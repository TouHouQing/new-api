package service

import (
	"github.com/stretchr/testify/assert"
	"testing"
)

func TestStudioDepthReferenceFollowsSelectedTake(t *testing.T) {
	data := map[string]any{"model": "wan2.1-vace-1.3b", "selectedTakeId": "depth", "mediaId": "depth-media", "takes": []any{map[string]any{"id": "depth", "mediaId": "depth-media", "status": "completed", "model": "studio-video-depth"}, map[string]any{"id": "original", "mediaId": "original-media", "status": "completed", "model": "wan2.1-vace-1.3b"}}}
	assert.True(t, studioDepthReference(data))
	data["selectedTakeId"], data["mediaId"] = "original", "original-media"
	assert.False(t, studioDepthReference(data))
	data["selectedTakeId"] = "depth"
	assert.False(t, studioDepthReference(data))
	assert.True(t, studioDepthReference(map[string]any{"model": "studio-video-depth"}))
}
