// SPDX-License-Identifier: AGPL-3.0-or-later
package production

import (
	"encoding/json"
	"testing"
)

func TestLegacyPrevisDisplayPreferenceUpgradePreservesNativeEdits(t *testing.T) {
	document, rows, data := legacyPrevisFixture()
	objectValue(objectValue(document["production"])["previs"])["advanced"].(map[string]any)["showPaths"] = false
	var report LegacyProjectionReport
	if err := projectLegacyPrevis(rows, &report, document, nil, nil, data); err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	json.Unmarshal([]byte(rows.PrevisCanvas.PayloadJSON), &payload)
	scene := objectValue(listValue(payload["previsScenes"])[1])
	if scene["motionPathsVisible"] != false {
		t.Fatal("legacy hidden paths lost")
	}
	// Reproduce an existing v10 native scene, already edited by its owner.
	delete(scene, "motionPathsVisible")
	scene["title"] = "已修改的导演台"
	objectValue(listValue(scene["objects"])[0])["name"] = "新角色名"
	encoded, _ := json.Marshal(payload)
	current := *rows.PrevisCanvas
	current.PayloadJSON = string(encoded)
	data.Canvas = &current
	data.PreviousPlanning = &report
	rows.PrevisCanvas = nil
	var upgraded LegacyProjectionReport
	if err := projectLegacyPrevis(rows, &upgraded, document, nil, nil, data); err != nil {
		t.Fatal(err)
	}
	if !upgraded.Previs.Reused || rows.PrevisCanvas == nil || rows.PrevisCanvasBeforeSHA == "" {
		t.Fatal("missing exact preimage for preference upgrade")
	}
	json.Unmarshal([]byte(rows.PrevisCanvas.PayloadJSON), &payload)
	scene = objectValue(listValue(payload["previsScenes"])[1])
	if scene["motionPathsVisible"] != false || scene["title"] != "已修改的导演台" || objectValue(listValue(scene["objects"])[0])["name"] != "新角色名" {
		t.Fatal("preference upgrade replaced native edits")
	}
	// A later explicit native choice wins over the original import forever.
	scene["motionPathsVisible"] = true
	encoded, _ = json.Marshal(payload)
	current.PayloadJSON = string(encoded)
	data.Canvas = &current
	rows.PrevisCanvas = nil
	if err := projectLegacyPrevis(rows, &upgraded, document, nil, nil, data); err != nil {
		t.Fatal(err)
	}
	if rows.PrevisCanvas != nil {
		t.Fatal("original preference overwrote later native choice")
	}
}
