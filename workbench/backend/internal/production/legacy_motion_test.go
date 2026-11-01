package production

import (
	"encoding/json"
	"testing"
	"yingce/backend/internal/model"
)

func TestLegacyMotionConvertsEveryKindAndPreservesProgramAndPhaseClocks(t *testing.T) {
	var rows []any
	if err := json.Unmarshal([]byte(`[{"id":"title","kind":"text","text":"中文 {%{pts}}","start":0.5,"end":2.5,"x":0.5,"y":0.2,"font_size":60,"font_family":"serif","color":"#ffffff","animation":"fade","bpm":120,"phaseOffset":0.25,"phaseDuration":4},{"id":"shape","kind":"shape","text":"方圆","start":0,"end":3,"x":0.5,"y":0.5,"font_size":80,"color":"#ff0000","animation":"morph","bpm":60},{"id":"logo","kind":"image","text":"原始Logo","imageMediaId":"owned","start":1,"end":3,"x":0.8,"y":0.8,"font_size":60,"color":"#ffffff","animation":"rotate","bpm":60}]`), &rows); err != nil {
		t.Fatal(err)
	}
	resources := map[string]model.Resource{"owned": {ID: "owned", Status: model.ResourceStatusReady, MimeType: "image/png"}}
	before, _ := json.Marshal(rows)
	clips, converted, err := projectLegacyMotion(rows, resources, "original", false)
	if err != nil || !converted || len(clips) != 3 {
		t.Fatal(clips, converted, err)
	}
	first := objectValue(clips[0])
	g, err := MotionGraphicForClip(first)
	if err != nil || g == nil || g.PhaseOffsetMs != 250 || g.PhaseDurationMs != 4000 || g.FontFamily != "serif" || first["startMs"] != int64(500) || first["durationMs"] != int64(2000) {
		t.Fatal("clock or font was reset", first, err)
	}
	raw, _ := json.Marshal(map[string]any{"version": 2, "tracks": []any{map[string]any{"id": "import-graphics", "kind": "text"}}, "clips": clips, "durationMs": 0})
	if _, err := ValidateTimelineDocument(raw); err != nil {
		t.Fatal(err)
	}
	after, _ := json.Marshal(rows)
	if string(before) != string(after) {
		t.Fatal("source changed")
	}
	delete(resources, "owned")
	if _, _, err := projectLegacyMotion(rows, resources, "original", false); err == nil {
		t.Fatal("missing fixed image silently replaced")
	}
}

func TestLegacyMotionUnknownOrMalformedFieldsStayVisibleAndRegionalScopeIsIndependent(t *testing.T) {
	document, resources, identities := legacyVersionsFixture(t)
	version := objectValue(listValue(objectValue(document["production"])["regionalVersions"])[0])
	var graphics []any
	_ = json.Unmarshal([]byte(`[{"id":"g","text":"区域版标题","start":0,"end":2,"x":0.5,"y":0.5,"font_size":60,"color":"#ffffff","animation":"slide","bpm":120}]`), &graphics)
	version["motionGraphics"] = graphics
	objectValue(document["production"])["motionGraphics"] = []any{map[string]any{"invalid": "global must not leak"}}
	converted, err := ProjectLegacyVersion(document, "regional", "import", resources, identities, false)
	if err != nil || len(converted.PreservedOnly) != 0 {
		t.Fatal("valid regional field not converted", converted.PreservedOnly, err)
	}
	var native map[string]any
	_ = json.Unmarshal(converted.Timeline, &native)
	count := 0
	for _, value := range listValue(native["clips"]) {
		if objectValue(value)["graphic"] != nil {
			count++
		}
	}
	if count != 1 {
		t.Fatal("regional graphic omitted or global graphic leaked")
	}
	for _, patch := range []map[string]any{{"x": "0.5"}, {"kind": 12}, {"unknown": "retain"}, {"end": .00001}} {
		encoded, _ := json.Marshal(graphics)
		var changed []any
		_ = json.Unmarshal(encoded, &changed)
		for key, value := range patch {
			objectValue(changed[0])[key] = value
		}
		if result, ok, err := projectLegacyMotion(changed, resources, "id", false); err != nil || ok || len(result) != 0 {
			t.Fatal("malformed field counted as converted", patch, result, ok, err)
		}
	}
}

func TestLegacyNativeDeliveryGuardRetainsEarlierMissingEffects(t *testing.T) {
	root := map[string]any{"motionGraphics": []any{map[string]any{"id": "original"}}, "reframes": map[string]any{"clip": map[string]any{"analysisId": "original"}}}
	document := map[string]any{"production": root}
	if fields := LegacyNativeDeliveryFields(document, 3, nil); len(fields) != 2 {
		t.Fatal("v3 cached report hid effects", fields)
	}
	if fields := LegacyNativeDeliveryFields(document, 4, nil); len(fields) != 1 || fields[0] != "production.reframes" {
		t.Fatal("v4 converted graphics should not hide unconverted reframes", fields)
	}
	if fields := LegacyNativeDeliveryFields(document, 4, []string{"production.motionGraphics"}); len(fields) != 2 {
		t.Fatal("v4 malformed graphics were cleared", fields)
	}
}
