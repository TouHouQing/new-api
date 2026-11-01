package app

import "math"

func cloudAgentPrevisValidateLens(camera map[string]any) error {
	for _, field := range []struct {
		name, label        string
		fallback, min, max float64
	}{
		{"aperture", "光圈", 2.8, .7, 32}, {"focusDistance", "对焦距离", 5, .1, 200},
	} {
		value := field.fallback
		if raw, present := camera[field.name]; present {
			value = numberValue(raw, math.NaN())
		}
		if err := cloudAgentPrevisFiniteInRange(value, field.label, field.min, field.max); err != nil {
			return err
		}
	}
	if value, present := camera["depthOfField"]; present {
		if _, ok := value.(bool); !ok {
			return BadAuthRequest("景深开关必须是布尔值")
		}
	}
	if numberValue(camera["focusDistance"], 5) <= numberValue(camera["focalLength"], 35)/1000 {
		return BadAuthRequest("对焦距离必须大于镜头焦距")
	}
	return nil
}

// Validate a separate proposal before writing any lens field. Rejected requests
// must not leave a half-updated camera in callers' preview documents.
func cloudAgentPrevisApplyLens(camera map[string]any, operation cloudAgentPrevisPatchOperation) error {
	proposal := map[string]any{"focalLength": numberValue(camera["focalLength"], 35), "aperture": numberValue(camera["aperture"], 2.8), "focusDistance": numberValue(camera["focusDistance"], 5)}
	for name, value := range map[string]*float64{"focalLength": operation.FocalLength, "aperture": operation.Aperture, "focusDistance": operation.FocusDistance} {
		if value != nil {
			proposal[name] = *value
		}
	}
	if err := cloudAgentPrevisFiniteInRange(numberValue(proposal["focalLength"], math.NaN()), "摄影机焦段", 1, 300); err != nil {
		return err
	}
	if err := cloudAgentPrevisValidateLens(proposal); err != nil {
		return err
	}
	for name, value := range map[string]*float64{"focalLength": operation.FocalLength, "aperture": operation.Aperture, "focusDistance": operation.FocusDistance} {
		if value != nil {
			camera[name] = *value
		}
	}
	if operation.FocalLength != nil {
		camera["fov"] = 2 * math.Atan(36/(2**operation.FocalLength)) * 180 / math.Pi
	}
	if operation.DepthOfField != nil {
		camera["depthOfField"] = *operation.DepthOfField
	}
	return nil
}
