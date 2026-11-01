package production

import (
	"encoding/hex"
	"errors"
	"strings"
	"unicode/utf8"
	"yingce/backend/internal/model"
)

func validCreativeText(text string, maximum int) bool {
	return utf8.ValidString(text) && utf8.RuneCountInString(text) <= maximum
}
func ValidateCreativeBrief(value model.ProjectCreativeBrief) error {
	if value.Version != 1 || value.TargetDurationMs < 0 || value.TargetDurationMs > 3_600_000 || !validCreativeText(value.Audience, 2000) || !validCreativeText(value.KeyMessage, 5000) || !validCreativeText(value.Language, 40) || !validCreativeText(value.Tone, 2000) || len(value.Constraints) > 20 {
		return errors.New("创作目标、时长或限制条件超出范围")
	}
	switch value.Goal {
	case "story", "product", "explain", "presenter", "music", "custom":
	default:
		return errors.New("请选择故事、商品、知识、口播、音乐或自定义创作目标")
	}
	for _, text := range value.Constraints {
		if strings.TrimSpace(text) == "" || !validCreativeText(text, 1000) {
			return errors.New("每条创作限制须为1至1000字")
		}
	}
	if origin := value.TemplateOrigin; origin != nil {
		if strings.TrimSpace(origin.ID) == "" || len(origin.ID) > 128 || origin.Version < 1 || len(origin.InputHash) != 64 {
			return errors.New("模板来源缺少有效版本与摘要")
		}
		if _, err := hex.DecodeString(origin.InputHash); err != nil {
			return errors.New("模板来源摘要无效")
		}
	}
	return nil
}
func ValidateShotNarrative(value model.ShotNarrative) error {
	switch value.Purpose {
	case "", "opening", "establish", "action", "emotion", "benefit", "ending":
	default:
		return errors.New("镜头目的须为开场、交代、行动、情绪、利益点或收束")
	}
	if !validCreativeText(value.Information, 2000) || !validCreativeText(value.Emotion, 500) || !validCreativeText(value.VisualBeat, 2000) || !validCreativeText(value.ContinuityNeeds, 2000) {
		return errors.New("镜头意图文本超出范围")
	}
	return nil
}
func ValidateShotReferenceStates(values []model.ShotReferenceState) error {
	if len(values) > 32 {
		return errors.New("每镜最多固定32项角色、场景或道具状态")
	}
	seen := map[string]bool{}
	for _, value := range values {
		key := value.AssetVersionID + "\x00" + value.Stage
		if value.Stage != "" && value.Stage != "image" && value.Stage != "video" {
			return errors.New("接戏设定的适用阶段须为全部、图片或视频")
		}
		conflict := seen[key] || seen[value.AssetVersionID+"\x00"] || value.Stage == "" && (seen[value.AssetVersionID+"\x00image"] || seen[value.AssetVersionID+"\x00video"])
		if value.AssetVersionID == "" || len(value.AssetVersionID) > 80 || conflict || len(value.ReferenceResourceIDs) > 12 || !validCreativeText(value.Wardrobe, 2000) || !validCreativeText(value.Emotion, 2000) || !validCreativeText(value.PropState, 2000) || !validCreativeText(value.Note, 2000) {
			return errors.New("接戏状态须绑定不同的有效素材版本，文本及参考图不能超出上限")
		}
		seen[key] = true
		resources := map[string]bool{}
		for _, id := range value.ReferenceResourceIDs {
			if id == "" || len(id) > 80 || resources[id] {
				return errors.New("接戏参考图须使用不同的有效资源编号")
			}
			resources[id] = true
		}
	}
	return nil
}
