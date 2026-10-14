package service

import (
	"github.com/stretchr/testify/require"
	"testing"
)

func TestStudioDeliveryCaptionsUseOutputOffsetsAndClipBounds(t *testing.T) {
	plan := &StudioRenderPlan{Clips: []StudioRenderClip{
		{Start: 1, Speed: 2, Caption: "第一行\n\n第二行", CaptionOffset: .5, CaptionDuration: 10},
		{Start: 3, Speed: 2, Caption: "返工字幕", CaptionOffset: .25},
	}}
	raw, err := BuildStudioDeliverySubtitles(plan, []float64{2, 1.5})
	require.NoError(t, err)
	require.Equal(t, "1\n00:00:00,500 --> 00:00:02,000\n第一行\n第二行\n\n2\n00:00:02,250 --> 00:00:03,500\n返工字幕\n\n", raw)
}

func TestStudioDeliveryCaptionsPreserveShiftedDialogueAndReindexCues(t *testing.T) {
	shifted, err := ShiftStudioSubtitles("9\n00:00:00,100 --> 00:00:00,400\n旁白 A --> B\n", .5)
	require.NoError(t, err)
	plan := &StudioRenderPlan{Subtitles: shifted, Clips: []StudioRenderClip{{Caption: "片段字幕", CaptionOffset: .75, CaptionDuration: .5}}}
	raw, err := BuildStudioDeliverySubtitles(plan, []float64{2})
	require.NoError(t, err)
	require.Equal(t, "1\n00:00:00,600 --> 00:00:00,900\n旁白 A --> B\n\n2\n00:00:00,750 --> 00:00:01,250\n片段字幕\n\n", raw)
	require.Equal(t, shifted, plan.Subtitles, "sidecar construction must not change the already burned subtitle input")
}

func TestStudioDeliveryCaptionsOmitTextOutsideTheRenderedClip(t *testing.T) {
	raw, err := BuildStudioDeliverySubtitles(&StudioRenderPlan{Clips: []StudioRenderClip{{Caption: "不可见字幕", CaptionOffset: 2}}}, []float64{1})
	require.NoError(t, err)
	require.Empty(t, raw)
}
