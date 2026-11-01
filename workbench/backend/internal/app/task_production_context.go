package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

type taskProductionContext struct {
	Requirements        []string `json:"requirements"`
	Version             int      `json:"version"`
	ProjectID           string   `json:"projectId"`
	ProjectRevision     int64    `json:"projectRevision"`
	CreativeBriefJSON   string   `json:"creativeBriefJson"`
	ProjectDescription  string   `json:"projectDescription,omitempty"`
	ShotID              string   `json:"shotId,omitempty"`
	RevisionID          string   `json:"revisionId,omitempty"`
	NarrativeJSON       string   `json:"narrativeJson,omitempty"`
	ReferenceStatesJSON string   `json:"referenceStatesJson,omitempty"`
}

func (s *Service) prepareTaskProductionContext(userID, mode, prompt string, input map[string]any) (string, error) {
	metadata, _ := input["metadata"].(map[string]any)
	if metadata == nil {
		return prompt, nil
	}
	// Caller supplied snapshots cannot masquerade as a server-confirmed plan.
	delete(metadata, "productionContext")
	projectID := strings.TrimSpace(stringValue(metadata["domainProjectId"]))
	if projectID == "" {
		return prompt, nil
	}
	project, err := s.activeProjectForUser(userID, projectID)
	if err != nil {
		return "", err
	}
	metadata["domainProjectId"] = projectID
	unitID := strings.TrimSpace(stringValue(metadata["unitId"]))
	chapterID := strings.TrimSpace(stringValue(metadata["chapterId"]))
	if unitID != "" && chapterID != "" && unitID != chapterID {
		return "", BadAuthRequest("任务章节与镜头归属不一致")
	}
	if unitID == "" {
		unitID = chapterID
	}
	if unitID != "" {
		if _, err := s.repo.ProjectUnit(projectID, unitID); err != nil {
			return "", shotOperationError(err)
		}
	}
	snapshot := taskProductionContext{Version: 1, ProjectID: projectID, ProjectRevision: project.Revision, CreativeBriefJSON: project.CreativeBriefJSON, ProjectDescription: project.Description}
	lines := []string{}
	if strings.TrimSpace(project.Description) != "" {
		lines = append(lines, "项目制作说明："+project.Description)
	}
	if project.CreativeBriefJSON != "" {
		var brief model.ProjectCreativeBrief
		if json.Unmarshal([]byte(project.CreativeBriefJSON), &brief) != nil || production.ValidateCreativeBrief(brief) != nil {
			return "", BadAuthRequest("原创作目标无法读取，请先核对项目设置")
		}
		labels := map[string]string{"story": "故事 / 短剧", "product": "商品 / 广告", "explain": "知识 / 讲解", "presenter": "口播", "music": "音乐 / MV", "custom": "自定义"}
		lines = append(lines, "作品类型："+labels[brief.Goal])
		for _, line := range []struct{ label, value string }{{"目标观众", brief.Audience}, {"核心信息", brief.KeyMessage}, {"语言", brief.Language}, {"情绪与语气", brief.Tone}} {
			if line.value != "" {
				lines = append(lines, line.label+"："+line.value)
			}
		}
		if brief.TargetDurationMs > 0 {
			lines = append(lines, fmt.Sprintf("成片目标时长：%g 秒；规划镜头时长总和并保留剪辑余量", float64(brief.TargetDurationMs)/1000))
		}
		for _, value := range brief.Constraints {
			lines = append(lines, "必须遵守："+value)
		}
	}
	shotID := strings.TrimSpace(stringValue(metadata["shotId"]))
	if shotID != "" {
		shot, err := s.repo.ActiveShotForProject(projectID, shotID)
		if err != nil {
			return "", shotOperationError(err)
		}
		if unitID != "" && shot.UnitID != unitID {
			return "", BadAuthRequest("镜头不属于本次制作章节")
		}
		metadata["shotId"], metadata["unitId"] = shot.ID, shot.UnitID
		if mode == "video" && shot.DurationMs > 0 {
			lines = append(lines, fmt.Sprintf("本任务只制作当前镜头，计划时长：%g 秒；成片总时长是全项目目标", float64(shot.DurationMs)/1000))
		}
		revisionID := stringValue(metadata["shotRevisionId"])
		if revisionID == "" || revisionID != shot.CurrentRevisionID {
			return "", shotRevisionConflict()
		}
		revision, err := s.repo.ShotRevisionForShot(shotID, revisionID)
		if err != nil {
			return "", shotOperationError(err)
		}
		snapshot.ShotID, snapshot.RevisionID, snapshot.NarrativeJSON, snapshot.ReferenceStatesJSON = shotID, revisionID, revision.NarrativeJSON, revision.ReferenceStatesJSON
		if revision.NarrativeJSON != "" {
			var narrative model.ShotNarrative
			if json.Unmarshal([]byte(revision.NarrativeJSON), &narrative) != nil || production.ValidateShotNarrative(narrative) != nil {
				return "", BadAuthRequest("原镜头意图无法读取")
			}
			purposes := map[string]string{"opening": "吸引观众", "establish": "交代背景", "action": "推动行动", "emotion": "表达情绪", "benefit": "呈现利益点", "ending": "收束 / 引导"}
			if narrative.Purpose != "" {
				lines = append(lines, "镜头目的："+purposes[narrative.Purpose])
			}
			for _, line := range []struct{ label, value string }{{"观众需要理解", narrative.Information}, {"情绪变化", narrative.Emotion}, {"画面重点", narrative.VisualBeat}, {"前后镜延续", narrative.ContinuityNeeds}} {
				if line.value != "" {
					lines = append(lines, line.label+"："+line.value)
				}
			}
		}
		if revision.ReferenceStatesJSON != "" {
			var states []model.ShotReferenceState
			if json.Unmarshal([]byte(revision.ReferenceStatesJSON), &states) != nil {
				return "", BadAuthRequest("原接戏状态无法读取")
			}
			if err := s.validateShotReferenceResources(userID, projectID, states); err != nil {
				return "", err
			}
			for index, state := range states {
				if (mode == "image" || mode == "video") && state.Stage != "" && state.Stage != mode {
					continue
				}
				parts := []string{}
				for _, part := range []struct{ label, value string }{{"衣着", state.Wardrobe}, {"情绪", state.Emotion}, {"道具状态", state.PropState}, {"接戏说明", state.Note}} {
					if part.value != "" {
						parts = append(parts, part.label+"："+part.value)
					}
				}
				if len(parts) > 0 {
					stageLabel := ""
					if state.Stage == "image" {
						stageLabel = "（图片阶段）"
					} else if state.Stage == "video" {
						stageLabel = "（视频阶段）"
					}
					lines = append(lines, fmt.Sprintf("参考设定 %d%s：%s", index+1, stageLabel, strings.Join(parts, "；")))
				}
				if mode != "image" && mode != "video" {
					continue
				}
				images, _ := input["referenceImages"].([]any)
				for _, id := range state.ReferenceResourceIDs {
					present := false
					for _, raw := range images {
						image, _ := raw.(map[string]any)
						if image["storageKey"] == "resource:"+id {
							present = true
							break
						}
					}
					if !present {
						images = append(images, map[string]any{"id": "shot-state:" + id, "name": fmt.Sprintf("接戏参考 %d", index+1), "storageKey": "resource:" + id, "url": resourceFileURL(id), "type": "image/*"})
					}
				}
				if len(images) > 0 {
					input["referenceImages"] = images
				}
			}
		}
	}
	if len(strings.Join(lines, "\n")) > 64<<10 {
		return "", BadAuthRequest("创作与接戏要求超过64KiB，请先精简后再生成")
	}
	snapshot.Requirements = lines
	encoded, err := json.Marshal(snapshot)
	if err != nil {
		return "", err
	}
	var fixed map[string]any
	if err := json.Unmarshal(encoded, &fixed); err != nil {
		return "", err
	}
	metadata["productionContext"] = fixed
	extra := []string{}
	for _, line := range lines {
		if !strings.Contains(prompt, line) {
			extra = append(extra, line)
		}
	}
	if len(extra) > 0 {
		prompt += "\n\n【项目与镜头的固定创作要求】\n" + strings.Join(extra, "\n")
	}
	if _, exists := input["prompt"]; exists {
		input["prompt"] = prompt
	}
	return prompt, nil
}

