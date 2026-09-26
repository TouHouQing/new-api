/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { getPricing } from '@/features/pricing/api'
import { compileBillingExpression } from '@/features/pricing/lib/billing-expression/parser'
import { evaluateBillingExpression } from '@/features/pricing/lib/billing-expression/runtime'
import { visitExpression } from '@/features/pricing/lib/billing-expression/types'
import type { PricingData, PricingModel } from '@/features/pricing/types'
import { getUserModels } from '@/lib/api'

import { parseStudioVideoPayloadPatch } from './model-profiles'

export type StudioVideoCostInput = {
  modelId: string
  group: string
  durationSeconds: number
  quantity: number
  quotaPerUnit?: number
}

export type StudioVideoCostPreview =
  | {
      status: 'estimated'
      priceBasis: 'per_request' | 'per_second'
      estimatedUsd: number
      estimatedQuota?: number
    }
  | {
      status: 'unknown'
      reason:
        | 'invalid_input'
        | 'pricing_unavailable'
        | 'group_unavailable'
        | 'model_unavailable'
        | 'dynamic_pricing'
        | 'unconfigured_pricing'
    }

/** Returns null when editable request fields can change billable usage. */
export function studioCostDurationSeconds(
  configuredSeconds: number,
  payloadPatchJson: string | undefined
): number | null {
  let patch: ReturnType<typeof parseStudioVideoPayloadPatch>
  try {
    patch = parseStudioVideoPayloadPatch(payloadPatchJson || '')
  } catch {
    return null
  }
  if (
    Object.keys(patch).some((key) => key !== 'seconds' && key !== 'duration')
  ) {
    return null
  }
  if (
    patch.seconds !== undefined &&
    patch.duration !== undefined &&
    Number(patch.seconds) !== patch.duration
  ) {
    return null
  }
  const duration = patch.duration ?? Number(patch.seconds ?? configuredSeconds)
  return Number.isInteger(duration) && duration >= 1 && duration <= 3600
    ? duration
    : null
}

function validInput(input: StudioVideoCostInput): boolean {
  return (
    input.modelId.trim().length > 0 &&
    input.group.trim().length > 0 &&
    Number.isSafeInteger(input.durationSeconds) &&
    input.durationSeconds > 0 &&
    Number.isSafeInteger(input.quantity) &&
    input.quantity > 0
  )
}

/** Evaluate only expressions whose entire price is determined by duration. */
function durationExpressionPrice(
  model: PricingModel,
  durationSeconds: number
): { usd: number; priceBasis: 'per_request' | 'per_second' } | null {
  const compiled = compileBillingExpression(model.billing_expr ?? '')
  if (compiled.status !== 'ready' || compiled.requestRules.length > 0) {
    return null
  }

  let durationField: string | null = null
  let unsupported = compiled.variables.size > 0
  visitExpression(compiled.ast, (node) => {
    if (node.kind === 'conditional') unsupported = true
    if (node.kind === 'binary' && !['+', '*', '/'].includes(node.operator)) {
      unsupported = true
    }
    if (node.kind === 'call') {
      if (node.name === 'u') {
        const field = node.args[0]
        if (
          field?.kind !== 'literal' ||
          typeof field.value !== 'string' ||
          model.billing_usage_schema?.[field.value]?.type !== 'number' ||
          model.billing_usage_schema[field.value]?.unit !== 'second'
        ) {
          unsupported = true
          return
        }
        if (durationField !== null && durationField !== field.value) {
          unsupported = true
        }
        durationField = field.value
      } else if (node.name !== 'tier' && node.name !== 'fixed') {
        unsupported = true
      }
    }
  })
  if (unsupported) return null

  const usage = durationField ? { [durationField]: durationSeconds } : {}
  const result = evaluateBillingExpression(compiled, { usage })
  if (result.status !== 'success') {
    return null
  }
  return {
    usd: result.cost,
    priceBasis: durationField ? 'per_second' : 'per_request',
  }
}

/**
 * Calculate a read-only estimate from the exact model and group returned by
 * the public pricing catalog and the user's enabled-model list.
 */
