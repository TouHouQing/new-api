// SPDX-License-Identifier: AGPL-3.0-or-later
package production

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func legacyPrevisFixture() (map[string]any, *repository.ProductionImportRows, LegacyProjectionData) {
	document := map[string]any{"production": map[string]any{"previs": map[string]any{"duration": 2.0, "camera": map[string]any{"yaw": 0.0, "endYaw": 90.0, "pitch": 30.0, "distance": 10.0, "fov": 50.0}, "actors": []any{map[string]any{"id": "actor", "title": "角色甲", "x": 2.0, "z": 0.0, "endX": 6.0, "endZ": 0.0, "pose": "point", "color": "#8ab4f8"}}, "props": []any{map[string]any{"id": "prop", "title": "道具", "x": -2.0, "z": 1.0, "width": 2.0, "height": 4.0, "depth": 1.0}}, "advanced": map[string]any{"followId": "actor", "lookAtId": "prop"}}}}
	canvas := model.CanvasProject{ID: "canvas", ProjectID: "project", UserID: "owner", Revision: 7, PayloadJSON: `{"id":"canvas","projectId":"project","nodes":[{"id":"keep-node","title":"人工作品"}],"connections":[],"previsScenes":[{"id":"keep-scene","title":"已编辑"}],"viewport":{"x":11,"k":2},"backgroundMode":"lines"}`}
	rows := &repository.ProductionImportRows{Project: model.Project{ID: "project", UserID: "owner", AspectRatio: "16:9"}, Receipt: model.ProductionImport{ID: "import", CanvasID: "canvas", CreatedAt: time.Unix(100, 0)}}
	return document, rows, LegacyProjectionData{Canvas: &canvas}
}

func TestLegacyPrevisPreservesWorkingCanvasAndOrbitAndBindings(t *testing.T) {
	document, rows, data := legacyPrevisFixture()
	before, _ := json.Marshal(document)
	originalCanvas := data.Canvas.PayloadJSON
	report := LegacyProjectionReport{PreservedOnly: []string{"production.previs", "another-field"}}
	if err := projectLegacyPrevis(rows, &report, document, nil, nil, data); err != nil {
		t.Fatal(err)
	}
	if rows.PrevisCanvas == nil || rows.PrevisCanvas.Revision != 7 || rows.PrevisCanvasBeforeSHA == "" {
		t.Fatal("missing atomic canvas revision")
	}
	var payload map[string]any
	json.Unmarshal([]byte(rows.PrevisCanvas.PayloadJSON), &payload)
	if len(listValue(payload["nodes"])) != 2 || len(listValue(payload["previsScenes"])) != 2 || objectValue(payload["viewport"])["x"] != 11.0 || payload["backgroundMode"] != "lines" {
		t.Fatal("existing canvas content changed")
	}
	scene := objectValue(listValue(payload["previsScenes"])[1])
	objects := listValue(scene["objects"])
	camera := objectValue(listValue(scene["cameras"])[0])
	frames := listValue(camera["keyframes"])
	if camera["followObjectId"] != objectValue(objects[0])["id"] || camera["lookAtObjectId"] != objectValue(objects[1])["id"] || objectValue(objects[0])["pose"] != "point" {
		t.Fatal("native relationships or pose lost")
	}
	if len(frames) != 49 || listValue(objectValue(objectValue(frames[24])["transform"])["position"])[0].(float64) < 6.12 {
		t.Fatal("camera orbit collapsed into straight interpolation")
	}
	if report.Previs.Objects != 2 || !reflect.DeepEqual(report.PreservedOnly, []string{"another-field"}) {
		t.Fatalf("incorrect conversion report: %+v", report)
	}
	after, _ := json.Marshal(document)
	if string(before) != string(after) || data.Canvas.PayloadJSON != originalCanvas {
		t.Fatal("source or active canvas mutated before confirmation")
	}
	second := *rows
	second.PrevisCanvas = nil
	second.PrevisCanvasBeforeSHA = ""
	var report2 LegacyProjectionReport
	if err := projectLegacyPrevis(&second, &report2, document, nil, nil, data); err != nil {
		t.Fatal(err)
	}
	if rows.PrevisCanvas.PayloadJSON != second.PrevisCanvas.PayloadJSON || report.Previs.PayloadSHA256 != report2.Previs.PayloadSHA256 {
		t.Fatal("preview/apply payload nondeterministic")
	}
}

