/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type {
  BillingPriceUnit,
  BillingUsageSchema,
  PricingModel,
} from '../types'
import { isDynamicPricingModel } from './dynamic-price'
import { isTokenBasedModel } from './model-helpers'

export type FixedPriceDisplay =
  | { kind: 'token' }
  | { kind: 'dynamic' }
  | { kind: 'unconfigured' }
  | { kind: 'fixed'; unit: BillingPriceUnit }

export function getModelPriceDisplay(
  model: PricingModel,
  schema: BillingUsageSchema | undefined = model.billing_usage_schema
): FixedPriceDisplay {
  if (isDynamicPricingModel(model)) return { kind: 'dynamic' }
  if (
    model.billing_price_unit === 'second' ||
    model.billing_price_unit === 'request'
  ) {
    return { kind: 'fixed', unit: model.billing_price_unit }
  }
  if (isTokenBasedModel(model)) return { kind: 'token' }
  // Ratio-based plugin variants keep the legacy fixed per-request contract.
  if (model.billing_mode === 'ratio') {
    return { kind: 'fixed', unit: 'request' }
  }
  if (schema && Object.keys(schema).length > 0) {
    return { kind: 'unconfigured' }
  }
  // Non-task fixed prices retain the legacy per-request contract.
  return { kind: 'fixed', unit: 'request' }
}

export function billingPriceUnitLabelKey(unit: BillingPriceUnit | undefined) {
  return unit === 'second' ? 'Price unit second' : 'Price unit request'
}

export function billingModeLabelKey(display: FixedPriceDisplay) {
  switch (display.kind) {
    case 'token':
      return 'Token-based' as const
    case 'dynamic':
      return 'Dynamic Pricing' as const
    case 'unconfigured':
      return 'Billing unit unconfirmed' as const
    case 'fixed':
      return display.unit === 'second'
        ? ('Per Second' as const)
        : ('Per Request' as const)
  }
}
