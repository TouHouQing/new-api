// SPDX-License-Identifier: AGPL-3.0-or-later
// Animation formulas adapted from New API studio-motion-runtime.ts,
// Copyright (C) 2023-2026 QuantumNous.
package production

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
)

type MotionGraphic struct {
	Version         int     `json:"version"`
	Kind            string  `json:"kind"`
	X               float64 `json:"x"`
	Y               float64 `json:"y"`
	Size            int     `json:"size"`
	Color           string  `json:"color"`
	FontFamily      string  `json:"fontFamily,omitempty"`
	Icon            string  `json:"icon,omitempty"`
	Shape           string  `json:"shape,omitempty"`
	ResourceID      string  `json:"resourceId,omitempty"`
	Animation       string  `json:"animation"`
	BPM             int     `json:"bpm"`
	PhaseOffsetMs   int64   `json:"phaseOffsetMs,omitempty"`
	PhaseDurationMs int64   `json:"phaseDurationMs"`
}

var motionColor = regexp.MustCompile(`^#[a-fA-F0-9]{6}$`)

func (graphic *MotionGraphic) UnmarshalJSON(raw []byte) error {
	type plain MotionGraphic
	var value plain
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return err
	}
	if err := ValidateMotionGraphic(MotionGraphic(value)); err != nil {
		return err
	}
	*graphic = MotionGraphic(value)
	return nil
}

func ValidateMotionGraphic(graphic MotionGraphic) error {
	invalid := func() error {
		return fmt.Errorf("%w: 动效的类型、位置、大小、颜色或时间设置无效", ErrTimelineDocument)
	}
	if graphic.Version != 1 || math.IsNaN(graphic.X) || math.IsNaN(graphic.Y) || graphic.X < 0 || graphic.X > 1 || graphic.Y < 0 || graphic.Y > 1 || graphic.Size < 12 || graphic.Size > 300 || !motionColor.MatchString(graphic.Color) || graphic.BPM < 30 || graphic.BPM > 240 || graphic.PhaseOffsetMs < 0 || graphic.PhaseOffsetMs > 3_600_000 || graphic.PhaseDurationMs < 1 || graphic.PhaseDurationMs > 3_600_000 {
		return invalid()
	}
	if graphic.FontFamily != "" && graphic.FontFamily != "sans" && graphic.FontFamily != "serif" {
		return invalid()
	}
	if graphic.Icon != "" && graphic.Icon != "spark" && graphic.Icon != "play" && graphic.Icon != "heart" && graphic.Icon != "check" && graphic.Icon != "arrow" {
		return invalid()
	}
	if graphic.Shape != "" && graphic.Shape != "square" && graphic.Shape != "circle" {
		return invalid()
	}
	switch graphic.Kind {
	case "text", "icon", "shape":
		if graphic.ResourceID != "" {
			return invalid()
		}
	case "image":
		if !markerText(graphic.ResourceID, 80) {
			return invalid()
		}
	default:
		return invalid()
	}
	switch graphic.Animation {
	case "none", "fade", "slide", "pulse", "bounce", "rotate":
	case "morph":
		if graphic.Kind != "shape" {
			return invalid()
		}
	default:
		return invalid()
	}
	return nil
}

func MotionGraphicForClip(clip map[string]any) (*MotionGraphic, error) {
	value, exists := clip["graphic"]
	if !exists {
		return nil, nil
	}
	if stringValue(clip, "kind") != "text" {
		return nil, ErrTimelineDocument
	}
	for _, key := range []string{"captionPresentation", "subtitleStyle", "subtitleHighlights", "captionOrigin", "captionLink"} {
		if _, exists := clip[key]; exists {
			return nil, ErrTimelineDocument
		}
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var graphic MotionGraphic
	if err := json.Unmarshal(raw, &graphic); err != nil {
		return nil, err
	}
	text, ok := clip["text"].(string)
	if !ok || len([]rune(text)) > 2000 || (graphic.Kind == "text" && text == "") {
		return nil, ErrTimelineDocument
	}
	return &graphic, nil
}

type MotionSample struct {
	Visible  bool    `json:"visible"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Opacity  float64 `json:"opacity"`
	Scale    float64 `json:"scale"`
	Rotation float64 `json:"rotation"`
	Radius   float64 `json:"radius"`
}

// Source time, rather than a newly reset animation clock, makes split/trim
// descendants continuous. Moving the occurrence changes only program time.
func SampleMotionGraphic(graphic MotionGraphic, startMs, durationMs, sourceStartMs, programMs int64, width, height int) MotionSample {
	result := MotionSample{Visible: programMs >= startMs && programMs < startMs+durationMs, X: graphic.X * float64(width), Y: graphic.Y * float64(height), Scale: 1}
	if !result.Visible {
		return result
	}
	t := float64(programMs-startMs+sourceStartMs+graphic.PhaseOffsetMs) / 1000
	beat := 2 * math.Pi * float64(graphic.BPM) / 60 * t
	result.Opacity = math.Max(0, math.Min(1, math.Min(t/.4, (float64(graphic.PhaseDurationMs)/1000-t)/.4)))
	if graphic.Shape == "circle" {
		result.Radius = float64(graphic.Size) / 2
	}
	switch graphic.Animation {
	case "none":
		result.Opacity = 1
	case "slide":
		result.X -= float64(width) * (1 - math.Min(1, t/.6))
	case "pulse":
		result.Scale = .85 + .15*math.Sin(beat)
		result.Opacity = .6 + .4*math.Sin(beat)
	case "bounce":
		result.Y -= float64(height) * .08 * math.Abs(math.Sin(beat))
	case "rotate":
		result.Rotation = t * float64(graphic.BPM) * 6
	case "morph":
		result.Radius = float64(graphic.Size) / 4 * (1 + math.Sin(beat))
	}
	return result
}
