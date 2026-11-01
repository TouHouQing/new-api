/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

const StudioPresenceTTL = 60

type StudioPresenceRequest struct {
	SessionID string `json:"session_id"`
	NodeID    string `json:"node_id"`
	View      string `json:"view"`
	Action    string `json:"action"`
}
type StudioPresence struct {
	UserID      int    `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	NodeID      string `json:"node_id"`
	View        string `json:"view"`
	ExpiresAt   int64  `json:"expires_at"`
}
type StudioReviewTarget struct {
	ProjectRevision int64   `json:"project_revision"`
	NodeID          string  `json:"node_id"`
	NodeTitle       string  `json:"node_title"`
	TakeID          string  `json:"take_id,omitempty"`
	MediaID         string  `json:"media_id"`
	Digest          string  `json:"digest"`
	Kind            string  `json:"kind"`
	Start           float64 `json:"start"`
	End             float64 `json:"end"`
}
type StudioReviewAssignmentEvent struct {
	OperationID        string `json:"operation_id"`
	RequestFingerprint string `json:"request_fingerprint"`
	ActorID            int    `json:"actor_id"`
	Operation          string `json:"operation"`
	State              string `json:"state"`
	Note               string `json:"note"`
	CreatedAt          string `json:"created_at"`
	Version            int64  `json:"version"`
}
type StudioReviewAssignment struct {
	ID             string                        `json:"id"`
	Version        int64                         `json:"version"`
	Title          string                        `json:"title"`
	Priority       string                        `json:"priority"`
	AssigneeID     int                           `json:"assignee_id"`
	AuthorID       int                           `json:"author_id"`
	State          string                        `json:"state"`
	Target         StudioReviewTarget            `json:"target"`
	RevisionTarget *StudioReviewTarget           `json:"revision_target,omitempty"`
	Events         []StudioReviewAssignmentEvent `json:"events"`
	UpdatedAt      string                        `json:"updated_at"`
	Stale          bool                          `json:"stale"`
}
type StudioReviewAssignmentRequest struct {
	ID              string  `json:"id"`
	OperationID     string  `json:"operation_id"`
	Operation       string  `json:"operation"`
	ExpectedVersion int64   `json:"expected_version"`
	AssigneeID      int     `json:"assignee_id"`
	Title           string  `json:"title"`
	Priority        string  `json:"priority"`
	State           string  `json:"state"`
	Note            string  `json:"note"`
	ProjectRevision int64   `json:"project_revision"`
	NodeID          string  `json:"node_id"`
	TakeID          string  `json:"take_id"`
	MediaID         string  `json:"media_id"`
	Start           float64 `json:"start"`
	End             float64 `json:"end"`
}
type StudioCollaborationMember struct {
	UserID      int    `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
}
type StudioCollaborationSnapshotResult struct {
	ServerTime      int64                       `json:"server_time"`
	ProjectRevision int64                       `json:"project_revision"`
	Role            string                      `json:"role"`
	Members         []StudioCollaborationMember `json:"members"`
	Presence        []StudioPresence            `json:"presence"`
	Assignments     []StudioReviewAssignment    `json:"assignments"`
}

func HeartbeatStudioPresence(actorID int, projectID string, input StudioPresenceRequest) (*StudioPresence, error) {
	project, _, err := model.StudioProjectAccess(model.DB, actorID, projectID, false)
	if err != nil {
		return nil, err
	}
	if !StudioIDPattern.MatchString(input.SessionID) || input.Action != "" && input.Action != "leave" || input.NodeID != "" && !StudioIDPattern.MatchString(input.NodeID) {
		return nil, errors.New("invalid presence session")
	}
	if input.View != "guided" && input.View != "canvas" && input.View != "review" && input.View != "timeline" && input.View != "" {
		return nil, errors.New("invalid presence view")
	}
	if input.NodeID != "" {
		var document map[string]any
		if common.Unmarshal([]byte(project.Document), &document) != nil {
			return nil, errors.New("project document is unavailable")
		}
		exists := false
		for _, node := range studioObjects(document, "nodes") {
			if node["id"] == input.NodeID {
				exists = true
				break
			}
		}
		if !exists {
			return nil, errors.New("presence node is unavailable")
		}
	}
	now := time.Now().UTC()
	expires := now.Unix() + StudioPresenceTTL
	state := "online"
	if input.Action == "leave" {
		expires = now.Unix()
		state = "left"
	}
	presence := StudioPresence{UserID: actorID, NodeID: input.NodeID, View: input.View, ExpiresAt: expires}
	raw, err := common.Marshal(presence)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256([]byte(fmt.Sprintf("%s:%d:%s", projectID, actorID, input.SessionID)))
	recordID := "presence_" + hex.EncodeToString(sum[:24])
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		var record model.StudioProductionRecord
		if err := tx.First(&record, "id = ?", recordID).Error; err == nil {
			if record.ProjectID != projectID || record.AuthorID != actorID || record.Kind != "presence" {
				return model.ErrStudioAccess
			}
			return tx.Model(&record).Updates(map[string]any{"document": model.StudioDocument(raw), "state": state, "revision": gorm.Expr("revision + 1"), "updated_at": now}).Error
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		var count int64
		if err := tx.Model(&model.StudioProductionRecord{}).Where("project_id = ? AND author_id = ? AND kind = ? AND state = ? AND updated_at > ?", projectID, actorID, "presence", "online", now.Add(-StudioPresenceTTL*time.Second)).Count(&count).Error; err != nil {
			return err
		}
		if count >= 5 {
			return errors.New("close another active project session before opening a new one")
		}
		return tx.Create(&model.StudioProductionRecord{ID: recordID, ProjectID: projectID, OwnerID: project.OwnerID, AuthorID: actorID, ParentID: input.SessionID, Kind: "presence", State: state, Revision: 1, Document: model.StudioDocument(raw)}).Error
	})
	if err != nil {
		return nil, err
	}
	// Presence is disposable, while review tasks and their events are durable.
	_ = model.DB.Where("project_id = ? AND kind = ? AND updated_at < ?", projectID, "presence", now.Add(-24*time.Hour)).Delete(&model.StudioProductionRecord{}).Error
	return &presence, nil
}

