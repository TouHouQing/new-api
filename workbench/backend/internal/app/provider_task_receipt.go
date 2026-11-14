package app

import (
	"context"
	"errors"
	"strings"
	"time"
)

// Persist the adapter's authoritative ID immediately; generic HTTP log parsing
// cannot discover every provider's response shape. This also links billing.
func (s *Service) recordProviderTaskReceipt(ctx context.Context, requestID string, stage string, nextPollAt *time.Time) error {
	metadata, ok := ctx.Value(providerAnalyticsKey{}).(providerAnalyticsContext)
	if !ok || metadata.TaskID == "" {
		return nil
	}
	var taskErr, billingErr error
	if err := s.repo.UpdateTaskProviderState(metadata.TaskID, requestID, stage, nextPollAt); err != nil {
		taskErr = err
	}
	if metadata.BillingOrderID != "" && strings.TrimSpace(requestID) != "" {
		billingErr = s.repo.UpdateBillingProviderRequestID(metadata.BillingOrderID, strings.TrimSpace(requestID))
	}
	return errors.Join(taskErr, billingErr)
}

func checkpointProtocolTaskReceipt(ctx context.Context, requestID string) (context.Context, error) {
	metadata, ok := ctx.Value(providerAnalyticsKey{}).(providerAnalyticsContext)
	if !ok || requestID == "" {
		return ctx, nil
	}
	if metadata.Service != nil {
		if err := metadata.Service.recordProviderTaskReceipt(ctx, requestID, "accepted", nil); err != nil {
			return ctx, err
		}
	}
	metadata.ProviderRequestID = requestID
	return context.WithValue(ctx, providerAnalyticsKey{}, metadata), nil
}
