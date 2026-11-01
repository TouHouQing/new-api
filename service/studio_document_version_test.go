package service

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestStudioLegacyProjectionCannotOverwriteVersionedData(t *testing.T) {
	original := model.StudioDocument(`{"id":"film","production":{"documentVersion":2,"brief":"Original","shotNarrative":{"shot":{"purpose":"opening"}}}}`)
	projected, err := StudioProjectDocumentForClient(original, 1)
	require.NoError(t, err)
	require.Contains(t, string(projected), "Original")
	require.NotContains(t, string(projected), "shotNarrative")
	require.Contains(t, string(original), "shotNarrative")
	require.ErrorIs(t, ValidateStudioClientWrite(original, projected, 1), ErrStudioClientVersion)
	require.ErrorIs(t, ValidateStudioClientWrite(original, projected, 2), ErrStudioClientVersion)
	require.NoError(t, ValidateStudioClientWrite(original, original, 2))
}

func TestStudioDocumentVersionRejectsUnknownFractionalAndDowngrade(t *testing.T) {
	for _, raw := range []model.StudioDocument{`{"production":{"documentVersion":3}}`, `{"production":{"documentVersion":1.5}}`, `{"production":{"documentVersion":"2"}}`} {
		_, err := StudioProjectDocumentVersion(raw)
		require.ErrorIs(t, err, ErrStudioClientVersion)
	}
	legacy := model.StudioDocument(`{"id":"film","production":{"brief":"Keep"}}`)
	require.NoError(t, ValidateStudioClientWrite(legacy, legacy, 1))
	_, err := StudioProjectDocumentForClient(legacy, 2)
	require.NoError(t, err)
}

func TestStudioRegionalAudioAndGraphicPhasesRequireVersionTwo(t *testing.T) {
	legacy := model.StudioDocument(`{"production":{"regionalVersions":[{"motionGraphics":[{"phaseOffset":2}]}]}}`)
	_, err := StudioProjectDocumentVersion(legacy)
	require.ErrorIs(t, err, ErrStudioClientVersion)
	versioned := model.StudioDocument(`{"production":{"documentVersion":2,"regionalVersions":[{"audioTracks":[{"id":"voice","speed":2,"anchorKind":"clip","anchorClipId":"clip","anchorSourceStart":1}],"motionGraphics":[{"phaseOffset":2,"phaseDuration":10}]}]}}`)
	projected, err := StudioProjectDocumentForClient(versioned, 1)
	require.NoError(t, err)
	for _, key := range []string{"speed", "anchorKind", "anchorClipId", "anchorSourceStart", "phaseOffset", "phaseDuration"} {
		require.NotContains(t, string(projected), key)
	}
	require.Contains(t, string(projected), "voice")
	require.ErrorIs(t, ValidateStudioClientWrite(versioned, projected, 1), ErrStudioClientVersion)
}
