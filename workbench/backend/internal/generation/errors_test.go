package generation

import (
	"net/http"
	"strings"
	"testing"
)

func TestHTTPErrorIdentifiesWorkflowSpendingLimit(t *testing.T) {
	message := (HTTPError{
		StatusCode: http.StatusForbidden,
		Body:       `{"error":{"message":"workflow spending limit reached; increase the limit before starting another generation"}}`,
	}).Error()
	if !strings.Contains(message, "工作流") || !strings.Contains(message, "费用上限") {
		t.Fatalf("HTTPError.Error() = %q", message)
	}
	if strings.Contains(message, "鉴权") || strings.Contains(message, "API Key") {
		t.Fatalf("workflow spending limit was reported as authentication failure: %q", message)
	}
}