// Prompt templates are compiled after admission. Reapply only the original
// server snapshot, so template expansion cannot erase confirmed requirements.
func applyPersistedProductionRequirements(prompt string, metadata map[string]any) (string, error) {
	raw, exists := metadata["productionContext"]
	if !exists {
		return prompt, nil
	}
	encoded, err := json.Marshal(raw)
	if err != nil {
		return "", errors.New("固定制作要求无法读取")
	}
	var snapshot taskProductionContext
	if json.Unmarshal(encoded, &snapshot) != nil || snapshot.Version != 1 || snapshot.ProjectID == "" || snapshot.ProjectID != stringValue(metadata["domainProjectId"]) || snapshot.ShotID != stringValue(metadata["shotId"]) || snapshot.RevisionID != stringValue(metadata["shotRevisionId"]) || snapshot.Requirements == nil || len(snapshot.Requirements) > 256 || len(strings.Join(snapshot.Requirements, "\n")) > 64<<10 {
		return "", errors.New("固定制作要求与原任务不一致，请核对原任务")
	}
	extra := []string{}
	for _, line := range snapshot.Requirements {
		if line != "" && !strings.Contains(prompt, line) {
			extra = append(extra, line)
		}
	}
	if len(extra) > 0 {
		prompt += "\n\n【项目与镜头的固定创作要求】\n" + strings.Join(extra, "\n")
	}
	return prompt, nil
}
