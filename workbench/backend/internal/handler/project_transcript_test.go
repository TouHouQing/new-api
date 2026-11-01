package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"yingce/backend/internal/service"
)

func TestTranscriptWriteRejectsTimestampEditsExtraObjectsAndOversize(t *testing.T) {
	for _, test := range []struct {
		body   string
		limit  int64
		status int
	}{
		{`{"expectedRevision":1,"changes":[{"id":"s-000001","text":"校正文字"}]}`, 1024, 0},
		{`{"expectedRevision":1,"changes":[{"id":"s-000001","text":"校正文字","startMs":100}]}`, 1024, 400},
		{`{"expectedRevision":1} {"action":"archive"}`, 1024, 400},
		{`{"expectedRevision":1,"note":"` + strings.Repeat("x", 128) + `"}`, 32, 413},
		{`{"expectedRevision":1}` + strings.Repeat(" ", 128), 32, 413},
	} {
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodPatch, "/transcript", strings.NewReader(test.body))
		var input service.ProjectTranscriptWriteRequest
		accepted := bindTranscriptJSON(context, &input, test.limit)
		if (test.status == 0) != accepted {
			t.Fatalf("unexpected decoder result for status %d", test.status)
		}
		if !accepted && recorder.Code != test.status {
			t.Fatalf("got %d want %d", recorder.Code, test.status)
		}
	}
}

func TestProjectLyricsDecoderAllowsExplicitManualClockButRejectsForgedSources(t *testing.T) {
	for _, test := range []struct {
		body     string
		accepted bool
	}{
		{`{"requestId":"lyrics-request-0001","expectedRevision":1,"sourceRevisionId":"original","lyrics":"归来","anchors":[{"line":0,"startMs":100,"endMs":900,"reviewed":true}]}`, true},
		{`{"anchors":[{"line":0,"startMs":100,"endMs":900,"reviewed":true,"method":"source_words"}]}`, false},
		{`{"source":{"resourceId":"foreign"},"anchors":[]}`, false},
		{`{} {"anchors":[]}`, false},
	} {
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodPost, "/lyrics-preview", strings.NewReader(test.body))
		var input service.ProjectLyricsRequest
		if bindTranscriptJSON(context, &input, 256<<10, "歌词参数无效") != test.accepted {
			t.Fatal("lyrics decoder accepted invalid source or rejected manual time")
		}
	}
}
