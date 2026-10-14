package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStudioStageDefaultsMatchTheEditableProjectSchema(t *testing.T) {
	document := map[string]any{"production": map[string]any{"previs": map[string]any{"actors": []any{map[string]any{"id": "hero", "title": "Hero", "x": 0, "z": 0, "endX": 1, "endZ": 0}}}}}
	scene, err := StudioPrevisDocument(document)
	require.NoError(t, err)
	assert.Equal(t, float64(5), scene.Duration)
	assert.Equal(t, float64(50), scene.Camera.FOV)
	assert.Equal(t, "stand", scene.Actors[0].Pose)
}

func TestStudioStageRejectsAmbiguousTargetsAndOutOfSceneKeys(t *testing.T) {
	base := func() map[string]any {
		return map[string]any{"duration": 5, "camera": map[string]any{"yaw": 20, "endYaw": 20, "pitch": 20, "distance": 10, "fov": 50}, "actors": []any{map[string]any{"id": "hero", "x": 0, "z": 0, "endX": 0, "endZ": 0, "pose": "stand"}}, "props": []any{}}
	}
	for _, change := range []func(map[string]any){
		func(scene map[string]any) {
			scene["props"] = []any{map[string]any{"id": "hero", "width": 1, "height": 1, "depth": 1}}
		},
		func(scene map[string]any) { scene["actors"].([]any)[0].(map[string]any)["id"] = "__camera__" },
		func(scene map[string]any) { scene["advanced"] = map[string]any{"followId": "missing"} },
		func(scene map[string]any) {
			scene["advanced"] = map[string]any{"tracks": []any{map[string]any{"targetId": "missing", "keys": []any{}}}}
		},
		func(scene map[string]any) {
			scene["advanced"] = map[string]any{"tracks": []any{map[string]any{"targetId": "hero", "keys": []any{map[string]any{"time": 6, "x": 0, "y": 0, "z": 0, "yaw": 0}}}}}
		},
		func(scene map[string]any) {
			scene["advanced"] = map[string]any{"tracks": []any{map[string]any{"targetId": "hero", "keys": []any{}}, map[string]any{"targetId": "hero", "keys": []any{}}}}
		},
	} {
		scene := base()
		change(scene)
		_, err := StudioPrevisDocument(map[string]any{"production": map[string]any{"previs": scene}})
		assert.Error(t, err)
	}
}
