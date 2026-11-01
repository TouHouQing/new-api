package app

import (
	"gorm.io/gorm"
	"testing"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func TestLegacyNativeHistoryUpgradePreservesHumanCorrectionsAndRejectsConflictingOriginals(t *testing.T) {
	_, db := legacyImportService(t)
	transcript := model.ProjectTranscript{ID: "original-transcript", UserID: "owner", ProjectID: "project", SourceKind: "legacy_import", SourceKey: "original", SourceImportID: "import", SourceLegacyID: "old-transcript", ResourceID: "source", SourceBytes: 100, SourceDurationMs: 1000, Title: "我改过的标题", CurrentRevisionID: "human-revision", Revision: 2, Archived: true}
	original := model.ProjectTranscriptRevision{ID: "original-revision", TranscriptID: transcript.ID, Version: 1, UserID: "owner", DocumentJSON: `{"segments":[]}`}
	human := model.ProjectTranscriptRevision{ID: "human-revision", TranscriptID: transcript.ID, Version: 2, UserID: "owner", DocumentJSON: `{"segments":[{"text":"人工修改"}]}`}
	for _, row := range []any{&transcript, &original, &human} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	incoming := transcript
	incoming.Title = "原始标题"
	incoming.CurrentRevisionID = original.ID
	incoming.Revision = 1
	incoming.Archived = false
	rows := repository.ProductionImportRows{Transcripts: []model.ProjectTranscript{incoming}, TranscriptRevisions: []model.ProjectTranscriptRevision{original}}
	apply := func() error {
		return db.Transaction(func(tx *gorm.DB) error { return repository.New(tx).CreateLegacySupplementRows(&rows) })
	}
	if err := apply(); err != nil {
		t.Fatal(err)
	}
	var stored model.ProjectTranscript
	if err := db.First(&stored, "id = ?", transcript.ID).Error; err != nil {
		t.Fatal(err)
	}
	if stored.Title != transcript.Title || stored.CurrentRevisionID != human.ID || stored.Revision != 2 || !stored.Archived {
		t.Fatal("upgrade overwrote human state", stored)
	}
	rows.Cut = &model.ProjectCut{ID: "should-rollback", UserID: "owner", ProjectID: "project", RequestID: "upgrade-rollback-0001", Kind: "master"}
	rows.TranscriptRevisions[0].DocumentJSON = `{"different":"original changed"}`
	if err := apply(); err == nil {
		t.Fatal("conflicting immutable source accepted")
	}
	var count int64
	if err := db.Model(&model.ProjectCut{}).Where("id = ?", rows.Cut.ID).Count(&count).Error; err != nil || count != 0 {
		t.Fatal("failed upgrade left a cut", count, err)
	}
	rows.Cut = nil
	rows.TranscriptRevisions[0] = original
	rows.Transcripts[0].UserID = "other"
	if err := apply(); err == nil {
		t.Fatal("foreign transcript identity accepted")
	}
}
