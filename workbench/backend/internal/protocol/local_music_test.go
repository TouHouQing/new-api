// SPDX-License-Identifier: AGPL-3.0-or-later
package protocol

import (
	"context"
	"encoding/json"
	"testing"
)

func musicRequest() GenerationRequest {
	return GenerationRequest{Model: "acestep-1.5-turbo", Prompt: "温暖的钢琴与弦乐", Extra: map[string]any{"idempotencyKey": "native-music", "audioMusicMode": "instrumental", "audioSeconds": "30", "audioBpm": "90", "audioFormat": "flac"}}
}

func TestLocalMusicTransportsSongAsNativeAudioWithUnchangedLyrics(t *testing.T) {
	a := localMusicAdapter{localAdapter{CapabilityAudio}}
	r := musicRequest()
	r.Extra["audioMusicMode"], r.Extra["audioLyrics"], r.Extra["audioLanguage"] = "song", "[Verse]\n晚风吹过山坡", "zh"
	spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
	if err != nil {
		t.Fatal(err)
	}
	body := spec.Body.(map[string]any)
	music := body["music"].(map[string]any)
	if spec.Path != "/api/submit" || spec.Headers["Idempotency-Key"] != "native-music" || body["model"] != "audio" || music["lyrics"] != r.Extra["audioLyrics"] || music["seconds"] != 30 {
		t.Fatal(spec)
	}
	parsed, err := a.ParseCreate(context.Background(), []byte(`{"prompt_id":"original-comfy-receipt"}`))
	if err != nil || parsed.TaskID != "original-comfy-receipt" || parsed.Status != StatusPending {
		t.Fatal(parsed, err)
	}
	poll, err := a.ParsePoll(context.Background(), PollContext{TaskID: parsed.TaskID, BaseURL: "http://127.0.0.1:8001"}, []byte(`{"status":"succeeded","outputs":[{"filename":"music.flac","url":"/api/jobs/original-comfy-receipt/outputs/0"}]}`))
	if err != nil || len(poll.Result.Audios) != 1 || poll.Result.Audios[0].URL != "http://127.0.0.1:8001/api/jobs/original-comfy-receipt/outputs/0" {
		t.Fatal(poll, err)
	}
}

func TestLocalMusicRejectsInvalidModesLyricsBoundsReferencesAndSpeechControls(t *testing.T) {
	a := localMusicAdapter{localAdapter{CapabilityAudio}}
	changes := []map[string]any{{"audioMusicMode": "song"}, {"audioLyrics": "unconfirmed lyrics"}, {"audioMusicMode": "speech"}, {"audioSeconds": "9"}, {"audioSeconds": "31"}, {"audioSeconds": "10.5"}, {"audioBpm": "39"}, {"audioBpm": "241"}, {"audioLanguage": "invalid"}, {"audioVoice": "sample:someone"}, {"audioInstructions": "whisper"}, {"audioSpeed": "2"}, {"audioFormat": "mp3"}, {"idempotencyKey": ""}}
	for _, change := range changes {
		r := musicRequest()
		for k, v := range change {
			r.Extra[k] = v
		}
		if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
			t.Fatal("unsupported request admitted", change)
		}
	}
	for _, kind := range []string{"image", "audio", "video"} {
		r := musicRequest()
		r.Inputs = []MediaReference{{Kind: kind, URL: "https://example.invalid/source"}}
		if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
			t.Fatal("reference admitted", kind)
		}
	}
}

func TestLocalMusicDeclaresTruthfulCapabilityAndDoesNotChangeExistingContracts(t *testing.T) {
	cap := LocalAudioCapabilities(LocalMusic)
	if !IsLocal(LocalMusic) || LocalMediaCapability(LocalMusic) != CapabilityAudio || cap.Operation != "music" || cap.MaxReferenceAudios != 0 || cap.MinSeconds != 10 || cap.MaxSeconds != 30 || cap.VoiceRightsRequired {
		t.Fatal(cap)
	}
	for _, id := range []string{LocalAudio, LocalSeparation} {
		raw, err := json.Marshal(LocalAudioCapabilities(id))
		if err != nil || string(raw) == "null" {
			t.Fatal(string(raw), err)
		}
		var fields map[string]any
		_ = json.Unmarshal(raw, &fields)
		if fields["musicModes"] != nil || fields["minBpm"] != nil {
			t.Fatal("old capability changed", fields)
		}
	}
}
