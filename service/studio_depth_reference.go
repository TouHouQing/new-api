package service

func studioDepthReference(data map[string]any) bool {
	if data["model"] == "studio-video-depth" {
		return true
	}
	for _, take := range studioObjects(data, "takes") {
		if take["id"] == data["selectedTakeId"] && take["mediaId"] == data["mediaId"] && take["status"] == "completed" {
			return take["model"] == "studio-video-depth"
		}
	}
	return false
}
