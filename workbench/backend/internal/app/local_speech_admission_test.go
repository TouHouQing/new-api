package app

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"yingce/backend/internal/model"
	"yingce/backend/internal/protocol"
)

func localSpeechInput() map[string]any {
	return map[string]any{"mode": "audio", "prompt": "你好", "config": map[string]any{"interfaceType": protocol.LocalAudio, "model": "chatterbox-multilingual", "audioFormat": "wav", "audioSpeed": "1"}}
}

func TestLocalSpeechRoutingIncludesOwnedVoiceAndActualParameters(t *testing.T) {
	spec, err := CapabilitySpecFromModelCapabilityConfig(&ModelCapabilityConfig{Version: 1, Audio: protocol.LocalSpeechCapabilities()}, "audio")
	if err != nil {
		t.Fatal(err)
	}
	input := localSpeechInput()
	config := input["config"].(map[string]any)
	config["audioVoice"], config["audioLanguage"], config["audioSpeed"] = "sample:owned-voice", "zh", "1.25"
	input["referenceAudios"] = []any{map[string]any{"storageKey": "resource:owned-voice"}}
	intent := ModelRequestIntentFromTaskInput(input, "canvas_audio", "")
	if result := MatchCapability(spec, intent); !result.Matched {
		t.Fatal("valid role voice was rejected before native task admission", result)
	}
	if config["audioVoice"] != "sample:owned-voice" {
		t.Fatal("routing replaced the immutable sample identity")
	}
	for key, value := range map[string]any{"audioVoice": "sample:", "audioFormat": "pcm", "audioSpeed": "4", "audioLanguage": "invalid", "audioInstructions": "whisper"} {
		original, exists := config[key]
		config[key] = value
		if result := MatchCapability(spec, ModelRequestIntentFromTaskInput(input, "canvas_audio", "")); result.Matched {
			t.Fatalf("unsupported %s was routed", key)
		}
		if exists {
			config[key] = original
		} else {
			delete(config, key)
		}
	}
}

func TestLocalSpeechAdmissionRejectsInvalidInputsBeforeJobsOrCredits(t *testing.T) {
	service := &Service{} // No repository is needed, and no task/credit write is possible.
	if err := service.validateLocalSpeechAdmission("owner", localSpeechInput()); err != nil {
		t.Fatal(err)
	}
	for _, change := range []map[string]any{{"audioSpeed": "8"}, {"audioInstructions": "whisper"}, {"audioVoice": "sample:missing"}} {
		input := localSpeechInput()
		for key, value := range change {
			input["config"].(map[string]any)[key] = value
		}
		if err := service.validateLocalSpeechAdmission("owner", input); err == nil {
			t.Fatalf("invalid speech admitted: %+v", change)
		}
	}
	input := localSpeechInput()
	input["referenceAudios"] = []any{map[string]any{"dataUrl": "data:audio/wav;base64,AAAA", "url": "https://example.invalid/replacement.wav"}}
	if err := service.validateLocalSpeechAdmission("owner", input); err == nil {
		t.Fatal("unowned inline voice admitted")
	}
}

func TestLocalSpeechCannotBypassResolvedRoleVoiceForDeclarativeAdapter(t *testing.T) {
	input := canvasGenerationInput{Mode: "audio", Config: providerConfig{InterfaceType: protocol.LocalAudio, AudioVoice: "default"}, Metadata: map[string]interface{}{"resolvedCharacterVersions": []interface{}{"role:version"}, "resolvedCharacterVoiceKey": "sample:original"}}
	if _, err := runAudioTask(context.Background(), input); err == nil || !strings.Contains(err.Error(), "声音绑定") {
		t.Fatal("declarative speech bypassed the fixed role binding", err)
	}
}

func TestLocalSpeechCapabilityCatalogMatchesFixedRuntimeBounds(t *testing.T) {
	value, err := NormalizeModelCapabilityConfigForModel("audio", protocol.LocalAudio, "chatterbox-multilingual", nil)
	if err != nil || value == nil || value.Audio == nil {
		t.Fatal("missing native audio capability", err)
	}
	spec, err := CapabilitySpecFromModelCapabilityConfig(value, "audio")
	if err != nil || spec.Inputs["audio"].Max != 1 || value.Audio.MinReferenceDurationMs != 3000 || value.Audio.MaxReferenceDurationMs != 20000 || value.Audio.PromptMaxChars != 3000 {
		t.Fatal("catalog and native speech limits differ", err)
	}
}

