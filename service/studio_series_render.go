package service

import (
	"errors"
	"slices"

	"github.com/QuantumNous/new-api/common"
)

// Bind a regional delivery to its saved episode and immutable media. A label or
// variant ID alone must never turn a different render into an episode delivery.
func ValidateStudioRegionalRender(document map[string]any, plan *StudioRenderPlan) error {
	production, _ := document["production"].(map[string]any)
	if plan.Package && production["requireApproved"] == true && !plan.RequireApproved {
		return errors.New("final delivery requires the project's saved approval policy")
	}
	if plan.VariantID == "" {
		return nil
	}
	var selected map[string]any
	for _, version := range studioObjects(production, "regionalVersions") {
		if version["id"] == plan.VariantID {
			selected = version
			break
		}
	}
	if selected == nil {
		return errors.New("the regional delivery version is unavailable")
	}
	episodeExists := false
	for _, episode := range studioObjects(production, "episodes") {
		if episode["id"] == selected["episodeId"] {
			episodeExists = true
			break
		}
	}
	if !episodeExists {
		return errors.New("the regional delivery episode is unavailable")
	}
	raw, err := common.Marshal(selected)
	if err != nil {
		return err
	}
	var version struct {
		Title              string
		MotionGraphics     []StudioMotionGraphic `json:"motionGraphics"`
		Width, Height, FPS int
		Fit, Subtitles     string
		Timeline           []struct {
			NodeID          string   `json:"nodeId"`
			TakeID          string   `json:"takeId"`
			MediaID         string   `json:"sourceMediaId"`
			Start           float64  `json:"trimStart"`
			End             *float64 `json:"trimEnd"`
			Speed, Volume   float64
			Muted           bool
			Caption         string
			CaptionOffset   float64 `json:"captionOffset"`
			CaptionDuration float64 `json:"captionDuration"`
			FadeIn          float64 `json:"fadeIn"`
			FadeOut         float64 `json:"fadeOut"`
		}
		Audio []struct {
			MediaID               string `json:"mediaId"`
			Start, Offset, Volume float64
			Duration              *float64
		} `json:"audioTracks"`
	}
	if err := common.Unmarshal(raw, &version); err != nil {
		return err
	}
	if !slices.Equal(version.MotionGraphics, plan.MotionGraphics) {
		return errors.New("regional graphics differ from their saved language version")
	}
	if version.Title != plan.DeliveryLabel || version.Width != plan.Width || version.Height != plan.Height || version.FPS != plan.FPS || version.Fit != plan.Fit || version.Subtitles != plan.Subtitles || plan.SubtitleOffset != 0 || !plan.SkipDialogue || !plan.Package || plan.NodeID != "" || len(version.Timeline) != len(plan.Clips) || len(version.Audio) != len(plan.Audio) {
		return errors.New("the regional render differs from its saved delivery settings")
	}
	for index, saved := range version.Timeline {
		actual := plan.Clips[index]
		mediaID := saved.MediaID
		if mediaID == "" {
			for _, node := range studioObjects(document, "nodes") {
				if node["id"] != saved.NodeID {
					continue
				}
				data, _ := node["data"].(map[string]any)
				mediaID, _ = data["mediaId"].(string)
				for _, take := range studioObjects(data, "takes") {
					if take["id"] == saved.TakeID {
						mediaID, _ = take["mediaId"].(string)
						break
					}
				}
			}
		}
		endsMatch := saved.End == nil && actual.End == nil || saved.End != nil && actual.End != nil && *saved.End == *actual.End
		if mediaID == "" || saved.NodeID != actual.NodeID || saved.TakeID != actual.TakeID || mediaID != actual.MediaID || saved.Start != actual.Start || !endsMatch || saved.Speed != actual.Speed || saved.Volume != actual.Volume || saved.Muted != actual.Muted || saved.Caption != actual.Caption || saved.CaptionOffset != actual.CaptionOffset || saved.CaptionDuration != actual.CaptionDuration || saved.FadeIn != actual.FadeIn || saved.FadeOut != actual.FadeOut || actual.VoiceoverMediaID != "" {
			return errors.New("a regional clip differs from its saved source version")
		}
	}
	for index, saved := range version.Audio {
		actual := plan.Audio[index]
		durationsMatch := saved.Duration == nil && actual.Duration == nil || saved.Duration != nil && actual.Duration != nil && *saved.Duration == *actual.Duration
		if saved.MediaID != actual.MediaID || saved.Start != actual.Start || saved.Offset != actual.Offset || saved.Volume != actual.Volume || !durationsMatch {
			return errors.New("regional audio differs from its saved language version")
		}
	}
	return nil
}
