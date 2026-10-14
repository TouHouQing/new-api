package service

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestStudioBridgeClientVerificationIsOwnerScopedAndDoesNotKeepBrowserOnline(t *testing.T) {
	bridge := NewStudioBridge()
	now := time.Now()
	bridge.now = func() time.Time { return now }
	workspace, err := bridge.Open(1, "browser", StudioBridgeOpen{ProjectID: "film", Title: "Film", Revision: 1, Snapshot: []byte(`{"contractVersion":1,"project":{"id":"film","nodes":[],"edges":[]}}`)})
	require.NoError(t, err)
	require.Nil(t, workspace.ClientSeen)
	_, err = bridge.VerifyClient(2, workspace.ID)
	require.ErrorIs(t, err, ErrStudioBridgeUnavailable)
	now = now.Add(2 * time.Minute)
	verified, err := bridge.VerifyClient(1, workspace.ID)
	require.NoError(t, err)
	require.NotNil(t, verified.ClientSeen)
	assert.Equal(t, now, *verified.ClientSeen)
	assert.False(t, verified.Online, "an external read must not resurrect a disconnected browser")
	assert.False(t, verified.Permissions.AllowGeneration)
}

func TestStudioPendingCaptionDraftBlocksPrimaryRenderButNotIndependentRegionalSubtitles(t *testing.T) {
	document := map[string]any{"production": map[string]any{"captionDraft": []any{map[string]any{"id": "pending", "start": "0", "end": "", "text": "Keep this draft"}}}}
	require.ErrorContains(t, ValidateStudioPendingCaptionDraft(document, ""), "pending caption")
	require.NoError(t, ValidateStudioPendingCaptionDraft(document, "regional-en"))
	document["production"] = map[string]any{}
	require.NoError(t, ValidateStudioPendingCaptionDraft(document, ""))
}

func TestStudioBridgeAcceptsCanvasProductionEditsAndStillRequiresEditPermission(t *testing.T) {
	for _, operation := range []map[string]any{
		{"op": "group_nodes", "nodeIds": []string{"a", "b"}},
		{"op": "set_previs", "scene": map[string]any{"duration": 1}},
		{"op": "set_motion_graphics", "items": []any{}},
	} {
		t.Run(operation["op"].(string), func(t *testing.T) {
			bridge := NewStudioBridge()
			input := StudioBridgeOpen{ProjectID: "film", Title: "Film", Revision: 1, Snapshot: []byte(`{"contractVersion":1,"project":{"id":"film","nodes":[],"edges":[]}}`), Permissions: StudioBridgePermissions{AllowEdits: true}}
			workspace, err := bridge.Open(1, "browser", input)
			require.NoError(t, err)
			raw, err := common.Marshal([]map[string]any{operation})
			require.NoError(t, err)
			request := StudioBridgeCommandRequest{RequestID: "d478c723-9a8a-4e36-a161-663bdc94a56d", ExpectedRevision: 1, Kind: "edit", Operations: raw}
			queued, err := bridge.Enqueue(1, workspace.ID, request)
			require.NoError(t, err, "edits advertised by the canvas operation schema must reach the connected browser")
			assert.Equal(t, "queued", queued.Status)
			input.Permissions.AllowEdits = false
			viewer, err := bridge.Open(1, "viewer", input)
			require.NoError(t, err)
			_, err = bridge.Enqueue(1, viewer.ID, request)
			require.ErrorIs(t, err, ErrStudioBridgePermission)
		})
	}
}
