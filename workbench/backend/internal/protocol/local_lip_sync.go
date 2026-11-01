// SPDX-License-Identifier: AGPL-3.0-or-later
package protocol

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
)

type LipSyncRegion struct {
	X      int `json:"x"`
	Y      int `json:"y"`
	Width  int `json:"width"`
	Height int `json:"height"`
}
type LipSyncSelection struct {
	Version      int            `json:"version"`
	StartMs      int64          `json:"startMs"`
	EndMs        int64          `json:"endMs"`
	AudioStartMs int64          `json:"audioStartMs"`
	Region       *LipSyncRegion `json:"region,omitempty"`
}
type LipSyncPlan struct {
	Version            int              `json:"version"`
	SourceNodeID       string           `json:"sourceNodeId"`
	AudioNodeID        string           `json:"audioNodeId"`
	SourceStorageKey   string           `json:"sourceStorageKey"`
	AudioStorageKey    string           `json:"audioStorageKey"`
	SourceSHA256       string           `json:"sourceSha256,omitempty"`
	AudioSHA256        string           `json:"audioSha256,omitempty"`
	SourceKind         string           `json:"sourceKind"`
	Selection          LipSyncSelection `json:"selection"`
	RightsConfirmedFor []string         `json:"rightsConfirmedFor"`
}

func DecodeLipSyncPlan(value any) (*LipSyncPlan, error) {
	if value == nil {
		return nil, nil
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var plan LipSyncPlan
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&plan); err != nil {
		return nil, fmt.Errorf("口型参数包含未知或无效字段")
	}
	if plan.Version != 1 || plan.SourceNodeID == "" || plan.AudioNodeID == "" || len(plan.SourceNodeID) > 128 || len(plan.AudioNodeID) > 128 || !strings.HasPrefix(plan.SourceStorageKey, "resource:") || !strings.HasPrefix(plan.AudioStorageKey, "resource:") || len(plan.SourceStorageKey) <= 9 || len(plan.AudioStorageKey) <= 9 || plan.SourceStorageKey == plan.AudioStorageKey || (plan.SourceKind != "image" && plan.SourceKind != "video") {
		return nil, fmt.Errorf("请选择已保存的画面及独立对白音频")
	}
	if err = plan.Selection.Validate(); err != nil {
		return nil, err
	}
	if plan.SourceKind == "image" && plan.Selection.StartMs != 0 {
		return nil, fmt.Errorf("照片从0秒开始，请调整对白起点")
	}
	if len(plan.RightsConfirmedFor) != 2 || plan.RightsConfirmedFor[0] != plan.SourceStorageKey || plan.RightsConfirmedFor[1] != plan.AudioStorageKey {
		return nil, fmt.Errorf("请确认当前画面与对白的使用权；更换素材后须重新确认")
	}
	return &plan, nil
}

func (s LipSyncSelection) Validate() error {
	if s.Version != 1 || s.StartMs < 0 || s.EndMs > 3600000 || s.AudioStartMs < 0 || s.AudioStartMs > 3600000 || s.EndMs-s.StartMs < 100 || s.EndMs-s.StartMs > 30000 {
		return fmt.Errorf("请选择0.1–30秒的完整口型片段及有效对白起点")
	}
	if r := s.Region; r != nil && (r.X < 0 || r.Y < 0 || r.Width < 48 || r.Height < 48 || r.X+r.Width > 1280 || r.Y+r.Height > 1280) {
		return fmt.Errorf("人物区域至少48像素且必须位于原画面内")
	}
	return nil
}

type localLipSyncAdapter struct{ localAdapter }

func (a localLipSyncAdapter) Metadata() Metadata {
	return Metadata{ID: LocalLipSync, Version: "1.0.0", Name: "本地口型 · MuseTalk", Vendor: "影策", Categories: []Capability{CapabilityVideo}, Scopes: []Surface{SurfaceAdminSystemChannel, SurfaceCanvas, SurfaceCreation, SurfaceAgent}, Enabled: true, Execution: "declarative", Description: "用已上传的单人正面照片或视频与对白制作口型片段，结果保存为新候选。CPU本地运行，支持明确时间与人物区域，无需个人API Key。"}
}

