package app

import (
	"encoding/json"
	"testing"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

func TestCanvasCaptionSnapshotOwnershipRaceAndImmutableReplay(t *testing.T) {
	s, db := legacyImportService(t)
	project := model.Project{ID: "caption-project", UserID: "owner", Name: "原生字幕合并", Revision: 1, Status: model.ProjectStatusActive}
	if err := db.Create(&project).Error; err != nil {
		t.Fatal(err)
	}
	for _, row := range []model.Resource{{ID: "original", UserID: "owner", Status: model.ResourceStatusReady, MimeType: "video/mp4", Width: 160, Height: 90, DurationMs: 6000, ETag: "fixed-original"}, {ID: "foreign", UserID: "other", Status: model.ResourceStatusReady, MimeType: "video/mp4", DurationMs: 6000}} {
		if err := db.Create(&row).Error; err != nil {
			t.Fatal(err)
		}
	}
	raw := `{"nodes":[{"id":"node","type":"video","title":"清晨的城市","position":{"x":10,"y":20},"metadata":{"storageKey":"resource:original","subtitleEntries":[{"index":7,"startMs":500,"endMs":2000,"text":"第一句话"},{"index":9,"startMs":2500,"endMs":4500,"text":"第二句话"}],"subtitleStyle":{"fontSize":18,"color":"#ffffff","position":"top"}}}]}`
	canvas := model.CanvasProject{ID: "canvas", UserID: "owner", ProjectID: project.ID, Title: "画布", Revision: 2, PayloadJSON: raw}
	if err := db.Create(&canvas).Error; err != nil {
		t.Fatal(err)
	}
	view, err := s.ReadCanvasTimelineSource("owner", project.ID, "canvas", "node", "original")
	if err != nil {
		t.Fatal(err)
	}
	if view.CaptionCount != 2 || view.Title != "清晨的城市" || view.CanvasRevision != 2 || len(view.NodeSHA256) != 64 {
		t.Fatal("bad descriptor", view)
	}
	for _, args := range [][5]string{{"other", project.ID, "canvas", "node", "original"}, {"owner", project.ID, "canvas", "node", "foreign"}, {"owner", project.ID, "missing", "node", "original"}, {"owner", project.ID, "canvas", "missing", "original"}} {
		if _, err := s.ReadCanvasTimelineSource(args[0], args[1], args[2], args[3], args[4]); err == nil {
			t.Fatal("unowned source accepted", args)
		}
	}
	rev := view.CanvasRevision
	request := TimelineEditRequest{RequestID: "canvas-caption-intent-0001", Commands: []production.TimelineEditCommand{{Op: "addCanvasNode", ResourceID: "original", CanvasID: "canvas", NodeID: "node", CanvasRevision: &rev, NodeSHA256: view.NodeSHA256}}}
	preview, err := s.PreviewTimelineEdits("owner", project.ID, request)
	if err != nil {
		t.Fatal(err)
	}
	request.PreviewToken = preview.PreviewToken
	// Layout-only autosave keeps the exact confirmed media/caption snapshot.
	var doc map[string]any
	json.Unmarshal([]byte(raw), &doc)
	node := doc["nodes"].([]any)[0].(map[string]any)
	node["position"] = map[string]any{"x": 999, "y": 888}
	changed, _ := json.Marshal(doc)
	if err := db.Model(&model.CanvasProject{}).Where("id = ?", canvas.ID).Updates(map[string]any{"payload_json": string(changed), "revision": 3}).Error; err != nil {
		t.Fatal(err)
	}
	check, err := s.PreviewTimelineEdits("owner", project.ID, request)
	if err != nil || check.PreviewToken != preview.PreviewToken {
		t.Fatal("unrelated layout invalidated confirmation", err)
	}
	metadata := node["metadata"].(map[string]any)
	metadata["subtitleEntries"].([]any)[0].(map[string]any)["text"] = "修改后的台词"
	changed, _ = json.Marshal(doc)
	db.Model(&model.CanvasProject{}).Where("id = ?", canvas.ID).Updates(map[string]any{"payload_json": string(changed), "revision": 4})
	if _, err := s.ApplyTimelineEdits("owner", project.ID, request); err == nil {
		t.Fatal("stale subtitle confirmation applied")
	}
	current, _ := s.GetProjectTimeline("owner", project.ID)
	if current.Revision != 0 {
		t.Fatal("rejected preview changed cut")
	}
	db.Model(&model.CanvasProject{}).Where("id = ?", canvas.ID).Updates(map[string]any{"payload_json": raw, "revision": 5})
	result, err := s.ApplyTimelineEdits("owner", project.ID, request)
	if err != nil {
		t.Fatal(err)
	}
	var timeline struct {
		Clips []struct {
			ID, Kind, Title, Text string
			CaptionLink           struct {
				SourceClipID string `json:"sourceClipId"`
			} `json:"captionLink"`
			CanvasOrigin struct {
				CanvasRevision int64 `json:"canvasRevision"`
			} `json:"canvasOrigin"`
		}
	}
	cut, err := s.GetProjectTimeline("owner", project.ID)
	if err != nil {
		t.Fatal(err)
	}
	json.Unmarshal(cut.Timeline, &timeline)
	if len(timeline.Clips) != 3 || timeline.Clips[0].Title != view.Title || timeline.Clips[0].CanvasOrigin.CanvasRevision != 2 {
		t.Fatalf("source snapshot lost: %s", cut.Timeline)
	}
	for _, clip := range timeline.Clips[1:] {
		if clip.CaptionLink.SourceClipID != timeline.Clips[0].ID || clip.Text == "" {
			t.Fatal("caption not bound to exact occurrence")
		}
	}
	db.Delete(&model.CanvasProject{}, "id = ?", canvas.ID)
	replay, err := s.ApplyTimelineEdits("owner", project.ID, request)
	if err != nil || !replay.Replayed || replay.AppliedRevision != result.AppliedRevision {
		t.Fatal("immutable replay depended on deleted canvas", err)
	}
	var count int64
	db.Model(&model.ProjectCut{}).Where("project_id = ?", project.ID).Count(&count)
	if count != 2 {
		t.Fatal("lost atomic backup", count)
	}
}
