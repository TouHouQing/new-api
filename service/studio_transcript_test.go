package service

import (
	"context"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestStudioTranscriptPreservesActualPrecisionAndStableSourceBoundIDs(t *testing.T) {
	raw := []byte(`{"text":"Hello world","duration":2,"segments":[{"start":0,"end":2,"text":"Hello world","speaker":"unproven"}],"words":[{"start":0,"end":0.8,"text":"Hello","confidence":0.71},{"start":1,"end":2,"text":"world"}]}`)
	first, err := ParseStudioTranscript(raw, "digest-a")
	require.NoError(t, err)
	require.Equal(t, "word", first.Precision)
	require.Empty(t, first.Segments[0].Speaker)
	require.NotEmpty(t, first.Words[0].ID)
	require.Equal(t, .71, *first.Words[0].Confidence)
	repeat, err := ParseStudioTranscript(raw, "digest-a")
	require.NoError(t, err)
	require.Equal(t, first, repeat)
	changed, err := ParseStudioTranscript(raw, "digest-b")
	require.NoError(t, err)
	require.NotEqual(t, first.Words[0].ID, changed.Words[0].ID)
	segments, err := ParseStudioTranscript([]byte(`{"segments":[{"start":0,"end":1,"text":"Sentence only"}]}`), "source")
	require.NoError(t, err)
	require.Equal(t, "segment", segments.Precision)
	require.Empty(t, segments.Words)
	numericIDs, err := ParseStudioTranscript([]byte(`{"text":"Hello world","duration":2,"segments":[{"id":0,"start":0,"end":2,"text":"Hello world"}],"words":[{"id":0,"start":0,"end":1,"word":"Hello"},{"id":1,"start":1,"end":2,"word":"world"}]}`), "source")
	require.NoError(t, err)
	require.Equal(t, "word", numericIDs.Precision)
	require.Equal(t, "Hello", numericIDs.Words[0].Text)
	require.NotEqual(t, "0", numericIDs.Segments[0].ID)
	for _, bad := range []string{`{"segments":[]}`, `{"segments":[{"start":2,"end":1,"text":"bad"}]}`, `{"segments":[{"start":0,"end":1,"text":"bad","confidence":1.1}]}`} {
		_, err := ParseStudioTranscript([]byte(bad), "source")
		require.Error(t, err)
	}
}

func TestStudioCorrectedTranscriptCaptionsPreserveSourceAndOtherClipOccurrences(t *testing.T) {
	studioProductionFixture(t)
	media, err := SaveStudioMedia(1, "speech", "video/mp4", strings.NewReader("caption-mapping-fixture-not-asr"))
	require.NoError(t, err)
	document := map[string]any{"id": "speech-film", "title": "Speech", "nodes": []any{map[string]any{"id": "video", "data": map[string]any{"kind": "video", "mediaId": media.MediaID}}}, "edges": []any{}, "captionsText": "1\n00:00:00,500 --> 00:00:05,500\nCrossing original\n", "production": map[string]any{"documentVersion": 2, "timelineEdited": true, "timeline": []any{map[string]any{"id": "first", "nodeId": "video", "trimStart": 0., "trimEnd": 2., "speed": 1.}, map[string]any{"id": "selected", "nodeId": "video", "trimStart": 2., "trimEnd": 6., "speed": 2.}, map[string]any{"id": "repeat", "nodeId": "video", "trimStart": 2., "trimEnd": 4., "speed": 1.}}}}
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	project, err := model.SaveStudioProject(1, "speech-film", "Speech", 0, string(raw))
	require.NoError(t, err)
	transcript, err := ParseStudioTranscript([]byte(`{"text":"Original sentence","segments":[{"start":2,"end":4,"text":"Original sentence"}],"words":[{"start":2,"end":3,"text":"Original","confidence":0.6}]}`), media.Digest)
	require.NoError(t, err)
	analysis, err := SaveStudioAnalysisResult(1, project, "transcript-source", media.MediaID, transcript, []string{"Explicit timestamp fixture, not model quality evidence."})
	require.NoError(t, err)
	var correction StudioTranscriptCorrection
	require.NoError(t, common.Unmarshal([]byte(`{"request_id":"corrected","segments":[{"id":"`+transcript.Segments[0].ID+`","text":"Corrected text","speaker":"Alice"}]}`), &correction))
	corrected, err := CorrectStudioTranscript(1, project.ID, analysis.ID, correction)
	require.NoError(t, err)
	_, changed, err := ReadStudioAnalysisResult(1, corrected.ID)
	require.NoError(t, err)
	content := changed["analysis"].(map[string]any)
	require.Equal(t, "Corrected text", content["text"])
	require.Equal(t, "Original sentence", content["original_asr_text"])
	require.Equal(t, "Original", studioObjects(content, "words")[0]["text"])
	_, clips := studioTimelineDocument(document)
	next, _, err := studioCompileTranscriptCaptions(1, project, document, clips, nil, StudioEditRequest{ClipID: "selected", TranscriptID: corrected.ID, ReviewConfirmed: true})
	require.NoError(t, err)
	captions := next["captionsText"].(string)
	require.Contains(t, captions, "00:00:02,000 --> 00:00:03,000\nCorrected text")
	require.Contains(t, captions, "00:00:00,500 --> 00:00:02,000\nCrossing original")
	require.Contains(t, captions, "00:00:04,000 --> 00:00:05,500\nCrossing original")
	require.Equal(t, "repeat", clips[2]["id"])
	_, err = PrepareStudioEditPlan(context.Background(), 2, project.ID, StudioEditRequest{RequestID: "outsider", Revision: 1, Action: "transcript_captions", ClipID: "selected", TranscriptID: corrected.ID, ReviewConfirmed: true})
	require.ErrorIs(t, err, model.ErrStudioAccess)
}

func TestStudioAnalysisRecoveryReadsOriginalArtifactWithoutPointerPollution(t *testing.T) {
	studioProductionFixture(t)
	project, err := model.SaveStudioProject(1, "transcript-film", "Film", 0, `{"id":"transcript-film","title":"Film","nodes":[],"edges":[]}`)
	require.NoError(t, err)
	source, err := SaveStudioMedia(1, "audio-source", "audio/wav", strings.NewReader("test audio artifact"))
	require.NoError(t, err)
	payload := map[string]any{"kind": "transcript", "segments": []any{map[string]any{"start": 0., "end": 1., "text": "Hello"}}}
	first, err := SaveStudioAnalysisResult(1, project, "transcript-record", source.MediaID, payload, []string{"Test fixture, not ASR output."})
	require.NoError(t, err)
	record, result, err := ReadStudioAnalysisResult(1, first.ID)
	require.NoError(t, err)
	require.Equal(t, payload, result["analysis"])
	replay, err := SaveStudioAnalysisResult(1, project, record.ID, source.MediaID, result["analysis"], []string{"Test fixture, not ASR output."})
	require.NoError(t, err)
	require.Equal(t, first.Fingerprint, replay.Fingerprint)
	_, _, err = ReadStudioAnalysisResult(2, first.ID)
	require.ErrorIs(t, err, model.ErrStudioAccess)
}
