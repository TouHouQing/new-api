package service

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
)

// Some compatible upstreams split an image into a URL and a base64 entry.
// Prefer base64 at each index and preserve extra URL images without duplicating
// split payloads. This only collects results; gateway billing remains canonical.
func StudioGeneratedImages(body []byte) ([]string, error) {
	var parsed struct {
		Data any `json:"data"`
	}
	if err := common.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	var entries []any
	switch value := parsed.Data.(type) {
	case map[string]any:
		entries = []any{value}
	case []any:
		entries = value
	default:
		return nil, errors.New("image generation returned no image data")
	}
	encoded, urls := []string{}, []string{}
	for _, value := range entries {
		entry, _ := value.(map[string]any)
		if data, ok := entry["b64_json"].(string); ok && data != "" {
			encoded = append(encoded, "data:image/png;base64,"+data)
		}
		if url, ok := entry["url"].(string); ok && url != "" {
			urls = append(urls, url)
		}
	}
	count := max(len(encoded), len(urls))
	if count < 1 || count > dto.MaxImageN {
		return nil, errors.New("image generation returned an invalid batch")
	}
	result := make([]string, count)
	for i := range count {
		if i < len(encoded) {
			result[i] = encoded[i]
		} else {
			result[i] = urls[i]
		}
	}
	return result, nil
}
