package billing_setting_test

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestModelPriceUnitUsesReviewedAndBillingAuthoritativeSources(t *testing.T) {
	savedPatches := constant.TaskPricePatches
	t.Cleanup(func() { constant.TaskPricePatches = savedPatches })

	constant.TaskPricePatches = []string{"per-request-model"}
	unit, source, ok := billing_setting.GetModelPriceUnit("per-request-model")
	require.True(t, ok)
	assert.Equal(t, billing_setting.ModelPriceUnitRequest, unit)
	assert.Equal(t, "task-price-patch", source)

	unit, source, ok = billing_setting.GetModelPriceUnit("sd4-seedance2.0fast-720p")
	require.True(t, ok)
	assert.Equal(t, billing_setting.ModelPriceUnitSecond, unit)
	assert.Equal(t, "builtin-reviewed", source)

	assert.Empty(t, billing_setting.NormalizeModelPriceUnit("guessed"))
	assert.Equal(t, billing_setting.ModelPriceUnitSecond, billing_setting.NormalizeModelPriceUnit(" SECOND "))

	syncData := billing_setting.GetPricingSyncData(map[string]any{})
	syncUnits, ok := syncData[billing_setting.BillingPriceUnitField].(map[string]string)
	require.True(t, ok)
	assert.Equal(t, billing_setting.ModelPriceUnitSecond, syncUnits["sd4-seedance2.0fast-720p"])
	assert.Equal(t, billing_setting.ModelPriceUnitRequest, syncUnits["per-request-model"])
}
