package protocol

import (
	"context"
	"net/http"
	"testing"
)

func speechContractRequest() GenerationRequest {
	return GenerationRequest{Model: "chatterbox-multilingual", Prompt: "你好", Extra: map[string]any{"idempotencyKey": "native-speech-operation", "audioFormat": "wav", "audioSpeed": "1", "audioLanguage": "zh", "audioVoice": "default"}}
}

func TestLocalAudioUsesNativeReceiptAndExplicitInstalledModel(t *testing.T) {
	a := localSpeechAdapter{localAdapter{CapabilityAudio}}
	request := speechContractRequest()
	spec, err := a.BuildCreate(context.Background(), RequestContext{Request: request})
	if err != nil {
		t.Fatal(err)
	}
	if spec.Path != "/api/audio/submit" || spec.Method != http.MethodPost || spec.Auth.Type != "none" || spec.Headers["Idempotency-Key"] != "native-speech-operation" {
		t.Fatalf("invalid private transport: %+v", spec)
	}
	body := spec.Body.(map[string]any)
	if body["voice"] != "default" || body["language"] != "zh" || body["format"] != "wav" {
		t.Fatalf("voice contract differs: %+v", body)
	}
	recovery, err := a.BuildCreateRecovery(context.Background(), RequestContext{Request: request})
	if err != nil || recovery.Method != http.MethodGet {
		t.Fatal("uncertain create is not read-only", err)
	}
	for _, change := range []map[string]any{{"audioSpeed": "NaN"}, {"audioSpeed": "4"}, {"audioFormat": "pcm"}, {"audioLanguage": "invalid"}, {"audioInstructions": "whisper"}, {"audioVoice": "vendor-voice"}} {
		request = speechContractRequest()
		for key, value := range change {
			request.Extra[key] = value
		}
		if _, err = a.BuildCreate(context.Background(), RequestContext{Request: request}); err == nil {
			t.Fatalf("unsupported contract accepted: %+v", change)
		}
	}
}

func TestLocalAudioReferencePermissionIsBoundToExactOwnedFile(t *testing.T) {
	a := localSpeechAdapter{localAdapter{CapabilityAudio}}
	request := speechContractRequest()
	request.Audios = []MediaReference{{Kind: "audio", DataURL: "data:audio/wav;base64,AAAA", Metadata: map[string]any{"storageKey": "resource:voice-one"}}}
	if _, err := a.BuildCreate(context.Background(), RequestContext{Request: request}); err == nil {
		t.Fatal("voice reference silently authorized")
	}
	request.Extra["voiceRightsConfirmedFor"] = "resource:voice-one"
	request.Extra["audioVoice"] = "sample:voice-one"
	spec, err := a.BuildCreate(context.Background(), RequestContext{Request: request})
	if err != nil {
		t.Fatal(err)
	}
	body := spec.Body.(map[string]any)
	if body["confirm_voice_rights"] != true || body["voice"] != "sample" || body["reference_audio"] != request.Audios[0].DataURL {
		t.Fatal("reference or explicit permission lost")
	}
	request.Extra["audioVoice"] = "default"
	if _, err = a.BuildCreate(context.Background(), RequestContext{Request: request}); err == nil {
		t.Fatal("the selected default voice silently became a reference voice")
	}
	request.Extra["audioVoice"] = "sample:voice-one"
	request.Audios[0].Metadata["storageKey"] = "resource:voice-two"
	if _, err = a.BuildCreate(context.Background(), RequestContext{Request: request}); err == nil {
		t.Fatal("permission reused for another voice")
	}
	request.Extra["voiceRightsConfirmedFor"] = "resource:voice-two"
	if _, err = a.BuildCreate(context.Background(), RequestContext{Request: request}); err == nil {
		t.Fatal("role binding silently switched to another reference")
	}
	request.Extra["audioVoice"] = "sample"
	request.Audios[0].DataURL = ""
	request.Audios[0].URL = "https://example.invalid/voice.wav"
	if _, err = a.BuildCreate(context.Background(), RequestContext{Request: request}); err == nil {
		t.Fatal("external URL replaced uploaded voice bytes")
	}
}

func TestLocalAudioPollAdoptsOnlyActualAudioAndSupportsScopedCancel(t *testing.T) {
	a := localSpeechAdapter{localAdapter{CapabilityAudio}}
	poll := PollContext{TaskID: "fixed-speech", BaseURL: "http://host.docker.internal:18002"}
	result, err := a.ParsePoll(context.Background(), poll, []byte(`{"status":"succeeded","outputs":[{"url":"/api/jobs/fixed-speech/outputs/0","filename":"output.wav"},{"url":"/api/jobs/fixed-speech/outputs/1","filename":"other.png"}]}`))
	if err != nil || len(result.Result.Audios) != 1 || len(result.Result.Images) != 0 || result.Result.Audios[0].URL != "http://host.docker.internal:18002/api/jobs/fixed-speech/outputs/0" {
		t.Fatal("incorrect speech adoption", err)
	}
	cancel, err := a.BuildCancel(context.Background(), poll)
	if err != nil || cancel.Path != "/api/jobs/fixed-speech/cancel" || cancel.Method != http.MethodPost {
		t.Fatal("incorrect scoped cancellation", err)
	}
}
