package canvas

import (
	"bytes"
	"encoding/json"
)

var canvasEditorDefaults = []struct {
	key   string
	value json.RawMessage
}{
	{"nodes", json.RawMessage(`[]`)},
	{"connections", json.RawMessage(`[]`)},
	{"chatSessions", json.RawMessage(`[]`)},
	{"activeChatId", json.RawMessage(`null`)},
	{"previsScenes", json.RawMessage(`[]`)},
	{"viewport", json.RawMessage(`{"x":0,"y":0,"k":1}`)},
	{"backgroundMode", json.RawMessage(`"dots"`)},
	{"showImageInfo", json.RawMessage(`false`)},
}

// NormalizeCanvasEditorDefaults is a semantic projection, shared with the
// native document reader. It never mutates a stored document or its children.
func NormalizeCanvasEditorDefaults(document map[string]any) map[string]any {
	result := make(map[string]any, len(document)+len(canvasEditorDefaults))
	for key, value := range document {
		result[key] = value
	}
	for _, field := range canvasEditorDefaults {
		if value, exists := result[field.key]; exists && value != nil {
			continue
		}
		var value any
		_ = json.Unmarshal(field.value, &value)
		result[field.key] = value
	}
	return result
}

// Read defaults must not become unsolicited stored edits. In particular, an
// Agent undo must retain the same preimage identity as before the operation.
func preserveCanvasEditorDefaultPresence(beforeJSON string, payload map[string]json.RawMessage) error {
	var before map[string]json.RawMessage
	if err := json.Unmarshal([]byte(beforeJSON), &before); err != nil {
		return err
	}
	for _, field := range canvasEditorDefaults {
		next, exists := payload[field.key]
		if !exists || !jsonEqual(rawJSON(next), rawJSON(field.value)) {
			continue
		}
		previous, existed := before[field.key]
		if !existed {
			delete(payload, field.key)
		} else if bytes.Equal(bytes.TrimSpace(previous), []byte("null")) {
			payload[field.key] = append(json.RawMessage(nil), previous...)
		}
	}
	return nil
}
