package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// 本地 whisper.cpp HTTP 服务客户端。配置项 CANVAS_WHISPER_BASE_URL
// 指向自建 whisper.cpp server（/inference，多部件 file 上传）。
// 语音数据不出本机，未配置该地址时任务在进入转写前明确失败。

type timelineTranscriptionSegment struct {
	StartMs int64  `json:"startMs"`
	EndMs   int64  `json:"endMs"`
	Text    string `json:"text"`
}

type timelineTranscriptionResult struct {
	Segments             []timelineTranscriptionSegment `json:"segments"`
	Words                []timelineTranscriptionWord    `json:"words,omitempty"`
	WordTimingIncomplete bool                           `json:"wordTimingIncomplete,omitempty"`
	SRT                  string                         `json:"srt"`
	Language             string                         `json:"language"`
	ResourceID           string                         `json:"resourceId,omitempty"`
	SourceClipID         string                         `json:"sourceClipId,omitempty"`
}

type timelineTranscriptionWord struct {
	StartMs    int64    `json:"startMs"`
	EndMs      int64    `json:"endMs"`
	Text       string   `json:"text"`
	Confidence *float64 `json:"confidence,omitempty"`
}

type whisperWord struct {
	Start       float64  `json:"start"`
	End         float64  `json:"end"`
	Text        string   `json:"text"`
	Word        string   `json:"word"`
	Confidence  *float64 `json:"confidence"`
	Probability *float64 `json:"probability"`
}

type whisperSegment struct {
	Start float64 `json:"start"`
	End   float64 `json:"end"`
	Text  string  `json:"text"`
}

type whisperVerboseJSON struct {
	Segments             []whisperSegment `json:"segments"`
	Words                []whisperWord    `json:"words"`
	WordTimingIncomplete bool             `json:"word_timing_incomplete"`
	Language             string           `json:"language"`
}

type whisperClient struct {
	baseURL string
	http    *http.Client
}

func newWhisperClient(baseURL string) *whisperClient {
	return &whisperClient{
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		http:    &http.Client{Timeout: 20 * time.Minute},
	}
}

