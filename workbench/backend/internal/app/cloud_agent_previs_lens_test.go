package app

import (
	"encoding/json"
	"math"
	"testing"
)

func TestCloudAgentPrevisLensAndDisplayControlsMatchCameraProjection(t *testing.T) {
	scene, camera, _ := trackingPrevisScene(t)
	focal, aperture, focus := 85., 1.4, 2.
	enabled, hidden := true, false
	_, err := cloudAgentPrevisApplyPatchOperation(scene, cloudAgentPrevisPatchOperation{Type: "camera_update", ID: camera, FocalLength: &focal, Aperture: &aperture, FocusDistance: &focus, DepthOfField: &enabled}, 0)
	if err != nil {
		t.Fatal(err)
	}
	current := creationMaps(scene["cameras"])[0]
	if current["aperture"] != aperture || current["focusDistance"] != focus || current["depthOfField"] != true || math.Abs(numberValue(current["fov"], 0)-23.913168488) > 1e-6 {
		t.Fatalf("lens and projection differ: %+v", current)
	}
	if _, err = cloudAgentPrevisApplyPatchOperation(scene, cloudAgentPrevisPatchOperation{Type: "scene_update", ID: "tracking", MotionPathsVisible: &hidden}, 1); err != nil {
		t.Fatal(err)
	}
	if scene["motionPathsVisible"] != false {
		t.Fatal("display preference lost")
	}
	if err = cloudAgentPrevisValidateScene(scene); err != nil {
		t.Fatal(err)
	}
}

func TestCloudAgentPrevisLensRejectsImpossibleFocusWithoutPartialMutation(t *testing.T) {
	scene, camera, _ := trackingPrevisScene(t)
	current := creationMaps(scene["cameras"])[0]
	before, _ := json.Marshal(current)
	focal, focus := 300., .1
	if err := cloudAgentPrevisApplyLens(current, cloudAgentPrevisPatchOperation{FocalLength: &focal, FocusDistance: &focus}); err == nil {
		t.Fatal("focus inside the lens accepted")
	}
	after, _ := json.Marshal(current)
	if string(before) != string(after) {
		t.Fatal("rejected lens changed original camera")
	}
	for _, entry := range []struct {
		field string
		value any
	}{{"aperture", "invalid"}, {"focusDistance", 0.}, {"depthOfField", "yes"}} {
		t.Run(entry.field, func(t *testing.T) {
			fresh, _, _ := trackingPrevisScene(t)
			creationMaps(fresh["cameras"])[0][entry.field] = entry.value
			if err := cloudAgentPrevisValidateScene(fresh); err == nil {
				t.Fatal("malformed lens accepted")
			}
		})
	}
	_ = camera
}
