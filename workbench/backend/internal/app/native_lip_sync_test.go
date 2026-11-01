package app

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"image"
	"image/png"
	"os"
	"strings"
	"testing"
	"yingce/backend/internal/model"
	"yingce/backend/internal/protocol"
)

func TestNativeLipSyncRecomputesOwnedPixelsDialogueAndBoundsBeforeTaskReservation(t *testing.T) {
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("actual FFprobe environment required")
	}
	s, db := newMediaRecoveryTestService(t)
	seedImageOperationSource(t, s, db)
	var pixels bytes.Buffer
	if err := png.Encode(&pixels, image.NewRGBA(image.Rect(0, 0, 64, 64))); err != nil {
		t.Fatal(err)
	}
	source, _, err := s.storeResource("image-user", "image", "face.png", "image/png", int64(pixels.Len()), 640, 384, 0, bytes.NewReader(pixels.Bytes()), nil, false)
	if err != nil {
		t.Fatal(err)
	}
	var wav bytes.Buffer
	frames := 16000 * 2
	wav.WriteString("RIFF")
	binary.Write(&wav, binary.LittleEndian, uint32(36+frames*2))
	wav.WriteString("WAVEfmt ")
	for _, v := range []any{uint32(16), uint16(1), uint16(1), uint32(16000), uint32(32000), uint16(2), uint16(16)} {
		binary.Write(&wav, binary.LittleEndian, v)
	}
	wav.WriteString("data")
	binary.Write(&wav, binary.LittleEndian, uint32(frames*2))
	wav.Write(make([]byte, frames*2))
	audio, _, err := s.storeResource("image-user", "audio", "dialogue.wav", "audio/wav", int64(wav.Len()), 0, 0, 120000, bytes.NewReader(wav.Bytes()), nil, false)
	if err != nil {
		t.Fatal(err)
	}
	plan := protocol.LipSyncPlan{Version: 1, SourceNodeID: "face", AudioNodeID: "dialogue", SourceKind: "image", SourceStorageKey: "resource:" + source.ID, AudioStorageKey: "resource:" + audio.ID, Selection: protocol.LipSyncSelection{Version: 1, EndMs: 1250}, RightsConfirmedFor: []string{"resource:" + source.ID, "resource:" + audio.ID}}
	doc, _ := json.Marshal(map[string]any{"nodes": []any{map[string]any{"id": "face", "type": "image", "metadata": map[string]any{"storageKey": plan.SourceStorageKey}}, map[string]any{"id": "dialogue", "type": "audio", "metadata": map[string]any{"storageKey": plan.AudioStorageKey}}}})
	if err = db.Create(&model.CanvasProject{ID: "lip-canvas", UserID: "image-user", PayloadJSON: string(doc)}).Error; err != nil {
		t.Fatal(err)
	}
	fixture := func() map[string]any {
		body, _ := json.Marshal(map[string]any{"mode": "video", "config": map[string]any{"interfaceType": protocol.LocalLipSync, "model": "musetalk-1.5", "videoGenerateAudio": "true", "videoSeconds": "2"}, "referenceImages": []any{map[string]any{"storageKey": plan.SourceStorageKey}}, "referenceAudios": []any{map[string]any{"storageKey": plan.AudioStorageKey, "durationMs": 120000}}, "metadata": map[string]any{"nativeLipSync": plan, "videoEditOperation": "lip_sync"}})
		var input map[string]any
		json.Unmarshal(body, &input)
		return input
	}
	if err = s.prepareNativeLipSync("image-user", "lip-canvas", fixture()); err != nil {
		t.Fatal("actual 64px picture and two-second audio rejected", err)
	}
	for _, change := range []func(map[string]any){
		func(m map[string]any) {
			m["metadata"].(map[string]any)["nativeLipSync"].(map[string]any)["rightsConfirmedFor"] = []any{}
		},
		func(m map[string]any) {
			m["metadata"].(map[string]any)["nativeLipSync"].(map[string]any)["sourceSha256"] = strings.Repeat("0", 64)
		},
		func(m map[string]any) {
			m["metadata"].(map[string]any)["nativeLipSync"].(map[string]any)["selection"].(map[string]any)["endMs"] = 2500
		},
		func(m map[string]any) {
			m["metadata"].(map[string]any)["nativeLipSync"].(map[string]any)["selection"].(map[string]any)["region"] = map[string]any{"x": 40, "y": 0, "width": 48, "height": 48}
		},
		func(m map[string]any) {
			m["referenceImages"] = []any{map[string]any{"dataUrl": "data:image/png;base64,AAAA"}}
		},
		func(m map[string]any) { m["config"].(map[string]any)["interfaceType"] = protocol.LocalVideo },
	} {
		input := fixture()
		change(input)
		if err = s.prepareNativeLipSync("image-user", "lip-canvas", input); err == nil {
			t.Fatal("unconfirmed, mismatched, unowned or false browser media metadata admitted")
		}
	}
	if err = s.prepareNativeLipSync("another-user", "lip-canvas", fixture()); err == nil {
		t.Fatal("foreign canvas admitted")
	}
	var count int64
	db.Model(&model.Task{}).Count(&count)
	if count != 0 {
		t.Fatal("preflight created a model task")
	}
}