func ReadStudioCollaborationSnapshot(actorID int, projectID string) (*StudioCollaborationSnapshotResult, error) {
	project, role, err := model.StudioProjectAccess(model.DB, actorID, projectID, false)
	if err != nil {
		return nil, err
	}
	snapshot := &StudioCollaborationSnapshotResult{ServerTime: time.Now().Unix(), ProjectRevision: project.Revision, Role: role, Members: []StudioCollaborationMember{}, Presence: []StudioPresence{}, Assignments: []StudioReviewAssignment{}}
	var membership []model.StudioProjectMember
	if err := model.DB.Where("project_id = ?", projectID).Find(&membership).Error; err != nil {
		return nil, err
	}
	roles := map[int]string{project.OwnerID: "owner"}
	for _, member := range membership {
		roles[member.UserID] = member.Role
	}
	ids := make([]int, 0, len(roles))
	for id := range roles {
		ids = append(ids, id)
	}
	var users []model.User
	if err := model.DB.Select("id", "username", "display_name").Where("id IN ?", ids).Order("id").Find(&users).Error; err != nil {
		return nil, err
	}
	names := map[int]model.User{}
	for _, user := range users {
		names[user.Id] = user
		snapshot.Members = append(snapshot.Members, StudioCollaborationMember{UserID: user.Id, Username: user.Username, DisplayName: user.DisplayName, Role: roles[user.Id]})
	}
	var records []model.StudioProductionRecord
	if err := model.DB.Where("project_id = ? AND kind = ? AND state = ? AND updated_at > ?", projectID, "presence", "online", time.Unix(snapshot.ServerTime-StudioPresenceTTL, 0)).Order("updated_at DESC").Limit(200).Find(&records).Error; err != nil {
		return nil, err
	}
	seen := map[int]bool{}
	for _, record := range records {
		var presence StudioPresence
		if common.Unmarshal([]byte(record.Document), &presence) != nil || presence.ExpiresAt <= snapshot.ServerTime || roles[record.AuthorID] == "" || seen[record.AuthorID] {
			continue
		}
		user, ok := names[record.AuthorID]
		if !ok {
			continue
		}
		presence.UserID, presence.Username, presence.DisplayName = record.AuthorID, user.Username, user.DisplayName
		seen[presence.UserID] = true
		snapshot.Presence = append(snapshot.Presence, presence)
	}
	var assignments []model.StudioProductionRecord
	if err := model.DB.Where("project_id = ? AND kind = ?", projectID, "review_assignment").Order("updated_at DESC").Limit(500).Find(&assignments).Error; err != nil {
		return nil, err
	}
	var document map[string]any
	if err := common.Unmarshal([]byte(project.Document), &document); err != nil {
		return nil, err
	}
	for _, record := range assignments {
		var assignment StudioReviewAssignment
		if common.Unmarshal([]byte(record.Document), &assignment) != nil {
			continue
		}
		target := assignment.Target
		if assignment.RevisionTarget != nil {
			target = *assignment.RevisionTarget
		}
		assignment.Stale = !studioReviewTargetMatches(document, target)
		snapshot.Assignments = append(snapshot.Assignments, assignment)
	}
	return snapshot, nil
}

