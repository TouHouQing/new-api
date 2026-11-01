package app

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

func TestMediaAnalysisRealWorkerAuthenticationAndPinnedConfiguration(t *testing.T) {
	base, secret := os.Getenv("CANVAS_TEST_MEDIA_ANALYSIS_URL"), os.Getenv("CANVAS_TEST_MEDIA_ANALYSIS_SECRET_FILE")
	if base == "" || secret == "" {
		t.Skip("explicit installed CPU worker is not configured")
	}
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	t.Setenv(mediaAnalysisWorkerURLEnv, base)
	t.Setenv(mediaAnalysisWorkerSecretEnv, secret)
	s, _ := newMediaRecoveryTestService(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	snapshot, err := s.configuredMediaAnalysisWorker(ctx)
	if err != nil {
		t.Fatal(err)
	}
	cipher, err := s.pinMediaAnalysisWorker(ctx)
	if err != nil || strings.Contains(cipher, snapshot.Token) {
		t.Fatal("worker configuration was not encrypted", err)
	}
	t.Setenv(mediaAnalysisWorkerURLEnv, "http://127.0.0.1:1")
	t.Setenv(mediaAnalysisWorkerSecretEnv, "missing-native-worker-token")
	restored, err := s.restoreMediaAnalysisWorker(cipher)
	if err != nil || restored != snapshot {
		t.Fatal("queued configuration was changed", err)
	}
	body, _ := json.Marshal(map[string]any{"engineVersion": restored.EngineVersion, "engineSHA256": restored.EngineSHA256})
	if _, err := mediaAnalysisWorkerRequest(ctx, restored, "POST", "/v1/verify", body, 5*time.Second); err != nil {
		t.Fatal(err)
	}
	restored.Token = strings.Repeat("x", 64)
	if _, err := mediaAnalysisWorkerRequest(ctx, restored, "POST", "/v1/verify", body, 5*time.Second); err == nil || !strings.Contains(err.Error(), "认证") {
		t.Fatal("invalid service authentication was accepted", err)
	}
}
