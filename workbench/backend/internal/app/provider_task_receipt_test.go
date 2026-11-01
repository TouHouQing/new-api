package app

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"yingce/backend/internal/model"
	"yingce/backend/internal/protocol"
)

func TestLocalAdapterParsedReceiptPersistsBeforePollAndResumesWithoutAnotherCreate(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	svc, db := legacyImportService(t)
	task := model.Task{ID: "parsed-receipt-task", UserID: "owner", Type: "canvas_video", Status: model.TaskStatusRunning}
	if err := db.Create(&task).Error; err != nil {
		t.Fatal(err)
	}
	creates, polls := 0, 0
	const receipt = "510bce55-076a-4c32-a765-f6ff2ebbf803"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			creates++
			fmt.Fprintf(w, `{"prompt_id":%q}`, receipt)
			return
		}
		polls++
		saved, err := svc.repo.TaskForUser("owner", task.ID)
		if err != nil || saved.ProviderRequestID != receipt {
			t.Error("poll began before the parsed receipt was durable", err)
		}
		fmt.Fprint(w, `{"status":"failed","message":"test stops before downloading media"}`)
	}))
	defer server.Close()
	var adapter protocol.Adapter
	for _, candidate := range protocol.LocalAdapters() {
		if candidate.Metadata().ID == protocol.LocalVideo {
			adapter = candidate
		}
	}
	input := canvasGenerationInput{Mode: "video", Prompt: "fixture", Config: providerConfig{BaseURL: server.URL, InterfaceType: protocol.LocalVideo, Model: "wan2.2-ti2v-5b"}}
	if _, err := runProtocolAdapterTask(withProviderAnalytics(context.Background(), svc, task), input, adapter); err == nil {
		t.Fatal("fixture failure became success")
	}
	saved, err := svc.repo.TaskForUser("owner", task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := runProtocolAdapterTask(withProviderAnalytics(context.Background(), svc, *saved), input, adapter); err == nil {
		t.Fatal("resumed fixture failure became success")
	}
	if creates != 1 || polls != 2 {
		t.Fatalf("receipt recovery repeated inference: creates=%d polls=%d", creates, polls)
	}
}
