package service

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestStudioMediaOperationsRequireCreativeInputBeforeJobCreation(t *testing.T) {
	for _, action := range []string{"sound_effects", "image_grid"} {
		t.Run(action, func(t *testing.T) {
			operation := StudioMediaOperation{NodeID: "output", Action: action, Model: "local", Seconds: 5, Prompt: " \n "}
			require.EqualError(t, ValidateStudioMediaOperation(1, nil, &operation), "Describe the sound or at least one image panel before generating.")
		})
	}
}

func TestStudioImageGridAcceptsAnExplicitReviewedPanelPlanWithoutGlobalPrompt(t *testing.T) {
	studioProductionFixture(t)
	document := map[string]any{"nodes": []any{map[string]any{"id": "output", "data": map[string]any{"kind": "image"}}}}
	operation := StudioMediaOperation{NodeID: "output", Action: "image_grid", Model: "local", Seconds: 5, Options: &StudioToolOptions{PanelPrompts: []string{"A seed in soil", "The first leaf", "Sunlight on two leaves", "A growing seedling"}}}
	require.NoError(t, ValidateStudioMediaOperation(1, document, &operation))
	operation.Options.PanelPrompts[2] = " "
	require.EqualError(t, ValidateStudioMediaOperation(1, document, &operation), "describe every panel in the shot plan")
}
