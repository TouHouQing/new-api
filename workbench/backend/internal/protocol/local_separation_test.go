// SPDX-License-Identifier: AGPL-3.0-or-later
package protocol

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

func separationRequest() GenerationRequest {
	return GenerationRequest{Model: "htdemucs", Audios: []MediaReference{{Kind: "audio", DataURL: "data:audio/wav;base64,AAAA", Metadata: map[string]any{"storageKey": "resource:owned-source"}}}, Extra: map[string]any{"idempotencyKey": "native-separation-operation", "audioStems": "pair"}}
}

func TestLocalMediaClassificationSharesRegistryAndStructuredAudioContracts(t *testing.T) {
	for id, capability := range map[string]Capability{LocalImage: CapabilityImage, LocalVideo: CapabilityVideo, LocalAudio: CapabilityAudio, LocalSeparation: CapabilityAudio} {
		if !IsLocal(id) || LocalMediaCapability(id) != capability {
			t.Fatal("registered native media protocol omitted from lifecycle", id)
		}
	}
	if LocalMediaCapability(LocalText) != "" || IsLocal("uninstalled") || LocalAudioCapabilities("uninstalled") != nil {
		t.Fatal("unknown or text protocol classified as media")
	}
	if LocalAudioCapabilities(LocalSeparation).Operation != "separate" || LocalAudioCapabilities(LocalAudio).VoiceRightsRequired != true {
		t.Fatal("audio contracts conflated")
	}
}

func TestLocalSeparationUsesNativeIdempotencyAndOnlyOwnedAudio(t *testing.T) {
	a := localSeparationAdapter{localAdapter{CapabilityAudio}}
	for _, stems := range []string{"pair", "all"} {
		request := separationRequest()
		request.Extra["audioStems"] = stems
		spec, err := a.BuildCreate(context.Background(), RequestContext{Request: request})
		if err != nil || spec.Path != "/api/media/separate" || spec.Auth.Type != "none" || spec.Headers["Idempotency-Key"] != "native-separation-operation" || spec.Body.(map[string]any)["stems"] != stems {
			t.Fatal("separation contract lost", spec, err)
		}
		recovery, err := a.BuildCreateRecovery(context.Background(), RequestContext{Request: request})
		if err != nil || recovery.Method != http.MethodGet {
			t.Fatal("recovery submitted another inference", err)
		}
	}
	for _, change := range []func(*GenerationRequest){
		func(r *GenerationRequest) { r.Model = "uninstalled" },
		func(r *GenerationRequest) { r.Extra["idempotencyKey"] = "" },
		func(r *GenerationRequest) { r.Extra["audioStems"] = "download" },
		func(r *GenerationRequest) { r.Audios = nil },
		func(r *GenerationRequest) { r.Audios = append(r.Audios, r.Audios[0]) },
		func(r *GenerationRequest) { r.Audios[0].Metadata = nil },
		func(r *GenerationRequest) { r.Audios[0].DataURL = "https://example.invalid/audio.wav" },
		func(r *GenerationRequest) { r.Videos = []MediaReference{{Kind: "video"}} },
	} {
		request := separationRequest()
		change(&request)
		if _, err := a.BuildCreate(context.Background(), RequestContext{Request: request}); err == nil {
			t.Fatal("invalid audio source or options accepted", request)
		}
	}
}

func TestLocalSeparationPollPreservesAllLabelsAndRejectsMissingOrForeignOutputs(t *testing.T) {
	a := localSeparationAdapter{localAdapter{CapabilityAudio}}
	context := PollContext{BaseURL: "http://host.docker.internal:18005", TaskID: "original-id", Request: separationRequest()}
	roles := []string{"vocals", "instrumental", "drums", "bass", "other"}
	items := make([]any, 5)
	for i, role := range roles {
		items[i] = map[string]any{"filename": role + ".wav", "url": fmt.Sprintf("/api/jobs/original-id/outputs/%d", i), "name": "音轨" + fmt.Sprint(i), "role": role}
	}
	poll := func(values []any) (PollResult, error) {
		body, _ := json.Marshal(map[string]any{"status": "succeeded", "outputs": values})
		return a.ParsePoll(nil, context, body)
	}
	result, err := poll(items[:2])
	if err != nil || len(result.Result.Audios) != 2 || result.Result.Audios[1].Role != "instrumental" {
		t.Fatal("pair lost", result, err)
	}
	context.Request.Extra["audioStems"] = "all"
	result, err = poll(items)
	if err != nil || len(result.Result.Audios) != 5 || result.Result.Audios[4].Name != "音轨4" {
		t.Fatal("five stems lost", result, err)
	}
	for _, invalid := range [][]any{items[:2], append(items[:4:4], map[string]any{"filename": "other.wav", "url": "/api/jobs/foreign/outputs/4", "name": "foreign", "role": "other"}), append(items[:4:4], items[0])} {
		if _, err = poll(invalid); err == nil {
			t.Fatal("incomplete or foreign outputs accepted")
		}
	}
}
