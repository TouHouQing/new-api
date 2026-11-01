package handler

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"yingce/backend/internal/service"
)

func TestVideoReworkRejectsForgedMediaAndUnknownNestedFields(t *testing.T) {
	for _, item := range []struct {
		body   string
		status int
	}{
		{`{"requestId":"native-repair-contract-01","expectedRevision":3,"edit":{"clipId":"one-use","clipSha256":"a","sourceResourceId":"original","sourceSha256":"b","sourceStartMs":500,"sourceEndMs":1500,"candidateResourceId":"candidate","candidateSha256":"c","candidateStartMs":250,"audio":"original","region":{"x":17,"y":15,"width":31,"height":33}}}`, 0},
		{`{"edit":{"url":"https://unowned.invalid/video"}}`, 400},
		{`{"edit":{"region":{"x":0,"y":0,"width":10,"height":10,"sourceWidth":640}}}`, 400},
		{`{"edit":{},"output":{"resourceId":"fabricated"}}`, 400},
		{`{"edit":{}}{}`, 400},
		{`{"edit":{}}` + strings.Repeat(" ", 64<<10), 413},
	} {
		response := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(response)
		context.Request = httptest.NewRequest(http.MethodPost, "/video-reworks", strings.NewReader(item.body))
		var request service.VideoReworkCreateRequest
		if accepted := bindTimelineEditJSON(context, &request); accepted != (item.status == 0) || !accepted && response.Code != item.status {
			t.Fatalf("strict native body binding: accepted=%v status=%d want=%d", accepted, response.Code, item.status)
		}
	}
}