func TestLocalSpeechAgentRoleUsesOwnedVoiceAndOnlySpokenDialogue(t *testing.T) {
	service, db, args := agentMediaFixture(t)
	node := seedCloudAgentCharacter(t, db, "agent-canvas")
	for _, row := range []any{
		&model.Resource{ID: "voice-sample", UserID: "user", Kind: "audio", Status: model.ResourceStatusReady, MimeType: "audio/wav", DurationMs: 5000, Size: 123},
	} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Model(&model.VoiceProfile{}).Where("id = ?", "character-voice").Updates(map[string]any{"voice_key": "sample:voice-sample", "sample_resource_id": "voice-sample"}).Error; err != nil {
		t.Fatal(err)
	}
	ref, field, err := cloudAgentMediaReference(service.repo, "user", "character-project", node, "audio")
	if err != nil || field != "referenceAudios" || ref["storageKey"] != "resource:voice-sample" || ref["durationMs"] != int64(5000) {
		t.Fatal("role did not resolve its original owned speech sample", ref, field, err)
	}
	if _, _, err := cloudAgentMediaReference(service.repo, "other", "character-project", node, "audio"); err == nil {
		t.Fatal("foreign voice reference admitted")
	}
	canvas, err := service.repo.CanvasProjectForUser("user", "agent-canvas")
	if err != nil {
		t.Fatal(err)
	}
	doc, err := creationDocument(canvas.PayloadJSON)
	if err != nil {
		t.Fatal(err)
	}
	doc["nodes"] = append(doc["nodes"].([]any), node)
	raw, _ := json.Marshal(doc)
	if err := db.Model(&model.CanvasProject{}).Where("id = ?", canvas.ID).Update("payload_json", string(raw)).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.ChannelModel{}).Where("id = ?", "video-cm").Updates(map[string]any{"model_key": "chatterbox-multilingual", "capability": "audio", "protocol": protocol.LocalAudio, "capability_config_json": mustEncodeModelCapabilityConfig(t, &ModelCapabilityConfig{Version: 1, Audio: protocol.LocalSpeechCapabilities()})}).Error; err != nil {
		t.Fatal(err)
	}
	empty := ""
	args.Mode, args.ChannelModelKey, args.Prompt, args.SourceNodeID = "audio", "chatterbox-multilingual", "你好，世界。 @音频1", "character-card"
	args.ReferenceNodeIDs = nil
	args.Duration = 0
	args.Size = ""
	args.VideoGenerateAudio = nil
	args.AudioInstructions = &empty
	args.VoiceRightsConfirmedFor = "resource:voice-sample"
	args.SnapshotHash = cloudAgentCanvasHash(doc)
	run, state := agentMediaRun(t, service, args, "request_approval")
	request, _, err := service.prepareCloudAgentMedia(run, &state, agentMediaCall(args))
	if err != nil {
		t.Fatal(err)
	}
	if request.Prompt != "你好，世界。" || strings.Contains(request.Prompt, "角色") {
		t.Fatal("speech includes non-dialogue context", request.Prompt)
	}
	if lenAnySlice(request.Input["referenceImages"]) != 0 || lenAnySlice(request.Input["referenceAudios"]) != 1 {
		t.Fatal("role audio slot mismatch", request.Input)
	}
	if request.Input["config"].(map[string]any)["audioInstructions"] != "" || request.Input["metadata"].(map[string]any)["voiceRightsConfirmedFor"] != "resource:voice-sample" {
		t.Fatal("role instructions or reference consent changed")
	}
	channel, err := service.repo.ChannelModelByKey("channel", "chatterbox-multilingual")
	if err != nil {
		t.Fatal(err)
	}
	profile, err := normalizedChannelModelCapability(channel)
	if err != nil || profile == nil || profile.Audio == nil {
		t.Fatal("native channel catalog omitted speech capability", err)
	}
}

