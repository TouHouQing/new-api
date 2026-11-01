package app

import (
	"encoding/json"
	"yingce/backend/internal/production"
)

// Old immutable cuts keep their original bytes. A load uses this derived copy,
// and the preview hashes that exact copy before it replaces the working edit.
func (s *Service) projectCutEditableTimeline(userID, projectID string, cut ProjectCutView) (json.RawMessage, error) {
	stored, err := production.TimelineDocumentOutput(cut.Timeline)
	if err != nil {
		return nil, NewAppError(500, "版本的画面设置无法读取")
	}
	if stored != nil {
		return cut.Timeline, nil
	}
	project, err := s.activeProjectForUser(userID, projectID)
	if err != nil {
		return nil, err
	}
	ratio := cut.Cut.AspectRatio
	if ratio == "" {
		ratio = project.AspectRatio
	}
	output, err := timelineOutputFormat(ratio)
	if err != nil {
		return nil, BadAuthRequest(err.Error())
	}
	if len(cut.Metadata) > 0 {
		var metadata struct {
			Output *timelineRenderFormat `json:"renderOutput"`
		}
		if json.Unmarshal(cut.Metadata, &metadata) != nil {
			return nil, NewAppError(500, "版本的画面设置无法读取")
		}
		if metadata.Output != nil {
			output = *metadata.Output
		}
	}
	return production.SetTimelineDocumentOutput(cut.Timeline, output)
}

func (s *Service) projectCutSaveOutput(userID, projectID, ratio string, raw json.RawMessage) (json.RawMessage, error) {
	stored, err := production.TimelineDocumentOutput(raw)
	if err != nil {
		return nil, BadAuthRequest(err.Error())
	}
	if ratio == "" && stored != nil {
		return raw, nil
	}
	if ratio == "" {
		project, err := s.activeProjectForUser(userID, projectID)
		if err != nil {
			return nil, err
		}
		ratio = project.AspectRatio
	}
	output, err := timelineOutputFormat(ratio)
	if err != nil {
		return nil, BadAuthRequest(err.Error())
	}
	if stored != nil {
		output.FPS = stored.FPS
		output.Fit = stored.Fit
	}
	return production.SetTimelineDocumentOutput(raw, output)
}
