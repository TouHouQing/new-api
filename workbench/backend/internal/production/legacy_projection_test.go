// SPDX-License-Identifier: AGPL-3.0-or-later
package production

import (
	"bytes"
	"encoding/json"
	"fmt"
	"reflect"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

func TestLegacyProjectionKeepsCandidateVersionsAndPinnedTimelineSource(t *testing.T) {
	first := map[string]any{"id": "first", "status": "completed", "mediaId": "r1", "prompt": "original"}
	second := map[string]any{"id": "second", "status": "completed", "mediaId": "r2", "prompt": "selected", "requestSnapshot": "{\"media_id\":\"historical\"}"}
	document := map[string]any{"nodes": []any{map[string]any{"id": "video", "position": map[string]any{"x": json.Number("10"), "y": json.Number("20")}, "data": map[string]any{"kind": "video", "title": "镜头", "prompt": "next draft", "selectedTakeId": "second", "mediaId": "r2", "seconds": json.Number("4"), "takes": []any{first, second}}}}, "shots": []any{map[string]any{"id": "shot", "title": "第二镜", "videoNodeId": "video", "trimStart": json.Number("1"), "trimEnd": json.Number("3"), "muted": true}}, "production": map[string]any{"regional": map[string]any{"masterMediaId": "r1"}}}
	before, _ := json.Marshal(document)
	counter := 0
	rows, report, err := ProjectLegacyDocument(document, LegacyBundleInspection{SourceFingerprint: "fingerprint", SourceProjectID: "old"}, map[string]model.Resource{"r1": {ID: "r1", MimeType: "video/mp4", DurationMs: 4000}, "r2": {ID: "r2", MimeType: "video/mp4", DurationMs: 4000}}, "owner", "导入", time.Now(), func() string { counter++; return fmt.Sprintf("id-%d", counter) })
	if err != nil {
		t.Fatal(err)
	}
	if report.Takes != 2 || len(rows.Versions) != 2 || len(rows.ShotArtifacts) != 2 || len(rows.Shots) != 1 {
		t.Fatalf("history lost: %+v", report)
	}
	if rows.Assets[0].PrimaryVersionID != rows.Versions[1].ID || !rows.ShotArtifacts[1].Selected || rows.ShotArtifacts[0].Selected {
		t.Fatal("selected take changed")
	}
	if rows.ShotArtifacts[0].ResourceID != "r1" || rows.ShotArtifacts[1].ResourceID != "r2" {
		t.Fatal("candidate resources changed")
	}
	var canvas struct {
		Timeline struct {
			Clips []struct {
				DurationMs    int64   `json:"durationMs"`
				SourceStartMs int64   `json:"sourceStartMs"`
				Volume        float64 `json:"volume"`
				DirectMedia   struct {
					StorageKey string `json:"storageKey"`
				} `json:"directMedia"`
			} `json:"clips"`
		} `json:"timeline"`
	}
	wrapped, _ := json.Marshal(map[string]any{"timeline": json.RawMessage(rows.Timeline.PayloadJSON)})
	if err := json.Unmarshal(wrapped, &canvas); err != nil {
		t.Fatal(err)
	}
	if len(canvas.Timeline.Clips) != 1 || canvas.Timeline.Clips[0].DirectMedia.StorageKey != "resource:r2" || canvas.Timeline.Clips[0].DurationMs != 2000 || canvas.Timeline.Clips[0].SourceStartMs != 1000 || canvas.Timeline.Clips[0].Volume != 0 {
		t.Fatalf("clip mapping lost: %+v", canvas)
	}
	after, _ := json.Marshal(document)
	if !reflect.DeepEqual(before, after) {
		t.Fatal("source document mutated")
	}
	if !reflect.DeepEqual(report.PreservedOnly, []string{"production"}) {
		t.Fatalf("unmapped data hidden: %+v", report)
	}
}

func TestLegacyProjectionCreatesCompleteMediaAndPendingAssetDocuments(t *testing.T) {
	document := map[string]any{"nodes": []any{
		map[string]any{"id": "ready", "data": map[string]any{"kind": "image", "title": "原画", "mediaId": "image-resource"}},
		map[string]any{"id": "pending", "data": map[string]any{"kind": "video", "title": "未生成镜头", "prompt": "下一镜"}},
	}}
	index := 0
	rows, _, err := ProjectLegacyDocument(document, LegacyBundleInspection{}, map[string]model.Resource{"image-resource": {ID: "image-resource", Width: 12, Height: 8, Size: 1234, MimeType: "image/png"}}, "owner", "导入", time.Now(), func() string { index++; return fmt.Sprintf("id-%d", index) })
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(rows.Assets[0].PayloadJSON), &payload); err != nil {
		t.Fatal(err)
	}
	data := payload["data"].(map[string]any)
	if payload["kind"] != "image" || data["bytes"] != float64(1234) || data["width"] != float64(12) || data["height"] != float64(8) || data["mimeType"] != "image/png" || data["dataUrl"] == "" {
		t.Fatalf("incomplete native media contract: %#v", payload)
	}
	if rows.Assets[1].Kind != "entity" {
		t.Fatal("pending media must preserve its definition without fabricating an image or video")
	}
}

func TestLegacyBundleRejectsDanglingSelectionAndCredentials(t *testing.T) {
	for _, scenario := range []string{"selection", "snapshot-secret", "asset-slots"} {
		t.Run(scenario, func(t *testing.T) {
			manifest, media := legacyFixture(t)
			data := manifest.Project["nodes"].([]any)[0].(map[string]any)["data"].(map[string]any)
			switch scenario {
			case "selection":
				data["selectedTakeId"] = "missing"
			case "snapshot-secret":
				data["takes"].([]any)[0].(map[string]any)["requestSnapshot"] = `{"headers":{"Authorization":"Bearer test-only"}}`
			case "asset-slots":
				manifest.Project["assets"] = []any{map[string]any{"id": "asset"}}
			}
			archive := buildLegacyFixture(t, manifest, media, "")
			if _, err := OpenLegacyBundle(bytes.NewReader(archive), int64(len(archive))); err == nil {
				t.Fatal("invalid bundle accepted")
			}
		})
	}
}
