package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestStudioEditRecordAppliesOnceAndPreservesHistory(t *testing.T) {
	studioProductionFixture(t)
	require.NoError(t, model.DB.AutoMigrate(&model.StudioProductionRecord{}))
	project, err := model.SaveStudioProject(1, "film", "Before", 0, `{"id":"film","title":"Before","nodes":[],"edges":[]}`)
	require.NoError(t, err)
	next := map[string]any{"id": "film", "title": "After", "nodes": []any{}, "edges": []any{}}
	record, err := SaveStudioProductionRecord(1, project.ID, "edit-request", "edit_plan", project.Revision, map[string]any{"next_document": next})
	require.NoError(t, err)
	_, err = SaveStudioProductionRecord(1, project.ID, record.ID, "edit_plan", 1, map[string]any{"next_document": map[string]any{"title": "Different"}})
	require.ErrorIs(t, err, model.ErrStudioRevision)
	updated, receipt, err := model.ApplyStudioEditRecord(1, record.ID, 1)
	require.NoError(t, err)
	require.EqualValues(t, 2, updated.Revision)
	require.Equal(t, "After", updated.Title)
	require.Equal(t, "applied", receipt.State)
	updated, receipt, err = model.ApplyStudioEditRecord(1, record.ID, 1)
	require.NoError(t, err)
	require.EqualValues(t, 2, updated.Revision)
	require.EqualValues(t, 2, receipt.AppliedRevision)
	var history []model.StudioProjectVersion
	require.NoError(t, model.DB.Where("project_id = ?", project.ID).Order("revision").Find(&history).Error)
	require.Len(t, history, 2)
	var original map[string]any
	require.NoError(t, common.Unmarshal([]byte(history[0].Document), &original))
	require.Equal(t, "Before", original["title"])
}

func TestStudioEditRecordRejectsOtherUserAndStaleRevision(t *testing.T) {
	studioProductionFixture(t)
	require.NoError(t, model.DB.AutoMigrate(&model.StudioProductionRecord{}))
	project, err := model.SaveStudioProject(1, "film", "Film", 0, `{"id":"film","title":"Film","nodes":[],"edges":[]}`)
	require.NoError(t, err)
	record, err := SaveStudioProductionRecord(1, project.ID, "plan", "edit_plan", 1, map[string]any{"next_document": map[string]any{"id": "film", "title": "Next"}})
	require.NoError(t, err)
	_, err = model.ReadStudioProductionRecord(2, record.ID, false)
	require.ErrorIs(t, err, model.ErrStudioAccess)
	_, _, err = model.ApplyStudioEditRecord(2, record.ID, 1)
	require.ErrorIs(t, err, model.ErrStudioAccess)
	_, err = model.SaveStudioProject(1, project.ID, "New edit", 1, string(project.Document))
	require.NoError(t, err)
	_, _, err = model.ApplyStudioEditRecord(1, record.ID, 2)
	require.ErrorIs(t, err, model.ErrStudioRevision)
}