func TestLocalSpeechAdminSavesAndPublishesCompiledContract(t *testing.T) {
	service, db := newChannelModelTestService(t)
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	channel := model.ModelChannel{ID: "local-speech", UserID: admin.ID, Scope: model.ChannelScopeSystem, Enabled: true, Name: "Speech", BaseURL: "https://example.com", ModelsJSON: `[]`}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	enabled := true
	saved, err := service.SaveAdminChannelModel(admin, channel.ID, "", ChannelModelRequest{ModelKey: "chatterbox-multilingual", Capability: "audio", Protocol: protocol.LocalAudio, PriceTiers: []ChannelModelPriceTierRequest{{BillingMode: "fixed_request", PriceConfigured: true, Enabled: &enabled}}, Enabled: &enabled})
	if err != nil {
		t.Fatal(err)
	}
	if saved.CapabilityConfig == nil || saved.CapabilityConfig["audio"] == nil || saved.CapabilityVersion < 1 {
		t.Fatal("new speech response omitted compiled capabilities")
	}
	stored, err := service.repo.ChannelModelByKey(channel.ID, saved.ModelKey)
	if err != nil {
		t.Fatal(err)
	}
	config, err := DecodeModelCapabilityConfig(stored.CapabilityConfigJSON)
	if err != nil || config == nil || config.Audio == nil || config.Audio.MaxReferenceAudios != 1 {
		t.Fatal("speech contract not persisted", err)
	}
	matched, err := service.channelModelMatchesIntent(stored, &ModelRequestIntent{Capability: "audio", Inputs: map[string]int{"audio": 2}})
	if err != nil || matched {
		t.Fatal("catalog admitted two voice references", err)
	}
	if err := db.Model(&model.ChannelModel{}).Where("id = ?", stored.ID).Update("capability_config_json", "").Error; err != nil {
		t.Fatal(err)
	}
	listed, err := service.AdminChannelModels(admin, channel.ID)
	if err != nil || len(listed) != 1 || listed[0].CapabilityConfig["audio"] == nil {
		t.Fatal("existing local speech model lost its compiled contract", err)
	}
	legacy := publicChannel(channel, false, listed)
	if len(legacy.ModelCosts) != 1 || legacy.ModelCosts[0].CapabilityConfig.Audio == nil {
		t.Fatal("legacy public catalog lost local speech capabilities")
	}
}

func TestLocalSpeechHeadlessReferenceReadsRealDurationBeforeAdmission(t *testing.T) {
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("actual FFprobe environment required")
	}
	service, db := newMediaRecoveryTestService(t)
	seedImageOperationSource(t, service, db)
	for _, seconds := range []float64{3.5, .5} {
		var wav bytes.Buffer
		frames := int(seconds * 24000)
		wav.WriteString("RIFF")
		binary.Write(&wav, binary.LittleEndian, uint32(36+frames*2))
		wav.WriteString("WAVEfmt ")
		binary.Write(&wav, binary.LittleEndian, uint32(16))
		binary.Write(&wav, binary.LittleEndian, uint16(1))
		binary.Write(&wav, binary.LittleEndian, uint16(1))
		binary.Write(&wav, binary.LittleEndian, uint32(24000))
		binary.Write(&wav, binary.LittleEndian, uint32(48000))
		binary.Write(&wav, binary.LittleEndian, uint16(2))
		binary.Write(&wav, binary.LittleEndian, uint16(16))
		wav.WriteString("data")
		binary.Write(&wav, binary.LittleEndian, uint32(frames*2))
		wav.Write(make([]byte, frames*2))
		resource, _, err := service.storeResource("image-user", "audio", "duration-calibration.wav", "audio/wav", int64(wav.Len()), 0, 0, 0, bytes.NewReader(wav.Bytes()), nil, false)
		if err != nil {
			t.Fatal(err)
		}
		input := localSpeechInput()
		input["config"].(map[string]any)["audioVoice"] = "sample"
		input["referenceAudios"] = []any{map[string]any{"storageKey": "resource:" + resource.ID}}
		input["metadata"] = map[string]any{"voiceRightsConfirmedFor": "resource:" + resource.ID}
		err = service.validateLocalSpeechAdmission("image-user", input)
		if seconds >= 3 && err != nil || seconds < 3 && err == nil {
			t.Fatalf("actual duration not enforced for %.1f seconds: %v", seconds, err)
		}
		stored, err := service.repo.ResourceForUser("image-user", resource.ID)
		if err != nil || stored.DurationMs != int64(seconds*1000) {
			t.Fatal("duration was not inspected and cached", err)
		}
	}
	var tasks int64
	if err := db.Model(&model.Task{}).Count(&tasks).Error; err != nil || tasks != 0 {
		t.Fatal("duration inspection created a model task", err)
	}
}
