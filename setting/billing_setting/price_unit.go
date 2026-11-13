package billing_setting

import (
	"maps"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/constant"
)

const (
	ModelPriceUnitSecond  = "second"
	ModelPriceUnitRequest = "request"
)

// These are reviewed legacy display metadata, not runtime inferences. They
// describe the already-configured ModelPrice basis for deployments that
// predate the explicit administrator map.
var builtinModelPriceUnit = map[string]string{
	"sd4-seedance2.0fast-720p": ModelPriceUnitSecond,
	"at-seedance-2.5-720p":     ModelPriceUnitRequest,
}

func NormalizeModelPriceUnit(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case ModelPriceUnitSecond:
		return ModelPriceUnitSecond
	case ModelPriceUnitRequest:
		return ModelPriceUnitRequest
	default:
		return ""
	}
}

// GetModelPriceUnit returns the reviewed display basis and its source.
// TaskPricePatches is authoritative because the billing path explicitly skips
// duration ratios for those models.
func GetModelPriceUnit(model string) (unit, source string, ok bool) {
	if slices.Contains(constant.TaskPricePatches, model) {
		return ModelPriceUnitRequest, "task-price-patch", true
	}
	if unit := NormalizeModelPriceUnit(billingSetting.ModelPriceUnit[model]); unit != "" {
		return unit, "admin", true
	}
	if unit := NormalizeModelPriceUnit(builtinModelPriceUnit[model]); unit != "" {
		return unit, "builtin-reviewed", true
	}
	return "", "", false
}

func GetModelPriceUnitCopy() map[string]string {
	units := maps.Clone(billingSetting.ModelPriceUnit)
	if units == nil {
		units = make(map[string]string)
	}
	for model, unit := range builtinModelPriceUnit {
		if _, exists := units[model]; !exists {
			units[model] = unit
		}
	}
	for _, model := range constant.TaskPricePatches {
		units[model] = ModelPriceUnitRequest
	}
	return units
}
