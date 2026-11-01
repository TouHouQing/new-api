package protocol

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"strings"
	"testing"
)

func lipSyncRequest67() GenerationRequest {
	source, audio := []byte(strings.Repeat("image-fixture", 4)), []byte(strings.Repeat("audio-fixture", 4))
	s, a := sha256.Sum256(source), sha256.Sum256(audio)
	plan := LipSyncPlan{Version: 1, SourceNodeID: "image", AudioNodeID: "audio", SourceStorageKey: "resource:source", AudioStorageKey: "resource:audio", SourceSHA256: hex.EncodeToString(s[:]), AudioSHA256: hex.EncodeToString(a[:]), SourceKind: "image", Selection: LipSyncSelection{Version: 1, EndMs: 1250}, RightsConfirmedFor: []string{"resource:source", "resource:audio"}}
	return GenerationRequest{Capability: CapabilityVideo, Model: "musetalk-1.5", Operation: "lip_sync", Duration: 2, GenerateAudio: true, Images: []MediaReference{{DataURL: "data:image/png;base64," + base64.StdEncoding.EncodeToString(source), Metadata: map[string]any{"storageKey": "resource:source"}}}, Audios: []MediaReference{{DataURL: "data:audio/wav;base64," + base64.StdEncoding.EncodeToString(audio), Metadata: map[string]any{"storageKey": "resource:audio"}}}, Extra: map[string]any{"idempotencyKey": "one", "nativeLipSync": plan}}
}
func TestLocalLipSyncUsesExactSelectedBytesAndMillisecondClock(t *testing.T) {
	r := lipSyncRequest67()
	adapter := localLipSyncAdapter{localAdapter{CapabilityVideo}}
	out, err := adapter.BuildCreate(context.Background(), RequestContext{Request: r})
	if err != nil {
		t.Fatal(err)
	}
	body := out.Body.(map[string]any)
	selection := body["selection"].(map[string]any)
	if out.Path != "/api/media/lip-sync" || selection["end_ms"] != int64(1250) || body["source"] != r.Images[0].DataURL || body["audio"] != r.Audios[0].DataURL || body["rights_confirmed"] != true {
		t.Fatal(out)
	}
	if !IsLocal(LocalLipSync) || LocalMediaCapability(LocalLipSync) != CapabilityVideo {
		t.Fatal("not registered in native cancellation/recovery")
	}
}
func TestLocalLipSyncRejectsWrongResourceHashMissingDialogueAndUnconfirmedFace(t *testing.T) {
	for _, change := range []func(*GenerationRequest){func(r *GenerationRequest) { r.Duration = 1 }, func(r *GenerationRequest) { r.Audios = nil }, func(r *GenerationRequest) { r.GenerateAudio = false }, func(r *GenerationRequest) { r.Images[0].Metadata["storageKey"] = "resource:foreign" }, func(r *GenerationRequest) {
		p := r.Extra["nativeLipSync"].(LipSyncPlan)
		p.SourceSHA256 = strings.Repeat("0", 64)
		r.Extra["nativeLipSync"] = p
	}, func(r *GenerationRequest) {
		p := r.Extra["nativeLipSync"].(LipSyncPlan)
		p.RightsConfirmedFor = nil
		r.Extra["nativeLipSync"] = p
	}, func(r *GenerationRequest) {
		p := r.Extra["nativeLipSync"].(LipSyncPlan)
		p.Selection.EndMs = 30001
		r.Extra["nativeLipSync"] = p
	}, func(r *GenerationRequest) { r.Images[0].DataURL = "https://example.com/image.png" }} {
		r := lipSyncRequest67()
		change(&r)
		if _, err := (localLipSyncAdapter{localAdapter{CapabilityVideo}}).BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
			t.Fatal("invalid lip-sync input admitted")
		}
	}
}
