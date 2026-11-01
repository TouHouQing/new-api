package integration

import (
	"encoding/json"
	"yingce/backend/internal/app"
)

// DefaultCapability returns the same protocol contract used by standalone
// Yingce. The host can narrow it with verified provider limits.
func DefaultCapability(protocol, name string) (map[string]any, error) {
	profile := app.DefaultModelCapabilityConfigForModel(protocol, name)
	data, err := json.Marshal(profile)
	if err != nil {
		return nil, err
	}
	var result map[string]any
	err = json.Unmarshal(data, &result)
	return result, err
}
