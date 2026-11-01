package app

import (
	"context"
	"encoding/json"
	"errors"

	"yingce/backend/internal/model"
	"yingce/backend/internal/protocol"
)

func isLocalMediaProtocol(id string) bool {
	return protocol.LocalMediaCapability(id) != ""
}

// This is a display hint from the stored, admitted input. Cancellation itself
// verifies the encrypted original administrator config before allowing it.
func taskHasLocalMediaCancellation(task model.Task) bool {
	var input struct {
		Mode   string `json:"mode"`
		Config struct {
			ChannelID     string `json:"channelId"`
			InterfaceType string `json:"interfaceType"`
		} `json:"config"`
	}
	if json.Unmarshal([]byte(task.InputJSON), &input) != nil || input.Config.ChannelID == "" {
		return false
	}
	return input.Mode != "" && input.Mode == string(protocol.LocalMediaCapability(input.Config.InterfaceType))
}

func (s *Service) allowsSubmittedLocalCancellation(task *model.Task) bool {
	if task.ProviderRequestID == "" || task.MediaStage != "" || !taskHasLocalMediaCancellation(*task) {
		return false
	}
	input, err := s.providerCancellationInput(task)
	return err == nil && input.Config.trustedLocalChannel && isLocalMediaProtocol(input.Config.InterfaceType)
}

func localCancellationAdapter(id string) (protocol.Adapter, error) {
	for _, adapter := range protocol.LocalAdapters() {
		if adapter.Metadata().ID == id && isLocalMediaProtocol(id) {
			return adapter, nil
		}
	}
	return nil, errors.New("当前本地协议不支持媒体取消")
}

func cancelLocalProviderTask(ctx context.Context, config providerConfig, id string) error {
	adapter, err := localCancellationAdapter(config.InterfaceType)
	if err != nil {
		return err
	}
	spec, err := adapter.BuildCancel(ctx, protocol.PollContext{TaskID: id, BaseURL: config.BaseURL})
	if err != nil {
		return err
	}
	_, err = executeProtocolRequest(ctx, config, spec)
	return err
}

func queryLocalProviderCancellation(ctx context.Context, config providerConfig, id string) (providerCancellationOutcome, string, error) {
	adapter, err := localCancellationAdapter(config.InterfaceType)
	if err != nil {
		return "", "", err
	}
	poll := protocol.PollContext{TaskID: id, BaseURL: config.BaseURL, Request: protocol.GenerationRequest{Extra: map[string]any{"audioStems": config.AudioStems}}}
	spec, err := adapter.BuildPoll(ctx, poll)
	if err != nil {
		return "", "", err
	}
	data, err := executeProtocolRequest(ctx, config, spec)
	if err != nil {
		return "", "", err
	}
	result, err := adapter.ParsePoll(ctx, poll, data)
	if err != nil {
		return "", "", err
	}
	switch result.Status {
	case protocol.StatusCancelled:
		return providerCancellationConfirmed, "cancelled", nil
	case protocol.StatusSucceeded:
		return providerCancellationSucceeded, "succeeded", nil
	case protocol.StatusFailed:
		return providerCancellationFailed, "failed", nil
	default:
		// Cancels are scoped and idempotent. Recover a lost cancellation POST
		// without resubmitting the inference or relying on process memory.
		if err := cancelLocalProviderTask(ctx, config, id); err != nil {
			return "", "", err
		}
		return providerCancellationPending, string(result.Status), nil
	}
}