func TestLegacyPrevisRetainsLaterEditsAndDeletion(t *testing.T) {
	document, rows, data := legacyPrevisFixture()
	report := LegacyProjectionReport{}
	if err := projectLegacyPrevis(rows, &report, document, nil, nil, data); err != nil {
		t.Fatal(err)
	}
	data.Canvas = rows.PrevisCanvas
	rows.PrevisCanvas = nil
	if err := projectLegacyPrevis(rows, &report, document, nil, nil, data); err != nil {
		t.Fatal(err)
	}
	if !report.Previs.Reused || rows.PrevisCanvas != nil {
		t.Fatal("existing native scene must not be replaced")
	}
	_, _, deleted := legacyPrevisFixture()
	data.Canvas = deleted.Canvas
	data.PreviousPlanning = &report
	if err := projectLegacyPrevis(rows, &report, document, nil, nil, data); err != nil {
		t.Fatal(err)
	}
	if !report.Previs.Reused || rows.PrevisCanvas != nil {
		t.Fatal("deleted native scene resurrected")
	}
}

func TestLegacyPrevisRejectsMissingBindingsModelsAndMalformedNumbers(t *testing.T) {
	for _, scenario := range []string{"binding", "model", "number", "duplicate-key"} {
		t.Run(scenario, func(t *testing.T) {
			document, rows, data := legacyPrevisFixture()
			scene := objectValue(objectValue(document["production"])["previs"])
			advanced := objectValue(scene["advanced"])
			switch scenario {
			case "binding":
				advanced["followId"] = "missing"
			case "model":
				advanced["models"] = []any{map[string]any{"id": "model", "modelMediaId": "foreign"}}
			case "number":
				scene["duration"] = "2"
			case "duplicate-key":
				key := map[string]any{"time": 1.0}
				advanced["tracks"] = []any{map[string]any{"targetId": "actor", "keys": []any{key, key}}}
			}
			if err := projectLegacyPrevis(rows, &LegacyProjectionReport{}, document, nil, nil, data); err == nil {
				t.Fatal("unsafe mapping accepted")
			}
			if rows.PrevisCanvas != nil {
				t.Fatal("rejected mapping changed canvas")
			}
		})
	}
}

func TestLegacyPrevisGLBAndFixedVersionKeepExactIdentities(t *testing.T) {
	document, rows, data := legacyPrevisFixture()
	advanced := objectValue(objectValue(objectValue(document["production"])["previs"])["advanced"])
	advanced["models"] = []any{map[string]any{"id": "model", "modelMediaId": "glb", "assetId": "asset", "assetVersionId": "v1", "animation": "Walk", "scale": 2.0, "pitch": 30.0}}
	identities := map[string]map[string]string{"assets": {"asset": "native-asset"}, "assetVersions": {"asset/v1": "fixed-v1"}, "assetRoots": {"asset": "newer-v2"}}
	if err := projectLegacyPrevis(rows, &LegacyProjectionReport{}, document, map[string]model.Resource{"glb": {ID: "glb", MimeType: "model/gltf-binary"}}, identities, data); err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	json.Unmarshal([]byte(rows.PrevisCanvas.PayloadJSON), &payload)
	scene := objectValue(listValue(payload["previsScenes"])[1])
	modelObject := objectValue(listValue(scene["objects"])[2])
	if modelObject["sourceAssetVersionId"] != "fixed-v1" || modelObject["storageKey"] != "resource:glb" || modelObject["preferredAnimation"] != "Walk" {
		t.Fatal("GLB, animation or fixed source version changed")
	}
}
