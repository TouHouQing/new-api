package app

import (
	"context"
	"testing"

	"yingce/backend/internal/model"
)

func TestDirectSubmissionDistinguishesExplicitRetryFromReclaimedLegacyTask(t *testing.T) {
	for _, tc := range []struct {
		name       string
		run        int
		attempts   int
		providerID string
		blocked    bool
	}{
		{"new", 1, 1, "", false},
		{"legacy", 0, 2, "", true},
		{"reclaimed", 1, 2, "", true},
		{"receipt", 1, 3, "original-provider", false},
		{"explicit-retry", 2, 2, "", false},
		{"repeated-explicit-retry", 3, 3, "", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, _ := newMediaRecoveryTestService(t)
			task := &model.Task{ID: newID(), UserID: "user", RouteRun: tc.run, Attempts: tc.attempts, ProviderRequestID: tc.providerID}
			attempt, err := s.createDirectTaskAttempt(task)
			if tc.blocked {
				if err == nil || !isRouteDispatchUncertain(err) {
					t.Fatal("unsafe legacy retry was not blocked", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if attempt.RouteRun != tc.run || attempt.ProviderRequestID != tc.providerID {
				t.Fatal("attempt lost original run or provider receipt", attempt)
			}
			wantState := "not_sent"
			if tc.providerID != "" {
				wantState = "accepted"
			}
			if attempt.DispatchState != wantState {
				t.Fatal("incorrect dispatch state", attempt)
			}
			key := withProviderSubmissionKey(context.Background(), attempt).Value(providerSubmissionKeyContext{})
			rows, err := s.repo.RouteAttempts(task.ID, tc.run)
			if err != nil || len(rows) != 1 {
				t.Fatal("original attempt not persisted", err, rows)
			}
			if withProviderSubmissionKey(context.Background(), &rows[0]).Value(providerSubmissionKeyContext{}) != key {
				t.Fatal("recovery changed original submission identity")
			}
		})
	}
}
