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
import { describe, expect, test, vi } from 'vitest'

import { getPricing } from '@/features/pricing/api'
import type { PricingData, PricingModel } from '@/features/pricing/types'
import { getUserModels } from '@/lib/api'

import {
  estimateStudioVideoCost,
  fetchStudioVideoCostPreview,
  studioCostDurationSeconds,
} from '../studio-cost'

vi.mock('@/features/pricing/api', () => ({ getPricing: vi.fn() }))
vi.mock('@/lib/api', () => ({ getUserModels: vi.fn() }))

const input = {
  modelId: 'video-example',
  group: 'premium',
  durationSeconds: 8,
  quantity: 3,
  quotaPerUnit: 500_000,
}

function catalog(model: Partial<PricingModel>): PricingData {
  return {
    success: true,
    data: [
      {
        id: 1,
        model_name: input.modelId,
        quota_type: 1,
        model_ratio: 0,
        completion_ratio: 1,
        model_price: 0.2,
        enable_groups: ['premium'],
        ...model,
      },
    ],
    vendors: [],
    group_ratio: { premium: 1.5 },
    usable_group: { premium: { desc: '', ratio: 1.5 } },
    supported_endpoint: {},
    auto_groups: [],
  }
}

describe('Studio video cost preview', () => {
  test('uses the submitted duration or marks custom billable fields unknown', () => {
    expect(studioCostDurationSeconds(5, '{"seconds":"30"}')).toBe(30)
    expect(studioCostDurationSeconds(5, '{"duration":30}')).toBe(30)
    expect(
      studioCostDurationSeconds(5, '{"seconds":"30","duration":8}')
    ).toBeNull()
    expect(
      studioCostDurationSeconds(5, '{"metadata":{"quality":"high"}}')
    ).toBeNull()
  })
  test('prices each fixed-price request with the selected user group ratio', () => {
    const preview = estimateStudioVideoCost(input, catalog({}), [input.modelId])
    expect(preview).toMatchObject({
      status: 'estimated',
      priceBasis: 'per_request',
      estimatedQuota: 450_000,
    })
    if (preview.status === 'estimated') {
      expect(preview.estimatedUsd).toBeCloseTo(0.9)
    }
    const fractionalQuota = estimateStudioVideoCost(
      input,
      catalog({ model_price: 0.000002 }),
      [input.modelId]
    )
    expect(fractionalQuota).toMatchObject({ estimatedQuota: 3 })
  })

  test('uses a simple server-provided seconds expression and request quantity', () => {
    const pricing = catalog({
      quota_type: 0,
      billing_mode: 'tiered_expr',
      billing_expr: 'tier("base", u("seconds") * 0.04)',
      billing_usage_schema: { seconds: { type: 'number', unit: 'second' } },
    })
    const preview = estimateStudioVideoCost(input, pricing, [input.modelId])
    expect(preview).toMatchObject({
      status: 'estimated',
      priceBasis: 'per_second',
      estimatedQuota: 720_000,
    })
    if (preview.status === 'estimated') {
      expect(preview.estimatedUsd).toBeCloseTo(1.44)
    }
  })

  test('returns unknown for channel-specific prices', () => {
    const pricing = catalog({
      billing_plugin_variants: [
        {
          plugin_key: 'provider-a',
          plugin_name: 'Provider A',
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("base", u("seconds") * 0.04)',
          billing_usage_schema: {
            seconds: { type: 'number', unit: 'second' },
          },
        },
      ],
    })
    expect(estimateStudioVideoCost(input, pricing, [input.modelId])).toEqual({
      status: 'unknown',
      reason: 'dynamic_pricing',
    })
  })

  test('does not present a legacy task base price as a final video total', () => {
    const pricing = catalog({
      billing_usage_schema: {
        seconds: { type: 'number', unit: 'second' },
      },
    })
    expect(estimateStudioVideoCost(input, pricing, [input.modelId])).toEqual({
      status: 'unknown',
      reason: 'dynamic_pricing',
    })
    expect(
      estimateStudioVideoCost(
        input,
        catalog({ supported_endpoint_types: ['openai-video'] }),
        [input.modelId]
      )
    ).toEqual({ status: 'unknown', reason: 'dynamic_pricing' })
  })

  test('returns unknown when expression needs extra request facts', () => {
    const pricing = catalog({
      quota_type: 0,
      billing_mode: 'tiered_expr',
      billing_expr:
        'u("resolution") == "4k" ? tier("high", u("seconds") * 0.1) : tier("base", u("seconds") * 0.04)',
      billing_usage_schema: {
        seconds: { type: 'number', unit: 'second' },
        resolution: { enum: ['720p', '4k'] },
      },
    })
    expect(estimateStudioVideoCost(input, pricing, [input.modelId])).toEqual({
      status: 'unknown',
      reason: 'dynamic_pricing',
    })
  })

  test('does not invent a price for token pricing or missing group ratios', () => {
    expect(
      estimateStudioVideoCost(
        input,
        catalog({ quota_type: 0, model_price: undefined }),
        [input.modelId]
      )
    ).toEqual({ status: 'unknown', reason: 'unconfigured_pricing' })
    const pricing = catalog({})
    pricing.group_ratio = {}
    expect(estimateStudioVideoCost(input, pricing, [input.modelId])).toEqual({
      status: 'unknown',
      reason: 'group_unavailable',
    })
  })

  test('requires the model to be enabled in the selected user group', () => {
    expect(estimateStudioVideoCost(input, catalog({}), [])).toEqual({
      status: 'unknown',
      reason: 'model_unavailable',
    })
  })

  test('rejects invalid quantities without assigning a guessed price', () => {
    expect(
      estimateStudioVideoCost(
        { ...input, quantity: Number.MAX_SAFE_INTEGER + 1 },
        catalog({}),
        [input.modelId]
      )
    ).toEqual({ status: 'unknown', reason: 'invalid_input' })
    expect(
      estimateStudioVideoCost({ ...input, durationSeconds: 8.5 }, catalog({}), [
        input.modelId,
      ])
    ).toEqual({ status: 'unknown', reason: 'invalid_input' })
  })

  test('reads the catalog and the selected group’s enabled models', async () => {
    vi.mocked(getPricing).mockResolvedValue(catalog({}))
    vi.mocked(getUserModels).mockResolvedValue({
      success: true,
      data: [input.modelId],
    })

    const preview = await fetchStudioVideoCostPreview(input)

    expect(getPricing).toHaveBeenCalledOnce()
    expect(getUserModels).toHaveBeenCalledWith('premium')
    expect(preview.status).toBe('estimated')
  })
})
