package handler

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"yingce/backend/internal/service"
)

func TestMediaAnalysisWriteBindsOnlyCorrectionContract(t *testing.T) {
	for _, test := range []struct {
		body   string
		status int
	}{
		{`{"requestId":"request-with-stable-id","expectedRevision":1,"title":"校正"}`, 0},
		{`{"expectedRevision":1,"source":{"resourceId":"other"}}`, 400},
		{`{"expectedRevision":1,"evidence":{"fake":true}}`, 400},
		{`{"expectedRevision":1} {"archived":true}`, 400},
		{`{"note":"` + strings.Repeat("x", 2<<20) + `"}`, 413},
		{`{"expectedRevision":1}` + strings.Repeat(" ", 2<<20), 413},
	} {
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodPut, "/analysis", strings.NewReader(test.body))
		var input service.ProjectMediaAnalysisWriteRequest
		accepted := bindMediaAnalysisJSON(context, &input)
		if accepted != (test.status == 0) || (!accepted && recorder.Code != test.status) {
			t.Fatalf("analysis binder accepted=%v status=%d want=%d", accepted, recorder.Code, test.status)
		}
	}
}
