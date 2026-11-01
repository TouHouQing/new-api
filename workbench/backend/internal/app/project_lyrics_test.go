package app

import (
	"encoding/json"
	"testing"

	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

func projectLyricsFixture(t *testing.T, svc *Service, db *gorm.DB) ProjectLyricsRequest {
	t.Helper()
	doc := production.TranscriptDocument{Version: 1, Precision: "word", Segments: []production.TranscriptSpan{{ID: "s", StartMs: 0, EndMs: 3000, Text: "雨夜重逢同行"}}, Words: []production.TranscriptSpan{{ID: "w1", StartMs: 300, EndMs: 600, Text: "雨夜"}, {ID: "w2", StartMs: 800, EndMs: 1100, Text: "重逢"}, {ID: "w3", StartMs: 2000, EndMs: 2200, Text: "同行"}}}
	raw, _ := json.Marshal(doc)
	for _, row := range []any{
		&model.Project{ID: "lyrics-project", UserID: "owner", Name: "歌曲 MV", Status: model.ProjectStatusActive},
		&model.Resource{ID: "lyrics-audio", UserID: "owner", Kind: "audio", MimeType: "audio/wav", Status: model.ResourceStatusReady, DurationMs: 3000, Size: 100, ETag: "source-etag"},
		&model.ProjectTranscript{ID: "lyrics-transcript", UserID: "owner", ProjectID: "lyrics-project", ResourceID: "lyrics-audio", SourceKind: "recognition", SourceKey: "lyrics-source", SourceETag: "source-etag", SourceBytes: 100, SourceDurationMs: 3000, CurrentRevisionID: "original", Revision: 1},
		&model.ProjectTranscriptRevision{ID: "original", TranscriptID: "lyrics-transcript", UserID: "owner", AuthorID: "owner", Version: 1, DocumentJSON: string(raw)},
	} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	expected := int64(1)
	return ProjectLyricsRequest{RequestID: "lyrics-native-request-0001", ExpectedRevision: &expected, SourceRevisionID: "original", Lyrics: "[Verse]\n雨夜重逢\n同行", Anchors: []production.LyricsAnchor{{Line: 1, StartSpanID: "w1", EndSpanID: "w2", Reviewed: true}, {Line: 2, StartSpanID: "w3", EndSpanID: "w3", Reviewed: true}}}
}

func exerciseProjectLyricsHistory(t *testing.T, svc *Service, db *gorm.DB) {
	t.Helper()
	input := projectLyricsFixture(t, svc, db)
	preview, err := svc.PreviewProjectLyrics("owner", "lyrics-project", "lyrics-transcript", input)
	if err != nil || !preview.CanApply || preview.Precision != "word" {
		t.Fatal(preview, err)
	}
	input.PreviewToken = preview.PreviewToken
	adopted, err := svc.ApplyProjectLyrics("owner", "lyrics-project", "lyrics-transcript", input)
	if err != nil || adopted.Replayed || !adopted.Current || adopted.View.Document.Version != 2 || adopted.View.CurrentVersion.Version != 2 {
		t.Fatal(adopted, err)
	}
	if adopted.View.Document.Lyrics == nil || adopted.View.Document.Segments[0].StartMs != 300 || adopted.View.Document.Segments[1].StartMs != 2000 {
		t.Fatal("source timing/provenance missing")
	}
	if adopted.View.Document.Lyrics.Text != input.Lyrics || adopted.View.Document.Lyrics.Lines[0].Line != 1 {
		t.Fatal("full lyrics or section index lost on adoption")
	}
	original, err := svc.GetProjectTranscriptVersion("owner", "lyrics-project", "lyrics-transcript", "original")
	if err != nil || original.Document.Version != 1 || original.Document.Lyrics != nil || len(original.Document.Words) != 3 {
		t.Fatal("original recognition changed", err)
	}
	// A delayed successful reply must return its original revision, even after
	// later manual correction and archive; it must never re-adopt old content.
	expected := adopted.View.Transcript.Revision
	text := "同行！"
	corrected, err := svc.UpdateProjectTranscript("owner", "lyrics-project", "lyrics-transcript", ProjectTranscriptWriteRequest{ExpectedRevision: &expected, Changes: []production.TranscriptCorrection{{ID: adopted.View.Document.Segments[1].ID, Text: &text}}})
	if err != nil {
		t.Fatal(err)
	}
	expected = corrected.Transcript.Revision
	archived, err := svc.UpdateProjectTranscript("owner", "lyrics-project", "lyrics-transcript", ProjectTranscriptWriteRequest{ExpectedRevision: &expected, Action: "archive"})
	if err != nil {
		t.Fatal(err)
	}
	replay, err := svc.ApplyProjectLyrics("owner", "lyrics-project", "lyrics-transcript", input)
	if err != nil || !replay.Replayed || replay.Current || replay.View.CurrentVersion.ID != adopted.View.CurrentVersion.ID {
		t.Fatal("lost reply did not recover its fixed version", err)
	}
	current, err := svc.GetProjectTranscript("owner", "lyrics-project", "lyrics-transcript")
	if err != nil || current.Transcript.Revision != archived.Transcript.Revision || !current.Transcript.Archived || current.Document.Segments[1].Text != text {
		t.Fatal("replay overwrote later work", err)
	}
	input.Lyrics = "different"
	if _, err := svc.ApplyProjectLyrics("owner", "lyrics-project", "lyrics-transcript", input); err == nil {
		t.Fatal("same request accepted different payload")
	}
	if _, err := svc.ReadProjectLyricsResult("other", "lyrics-project", "lyrics-transcript", input.RequestID); err == nil {
		t.Fatal("foreign user read lyrics")
	}
	var count int64
	db.Model(&model.ProjectTranscriptRevision{}).Where("transcript_id = ?", "lyrics-transcript").Count(&count)
	if count != 3 {
		t.Fatalf("unexpected duplicated revisions: %d", count)
	}
}

func TestProjectLyricsSQLiteRetainsSourceFixedReceiptAndLaterCorrection(t *testing.T) {
	svc, db := legacyImportService(t)
	exerciseProjectLyricsHistory(t, svc, db)
}
func TestProjectLyricsPostgresRetainsSourceFixedReceiptAndLaterCorrection(t *testing.T) {
	svc, db := newProjectNameConflictPostgresService(t)
	connection, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = connection.Close() })
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	exerciseProjectLyricsHistory(t, svc, db)
}
func TestProjectLyricsRejectsUnreviewedChangedSourceAndStalePreview(t *testing.T) {
	svc, db := legacyImportService(t)
	input := projectLyricsFixture(t, svc, db)
	preview, err := svc.PreviewProjectLyrics("owner", "lyrics-project", "lyrics-transcript", input)
	if err != nil {
		t.Fatal(err)
	}
	input.PreviewToken = preview.PreviewToken
	for _, mode := range []string{"review", "token", "revision", "source", "duration", "foreign-version"} {
		t.Run(mode, func(t *testing.T) {
			copy := input
			copy.Anchors = append([]production.LyricsAnchor{}, input.Anchors...)
			switch mode {
			case "review":
				copy.Anchors[0].Reviewed = false
			case "token":
				copy.PreviewToken = ""
			case "revision":
				stale := int64(0)
				copy.ExpectedRevision = &stale
			case "source":
				db.Model(&model.Resource{}).Where("id = ?", "lyrics-audio").Update("e_tag", "changed")
				defer db.Model(&model.Resource{}).Where("id = ?", "lyrics-audio").Update("e_tag", "source-etag")
			case "duration":
				db.Model(&model.Resource{}).Where("id = ?", "lyrics-audio").Update("duration_ms", 2999)
				defer db.Model(&model.Resource{}).Where("id = ?", "lyrics-audio").Update("duration_ms", 3000)
			case "foreign-version":
				copy.SourceRevisionID = "not-owned"
			}
			if _, err := svc.ApplyProjectLyrics("owner", "lyrics-project", "lyrics-transcript", copy); err == nil {
				t.Fatal("invalid lyric proposal adopted")
			}
		})
	}
	current, err := svc.GetProjectTranscript("owner", "lyrics-project", "lyrics-transcript")
	if err != nil || current.Transcript.Revision != 1 || current.CurrentVersion.ID != "original" {
		t.Fatal("rejected operation mutated source", err)
	}
}
