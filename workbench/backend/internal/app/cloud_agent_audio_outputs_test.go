// SPDX-License-Identifier: AGPL-3.0-or-later
package app

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"yingce/backend/internal/model"
)

func TestCloudAgentMediaAudioTracksSurviveHeadlessDeliveryReopenAndUserEdits(t *testing.T) {
	s, db, _, _ := creationTestService(t)
	task := &model.Task{ID: "separation-task", Type: "canvas_audio", Status: model.TaskStatusSucceeded}
	root := map[string]any{"id": strings.Repeat("a", 80), "type": "audio", "title": "分离声音", "width": 300., "height": 100., "position": map[string]any{"x": 10., "y": 20.}, "metadata": map[string]any{"taskId": task.ID, "status": "loading"}}
	doc := map[string]any{"nodes": []any{root}}
	outputs := []map[string]any{}
	for i, role := range []string{"vocals", "instrumental", "drums"} {
		id := fmt.Sprintf("audio-resource-%d", i)
		if err := db.Create(&model.Resource{ID: id, UserID: "user", Kind: "audio", Status: "ready", MimeType: "audio/wav", Size: int64(100 + i), DurationMs: 4000}).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Create(&model.Asset{ID: generationMediaAssetID(task.ID, i), UserID: "user", Kind: "audio"}).Error; err != nil {
			t.Fatal(err)
		}
		outputs = append(outputs, map[string]any{"storageKey": "resource:" + id, "role": role, "name": fmt.Sprintf("音轨 %d", i)})
	}
	if err := completeCloudAgentAudioOutputs(s.repo, "user", doc, root, task, outputs); err != nil {
		t.Fatal(err)
	}
	nodes := creationMaps(doc["nodes"])
	if len(nodes) != 3 {
		t.Fatal("headless Agent dropped nonprimary tracks", len(nodes))
	}
	for i, node := range nodes {
		meta := node["metadata"].(map[string]any)
		if meta["storageKey"] != fmt.Sprintf("resource:audio-resource-%d", i) || meta["assetId"] != generationMediaAssetID(task.ID, i) || len(stringValue(node["id"])) > 80 {
			t.Fatal("track ownership, asset identity or canvas ID limit lost", node)
		}
		if i > 0 && meta["audioOutputSourceNodeId"] != root["id"] {
			t.Fatal("track root missing")
		}
	}
	nodes[0]["title"] = "用户的人声标题"
	nodes[1]["title"] = "用户的伴奏标题"
	nodes[1]["position"] = map[string]any{"x": 700., "y": 600.}
	doc["nodes"] = []any{nodes[0], nodes[1]} // An intentionally deleted drum track stays deleted.
	raw, _ := json.Marshal(doc)
	var reopened map[string]any
	_ = json.Unmarshal(raw, &reopened)
	reopenedRoot := creationMaps(reopened["nodes"])[0]
	if err := completeCloudAgentAudioOutputs(s.repo, "user", reopened, reopenedRoot, task, outputs); err != nil {
		t.Fatal(err)
	}
	restored := creationMaps(reopened["nodes"])
	if len(restored) != 2 || restored[0]["title"] != "用户的人声标题" || restored[1]["title"] != "用户的伴奏标题" || restored[1]["position"].(map[string]any)["y"] != 600. {
		t.Fatal("headless refresh overwrote user edits or resurrected deleted tracks", reopened)
	}
	if len(audioTaskOutputNodeID("voice", "task", 1)) != 22 || audioTaskOutputNodeID("voice", "task", 1) == audioTaskOutputNodeID("voice", "task", 2) {
		t.Fatal("unstable audio output IDs")
	}
	if audioTaskOutputNodeID("voice", "task", 1) != "audio_822968a790dc6335" {
		t.Fatal("native and browser output identities diverged")
	}
}

func TestCloudAgentMediaAudioTracksRejectPartialOwnershipWithoutChangingCanvas(t *testing.T) {
	s, db, _, _ := creationTestService(t)
	task := &model.Task{ID: "partial-audio", Status: model.TaskStatusSucceeded}
	root := map[string]any{"id": "audio-root", "type": "audio", "metadata": map[string]any{"taskId": task.ID, "status": "loading"}}
	doc := map[string]any{"nodes": []any{root}}
	for _, resource := range []model.Resource{{ID: "owned-audio", UserID: "user", Kind: "audio", Status: "ready", MimeType: "audio/wav"}, {ID: "foreign-audio", UserID: "other", Kind: "audio", Status: "ready", MimeType: "audio/wav"}} {
		if err := db.Create(&resource).Error; err != nil {
			t.Fatal(err)
		}
	}
	before, _ := json.Marshal(doc)
	err := completeCloudAgentAudioOutputs(s.repo, "user", doc, root, task, []map[string]any{{"storageKey": "resource:owned-audio"}, {"storageKey": "resource:foreign-audio"}})
	after, _ := json.Marshal(doc)
	if err == nil || string(before) != string(after) {
		t.Fatal("a partial or foreign output changed the canvas", err, doc)
	}
}

func TestCloudAgentMediaAudioTracksPlaceReadableColumnWithoutCoveringExistingNodes(t *testing.T) {
	nodes := []map[string]any{{"type": "audio", "position": map[string]any{"x": 358., "y": 20.}, "width": 300., "height": 100.}}
	position := availableAudioOutputPosition(nodes, 358, 144, 300, 100)
	if position["x"] != 358. || position["y"] != 156. {
		t.Fatal("audio tracks overlapped or were spread across the entire canvas", position)
	}
}
