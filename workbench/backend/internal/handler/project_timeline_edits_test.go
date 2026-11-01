package handler

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"yingce/backend/internal/service"
)

func TestProjectCutReviewRejectsForgedOriginsAndResultBodies(t *testing.T) {
	for _, item := range []struct {
		body  string
		valid bool
	}{
		{`{"requestId":"legacy-review-0001","expectedRevision":3,"discardFields":["regionalVersions.reframes"]}`, true},
		{`{"requestId":"legacy-review-0001","originCutId":"foreign","discardFields":["regionalVersions.reframes"]}`, false},
		{`{"timeline":{"clips":[]},"discardFields":["regionalVersions.reframes"]}`, false},
		{`{"discardFields":["regionalVersions.reframes"]}{}`, false},
	} {
		response := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(response)
		context.Request = httptest.NewRequest(http.MethodPost, "/legacy-settings/preview", strings.NewReader(item.body))
		var request service.ProjectCutReviewRequest
		if accepted := bindTimelineEditJSON(context, &request); accepted != item.valid {
			t.Fatal("review binding", item.body, accepted)
		}
	}
}

func TestTimelineEditWritesRejectForgedResultsAndUnknownCommandFields(t *testing.T) {
	for _, item := range []struct {
		body   string
		status int
	}{
		{`{"requestId":"native-edit-request-0001","expectedRevision":1,"commands":[{"op":"moveClip","id":"video","startMs":1000}]}`, 0},
		{`{"commands":[{"op":"moveClip","id":"video","storageKey":"resource:foreign"}]}`, 400},
		{`{"commands":[{"op":"addResource","resourceId":"owned","media":{"DurationMs":5000}}]}`, 400},
		{`{"commands":[{"op":"addResource","resourceId":"owned","url":"https://example.invalid/fake.mp4"}]}`, 400},
		{`{"commands":[],"timeline":{"fake":true}}`, 400},
		{`{"commands":[]}{"commands":[]}`, 400},
		{`{"requestId":"` + strings.Repeat("x", 64<<10) + `"}`, 413},
		{`{"commands":[]}` + strings.Repeat(" ", 64<<10), 413},
	} {
		response := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(response)
		context.Request = httptest.NewRequest(http.MethodPost, "/edits", strings.NewReader(item.body))
		var request service.TimelineEditRequest
		accepted := bindTimelineEditJSON(context, &request)
		if accepted != (item.status == 0) || !accepted && response.Code != item.status {
			t.Fatalf("edit binding accepted=%v status=%d want=%d", accepted, response.Code, item.status)
		}
	}
}