func TestNativeLipSyncCatalogPinsActualCompiledLimitsAndAudioOutput(t *testing.T) {
	config, err := NormalizeModelCapabilityConfigForModel("video", protocol.LocalLipSync, "musetalk-1.5", &ModelCapabilityConfig{Version: 1, Video: &VideoCapabilityConfig{References: VideoReferenceConfig{MaxImages: 99, MaxAudios: 99}}})
	if err != nil || config.Video == nil {
		t.Fatal(config, err)
	}
	if config.Text != nil || config.Image != nil || config.Video.References.MaxImages != 1 || config.Video.References.MaxVideos != 1 || config.Video.References.MaxAudios != 1 || config.Video.DefaultOperation != "lip_sync" || config.Video.Duration.Max != 30 || !config.Video.GenerateAudio.Default {
		t.Fatal("runtime contract was widened", config)
	}
	spec, err := CapabilitySpecFromModelCapabilityConfig(config, "video")
	if err != nil || spec.Operations[0] != "lip_sync" {
		t.Fatal(spec, err)
	}
	input := map[string]any{"mode": "video", "config": map[string]any{"videoSeconds": "2", "size": "original", "vquality": "original", "videoGenerateAudio": "true"}, "referenceImages": []any{map[string]any{}}, "referenceAudios": []any{map[string]any{}}}
	if result := MatchCapability(spec, ModelRequestIntentFromTaskInput(input, "canvas_video", "lip_sync")); !result.Matched {
		t.Fatal(result)
	}
}

func TestNativeLipSyncAgentUsesReviewedDraftAndQuoteIncludesExactSelection(t *testing.T) {
	plan := protocol.LipSyncPlan{Version: 1, SourceNodeID: "face", AudioNodeID: "audio", SourceStorageKey: "resource:source", AudioStorageKey: "resource:audio", SourceKind: "image", Selection: protocol.LipSyncSelection{Version: 1, EndMs: 1250}, RightsConfirmedFor: []string{"resource:source", "resource:audio"}}
	doc := map[string]any{"nodes": []any{map[string]any{"id": "face", "type": "image", "metadata": map[string]any{"lipSyncDraft": plan}}}}
	args := cloudAgentMediaArgs{Mode: "video", LipSyncSourceNodeID: "face", ReferenceNodeIDs: []string{"face", "audio"}}
	input := map[string]any{"metadata": map[string]any{}}
	if err := (&Service{}).prepareCloudAgentLipSync("owner", "canvas", doc, args, input); err != nil {
		t.Fatal(err)
	}
	if input["metadata"].(map[string]any)["videoEditOperation"] != "lip_sync" {
		t.Fatal(input)
	}
	args.ReferenceNodeIDs = []string{"face", "another-audio"}
	if (&Service{}).prepareCloudAgentLipSync("owner", "canvas", doc, args, input) == nil {
		t.Fatal("Agent substituted another dialogue")
	}
	args.ReferenceNodeIDs = []string{"face", "audio"}
	doc["nodes"].([]any)[0].(map[string]any)["metadata"] = map[string]any{}
	if (&Service{}).prepareCloudAgentLipSync("owner", "canvas", doc, args, input) == nil {
		t.Fatal("Agent invented a face region or authorization")
	}
}

func TestNativeLipSyncAgentReadHidesStorageAndChangedDraftInvalidatesApproval(t *testing.T) {
	plan := protocol.LipSyncPlan{Version: 1, SourceNodeID: "face", AudioNodeID: "audio", SourceStorageKey: "resource:private-face", AudioStorageKey: "resource:private-dialogue", SourceKind: "image", Selection: protocol.LipSyncSelection{Version: 1, EndMs: 1250}, RightsConfirmedFor: []string{"resource:private-face", "resource:private-dialogue"}}
	raw, _ := json.Marshal(plan)
	var saved map[string]any
	json.Unmarshal(raw, &saved)
	meta := map[string]any{"storageKey": plan.SourceStorageKey, "lipSyncDraft": saved}
	node := map[string]any{"id": "face", "type": "image", "metadata": meta}
	audio := map[string]any{"id": "audio", "type": "audio", "metadata": map[string]any{"storageKey": plan.AudioStorageKey}}
	nodes := map[string]map[string]any{"face": node, "audio": audio}
	summary := cloudAgentLipSyncSummary(node, nodes)
	encoded, _ := json.Marshal(summary)
	if summary["settingsReady"] != true || summary["audioNodeId"] != "audio" || strings.Contains(string(encoded), "resource:") || strings.Contains(string(encoded), "storageKey") {
		t.Fatal("Agent cannot read reviewed settings or private locators leaked", summary)
	}
	doc := map[string]any{"nodes": []any{node, audio}}
	args := cloudAgentMediaArgs{Mode: "video", NodeID: "new-candidate", LipSyncSourceNodeID: "face", ReferenceNodeIDs: []string{"face", "audio"}}
	before, err := cloudAgentMediaDependencyHash(doc, args)
	if err != nil {
		t.Fatal(err)
	}
	saved["selection"].(map[string]any)["audioStartMs"] = 100
	after, err := cloudAgentMediaDependencyHash(doc, args)
	if err != nil || before == after {
		t.Fatal("changed dialogue clock kept stale approval", err)
	}
	saved["rightsConfirmedFor"] = []any{}
	summary = cloudAgentLipSyncSummary(node, nodes)
	if summary["settingsReady"] != false || summary["rightsConfirmed"] != false {
		t.Fatal("withdrawn source permission remained ready")
	}
}
