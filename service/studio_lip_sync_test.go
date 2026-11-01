package service

import (
	"bytes"
	"math"
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestStudioLipSyncSelectionBounds(t *testing.T) {
	video := &StudioMediaProbe{HasVideo: true, Duration: 8, Width: 1280, Height: 384}
	audio := &StudioMediaProbe{HasAudio: true, Duration: 5}
	start := .5
	valid := func() *StudioMediaOperation {
		return &StudioMediaOperation{Action: "lip_sync", Seconds: 1.5, Options: &StudioToolOptions{LipAudioStart: &start}, Edit: &StudioMediaEdit{Start: 2, End: 3.5, X: 640, Y: 0, Width: 640, Height: 384}}
	}
	require.NoError(t, validateStudioLipSyncBounds(valid(), video, audio))
	automatic := valid()
	automatic.Edit.X, automatic.Edit.Width, automatic.Edit.Height = 0, 0, 0
	require.NoError(t, validateStudioLipSyncBounds(automatic, video, audio))
	for name, change := range map[string]func(*StudioMediaOperation){
		"missing interval":      func(op *StudioMediaOperation) { op.Edit = nil },
		"overrun video":         func(op *StudioMediaOperation) { op.Edit.Start, op.Edit.End = 7.5, 9 },
		"overrun audio":         func(op *StudioMediaOperation) { value := 4.0; op.Options.LipAudioStart = &value },
		"wrong duration":        func(op *StudioMediaOperation) { op.Seconds = 2 },
		"out of frame":          func(op *StudioMediaOperation) { op.Edit.X = 1000 },
		"small roi":             func(op *StudioMediaOperation) { op.Edit.Width = 10 },
		"partial automatic roi": func(op *StudioMediaOperation) { op.Edit.Width = 0 },
		"not finite":            func(op *StudioMediaOperation) { op.Edit.Start = math.NaN() },
		"negative audio":        func(op *StudioMediaOperation) { value := -1.0; op.Options.LipAudioStart = &value },
		"speed freezes words":   func(op *StudioMediaOperation) { op.Edit.Speed = 2 },
	} {
		t.Run(name, func(t *testing.T) {
			op := valid()
			change(op)
			require.Error(t, validateStudioLipSyncBounds(op, video, audio))
		})
	}
	require.Error(t, validateStudioLipSyncBounds(valid(), nil, audio))
	require.Error(t, validateStudioLipSyncBounds(valid(), video, &StudioMediaProbe{Duration: 5}))
}

func TestStudioLipSyncStoredSourcesAreProbedAndMustBeExactlyOneOfEach(t *testing.T) {
	if !StudioRenderAvailable() {
		t.Skip("FFmpeg is not configured")
	}
	studioProductionFixture(t)
	video, err := os.ReadFile("../web/public/studio-examples/presenter/source.mp4")
	require.NoError(t, err)
	audio, err := os.ReadFile("../web/public/studio-examples/presenter/voice.wav")
	require.NoError(t, err)
	_, err = SaveStudioMedia(1, "lip-video", "video/mp4", bytes.NewReader(video))
	require.NoError(t, err)
	_, err = SaveStudioMedia(1, "lip-audio", "audio/wav", bytes.NewReader(audio))
	require.NoError(t, err)
	operation := &StudioMediaOperation{Action: "lip_sync", Seconds: 1, ReferenceMediaIDs: []string{"lip-video", "lip-audio"}, Edit: &StudioMediaEdit{Start: .5, End: 1.5}}
	require.NoError(t, validateStudioLipSync(1, operation))
	operation.Edit.End = 3
	require.ErrorContains(t, validateStudioLipSync(1, operation), "fully covered")
	operation.Edit.End = 1.5
	operation.ReferenceMediaIDs = []string{"lip-video", "lip-video"}
	require.ErrorContains(t, validateStudioLipSync(1, operation), "exactly one")
	operation.ReferenceMediaIDs = []string{"lip-video", "lip-audio", "lip-audio"}
	require.ErrorContains(t, validateStudioLipSync(1, operation), "exactly one")
	operation.ReferenceMediaIDs = []string{"lip-video", "lip-audio"}
	require.Error(t, validateStudioLipSync(2, operation))
}
