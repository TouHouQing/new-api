package imageplan

import (
	"encoding/json"
	"strings"
	"testing"
)

const proposal = `{"canPlan":true,"layout":"composition","coordinateSpace":"pixels","imageSize":{"width":800,"height":400},"layers":[{"name":"底板","description":"白色排版背景","kind":"background","generation":{"prompt":"保留白底","background":"opaque"},"extraction":{"method":"source"}},{"name":"完整照片","description":"右侧完整人物照片","kind":"object","editUnit":"scene","bbox":[400,40,720,360],"generation":{"prompt":"保留完整照片内部全部像素","background":"transparent"},"extraction":{"method":"source-region","shape":"rounded-rect","radiusRatio":0.1}}]}`

func TestPlanPreservesOriginalExtractionAndNormalizesActualReferenceCoordinates(t *testing.T) {
	plan, err := Parse("```json\n"+proposal+"\n```", Size{800, 400}, "materials")
	if err != nil {
		t.Fatal(err)
	}
	layer := plan.Layers[1]
	if plan.Layers[0].Extraction.Method != "source" || layer.Extraction.Method != "source-region" || layer.Extraction.Region == nil || layer.RemoveFromBackground || layer.BBox[0] != 500 || layer.BBox[1] != 100 || layer.BBox[2] != 900 || layer.BBox[3] != 900 || *layer.Extraction.Region.RadiusRatio != .1 {
		t.Fatalf("original-pixel plan changed: %+v", plan)
	}
	recompose, err := Parse(proposal, Size{800, 400}, "recompose")
	if err != nil || recompose.Layers[0].Extraction.Method != "generate" || !recompose.Layers[1].RemoveFromBackground {
		t.Fatalf("explicit purpose not applied: %v %+v", err, recompose)
	}
}

func TestPlanUncertainOrConflictingBoundsRequireManualSelectionWithoutModelFallback(t *testing.T) {
	for _, raw := range []string{strings.Replace(proposal, `"width":800`, `"width":1000`, 1), strings.Replace(proposal, `"shape":"rounded-rect"`, `"bbox":[1,2,3,4],"shape":"rounded-rect"`, 1), strings.Replace(proposal, `"bbox":[400,40,720,360],`, "", 1)} {
		plan, err := Parse(raw, Size{800, 400}, "materials")
		if err != nil || len(plan.Warnings) == 0 || plan.Layers[1].Extraction.Method != "source-region" || plan.Layers[1].Extraction.Region != nil {
			t.Fatalf("uncertain bounds became execution: %v %+v", err, plan)
		}
	}
}

func TestPlanRejectsUnrecognizedImageAndUndeclaredGenerationOverrides(t *testing.T) {
	for _, raw := range []string{`{"canPlan":false,"reason":"无法读取图片"}`, `not-json`, strings.Replace(proposal, `"prompt":"保留白底"`, `"model":"paid","prompt":"保留白底"`, 1), strings.Replace(proposal, `"background":"transparent"`, `"background":"opaque"`, 1), strings.Replace(proposal, `"name":"完整照片"`, `"name":"底板"`, 1), strings.Replace(proposal, `"radiusRatio":0.1`, `"radiusRatio":0.9`, 1)} {
		if _, err := Parse(raw, Size{800, 400}, "materials"); err == nil {
			t.Fatalf("invalid planning accepted: %s", raw)
		}
	}
	var data map[string]any
	if err := json.Unmarshal([]byte(proposal), &data); err != nil {
		t.Fatal(err)
	}
	data["layout"] = "continuous"
	raw, _ := json.Marshal(data)
	if _, err := Parse(string(raw), Size{800, 400}, "materials"); err == nil {
		t.Fatal("continuous-photo fragment was accepted as an independent original-pixel scene")
	}
}
