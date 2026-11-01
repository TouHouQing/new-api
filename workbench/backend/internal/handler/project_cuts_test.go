package handler

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"yingce/backend/internal/service"
)

func TestProjectCutWriteRejectsSourceForgeryTrailingJSONAndOversize(t *testing.T) {
	for _, test := range []struct {
		body   string
		status int
	}{
		{`{"requestId":"stable-cut-request-id","expectedRevision":1,"title":"母版","kind":"master"}`, 0},
		{`{"requestId":"stable-cut-request-id","sourceImportId":"foreign"}`, 400},
		{`{"requestId":"stable-cut-request-id","metadata":{"fake":true}}`, 400},
		{`{"title":"first"}{"title":"second"}`, 400},
		{`{"title":"` + strings.Repeat("x", (8<<20)+(64<<10)) + `"}`, 413},
		{`{"title":"valid"}` + strings.Repeat(" ", (8<<20)+(64<<10)), 413},
	} {
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodPost, "/cuts", strings.NewReader(test.body))
		var req service.ProjectCutCreateRequest
		accepted := bindProjectCutJSON(context, &req)
		if accepted != (test.status == 0) || (!accepted && recorder.Code != test.status) {
			t.Fatalf("cut binder accepted=%v status=%d want=%d", accepted, recorder.Code, test.status)
		}
	}
}

func TestProjectCutCaptionPreviewJSONIsStrictAndBounded(t *testing.T) {
	for _, test := range []struct {
		body   string
		status int
	}{
		{`{"aspectRatio":"16:9","clips":[]}`, 0},
		{`{"aspectRatio":"16:9","clips":[],"model":"not-a-generation"}`, 400},
		{`{"clips":[]}{"clips":[]}`, 400},
		{`{"clips":[{"text":"` + strings.Repeat("x", 512<<10) + `"}]}`, 413},
		{`{"clips":[]}` + strings.Repeat(" ", 512<<10), 413},
	} {
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodPost, "/caption-preview", strings.NewReader(test.body))
		var req service.CaptionPreviewRequest
		accepted := bindCaptionPreviewJSON(context, &req)
		if accepted != (test.status == 0) || !accepted && recorder.Code != test.status {
			t.Fatalf("caption binder accepted=%v status=%d want=%d", accepted, recorder.Code, test.status)
		}
	}
}

func TestProjectCutFixedExportJSONRejectsSnapshotAndFormatForgery(t *testing.T) {
	for _, body := range []string{
		`{"requestId":"stable-export-request","timelineSha256":"` + strings.Repeat("a", 64) + `","output":{"width":64,"height":64}}`,
		`{"requestId":"stable-export-request","timeline":{}}`,
		`{"requestId":"stable-export-request","model":"paid-model"}`,
		`{"requestId":"stable-export-request"}{"requestId":"other"}`,
		`{"requestId":"` + strings.Repeat("x", 64<<10) + `"}`,
	} {
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodPost, "/fixed-cut/renders", strings.NewReader(body))
		var request service.ProjectCutRenderRequest
		if bindStrictProjectJSON(context, &request, 64<<10, "invalid", "oversize") {
			t.Fatal("forged export request accepted")
		}
		if recorder.Code != 400 && recorder.Code != 413 {
			t.Fatal("invalid request status", recorder.Code)
		}
	}
}
