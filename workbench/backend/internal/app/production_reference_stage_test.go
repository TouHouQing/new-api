package app

import (
	"encoding/json"
	"gorm.io/gorm"
	"strings"
	"testing"
	"yingce/backend/internal/model"
)

func TestLegacyPlanningReferenceStageReachesOnlyMatchingNativeTask(t *testing.T) {
	planningBothDatabases(t, func(t *testing.T, s *Service, db *gorm.DB, p model.Project, u model.ProjectUnit) {
		for _, row := range []any{&model.Asset{ID: "stage-asset", UserID: "user-1", Kind: "entity", Category: "character", Title: "人物", PayloadJSON: "{}"}, &model.AssetVersion{ID: "stage-version", AssetID: "stage-asset", Version: 1, Status: model.AssetVersionStatusDraft, DefinitionJSON: "{}"}, &model.ProjectAssetLink{ID: "stage-link", ProjectID: p.ID, AssetID: "stage-asset"}, &model.Resource{ID: "image-reference", UserID: "user-1", Kind: "image", Status: model.ResourceStatusReady, MimeType: "image/png"}, &model.Resource{ID: "video-reference", UserID: "user-1", Kind: "image", Status: model.ResourceStatusReady, MimeType: "image/png"}} {
			if err := db.Create(row).Error; err != nil {
				t.Fatal(err)
			}
		}
		states := []model.ShotReferenceState{{AssetVersionID: "stage-version", Stage: "image", Wardrobe: "图片的红外套", ReferenceResourceIDs: []string{"image-reference"}}, {AssetVersionID: "stage-version", Stage: "video", Wardrobe: "视频的蓝外套", ReferenceResourceIDs: []string{"video-reference"}}}
		shot, err := s.CreateProjectShot("user-1", p.ID, CreateProjectShotRequest{UnitID: u.ID, Title: "分阶段参考", Description: "校准", Revision: ShotRevisionInput{ReferenceStates: states}})
		if err != nil {
			t.Fatal(err)
		}
		for _, stage := range []string{"image", "video"} {
			input := map[string]any{"metadata": map[string]any{"domainProjectId": p.ID, "unitId": u.ID, "shotId": shot.ID, "shotRevisionId": shot.CurrentRevisionID}}
			prompt, err := s.prepareTaskProductionContext("user-1", stage, "基础提示", input)
			if err != nil {
				t.Fatal(err)
			}
			expected, other := "图片的红外套", "视频的蓝外套"
			if stage == "video" {
				expected, other = other, expected
			}
			if !strings.Contains(prompt, expected) || strings.Contains(prompt, other) {
				t.Fatal("wrong stage requirements", prompt)
			}
			images := input["referenceImages"].([]any)
			if len(images) != 1 || images[0].(map[string]any)["storageKey"] != "resource:"+stage+"-reference" {
				t.Fatal("wrong stage image")
			}
			encoded, _ := json.Marshal(input["metadata"])
			if !strings.Contains(string(encoded), "图片的红外套") || !strings.Contains(string(encoded), "视频的蓝外套") {
				t.Fatal("audit snapshot lost the original two-stage revision")
			}
		}
	})
}