func studioReviewTargetMatches(document map[string]any, target StudioReviewTarget) bool {
	for _, node := range studioObjects(document, "nodes") {
		if node["id"] != target.NodeID {
			continue
		}
		data, _ := node["data"].(map[string]any)
		if data == nil {
			return false
		}
		if target.TakeID != "" {
			for _, take := range studioObjects(data, "takes") {
				if take["id"] == target.TakeID && take["mediaId"] == target.MediaID {
					return data["selectedTakeId"] == target.TakeID
				}
			}
			return false
		}
		return data["mediaId"] == target.MediaID
	}
	return false
}

func validateStudioReviewTarget(project *model.StudioProject, input StudioReviewAssignmentRequest) (StudioReviewTarget, error) {
	target := StudioReviewTarget{ProjectRevision: project.Revision, NodeID: input.NodeID, TakeID: input.TakeID, MediaID: input.MediaID, Start: input.Start, End: input.End}
	if input.ProjectRevision != project.Revision {
		return target, model.ErrStudioRevision
	}
	if !StudioIDPattern.MatchString(input.NodeID) || !StudioIDPattern.MatchString(input.MediaID) || input.TakeID != "" && !StudioIDPattern.MatchString(input.TakeID) || math.IsNaN(input.Start) || math.IsNaN(input.End) || math.IsInf(input.Start, 0) || math.IsInf(input.End, 0) || input.Start < 0 || input.End < 0 || input.End > 3600 {
		return target, errors.New("invalid review target")
	}
	var document map[string]any
	if err := common.Unmarshal([]byte(project.Document), &document); err != nil {
		return target, err
	}
	found := false
	for _, node := range studioObjects(document, "nodes") {
		if node["id"] != input.NodeID {
			continue
		}
		data, _ := node["data"].(map[string]any)
		if data == nil {
			continue
		}
		target.NodeTitle, _ = data["title"].(string)
		target.Kind, _ = data["kind"].(string)
		if target.Kind != "image" && target.Kind != "video" && target.Kind != "audio" {
			return target, errors.New("review target must have stored media")
		}
		if input.TakeID != "" {
			for _, take := range studioObjects(data, "takes") {
				if take["id"] == input.TakeID && take["mediaId"] == input.MediaID && take["status"] == "completed" {
					found = true
					break
				}
			}
		} else {
			found = data["mediaId"] == input.MediaID
		}
	}
	if !found {
		return target, errors.New("review target does not match the selected take and media")
	}
	media, err := GetStudioMedia(project.OwnerID, input.MediaID)
	if err != nil {
		return target, model.ErrStudioAccess
	}
	if !strings.HasPrefix(media.MimeType, target.Kind+"/") {
		return target, errors.New("review media type does not match the shot")
	}
	target.Digest = media.Digest
	if target.Kind == "video" || target.Kind == "audio" {
		path, err := StudioMediaPath(media)
		if err != nil {
			return target, err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		probe, err := ProbeStudioMedia(ctx, path)
		if err != nil || probe.Duration <= 0 {
			return target, errors.New("review media duration could not be read")
		}
		if target.End == 0 {
			target.End = probe.Duration
		}
		if target.End <= target.Start || target.End > probe.Duration+0.05 {
			return target, errors.New("review time range is outside the media")
		}
	} else if target.Start != 0 || target.End != 0 {
		return target, errors.New("still-image reviews do not have a time range")
	}
	return target, nil
}

func SaveStudioReviewAssignment(actorID int, projectID, assignmentID string, input StudioReviewAssignmentRequest) (*StudioReviewAssignment, error) {
	project, role, err := model.StudioProjectAccess(model.DB, actorID, projectID, false)
	if err != nil {
		return nil, err
	}
	editor := role == "owner" || role == "editor"
	if role == "viewer" || !StudioIDPattern.MatchString(assignmentID) || !StudioIDPattern.MatchString(input.OperationID) || input.ExpectedVersion < 0 || len([]rune(input.Note)) > 2000 || len([]rune(input.Title)) > 200 {
		return nil, model.ErrStudioAccess
	}
	requestRaw, err := common.Marshal(input)
	if err != nil {
		return nil, errors.New("invalid review operation")
	}
	requestSum := sha256.Sum256(requestRaw)
	fingerprint := hex.EncodeToString(requestSum[:])
	now := time.Now().UTC().Format(time.RFC3339)
	assignment := &StudioReviewAssignment{}
	var existing model.StudioProductionRecord
	lookup := model.DB.Where("id = ? AND project_id = ? AND kind = ?", assignmentID, projectID, "review_assignment").First(&existing).Error
	if lookup == nil {
		if err := common.Unmarshal([]byte(existing.Document), assignment); err != nil {
			return nil, err
		}
		for _, event := range assignment.Events {
			if event.OperationID == input.OperationID {
				if event.ActorID == actorID && event.RequestFingerprint == fingerprint {
					return assignment, nil
				}
				return nil, model.ErrStudioRevision
			}
		}
		if input.ExpectedVersion != existing.Revision || assignment.Version != existing.Revision {
			return nil, model.ErrStudioRevision
		}
		if len(assignment.Events) >= 200 {
			return nil, errors.New("review event limit reached; create a follow-up task")
		}
		switch input.Operation {
		case "reply":
			if strings.TrimSpace(input.Note) == "" {
				return nil, errors.New("write a reply before submitting")
			}
		case "status":
			if !editor && assignment.AssigneeID != actorID {
				return nil, model.ErrStudioAccess
			}
			switch input.State {
			case "open", "in_progress", "approved", "changes_requested", "closed":
			default:
				return nil, errors.New("invalid review state")
			}
			if input.State == "closed" && assignment.State != "approved" && strings.TrimSpace(input.Note) == "" {
				return nil, errors.New("explain how this review was addressed before closing it")
			}
			assignment.State = input.State
		case "assign":
			if !editor {
				return nil, model.ErrStudioAccess
			}
			if err := validateStudioReviewAssignee(projectID, input.AssigneeID); err != nil {
				return nil, err
			}
			if input.Priority != "normal" && input.Priority != "high" {
				return nil, errors.New("invalid review priority")
			}
			assignment.AssigneeID, assignment.Priority = input.AssigneeID, input.Priority
		case "revise":
			if !editor {
				return nil, model.ErrStudioAccess
			}
			if input.NodeID != assignment.Target.NodeID {
				return nil, errors.New("the revision must address the original reviewed shot")
			}
			target, err := validateStudioReviewTarget(project, input)
			if err != nil {
				return nil, err
			}
			previous := assignment.Target
			if assignment.RevisionTarget != nil {
				previous = *assignment.RevisionTarget
			}
			if previous.MediaID == target.MediaID && previous.TakeID == target.TakeID {
				return nil, errors.New("submit a new take to address this review")
			}
			assignment.RevisionTarget = &target
			assignment.State = "revision_submitted"
		default:
			return nil, errors.New("invalid review operation")
		}
		assignment.Version++
	} else {
		if !errors.Is(lookup, gorm.ErrRecordNotFound) {
			return nil, lookup
		}
		if !editor || input.ExpectedVersion != 0 || input.Operation != "create" {
			return nil, model.ErrStudioAccess
		}
		if strings.TrimSpace(input.Title) == "" || input.Priority != "normal" && input.Priority != "high" {
			return nil, errors.New("review title and priority are required")
		}
		if err := validateStudioReviewAssignee(projectID, input.AssigneeID); err != nil {
			return nil, err
		}
		target, err := validateStudioReviewTarget(project, input)
		if err != nil {
			return nil, err
		}
		assignment = &StudioReviewAssignment{ID: assignmentID, Version: 1, Title: input.Title, Priority: input.Priority, AssigneeID: input.AssigneeID, AuthorID: actorID, State: "open", Target: target, Events: []StudioReviewAssignmentEvent{}}
	}
	assignment.UpdatedAt = now
	assignment.Stale = false
	assignment.Events = append(assignment.Events, StudioReviewAssignmentEvent{OperationID: input.OperationID, RequestFingerprint: fingerprint, ActorID: actorID, Operation: input.Operation, State: assignment.State, Note: input.Note, CreatedAt: now, Version: assignment.Version})
	raw, err := common.Marshal(assignment)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(raw)
	if lookup == nil {
		updated := model.DB.Model(&model.StudioProductionRecord{}).Where("id = ? AND project_id = ? AND kind = ? AND revision = ?", assignmentID, projectID, "review_assignment", input.ExpectedVersion).Updates(map[string]any{"revision": assignment.Version, "state": assignment.State, "document": model.StudioDocument(raw), "fingerprint": hex.EncodeToString(sum[:]), "updated_at": time.Now()})
		if updated.Error != nil {
			return nil, updated.Error
		}
		if updated.RowsAffected != 1 {
			return nil, model.ErrStudioRevision
		}
	} else {
		record := &model.StudioProductionRecord{ID: assignmentID, ProjectID: projectID, Kind: "review_assignment", State: assignment.State, Revision: 1, Document: model.StudioDocument(raw), Fingerprint: hex.EncodeToString(sum[:])}
		if _, err := model.CreateStudioProductionRecord(actorID, record); err != nil {
			return nil, err
		}
	}
	return assignment, nil
}

func validateStudioReviewAssignee(projectID string, assigneeID int) error {
	if assigneeID <= 0 {
		return errors.New("choose a project reviewer")
	}
	_, role, err := model.StudioProjectAccess(model.DB, assigneeID, projectID, false)
	if err != nil || role == "viewer" {
		return errors.New("assignee must be an owner, editor or reviewer of this project")
	}
	return nil
}
