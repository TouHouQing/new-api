package app

import (
	"encoding/json"
	"errors"
	"sort"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

func cutDeliveryPending() *AppError {
	return &AppError{Status: 409, Code: 409, Reason: "cut_delivery_pending", Message: "此剪辑仍有未处理的旧版设置，请更新旧版转换，或核对画面后明确放弃这些设置，再导出"}
}

// Origins are written by the server and survive ordinary JSON edits. Keep
// historical notices even after an intermediate snapshot has been archived.
func (s *Service) projectCutDeliveryBlockers(row *model.ProjectCut) []string {
	fields, _ := s.projectCutDeliveryState(row)
	return fields
}

func (s *Service) projectCutDeliveryState(row *model.ProjectCut) ([]string, string) {
	visited := map[string]bool{}
	var read func(*model.ProjectCut) ([]string, string)
	read = func(cut *model.ProjectCut) ([]string, string) {
		if visited[cut.ID] {
			return []string{"delivery.source-cycle"}, cut.ID
		}
		if len(visited) >= 256 {
			return []string{"delivery.source-limit"}, cut.ID
		}
		visited[cut.ID] = true
		fields := append(s.legacyRegionalDeliveryBlockers(cut), s.legacyNativeDeliveryBlockers(cut)...)
		if cut.MetadataJSON != "" {
			var metadata struct {
				PreservedOnly []string `json:"preservedOnly"`
			}
			if json.Unmarshal([]byte(cut.MetadataJSON), &metadata) != nil {
				return []string{"delivery.source-unreadable"}, cut.ID
			}
			fields = append(fields, metadata.PreservedOnly...)
		}
		anchor := ""
		if len(fields) > 0 {
			anchor = cut.ID
		}
		if cut.OriginCutID != "" {
			parent, err := s.repo.ProjectCut(cut.UserID, cut.ProjectID, cut.OriginCutID)
			if err != nil {
				return append(fields, "delivery.source-unavailable"), cut.ID
			}
			if _, err := projectCutView(parent, false); err != nil {
				return append(fields, "delivery.source-unreadable"), cut.ID
			}
			inherited, parentAnchor := read(parent)
			fields = append(fields, inherited...)
			if anchor == "" {
				anchor = parentAnchor
			}
		}
		return fields, anchor
	}
	fields, anchor := read(row)
	unique := map[string]bool{}
	result := []string{}
	for _, field := range fields {
		if field != "" && !unique[field] {
			unique[field] = true
			result = append(result, field)
		}
	}
	sort.Strings(result)
	return result, anchor
}

func (s *Service) timelineOriginView(userID, projectID, originID string, view ProjectTimelineView) (ProjectTimelineView, error) {
	if originID == "" {
		if _, err := s.repo.ProductionImportForProject(userID, projectID); err == nil {
			root, err := s.repo.FirstImportedProjectCut(userID, projectID)
			if err == nil {
				originID = root.ID
			} else if !errors.Is(err, gorm.ErrRecordNotFound) {
				return view, err
			}
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return view, err
		}
	}
	view.OriginCutID = originID
	if originID != "" {
		cut, err := s.repo.ProjectCut(userID, projectID, originID)
		if err != nil {
			view.DeliveryBlockers = []string{"delivery.source-unavailable"}
			return view, nil
		}
		view.DeliveryBlockers, view.OriginCutID = s.projectCutDeliveryState(cut)
	}
	return view, nil
}