// transcribe 将本地 wav 送至 whisper.cpp /inference，返回段落与语言。
func (c *whisperClient) transcribe(ctx context.Context, wavPath string, language string, identity ...string) (timelineTranscriptionResult, error) {
	if c.baseURL == "" {
		return timelineTranscriptionResult{}, fmt.Errorf("本地转写服务未配置：请设置 CANVAS_WHISPER_BASE_URL")
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	audio, err := os.Open(wavPath)
	if err != nil {
		return timelineTranscriptionResult{}, fmt.Errorf("读取待转写音频失败: %w", err)
	}
	defer audio.Close()
	part, err := writer.CreateFormFile("file", filepath.Base(wavPath))
	if err != nil {
		return timelineTranscriptionResult{}, err
	}
	if _, err := io.Copy(part, audio); err != nil {
		return timelineTranscriptionResult{}, fmt.Errorf("上传音频失败: %w", err)
	}
	if err := writer.WriteField("response_format", "verbose_json"); err != nil {
		return timelineTranscriptionResult{}, err
	}
	if strings.TrimSpace(language) != "" {
		if err := writer.WriteField("language", strings.TrimSpace(language)); err != nil {
			return timelineTranscriptionResult{}, err
		}
	}
	if err := writer.Close(); err != nil {
		return timelineTranscriptionResult{}, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/inference", &body)
	if err != nil {
		return timelineTranscriptionResult{}, err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if len(identity) > 0 && identity[0] != "" {
		req.Header.Set("Idempotency-Key", "yingce-transcribe-"+identity[0])
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return timelineTranscriptionResult{}, fmt.Errorf("无法连接本地转写服务(whisper.cpp): %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return timelineTranscriptionResult{}, fmt.Errorf("本地转写服务返回 %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
	}
	payload, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return timelineTranscriptionResult{}, fmt.Errorf("读取转写结果失败: %w", err)
	}
	result, err := decodeWhisperRecognition(payload)
	if err != nil {
		return timelineTranscriptionResult{}, err
	}
	if len(result.Segments) == 0 {
		return timelineTranscriptionResult{}, fmt.Errorf("本地转写服务未识别出语音内容")
	}
	return result, nil
}

func decodeWhisperRecognition(payload []byte) (timelineTranscriptionResult, error) {
	segments, language, err := decodeWhisperVerboseJSON(payload)
	if err != nil {
		return timelineTranscriptionResult{}, err
	}
	var parsed whisperVerboseJSON
	if err := json.Unmarshal(payload, &parsed); err != nil {
		return timelineTranscriptionResult{}, fmt.Errorf("逐词识别结果解析失败: %w", err)
	}
	if len(parsed.Words) > 100000 {
		return timelineTranscriptionResult{}, fmt.Errorf("逐词识别结果过大，请分段识别")
	}
	result := timelineTranscriptionResult{Segments: segments, Language: language, WordTimingIncomplete: parsed.WordTimingIncomplete}
	var previous int64
	for _, word := range parsed.Words {
		text := strings.TrimSpace(word.Text)
		if text == "" {
			text = strings.TrimSpace(word.Word)
		}
		if text == "" {
			continue
		}
		if math.IsNaN(word.Start) || math.IsNaN(word.End) || math.IsInf(word.Start, 0) || math.IsInf(word.End, 0) || word.Start < 0 || word.End <= word.Start || word.End > 86400 {
			return timelineTranscriptionResult{}, fmt.Errorf("转写服务返回无效的逐词时间")
		}
		start, end := int64(math.Round(word.Start*1000)), int64(math.Round(word.End*1000))
		if start < previous || end <= start {
			return timelineTranscriptionResult{}, fmt.Errorf("逐词时间顺序或精度无效，未采用识别结果")
		}
		confidence := word.Confidence
		if confidence == nil {
			confidence = word.Probability
		}
		if confidence != nil && (math.IsNaN(*confidence) || math.IsInf(*confidence, 0) || *confidence < 0 || *confidence > 1) {
			return timelineTranscriptionResult{}, fmt.Errorf("识别置信度无效")
		}
		result.Words = append(result.Words, timelineTranscriptionWord{StartMs: start, EndMs: end, Text: text, Confidence: confidence})
		previous = start
	}
	return result, nil
}

// decodeWhisperVerboseJSON 解析 whisper.cpp verbose_json 响应为内部段落，
// 过滤空文本，秒精度取整为毫秒。
func decodeWhisperVerboseJSON(payload []byte) ([]timelineTranscriptionSegment, string, error) {
	var parsed whisperVerboseJSON
	if err := json.Unmarshal(payload, &parsed); err != nil {
		return nil, "", fmt.Errorf("转写结果解析失败: %w", err)
	}
	segments := make([]timelineTranscriptionSegment, 0, len(parsed.Segments))
	for _, seg := range parsed.Segments {
		if strings.TrimSpace(seg.Text) == "" {
			continue
		}
		if math.IsNaN(seg.Start) || math.IsNaN(seg.End) || math.IsInf(seg.Start, 0) || math.IsInf(seg.End, 0) || seg.Start < 0 || seg.End <= seg.Start || seg.End > 86400 {
			return nil, "", fmt.Errorf("转写服务返回无效的字幕时间，未采用识别结果")
		}
		segments = append(segments, timelineTranscriptionSegment{
			StartMs: int64(math.Round(seg.Start * 1000)),
			EndMs:   int64(math.Round(seg.End * 1000)),
			Text:    strings.TrimSpace(seg.Text),
		})
	}
	return segments, parsed.Language, nil
}

// formatSRTTimestamp 将毫秒时间格式化为 SRT 时间戳 hh:mm:ss,mmm。
func formatSRTTimestamp(ms int64) string {
	if ms < 0 {
		ms = 0
	}
	hours := ms / 3600000
	minutes := (ms % 3600000) / 60000
	seconds := (ms % 60000) / 1000
	millis := ms % 1000
	return fmt.Sprintf("%02d:%02d:%02d,%03d", hours, minutes, seconds, millis)
}

// buildTimelineSRT 由段落生成 SRT 字幕文本，供前端直接消费或导出。
func buildTimelineSRT(segments []timelineTranscriptionSegment) string {
	var out strings.Builder
	for i, seg := range segments {
		fmt.Fprintf(&out, "%d\n%s --> %s\n%s\n\n", i+1, formatSRTTimestamp(seg.StartMs), formatSRTTimestamp(seg.EndMs), seg.Text)
	}
	return out.String()
}
