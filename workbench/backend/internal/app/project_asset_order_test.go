package app

import (
	"reflect"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

// A whole imported batch shares one timestamp. LIMIT/OFFSET must still identify
// one stable page, including after a PostgreSQL dump/restore changes row layout.
func TestProjectAssetsPageStableWhenImportTimestampsTie(t *testing.T) {
	service, db := newProjectWorkbenchReadTestService(t)
	project := seedWorkbenchProject(t, db)
	stamp := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	for _, id := range []string{"asset-c", "asset-a", "asset-f", "asset-b", "asset-e", "asset-d"} {
		asset := model.Asset{ID: id, UserID: "user-1", Title: id, Kind: "image", Category: model.AssetCategoryProp, Status: model.AssetVersionStatusConfirmed, CreatedAt: stamp, UpdatedAt: stamp}
		if err := db.Create(&asset).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Create(&model.ProjectAssetLink{ID: "link-" + id, ProjectID: project.ID, AssetID: id}).Error; err != nil {
			t.Fatal(err)
		}
	}
	want := []string{"asset-f", "asset-e", "asset-d", "asset-c", "asset-b", "asset-a"}
	for repeat := 0; repeat < 3; repeat++ {
		var got []string
		for page := 1; page <= 3; page++ {
			result, err := service.ProjectAssetsPage("user-1", project.ID, page, 2, "prop", "image", "", nil, "")
			if err != nil {
				t.Fatal(err)
			}
			if result.Total != 6 || result.HasMore != (page < 3) {
				t.Fatalf("invalid page: %+v", result)
			}
			for _, asset := range result.Assets {
				got = append(got, asset.ID)
			}
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("tied pages = %v; want %v", got, want)
		}
	}
	all, err := service.ProjectAssets("user-1", project.ID)
	if err != nil {
		t.Fatal(err)
	}
	for i, asset := range all {
		if asset.ID != want[i] {
			t.Fatalf("full and paginated orders differ at %d", i)
		}
	}
	if err := db.Model(&model.Asset{}).Where("id = ?", "asset-a").Update("updated_at", stamp.Add(time.Second)).Error; err != nil {
		t.Fatal(err)
	}
	first, err := service.ProjectAssetsPage("user-1", project.ID, 1, 2, "prop", "image", "", nil, "")
	if err != nil || len(first.Assets) != 2 || first.Assets[0].ID != "asset-a" {
		t.Fatalf("newest update should lead: %+v, %v", first, err)
	}
}
