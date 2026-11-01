package app

import (
	"encoding/json"
	"testing"

	"yingce/backend/internal/model"
)

func TestCloudAgentNativeImageEditSealsSavedMaskAndBindsApprovalDependencies(t *testing.T) {
	s, db, input, _, _ := nativeImageEditFixture(t)
	canvas, err := s.repo.CanvasProjectForUser("image-user", "native-edit-canvas")
	if err != nil {
		t.Fatal(err)
	}
	doc, err := creationDocument(canvas.PayloadJSON)
	if err != nil {
		t.Fatal(err)
	}
	nodes, _ := creationObjects(doc["nodes"])
	meta := nodes["original-node"]["metadata"].(map[string]any)
	original := input["metadata"].(map[string]any)["nativeImageEdit"].(map[string]any)
	mask := original["mask"]
	encoded, _ := json.Marshal(mask)
	var saved map[string]any
	json.Unmarshal(encoded, &saved)
	saved["version"], saved["sourceStorageKey"] = 1, "resource:"+original["resourceId"].(string)
	meta["imageMaskDocument"] = saved
	encoded, _ = json.Marshal(doc)
	if err := db.Model(canvas).Update("payload_json", string(encoded)).Error; err != nil {
		t.Fatal(err)
	}
	args := cloudAgentMediaArgs{Mode: "image", NodeID: "new-candidate", ReferenceNodeIDs: []string{"original-node"}, ImageEdit: &cloudAgentImageEditIntent{SourceNodeID: "original-node", UseSavedMask: true}}
	request := map[string]any{"mode": "image", "metadata": map[string]any{}}
	if err := s.prepareCloudAgentImageEdit("image-user", canvas.ID, doc, args, request); err != nil {
		t.Fatal(err)
	}
	encoded, _ = json.Marshal(request)
	edit, _, err := nativeImageEditForTask(&model.Task{Type: "canvas_image", ProjectID: canvas.ID, InputJSON: string(encoded)})
	if err != nil || edit == nil || edit.Source.SHA256 != original["expectedSourceSha256"] || edit.Mask == nil {
		t.Fatal("Agent did not reuse the ordinary sealed image admission", err)
	}
	before, err := cloudAgentMediaDependencyHash(doc, args)
	if err != nil {
		t.Fatal(err)
	}
	saved["strokes"] = []any{}
	after, err := cloudAgentMediaDependencyHash(doc, args)
	if err != nil || before == after {
		t.Fatal("changing the saved selection did not invalidate approval", err)
	}
	if err := s.prepareCloudAgentImageEdit("image-user", canvas.ID, doc, args, request); err == nil {
		t.Fatal("empty selection was admitted")
	}
	args.ReferenceNodeIDs = []string{"other-node"}
	if err := s.prepareCloudAgentImageEdit("image-user", canvas.ID, doc, args, request); err == nil {
		t.Fatal("unrelated image reference was admitted")
	}
	var count int64
	if err := db.Model(&model.Task{}).Count(&count).Error; err != nil || count != 0 {
		t.Fatal("Agent preview submitted inference", err)
	}
}
