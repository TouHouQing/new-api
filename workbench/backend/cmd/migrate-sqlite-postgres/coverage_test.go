package main

import (
	"strings"
	"testing"

	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func TestCoverageChecksActualSchemaAndCuratedSkillTables(t *testing.T) {
	db := sequenceSource(t)
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	if err := verifyMigrationCoverage(db); err != nil {
		t.Fatal(err)
	}
	tables, err := db.Migrator().GetTables()
	if err != nil {
		t.Fatal(err)
	}
	var businessTables []string
	for _, name := range tables {
		if !strings.HasPrefix(name, "sqlite_") {
			businessTables = append(businessTables, name)
		}
	}
	if err := validateTargetTableNames(businessTables); err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("CREATE TABLE unlisted_production_data (id TEXT PRIMARY KEY)").Error; err != nil {
		t.Fatal(err)
	}
	if err := verifyMigrationCoverage(db); err == nil {
		t.Fatal("actual unlisted source table was silently omitted")
	}
}

func TestFreshCopyPreservesCustomizedSkillCatalogAndRerun(t *testing.T) {
	source, target := sequenceSource(t), sequenceSource(t)
	for _, db := range []*gorm.DB{source, target} {
		if err := database.MigrateSchema(db); err != nil {
			t.Fatal(err)
		}
	}
	if err := source.Where("id = ?", "drama").Delete(&model.SkillCurationRoot{}).Error; err != nil {
		t.Fatal(err)
	}
	custom := model.SkillCurationRoot{ID: "custom", Name: "产品片", NormalizedName: "产品片", SortOrder: 3, Enabled: false}
	if err := source.Create(&custom).Error; err != nil {
		t.Fatal(err)
	}
	if err := source.Model(&model.SkillCurationSetting{}).Where("id = 1").Updates(map[string]any{"enabled": true, "revision": 9}).Error; err != nil {
		t.Fatal(err)
	}
	for _, migration := range migrations() {
		if _, err := migration.run(source, target, true); err != nil {
			t.Fatalf("copy %s: %v", migration.name, err)
		}
	}
	for _, migration := range migrations() {
		if _, err := migration.run(source, target, false); err != nil {
			t.Fatalf("verify %s: %v", migration.name, err)
		}
	}
	var count int64
	if err := target.Model(&model.SkillCurationRoot{}).Where("id = ?", "drama").Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("deleted default root was recreated: %d %v", count, err)
	}
}
