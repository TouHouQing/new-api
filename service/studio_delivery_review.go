package service

import "errors"

// A preview can include work in progress, but a delivery must not include an
// audio version that a reviewer explicitly requested to replace.
func ValidateStudioDeliveryAudioReviews(document map[string]any, plan *StudioRenderPlan) error {
	if plan == nil || !plan.Package && !plan.RequireApproved {
		return nil
	}
	used := map[string]bool{}
	for _, track := range plan.Audio {
		used[track.MediaID] = true
	}
	production, _ := document["production"].(map[string]any)
	for _, clip := range plan.Clips {
		used[clip.VoiceoverMediaID] = true
		if plan.SkipDialogue {
			continue
		}
		logicalNodeID, _ := studioRenderDialogueSource(document, clip)
		for _, shot := range studioObjects(document, "shots") {
			if shot["videoNodeId"] != logicalNodeID {
				continue
			}
			for _, cue := range studioObjects(production, "dialogueCues") {
				if cue["shotId"] == shot["id"] {
					id, _ := cue["audioMediaId"].(string)
					used[id] = true
				}
			}
		}
	}
	latest := map[string]string{}
	for _, review := range studioObjects(production, "reviews") {
		id, _ := review["mediaId"].(string)
		status, _ := review["status"].(string)
		latest[id] = status
	}
	for id := range used {
		if id != "" && latest[id] == "retake" {
			return errors.New("replace or approve the rejected audio version before final delivery")
		}
	}
	return nil
}
