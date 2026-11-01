package app

import "testing"

func trackingPrevisScene(t *testing.T) (map[string]any, string, string) {
	t.Helper()
	scene, err := cloudAgentPrevisSceneCreateTemplate(cloudAgentPrevisSceneCreateArgs{SceneID: "tracking", Title: "跟随机位", TemplateID: "dialogue"})
	if err != nil {
		t.Fatal(err)
	}
	return scene, stringValue(creationMaps(scene["cameras"])[0]["id"]), stringValue(creationMaps(scene["objects"])[0]["id"])
}

func TestCloudAgentPrevisCameraTrackingCannotLoseBoundSubject(t *testing.T) {
	scene, camera, actor := trackingPrevisScene(t)
	if _, err := cloudAgentPrevisApplyPatchOperation(scene, cloudAgentPrevisPatchOperation{Type: "camera_update", ID: camera, FollowObjectID: &actor, LookAtObjectID: &actor}, 0); err != nil {
		t.Fatal(err)
	}
	if err := cloudAgentPrevisValidateScene(scene); err != nil {
		t.Fatal(err)
	}
	if _, err := cloudAgentPrevisApplyPatchOperation(scene, cloudAgentPrevisPatchOperation{Type: "object_remove", ID: actor}, 1); err == nil {
		t.Fatal("removed the subject of an active camera")
	}
	empty := ""
	if _, err := cloudAgentPrevisApplyPatchOperation(scene, cloudAgentPrevisPatchOperation{Type: "camera_update", ID: camera, FollowObjectID: &empty, LookAtObjectID: &empty}, 2); err != nil {
		t.Fatal(err)
	}
	if _, err := cloudAgentPrevisApplyPatchOperation(scene, cloudAgentPrevisPatchOperation{Type: "object_remove", ID: actor}, 3); err != nil {
		t.Fatal(err)
	}
	if err := cloudAgentPrevisValidateScene(scene); err != nil {
		t.Fatal(err)
	}
}

func TestCloudAgentPrevisCameraTrackingRejectsUnknownSubjectWithoutReplacingBinding(t *testing.T) {
	scene, camera, actor := trackingPrevisScene(t)
	unknown := "another-scene-object"
	if _, err := cloudAgentPrevisApplyPatchOperation(scene, cloudAgentPrevisPatchOperation{Type: "camera_update", ID: camera, FollowObjectID: &actor}, 0); err != nil {
		t.Fatal(err)
	}
	if _, err := cloudAgentPrevisApplyPatchOperation(scene, cloudAgentPrevisPatchOperation{Type: "camera_update", ID: camera, FollowObjectID: &actor, LookAtObjectID: &unknown}, 1); err == nil {
		t.Fatal("accepted an unbound scene object")
	}
	current := creationMaps(scene["cameras"])[0]
	if stringValue(current["followObjectId"]) != actor || current["lookAtObjectId"] != nil {
		t.Fatal("rejected tracking changed the saved binding")
	}
	current["lookAtObjectId"] = 42
	if err := cloudAgentPrevisValidateScene(scene); err == nil {
		t.Fatal("accepted malformed tracking state")
	}
}
