// SPDX-License-Identifier: AGPL-3.0-or-later
package app

import (
	"testing"
	"yingce/backend/internal/protocol"
)

func musicInput66() map[string]any {
	return map[string]any{"mode": "audio", "prompt": "温暖的钢琴", "config": map[string]any{"interfaceType": protocol.LocalMusic, "model": "acestep-1.5-turbo", "audioMusicMode": "instrumental", "audioSeconds": "20", "audioBpm": "90", "audioFormat": "flac"}}
}

func TestLocalMusicAdmissionRejectsBeforeTaskOrBudgetWrites(t *testing.T) {
	s := &Service{}
	if err := s.validateLocalSpeechAdmission("owner", musicInput66()); err != nil {
		t.Fatal(err)
	}
	for _, change := range []map[string]any{{"audioLyrics": "leftover lyrics"}, {"audioMusicMode": "song"}, {"audioSeconds": "31"}, {"audioBpm": "300"}, {"audioVoice": "sample:someone"}} {
		input := musicInput66()
		for k, v := range change {
			input["config"].(map[string]any)[k] = v
		}
		if s.validateLocalSpeechAdmission("owner", input) == nil {
			t.Fatal("invalid music admitted", change)
		}
	}
	for _, field := range []string{"referenceImages", "referenceVideos", "referenceAudios"} {
		input := musicInput66()
		input[field] = []any{map[string]any{"storageKey": "resource:someone-else"}}
		if s.validateLocalSpeechAdmission("owner", input) == nil {
			t.Fatal("unowned reference admitted", field)
		}
	}
}

func TestLocalMusicRoutingRejectsSpeechAndUnsupportedDurations(t *testing.T) {
	config, err := NormalizeModelCapabilityConfigForModel("audio", protocol.LocalMusic, "acestep-1.5-turbo", nil)
	if err != nil {
		t.Fatal(err)
	}
	spec, err := CapabilitySpecFromModelCapabilityConfig(config, "audio")
	if err != nil || spec.Audio.Operation != "music" {
		t.Fatal(spec, err)
	}
	input := musicInput66()
	if result := MatchCapability(spec, ModelRequestIntentFromTaskInput(input, "canvas_audio", "")); !result.Matched {
		t.Fatal(result)
	}
	for _, change := range []map[string]any{{"audioMusicMode": "speech"}, {"audioSeconds": "9"}, {"audioBpm": "300"}, {"audioFormat": "mp3"}} {
		input := musicInput66()
		for k, v := range change {
			input["config"].(map[string]any)[k] = v
		}
		if result := MatchCapability(spec, ModelRequestIntentFromTaskInput(input, "canvas_audio", "")); result.Matched {
			t.Fatal("unsupported route matched", change, result)
		}
	}
}
