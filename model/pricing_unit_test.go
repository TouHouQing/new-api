package model

import (
	"testing"

	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPricingFixedPriceDisplayUnit(t *testing.T) {
	unit, source := pricingFixedPriceDisplayUnit(Pricing{
		ModelName: "sd4-seedance2.0fast-720p",
		QuotaType: 1,
		BillingUsageSchema: map[string]jsplugin.UsageFieldSchema{
			"seconds": {Type: "number", Unit: "second"},
		},
	})
	assert.Equal(t, billing_setting.ModelPriceUnitSecond, unit)
	assert.Equal(t, "builtin-reviewed", source)

	unit, source = pricingFixedPriceDisplayUnit(Pricing{
		ModelName: "at-seedance-2.5-720p",
		QuotaType: 1,
		BillingUsageSchema: map[string]jsplugin.UsageFieldSchema{
			"seconds": {Type: "number", Unit: "second"},
		},
	})
	assert.Equal(t, billing_setting.ModelPriceUnitRequest, unit)
	assert.Equal(t, "builtin-reviewed", source)

	unit, source = pricingFixedPriceDisplayUnit(Pricing{
		ModelName: "unclassified-task",
		QuotaType: 1,
		BillingUsageSchema: map[string]jsplugin.UsageFieldSchema{
			"seconds": {Type: "number", Unit: "second"},
		},
	})
	assert.Empty(t, unit)
	assert.Equal(t, "unconfigured", source)

	unit, source = pricingFixedPriceDisplayUnit(Pricing{
		ModelName: "ordinary-fixed",
		QuotaType: 1,
	})
	require.NotEmpty(t, source)
	assert.Equal(t, billing_setting.ModelPriceUnitRequest, unit)
	assert.Equal(t, "legacy-request", source)

	unit, source = pricingFixedPriceDisplayUnit(Pricing{
		ModelName:   "dynamic-task",
		QuotaType:   1,
		BillingMode: billing_setting.BillingModeTieredExpr,
		BillingExpr: `u("seconds") * 0.4`,
	})
	assert.Empty(t, unit)
	assert.Equal(t, "dynamic", source)

	unit, source = pricingFixedPriceDisplayUnit(Pricing{
		ModelName: "sd4-seedance2.0fast-720p",
		QuotaType: 1,
		BillingPluginVariants: []PricingPluginVariant{
			{PluginKey: "alpha", BillingMode: billing_setting.BillingModeRatio},
			{PluginKey: "beta", BillingMode: billing_setting.BillingModeRatio},
		},
	})
	assert.Equal(t, billing_setting.ModelPriceUnitSecond, unit)
	assert.Equal(t, "builtin-reviewed", source)

	unit, source = pricingFixedPriceDisplayUnit(Pricing{
		ModelName: "sd4-seedance2.0fast-720p",
		QuotaType: 1,
		BillingPluginVariants: []PricingPluginVariant{
			{
				PluginKey:   "alpha",
				BillingMode: billing_setting.BillingModeTieredExpr,
				BillingExpr: `u("seconds") * 0.4`,
			},
		},
	})
	assert.Empty(t, unit)
	assert.Equal(t, "dynamic", source)
}

func TestValidateModelPriceUnitMetadata(t *testing.T) {
	values := PricingValues{
		billing_setting.ModelPriceUnitOption: " SECOND ",
	}
	require.NoError(t, validateModelPricing("fixed-video", values, nil))
	assert.Equal(t, billing_setting.ModelPriceUnitSecond, values[billing_setting.ModelPriceUnitOption])

	values[billing_setting.ModelPriceUnitOption] = "minute"
	require.ErrorContains(t, validateModelPricing("fixed-video", values, nil), "price unit must be second or request")
}
