package database

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

type cutOriginApplication struct {
	revision int64
	cutID    string
}

// Read-only projection also serves the SQLite-to-PostgreSQL snapshot copier.
// The source may predate the columns; only target provenance is synthesized
// from its own immutable receipts, never from another project or live state.
type ProjectCutOriginPlan struct {
	Cuts      map[string]string
	Timelines map[string]string
}

func ReadProjectCutOriginPlan(db *gorm.DB) (ProjectCutOriginPlan, error) {
	result := ProjectCutOriginPlan{Cuts: map[string]string{}, Timelines: map[string]string{}}
	if !db.Migrator().HasTable(&model.ProjectCut{}) {
		return result, nil
	}
	err := collectProjectCutOrigins(db, &result)
	return result, err
}

// Add only provenance columns. Historical payloads, metadata, hashes and
// receipts retain their exact bytes; the CAS revision determines ancestry.
func migrateProjectCutOrigins(tx *gorm.DB) error {
	for _, row := range []any{&model.ProjectCut{}, &model.ProjectTimeline{}} {
		if !tx.Migrator().HasColumn(row, "OriginCutID") {
			if err := tx.Migrator().AddColumn(row, "OriginCutID"); err != nil {
				return err
			}
		}
	}
	plan, err := ReadProjectCutOriginPlan(tx)
	if err != nil {
		return err
	}
	for id, parent := range plan.Cuts {
		if err := tx.Model(&model.ProjectCut{}).Where("id = ?", id).UpdateColumn("origin_cut_id", parent).Error; err != nil {
			return err
		}
	}
	for id, parent := range plan.Timelines {
		if err := tx.Model(&model.ProjectTimeline{}).Where("project_id = ?", id).UpdateColumn("origin_cut_id", parent).Error; err != nil {
			return err
		}
	}
	return nil
}