export function estimateStudioVideoCost(
  input: StudioVideoCostInput,
  pricing: PricingData,
  enabledModels: readonly string[]
): StudioVideoCostPreview {
  if (!validInput(input)) return { status: 'unknown', reason: 'invalid_input' }
  if (!pricing.success || !Array.isArray(pricing.data)) {
    return { status: 'unknown', reason: 'pricing_unavailable' }
  }
  if (!Object.hasOwn(pricing.usable_group ?? {}, input.group)) {
    return { status: 'unknown', reason: 'group_unavailable' }
  }
  const groupRatio = pricing.group_ratio?.[input.group]
  if (
    typeof groupRatio !== 'number' ||
    !Number.isFinite(groupRatio) ||
    groupRatio < 0
  ) {
    return { status: 'unknown', reason: 'group_unavailable' }
  }
  if (!enabledModels.includes(input.modelId)) {
    return { status: 'unknown', reason: 'model_unavailable' }
  }
  const model = pricing.data.find((item) => item.model_name === input.modelId)
  if (!model) return { status: 'unknown', reason: 'model_unavailable' }

  if (model.billing_plugin_variants?.length) {
    return { status: 'unknown', reason: 'dynamic_pricing' }
  }
  if (
    model.billing_mode !== 'tiered_expr' &&
    (Object.keys(model.billing_usage_schema ?? {}).length > 0 ||
      model.supported_endpoint_types?.includes('openai-video'))
  ) {
    // Legacy task adapters may multiply the catalog's model_price by usage
    // facts that /api/pricing does not expose as a price formula.
    return { status: 'unknown', reason: 'dynamic_pricing' }
  }

  let price: { usd: number; priceBasis: 'per_request' | 'per_second' }
  if (model.billing_mode === 'tiered_expr') {
    const expressionPrice = durationExpressionPrice(
      model,
      input.durationSeconds
    )
    if (!expressionPrice) {
      return { status: 'unknown', reason: 'dynamic_pricing' }
    }
    price = expressionPrice
  } else if (
    model.quota_type === 1 &&
    typeof model.model_price === 'number' &&
    Number.isFinite(model.model_price) &&
    model.model_price >= 0
  ) {
    price = { usd: model.model_price, priceBasis: 'per_request' }
  } else {
    return { status: 'unknown', reason: 'unconfigured_pricing' }
  }

  const perRequestUsd = price.usd * groupRatio
  const estimatedUsd = perRequestUsd * input.quantity
  if (!Number.isFinite(estimatedUsd) || estimatedUsd < 0) {
    return { status: 'unknown', reason: 'unconfigured_pricing' }
  }

  const preview: StudioVideoCostPreview = {
    status: 'estimated',
    priceBasis: price.priceBasis,
    estimatedUsd,
  }
  const rawQuota = perRequestUsd * (input.quotaPerUnit ?? Number.NaN)
  const quotaPerRequest =
    model.billing_mode === 'tiered_expr'
      ? Math.round(rawQuota)
      : Math.trunc(rawQuota)
  if (
    Number.isFinite(input.quotaPerUnit) &&
    (input.quotaPerUnit ?? 0) > 0 &&
    Number.isFinite(rawQuota) &&
    rawQuota >= 0 &&
    rawQuota <= 2_147_483_647 &&
    Number.isSafeInteger(quotaPerRequest * input.quantity)
  ) {
    preview.estimatedQuota = quotaPerRequest * input.quantity
  }
  return preview
}

/** Fetches only existing read-only endpoints; request failures leave price unknown. */
export async function fetchStudioVideoCostPreview(
  input: StudioVideoCostInput
): Promise<StudioVideoCostPreview> {
  if (!validInput(input)) return { status: 'unknown', reason: 'invalid_input' }
  try {
    const [pricing, models] = await Promise.all([
      getPricing(),
      getUserModels(input.group),
    ])
    if (!models.success || !Array.isArray(models.data)) {
      return { status: 'unknown', reason: 'model_unavailable' }
    }
    return estimateStudioVideoCost(input, pricing, models.data)
  } catch {
    return { status: 'unknown', reason: 'pricing_unavailable' }
  }
}
