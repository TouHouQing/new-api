package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"

	"github.com/QuantumNous/new-api/model"
)

func StudioLastFrame(ctx context.Context, ownerID int, mediaID string) (*model.StudioMedia, error) {
	video, err := GetStudioMedia(ownerID, mediaID)
	if err != nil {
		return nil, err
	}
	frameID := "frame-" + video.Digest
	if frame, err := GetStudioMedia(ownerID, frameID); err == nil {
		return frame, nil
	}
	if !StudioRenderAvailable() {
		return nil, errors.New("configure FFmpeg to continue from a clip's last frame")
	}
	path, err := StudioMediaPath(video)
	if err != nil {
		return nil, err
	}
	probe, err := ProbeStudioMedia(ctx, path)
	if err != nil || !probe.HasVideo {
		return nil, errors.New("continuation source has no usable video")
	}
	workdir, err := os.MkdirTemp("", "studio-frame-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(workdir)
	// Only the last second is decoded; image2 updates the same PNG through the
	// final decoded frame, avoiding a whole-video reverse filter in memory.
	if err := runStudioFFmpeg(ctx, workdir, []string{"-nostdin", "-y", "-v", "error", "-sseof", "-1", "-i", path, "-an", "-vf", "scale=w=1280:h=1280:force_original_aspect_ratio=decrease:force_divisible_by=2", "-fps_mode", "passthrough", "-update", "1", "frame.png"}); err != nil {
		return nil, err
	}
	file, err := os.Open(filepath.Join(workdir, "frame.png"))
	if err != nil {
		return nil, err
	}
	defer file.Close()
	return SaveStudioMedia(ownerID, frameID, "image/png", file)
}

func StudioFrameAt(ctx context.Context, ownerID int, mediaID string, seconds float64) (*model.StudioMedia, error) {
	if math.IsNaN(seconds) || math.IsInf(seconds, 0) || seconds < 0 || seconds > 3600 {
		return nil, errors.New("invalid frame time")
	}
	video, err := GetStudioMedia(ownerID, mediaID)
	if err != nil {
		return nil, err
	}
	hash := sha256.Sum256([]byte(fmt.Sprintf("%s:%.3f", video.Digest, seconds)))
	frameID := "frame-at-" + hex.EncodeToString(hash[:])
	if frame, err := GetStudioMedia(ownerID, frameID); err == nil {
		return frame, nil
	}
	path, err := StudioMediaPath(video)
	if err != nil {
		return nil, err
	}
	probe, err := ProbeStudioMedia(ctx, path)
	if err != nil || !probe.HasVideo || seconds >= probe.Duration {
		return nil, errors.New("frame time is outside the video")
	}
	workdir, err := os.MkdirTemp("", "studio-frame-at-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(workdir)
	if err := runStudioFFmpeg(ctx, workdir, []string{"-nostdin", "-y", "-v", "error", "-ss", fmt.Sprint(seconds), "-i", path, "-an", "-vf", "scale=w=1280:h=1280:force_original_aspect_ratio=decrease:force_divisible_by=2", "-frames:v", "1", "frame.png"}); err != nil {
		return nil, err
	}
	file, err := os.Open(filepath.Join(workdir, "frame.png"))
	if err != nil {
		return nil, err
	}
	defer file.Close()
	return SaveStudioMedia(ownerID, frameID, "image/png", file)
}
