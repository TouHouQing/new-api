package app

import (
	"encoding/json"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

type UpdateShotIntentionsRequest struct {
	ExpectedRevisionID string                     `json:"expectedRevisionId"`
	Narrative          *model.ShotNarrative       `json:"narrative,omitempty"`
	ReferenceStates    []model.ShotReferenceState `json:"referenceStates,omitempty"`
}

// The focused action preserves all prompts, camera settings and action beats.
// The shared revision writer performs the final CAS and quota transaction.
func (s *Service) UpdateShotIntentions(userID, projectID, shotID string, req UpdateShotIntentionsRequest) (model.Shot, model.ShotRevision, error) {
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return model.Shot{}, model.ShotRevision{}, err
	}
	shot, err := s.repo.ActiveShotForProject(projectID, shotID)
	if err != nil {
		return model.Shot{}, model.ShotRevision{}, shotOperationError(err)
	}
	if req.ExpectedRevisionID == "" || req.Narrative == nil && req.ReferenceStates == nil {
		return model.Shot{}, model.ShotRevision{}, BadAuthRequest("请提供当前镜头版本和要修改的意图或接戏状态")
	}
	if req.ExpectedRevisionID != shot.CurrentRevisionID {
		return model.Shot{}, model.ShotRevision{}, shotRevisionConflict()
	}
	revision, err := s.repo.ShotRevisionForShot(shotID, req.ExpectedRevisionID)
	if err != nil {
		return model.Shot{}, model.ShotRevision{}, shotOperationError(err)
	}
	beats := []map[string]any{}
	if revision.ActionBeatsJSON != "" && json.Unmarshal([]byte(revision.ActionBeatsJSON), &beats) != nil {
		return model.Shot{}, model.ShotRevision{}, BadAuthRequest("原动作节拍无法读取，请先核对镜头版本")
	}
	return s.CreateShotRevision(userID, projectID, shotID, ShotRevisionInput{preserveEmptyPlot: revision.PlotDescription == "" && shot.Description == "", ExpectedRevisionID: &req.ExpectedRevisionID, PlotDescription: revision.PlotDescription, Action: revision.Action, Dialogue: revision.Dialogue, ShotSize: revision.ShotSize, CameraAngle: revision.CameraAngle, CameraMovement: revision.CameraMovement, DurationMs: revision.DurationMs, ImagePrompt: revision.ImagePrompt, VideoPrompt: revision.VideoPrompt, NegativePrompt: revision.NegativePrompt, ContinuityNotes: revision.ContinuityNotes, ActionBeats: beats, Narrative: req.Narrative, ReferenceStates: req.ReferenceStates})
}

func (s *Service) inheritShotIntentions(shotID, revisionID string, input *ShotRevisionInput) error {
	if revisionID == "" || input.Narrative != nil && input.ReferenceStates != nil {
		return nil
	}
	previous, err := s.repo.ShotRevisionForShot(shotID, revisionID)
	if err != nil {
		return err
	}
	if input.Narrative == nil && previous.NarrativeJSON != "" {
		var value model.ShotNarrative
		if json.Unmarshal([]byte(previous.NarrativeJSON), &value) != nil {
			return BadAuthRequest("原镜头意图无法读取，请先核对该版本")
		}
		input.Narrative = &value
	}
	if input.ReferenceStates == nil && previous.ReferenceStatesJSON != "" {
		if json.Unmarshal([]byte(previous.ReferenceStatesJSON), &input.ReferenceStates) != nil {
			return BadAuthRequest("原接戏状态无法读取，请先核对该版本")
		}
	}
	return nil
}

func (s *Service) validateShotReferenceResources(userID, projectID string, values []model.ShotReferenceState) error {
	if err := production.ValidateShotReferenceStates(values); err != nil {
		return BadAuthRequest(err.Error())
	}
	if len(values) == 0 {
		return nil
	}
	ids := make([]string, 0, len(values))
	seenVersions := map[string]bool{}
	for _, state := range values {
		if !seenVersions[state.AssetVersionID] {
			ids = append(ids, state.AssetVersionID)
			seenVersions[state.AssetVersionID] = true
		}
	}
	versions, err := s.repo.ProjectAssetVersionsByIDs(projectID, ids)
	if err != nil {
		return err
	}
	if len(versions) != len(ids) {
		return BadAuthRequest("接戏状态须选择本项目已关联的素材版本")
	}
	for _, version := range versions {
		asset, err := s.repo.AssetForUser(userID, version.AssetID)
		if err != nil {
			return err
		}
		if asset.Status == model.AssetVersionStatusArchived || version.Status == model.AssetVersionStatusArchived {
			return BadAuthRequest("接戏素材版本已归档，请先恢复或选择可用版本")
		}
	}
	for _, state := range values {
		for _, id := range state.ReferenceResourceIDs {
			resource, err := s.repo.ResourceForUser(userID, id)
			if err != nil {
				return NotFound("接戏参考图不存在或不属于当前账号")
			}
			if resource.Kind != "image" || resource.Status != model.ResourceStatusReady {
				return BadAuthRequest("接戏参考须使用已就绪的图片")
			}
		}
	}
	return nil
}

func (s *Service) validateShotIntentionsStorage(userID string, revision model.ShotRevision) error {
	if revision.NarrativeJSON == "" && revision.ReferenceStatesJSON == "" {
		return nil
	}
	return s.validateProductionDocumentStorage(userID, int64(len(revision.NarrativeJSON)+len(revision.ReferenceStatesJSON)))
}