func collectProjectCutOrigins(tx *gorm.DB, plan *ProjectCutOriginPlan) error {
	key := func(userID, projectID string) string { return userID + "\x00" + projectID }
	cuts := []model.ProjectCut{}
	ownNotice := map[string]bool{}
	columns := []string{"id", "user_id", "project_id", "source_key", "timeline_revision", "created_at", "metadata_json"}
	if tx.Migrator().HasColumn(&model.ProjectCut{}, "OriginCutID") {
		columns = append(columns, "origin_cut_id")
	}
	cutRows, err := tx.Model(&model.ProjectCut{}).Select(columns).Rows()
	if err != nil {
		return err
	}
	for cutRows.Next() {
		var cut model.ProjectCut
		if err := tx.ScanRows(cutRows, &cut); err != nil {
			cutRows.Close()
			return err
		}
		if cut.MetadataJSON != "" {
			var metadata struct {
				PreservedOnly []string `json:"preservedOnly"`
			}
			ownNotice[cut.ID] = json.Unmarshal([]byte(cut.MetadataJSON), &metadata) != nil || len(metadata.PreservedOnly) > 0
		}
		cut.MetadataJSON = ""
		cuts = append(cuts, cut)
	}
	if err := cutRows.Err(); err != nil {
		cutRows.Close()
		return err
	}
	cutRows.Close()
	identities := map[string]string{}
	roots := map[string]model.ProjectCut{}
	for _, cut := range cuts {
		scope := key(cut.UserID, cut.ProjectID)
		identities[cut.ID] = scope
		if !strings.HasPrefix(cut.SourceKey, "studio-native-v") {
			continue
		}
		old, exists := roots[scope]
		if !exists || cut.CreatedAt.Before(old.CreatedAt) || cut.CreatedAt.Equal(old.CreatedAt) && cut.ID < old.ID {
			roots[scope] = cut
		}
	}
	applications := map[string][]cutOriginApplication{}
	rows, err := tx.Model(&model.ProjectCutApplyReceipt{}).Select("user_id", "project_id", "cut_id", "result_json").Rows()
	if err != nil {
		return err
	}
	for rows.Next() {
		var row model.ProjectCutApplyReceipt
		if err := tx.ScanRows(rows, &row); err != nil {
			rows.Close()
			return err
		}
		var result struct {
			AppliedRevision int64 `json:"appliedRevision"`
		}
		if json.Unmarshal([]byte(row.ResultJSON), &result) != nil || result.AppliedRevision < 1 {
			rows.Close()
			return fmt.Errorf("invalid cut apply receipt while migrating working origins")
		}
		scope := key(row.UserID, row.ProjectID)
		if identities[row.CutID] != scope {
			rows.Close()
			return fmt.Errorf("cut apply receipt has an unrelated source")
		}
		applications[scope] = append(applications[scope], cutOriginApplication{result.AppliedRevision, row.CutID})
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	for scope, list := range applications {
		sort.Slice(list, func(i, j int) bool { return list[i].revision < list[j].revision })
		for i := 1; i < len(list); i++ {
			if list[i].revision == list[i-1].revision && list[i].cutID != list[i-1].cutID {
				return fmt.Errorf("ambiguous cut apply revision while migrating working origins")
			}
		}
		applications[scope] = list
	}
	origin := func(scope string, revision int64, createdAt time.Time, limitRootTime bool) string {
		list := applications[scope]
		index := sort.Search(len(list), func(i int) bool { return list[i].revision > revision })
		if index > 0 {
			return list[index-1].cutID
		}
		root, exists := roots[scope]
		if exists && (!limitRootTime || !root.CreatedAt.After(createdAt)) {
			return root.ID
		}
		return ""
	}
	parents := map[string]string{}
	byID := map[string]model.ProjectCut{}
	for _, cut := range cuts {
		byID[cut.ID] = cut
		parent := cut.OriginCutID
		if parent == "" && cut.DerivesFromWorkingCut() {
			parent = origin(key(cut.UserID, cut.ProjectID), cut.WorkingOriginRevision(), cut.CreatedAt, true)
		}
		if parent == cut.ID {
			return fmt.Errorf("cut origin would reference itself")
		}
		if parent != "" && identities[parent] != identities[cut.ID] {
			return fmt.Errorf("cut origin has an unrelated source")
		}
		parents[cut.ID] = parent
	}
	// Iterative traversal supports long editing histories without stack growth.
	// A snapshot with its own notice remains an anchor; ordinary intermediate
	// saves collapse to the same source, retaining every notice on that source.
	resolved := map[string]string{"": ""}
	checked := map[string]bool{}
	for _, cut := range cuts {
		path := []string{}
		seen := map[string]bool{}
		id := cut.ID
		for id != "" && !checked[id] {
			if seen[id] {
				return fmt.Errorf("cut origins contain a cycle")
			}
			seen[id] = true
			path = append(path, id)
			id = parents[id]
		}
		for _, id := range path {
			checked[id] = true
		}
	}
	anchor := func(id string) string {
		if value, ok := resolved[id]; ok {
			return value
		}
		path := []string{}
		for {
			if value, ok := resolved[id]; ok {
				for _, pending := range path {
					resolved[pending] = value
				}
				return value
			}
			row := byID[id]
			if !row.DerivesFromWorkingCut() || ownNotice[id] {
				resolved[id] = id
				for _, pending := range path {
					resolved[pending] = id
				}
				return id
			}
			path = append(path, id)
			id = parents[id]
		}
	}
	for _, cut := range cuts {
		parent := anchor(parents[cut.ID])
		plan.Cuts[cut.ID] = parent
	}
	timelines := []model.ProjectTimeline{}
	columns = []string{"project_id", "user_id", "revision", "created_at"}
	if tx.Migrator().HasColumn(&model.ProjectTimeline{}, "OriginCutID") {
		columns = append(columns, "origin_cut_id")
	}
	if err := tx.Select(columns).Find(&timelines).Error; err != nil {
		return err
	}
	for _, timeline := range timelines {
		if timeline.OriginCutID != "" {
			if identities[timeline.OriginCutID] != key(timeline.UserID, timeline.ProjectID) {
				return fmt.Errorf("working origin has an unrelated source")
			}
			plan.Timelines[timeline.ProjectID] = anchor(timeline.OriginCutID)
			continue
		}
		parent := anchor(origin(key(timeline.UserID, timeline.ProjectID), timeline.Revision, timeline.CreatedAt, false))
		plan.Timelines[timeline.ProjectID] = parent
	}
	return nil
}
