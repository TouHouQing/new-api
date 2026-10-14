package service

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestStudioNoviceProductionFieldsMatchServerSchema(t *testing.T) {
	document := []byte(`{"id":"film","title":"Film","createdAt":"2026-10-09T00:00:00Z","updatedAt":"2026-10-09T00:00:00Z","nodes":[],"edges":[],"production":{"milestones":[{"revision":1,"title":"Before voice change","createdAt":"2026-10-09T00:00:00Z"}],"assistant":{"messages":[],"applied":false,"undoDocument":"{\"id\":\"film\"}"}}}`)
	_, err := ValidateStudioDocument("film", document)
	require.NoError(t, err, "the built server must accept fields used by the current UI")
	invalid := []byte(`{"id":"film","title":"Film","createdAt":"2026-10-09T00:00:00Z","updatedAt":"2026-10-09T00:00:00Z","nodes":[],"edges":[],"production":{"milestones":[{"revision":0,"title":"invalid","createdAt":"2026-10-09T00:00:00Z"}]}}`)
	_, err = ValidateStudioDocument("film", invalid)
	require.Error(t, err)
}

func TestStudioCanvasFramesValidateStoredMembership(t *testing.T) {
	var document map[string]any
	require.NoError(t, common.Unmarshal([]byte(`{"id":"film","title":"Film","createdAt":"2026-10-11T00:00:00Z","updatedAt":"2026-10-11T00:00:00Z","nodes":[{"id":"a","type":"studio","position":{"x":0,"y":0},"data":{"kind":"text","title":"A","prompt":""}},{"id":"b","type":"studio","position":{"x":400,"y":0},"data":{"kind":"image","title":"B","prompt":""}}],"edges":[],"canvas":{"frames":[{"id":"group","title":"Scene","x":-24,"y":-48,"width":750,"height":500,"nodeIds":["a","b"]}]}}`), &document))
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	_, err = ValidateStudioDocument("film", raw)
	require.NoError(t, err)
	frame := studioObjects(document["canvas"].(map[string]any), "frames")[0]
	for _, ids := range [][]any{{"a", "a"}, {"a", "missing"}} {
		frame["nodeIds"] = ids
		raw, err = common.Marshal(document)
		require.NoError(t, err)
		_, err = ValidateStudioDocument("film", raw)
		assert.ErrorContains(t, err, "members")
	}
	frame["nodeIds"] = []any{"a", "b"}
	frame["id"] = "a"
	raw, err = common.Marshal(document)
	require.NoError(t, err)
	_, err = ValidateStudioDocument("film", raw)
	assert.ErrorContains(t, err, "unique")
}
