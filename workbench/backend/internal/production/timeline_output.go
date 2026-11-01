package production

import (
	"bytes"
	"encoding/json"
	"fmt"
)

// Output belongs to the editable timeline, so loading a regional cut preserves
// its exact dimensions, frame rate and fit through subsequent edits and saves.
type TimelineOutput struct {
	Width  int    `json:"width"`
	Height int    `json:"height"`
	FPS    int    `json:"fps"`
	Fit    string `json:"fit,omitempty"`
}

func (output *TimelineOutput) UnmarshalJSON(raw []byte) error {
	type plain TimelineOutput
	var decoded plain
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&decoded); err != nil {
		return err
	}
	if err := ValidateTimelineOutput(TimelineOutput(decoded)); err != nil {
		return err
	}
	*output = TimelineOutput(decoded)
	return nil
}

func ValidateTimelineOutput(output TimelineOutput) error {
	if output.Width < 64 || output.Width > 4096 || output.Height < 64 || output.Height > 4096 || output.Width%2 != 0 || output.Height%2 != 0 || output.FPS < 12 || output.FPS > 60 {
		return fmt.Errorf("导出宽高须为64到4096之间的偶数，帧率须为12到60")
	}
	switch output.Fit {
	case "", "letterbox", "crop", "blur":
		return nil
	}
	return fmt.Errorf("导出画面适配方式无效")
}

func TimelineDocumentOutput(raw json.RawMessage) (*TimelineOutput, error) {
	var document map[string]json.RawMessage
	if err := json.Unmarshal(raw, &document); err != nil {
		return nil, err
	}
	value, exists := document["output"]
	if !exists {
		return nil, nil
	}
	var output TimelineOutput
	decoder := json.NewDecoder(bytes.NewReader(value))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&output); err != nil {
		return nil, ErrTimelineDocument
	}
	if err := ValidateTimelineOutput(output); err != nil {
		return nil, err
	}
	return &output, nil
}

func SetTimelineDocumentOutput(raw json.RawMessage, output TimelineOutput) (json.RawMessage, error) {
	if err := ValidateTimelineOutput(output); err != nil {
		return nil, err
	}
	var document map[string]json.RawMessage
	if err := json.Unmarshal(raw, &document); err != nil {
		return nil, err
	}
	if document == nil {
		return nil, ErrTimelineDocument
	}
	encoded, err := json.Marshal(output)
	if err != nil {
		return nil, err
	}
	document["output"] = encoded
	encoded, err = json.Marshal(document)
	if err != nil {
		return nil, err
	}
	return ValidateTimelineDocument(encoded)
}
