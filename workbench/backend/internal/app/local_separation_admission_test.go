// SPDX-License-Identifier: AGPL-3.0-or-later
package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"yingce/backend/internal/model"
	"yingce/backend/internal/protocol"
)

func TestLocalSeparationRoutingDeclaresActualSourceAndStems(t *testing.T) {
	config, err := NormalizeModelCapabilityConfigForModel("audio", protocol.LocalSeparation, "htdemucs", nil)
	if err != nil || config.Audio.Operation != "separate" {
		t.Fatal(config, err)
	}
	spec, err := CapabilitySpecFromModelCapabilityConfig(config, "audio")
	if err != nil || spec.Inputs["audio"].Min != 1 || len(spec.Options) != 1 {
		t.Fatal(spec, err)
	}
	input := map[string]any{"mode": "audio", "config": map[string]any{"interfaceType": protocol.LocalSeparation, "model": "htdemucs", "audioStems": "all"}, "referenceAudios": []any{map[string]any{"storageKey": "resource:owned"}}}
	if result := MatchCapability(spec, ModelRequestIntentFromTaskInput(input, "canvas_audio", "")); !result.Matched {
		t.Fatal("valid separation was routed as speech", result)
	}
	input["referenceAudios"] = []any{}
	if result := MatchCapability(spec, ModelRequestIntentFromTaskInput(input, "canvas_audio", "")); result.Matched {
		t.Fatal("source-free separation admitted")
	}
	service := &Service{}
	if service.validateLocalSpeechAdmission("owner", input) == nil {
		t.Fatal("source-free task admitted before task and credit reservation")
	}
	input["referenceAudios"] = []any{map[string]any{"dataUrl": "data:audio/wav;base64,AAAA", "url": "https://example.invalid/foreign.wav"}}
	if service.validateLocalSpeechAdmission("owner", input) == nil {
		t.Fatal("unowned inline bytes admitted")
	}
}

func TestLocalSeparationAdminPersistsPublishesAndMatchesCompiledContract(t *testing.T) {
	service, db := newChannelModelTestService(t)
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	channel := model.ModelChannel{ID: "local-separation", UserID: admin.ID, Scope: model.ChannelScopeSystem, Enabled: true, Name: "Separation", BaseURL: "https://example.com", ModelsJSON: `[]`}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	enabled := true
	saved, err := service.SaveAdminChannelModel(admin, channel.ID, "", ChannelModelRequest{ModelKey: "htdemucs", Capability: "audio", Protocol: protocol.LocalSeparation, PriceTiers: []ChannelModelPriceTierRequest{{BillingMode: "fixed_request", PriceConfigured: true, Enabled: &enabled}}, Enabled: &enabled})
	if err != nil || saved.CapabilityConfig == nil || saved.CapabilityVersion < 1 {
		t.Fatal("actual admin creation omitted compiled separation contract", saved, err)
	}
	stored, err := service.repo.ChannelModelByKey(channel.ID, saved.ModelKey)
	if err != nil {
		t.Fatal(err)
	}
	profile, err := DecodeModelCapabilityConfig(stored.CapabilityConfigJSON)
	if err != nil || profile == nil || profile.Audio == nil || profile.Audio.Operation != "separate" || DefaultModelCapabilityConfigForModel(protocol.LocalSeparation, "htdemucs").Audio == nil {
		t.Fatal("stored/default contract differs", profile, err)
	}
	for _, test := range []struct {
		count int
		stems string
		valid bool
	}{{1, "all", true}, {0, "all", false}, {2, "pair", false}, {1, "unknown", false}} {
		matched, err := service.channelModelMatchesIntent(stored, &ModelRequestIntent{Capability: "audio", Inputs: map[string]int{"audio": test.count}, Options: map[string]any{"audioStems": test.stems}})
		if err != nil || matched != test.valid {
			t.Fatal("catalog bypassed declared source or stems", test, matched, err)
		}
	}
	listed, err := service.AdminChannelModels(admin, channel.ID)
	if err != nil || len(listed) != 1 || listed[0].CapabilityConfig["audio"] == nil {
		t.Fatal("admin listing lost separation contract", err)
	}
	public := publicChannel(channel, false, listed)
	if len(public.ModelCosts) != 1 || public.ModelCosts[0].CapabilityConfig.Audio == nil || public.ModelCosts[0].CapabilityConfig.Audio.Operation != "separate" {
		t.Fatal("public model directory omitted separation controls")
	}
}

func TestLocalSeparationCancellationReadsOriginalCompleteFiveTrackGroup(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	const identity = "510bce55-076a-4c32-a765-f6ff2ebbf803"
	reads, posts := 0, 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			posts++
			http.Error(w, "unexpected mutation", 500)
			return
		}
		reads++
		outputs := []map[string]any{}
		for i, role := range []string{"vocals", "instrumental", "drums", "bass", "other"} {
			outputs = append(outputs, map[string]any{"filename": role + ".wav", "name": role, "role": role, "url": fmt.Sprintf("/api/jobs/%s/outputs/%d", identity, i)})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"status": "succeeded", "outputs": outputs})
	}))
	defer server.Close()
	config := providerConfig{BaseURL: server.URL, InterfaceType: protocol.LocalSeparation, AudioStems: "all", trustedLocalChannel: true}
	outcome, status, err := queryLocalProviderCancellation(context.Background(), config, identity)
	if err != nil || outcome != providerCancellationSucceeded || status != "succeeded" || reads != 1 || posts != 0 {
		t.Fatal("late cancellation lost original five-track success", outcome, status, err, reads, posts)
	}
	task := model.Task{InputJSON: `{"mode":"audio","config":{"channelId":"system","interfaceType":"yingce-local-separation","audioStems":"all"}}`}
	if !isLocalMediaProtocol(protocol.LocalSeparation) || !taskHasLocalMediaCancellation(task) {
		t.Fatal("native task center hid separation cancellation")
	}
}
