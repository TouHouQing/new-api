package service

import (
	"bytes"
	"image"
	"image/png"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func studioCollaborationFixture(t *testing.T) {
	t.Helper()
	studioProductionFixture(t)
	require.NoError(t, model.DB.AutoMigrate(&model.StudioProductionRecord{}))
	for _, user := range []model.User{{Id: 2, Username: "editor", AffCode: "editor-aff", Status: common.UserStatusEnabled}, {Id: 3, Username: "reviewer", AffCode: "reviewer-aff", Status: common.UserStatusEnabled}, {Id: 4, Username: "viewer", AffCode: "viewer-aff", Status: common.UserStatusEnabled}} {
		require.NoError(t, model.DB.Create(&user).Error)
	}
	source := `{"id":"film","title":"Film","nodes":[{"id":"shot","type":"studio","position":{"x":0,"y":0},"data":{"kind":"image","title":"Product","prompt":"Product photo","mediaId":"image-one","selectedTakeId":"take-one","takes":[{"id":"take-one","createdAt":"2026-10-18","prompt":"Product photo","status":"completed","mediaId":"image-one"}]}}],"edges":[],"createdAt":"2026-10-18","updatedAt":"2026-10-18"}`
	_, err := model.SaveStudioProject(1, "film", "Film", 0, source)
	require.NoError(t, err)
	for _, member := range []model.StudioProjectMember{{ProjectID: "film", UserID: 2, Role: "editor"}, {ProjectID: "film", UserID: 3, Role: "reviewer"}, {ProjectID: "film", UserID: 4, Role: "viewer"}} {
		require.NoError(t, model.DB.Create(&member).Error)
	}
	var encoded bytes.Buffer
	require.NoError(t, png.Encode(&encoded, image.NewRGBA(image.Rect(0, 0, 2, 2))))
	for _, id := range []string{"image-one", "image-two"} {
		_, err := SaveStudioMedia(1, id, "image/png", bytes.NewReader(encoded.Bytes()))
		require.NoError(t, err)
		require.NoError(t, LinkStudioProjectMedia("film", id))
	}
}

func TestStudioCollaborationPresenceExpiresAndRevocationHidesExistingSessions(t *testing.T) {
	studioCollaborationFixture(t)
	presence, err := HeartbeatStudioPresence(2, "film", StudioPresenceRequest{SessionID: "browser-a", NodeID: "shot", View: "review"})
	require.NoError(t, err)
	assert.InDelta(t, time.Now().Unix()+StudioPresenceTTL, presence.ExpiresAt, 2)
	_, err = HeartbeatStudioPresence(5, "film", StudioPresenceRequest{SessionID: "outsider"})
	require.ErrorIs(t, err, model.ErrStudioAccess)
	snapshot, err := ReadStudioCollaborationSnapshot(3, "film")
	require.NoError(t, err)
	require.Len(t, snapshot.Presence, 1)
	assert.Equal(t, "editor", snapshot.Presence[0].Username)
	var record model.StudioProductionRecord
	require.NoError(t, model.DB.Where("project_id = ? AND kind = ?", "film", "presence").First(&record).Error)
	presence.ExpiresAt = time.Now().Unix() - 1
	raw, err := common.Marshal(presence)
	require.NoError(t, err)
	require.NoError(t, model.DB.Model(&record).Update("document", model.StudioDocument(raw)).Error)
	snapshot, err = ReadStudioCollaborationSnapshot(1, "film")
	require.NoError(t, err)
	assert.Empty(t, snapshot.Presence)
	_, err = HeartbeatStudioPresence(2, "film", StudioPresenceRequest{SessionID: "browser-a", NodeID: "shot", View: "canvas"})
	require.NoError(t, err)
	require.NoError(t, model.DB.Where("project_id = ? AND user_id = ?", "film", 2).Delete(&model.StudioProjectMember{}).Error)
	snapshot, err = ReadStudioCollaborationSnapshot(1, "film")
	require.NoError(t, err)
	assert.Empty(t, snapshot.Presence)
	_, err = HeartbeatStudioPresence(2, "film", StudioPresenceRequest{SessionID: "browser-a", NodeID: "shot"})
	require.ErrorIs(t, err, model.ErrStudioAccess)
}

func TestStudioCollaborationReviewPinsTakeAndRejectsLostUpdates(t *testing.T) {
	studioCollaborationFixture(t)
	create := StudioReviewAssignmentRequest{OperationID: "create-task", Operation: "create", Title: "Check product", Priority: "high", AssigneeID: 3, ProjectRevision: 1, NodeID: "shot", TakeID: "take-one", MediaID: "image-one", Note: "Keep the logo clear"}
	task, err := SaveStudioReviewAssignment(2, "film", "review-task", create)
	require.NoError(t, err)
	assert.Equal(t, "image-one", task.Target.MediaID)
	assert.Len(t, task.Target.Digest, 64)
	repeat, err := SaveStudioReviewAssignment(2, "film", task.ID, create)
	require.NoError(t, err)
	assert.EqualValues(t, 1, repeat.Version)
	assert.Len(t, repeat.Events, 1)
	_, err = SaveStudioReviewAssignment(4, "film", task.ID, StudioReviewAssignmentRequest{OperationID: "viewer-reply", Operation: "reply", ExpectedVersion: 1, Note: "No"})
	require.ErrorIs(t, err, model.ErrStudioAccess)
	reply := StudioReviewAssignmentRequest{OperationID: "reviewer-reply", Operation: "reply", ExpectedVersion: 1, Note: "The face needs work"}
	task, err = SaveStudioReviewAssignment(3, "film", task.ID, reply)
	require.NoError(t, err)
	assert.Len(t, task.Events, 2)
	_, err = SaveStudioReviewAssignment(2, "film", task.ID, StudioReviewAssignmentRequest{OperationID: "old-editor", Operation: "status", ExpectedVersion: 1, State: "closed", Note: "Done"})
	require.ErrorIs(t, err, model.ErrStudioRevision)
	require.NoError(t, model.DB.Where("project_id = ? AND user_id = ?", "film", 3).Delete(&model.StudioProjectMember{}).Error)
	_, err = SaveStudioReviewAssignment(3, "film", task.ID, StudioReviewAssignmentRequest{OperationID: "revoked", Operation: "status", ExpectedVersion: 2, State: "approved"})
	require.ErrorIs(t, err, model.ErrStudioAccess)
	snapshot, err := ReadStudioCollaborationSnapshot(1, "film")
	require.NoError(t, err)
	require.Len(t, snapshot.Assignments, 1)
	assert.Len(t, snapshot.Assignments[0].Events, 2)
}

func TestStudioCollaborationRevisionKeepsOriginalTargetAndResolvesExactNewTake(t *testing.T) {
	studioCollaborationFixture(t)
	task, err := SaveStudioReviewAssignment(1, "film", "task", StudioReviewAssignmentRequest{OperationID: "create", Operation: "create", Title: "Logo", Priority: "normal", AssigneeID: 3, ProjectRevision: 1, NodeID: "shot", TakeID: "take-one", MediaID: "image-one"})
	require.NoError(t, err)
	project, _, err := model.StudioProjectAccess(model.DB, 1, "film", false)
	require.NoError(t, err)
	var document map[string]any
	require.NoError(t, common.Unmarshal([]byte(project.Document), &document))
	data := studioObjects(document, "nodes")[0]["data"].(map[string]any)
	data["selectedTakeId"] = "take-two"
	data["mediaId"] = "image-two"
	data["takes"] = append(data["takes"].([]any), map[string]any{"id": "take-two", "createdAt": "2026-10-18", "prompt": "fixed", "status": "completed", "mediaId": "image-two"})
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	_, err = model.SaveStudioProject(1, "film", "Film", 1, string(raw))
	require.NoError(t, err)
	snapshot, err := ReadStudioCollaborationSnapshot(3, "film")
	require.NoError(t, err)
	require.True(t, snapshot.Assignments[0].Stale)
	task, err = SaveStudioReviewAssignment(2, "film", task.ID, StudioReviewAssignmentRequest{OperationID: "new-version", Operation: "revise", ExpectedVersion: 1, ProjectRevision: 2, NodeID: "shot", TakeID: "take-two", MediaID: "image-two", Note: "Logo repaired"})
	require.NoError(t, err)
	assert.Equal(t, "image-one", task.Target.MediaID)
	require.NotNil(t, task.RevisionTarget)
	assert.Equal(t, "image-two", task.RevisionTarget.MediaID)
	assert.Equal(t, "revision_submitted", task.State)
	task, err = SaveStudioReviewAssignment(3, "film", task.ID, StudioReviewAssignmentRequest{OperationID: "approve", Operation: "status", ExpectedVersion: 2, State: "approved"})
	require.NoError(t, err)
	task, err = SaveStudioReviewAssignment(3, "film", task.ID, StudioReviewAssignmentRequest{OperationID: "close", Operation: "status", ExpectedVersion: 3, State: "closed"})
	require.NoError(t, err)
	assert.EqualValues(t, 4, task.Version)
	assert.Len(t, task.Events, 4)
	snapshot, err = ReadStudioCollaborationSnapshot(1, "film")
	require.NoError(t, err)
	assert.False(t, snapshot.Assignments[0].Stale)
}