func (a localLipSyncAdapter) BuildCreate(_ context.Context, c RequestContext) (RequestSpec, error) {
	r := c.Request
	key, _ := r.Extra["idempotencyKey"].(string)
	plan, err := DecodeLipSyncPlan(r.Extra["nativeLipSync"])
	if err != nil {
		return RequestSpec{}, err
	}
	if key == "" || r.Model != "musetalk-1.5" || plan == nil || r.Operation != "lip_sync" {
		return RequestSpec{}, fmt.Errorf("请先在原画面保存口型设置，并选择已安装的MuseTalk模型")
	}
	if len(r.Images)+len(r.Videos) != 1 || len(r.Audios) != 1 || r.ImageCount > 1 || r.Output.Count > 1 || r.Watermark || !r.GenerateAudio {
		return RequestSpec{}, fmt.Errorf("口型需要一张照片或一段视频及一段对白，输出一份带声音的新视频")
	}
	seconds := int((plan.Selection.EndMs - plan.Selection.StartMs + 999) / 1000)
	if r.Duration != seconds || r.Output.Duration != 0 && r.Output.Duration != seconds {
		return RequestSpec{}, fmt.Errorf("报价时长必须覆盖已选口型片段，请沿用保存的范围")
	}
	var source MediaReference
	if plan.SourceKind == "image" && len(r.Images) == 1 {
		source = r.Images[0]
	} else if plan.SourceKind == "video" && len(r.Videos) == 1 {
		source = r.Videos[0]
	} else {
		return RequestSpec{}, fmt.Errorf("所选画面类型与保存的口型设置不同")
	}
	check := func(ref MediaReference, kind, key, digest string, maxBytes int) error {
		storage, _ := ref.Metadata["storageKey"].(string)
		head, encoded, ok := strings.Cut(ref.DataURL, ",")
		if storage != key || !ok || !strings.HasPrefix(head, "data:"+kind+"/") || !strings.HasSuffix(head, ";base64") || len(encoded) > (maxBytes+2)/3*4 {
			return fmt.Errorf("口型仅接受已校验归属的原始画面与对白文件")
		}
		formats := map[string]string{"image": "png|jpeg|jpg|webp", "video": "mp4|webm|quicktime", "audio": "wav|x-wav|mpeg|mp3|flac|ogg|opus|webm|aac|mp4|x-m4a"}
		if !regexp.MustCompile(`^data:` + kind + `/(?:` + formats[kind] + `);base64$`).MatchString(head) {
			return fmt.Errorf("口型素材格式不支持，请使用PNG/JPEG/WebP、MP4/WebM视频或常用音频格式")
		}
		body, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil || len(body) < 32 || len(body) > maxBytes {
			return fmt.Errorf("口型素材内容无效或超过文件上限")
		}
		sum := sha256.Sum256(body)
		if !regexp.MustCompile(`^[a-f0-9]{64}$`).MatchString(digest) || hex.EncodeToString(sum[:]) != digest {
			return fmt.Errorf("口型原文件已变化，请重新选择并确认")
		}
		return nil
	}
	maximum := 8 * 1024 * 1024
	if plan.SourceKind == "video" {
		maximum = 24 * 1024 * 1024
	}
	if err = check(source, plan.SourceKind, plan.SourceStorageKey, plan.SourceSHA256, maximum); err != nil {
		return RequestSpec{}, err
	}
	if err = check(r.Audios[0], "audio", plan.AudioStorageKey, plan.AudioSHA256, 8*1024*1024); err != nil {
		return RequestSpec{}, err
	}
	selection := map[string]any{"version": 1, "start_ms": plan.Selection.StartMs, "end_ms": plan.Selection.EndMs, "audio_start_ms": plan.Selection.AudioStartMs, "region": plan.Selection.Region}
	return RequestSpec{Method: http.MethodPost, Path: "/api/media/lip-sync", OriginPath: true, ContentType: "application/json", Auth: ManifestAuth{Type: "none"}, Headers: map[string]string{"Idempotency-Key": key}, Body: map[string]any{"model_name": r.Model, "source_kind": plan.SourceKind, "source": source.DataURL, "audio": r.Audios[0].DataURL, "source_sha256": plan.SourceSHA256, "audio_sha256": plan.AudioSHA256, "selection": selection, "rights_confirmed": true}}, nil
}
