package main

import (
	"testing"
	"time"

	"gorm.io/gorm"
)

type snapshotFixture struct {
	ID             string `gorm:"primaryKey;size:36"`
	Label          string `gorm:"size:128;default:fallback"`
	Enabled        bool   `gorm:"default:true"`
	Counter        int    `gorm:"default:7"`
	CreatedAt      time.Time
	UpdatedAt      time.Time
	DeletedAt      gorm.DeletedAt
	NullableString string
	Tags           []string `gorm:"serializer:json;type:text"`
}

func (snapshotFixture) TableName() string { return "snapshot_fixtures" }

func TestSnapshotCopyPreservesZeroDefaultsNullsAndSoftDeletedRows(t *testing.T) {
	withMigrationTargets(t, func(t *testing.T, target *gorm.DB) {
		source := sequenceSource(t)
		for _, db := range []*gorm.DB{source, target} {
			if err := db.AutoMigrate(&snapshotFixture{}); err != nil {
				t.Fatal(err)
			}
		}
		insert := "INSERT INTO snapshot_fixtures (id,label,enabled,counter,created_at,updated_at,deleted_at,nullable_string,tags) VALUES (?,?,?,?,?,?,?,?,?)"
		if err := source.Exec(insert, "a", "", false, 0, time.Time{}, time.Time{}, nil, nil, `["one"]`).Error; err != nil {
			t.Fatal(err)
		}
		deleted := time.Date(2025, 1, 2, 3, 4, 5, 0, time.UTC)
		if err := source.Exec(insert, "b", "archived", false, 0, time.Time{}, time.Time{}, deleted, "", nil).Error; err != nil {
			t.Fatal(err)
		}
		migration := migrateTable[snapshotFixture]("snapshot_fixtures")
		if count, err := migration.run(source, target, true); err != nil || count != 2 {
			t.Fatalf("snapshot copy: %d %v", count, err)
		}
		var rows []snapshotFixture
		if err := target.Unscoped().Order("id").Find(&rows).Error; err != nil {
			t.Fatal(err)
		}
		if len(rows) != 2 || rows[0].Label != "" || rows[0].Enabled || rows[0].Counter != 0 || !rows[0].CreatedAt.IsZero() || !rows[0].UpdatedAt.IsZero() {
			t.Fatalf("snapshot values synthesized: %#v", rows)
		}
		if !rows[1].DeletedAt.Valid || !rows[1].DeletedAt.Time.Equal(deleted) {
			t.Fatal("soft-deleted history was omitted")
		}
		if len(rows[0].Tags) != 1 || rows[0].Tags[0] != "one" {
			t.Fatal("serialized field was lost")
		}
		var nulls int64
		if err := target.Table("snapshot_fixtures").Where("nullable_string IS NULL").Count(&nulls).Error; err != nil || nulls != 1 {
			t.Fatalf("NULL mask changed: %d %v", nulls, err)
		}
		if _, err := migration.run(source, target, false); err != nil {
			t.Fatalf("fresh source reread differs: %v", err)
		}
		if err := source.Exec("ALTER TABLE snapshot_fixtures ADD COLUMN source_only TEXT").Error; err != nil {
			t.Fatal(err)
		}
		if _, err := migration.run(source, target, false); err == nil {
			t.Fatal("unexplained source column was ignored")
		}
	})
}
