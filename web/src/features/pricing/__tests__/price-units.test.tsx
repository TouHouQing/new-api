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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import zh from '@/i18n/locales/zh.json'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { ModelBillingModeBadge } from '../components/model-billing-mode-badge'
import { ModelCard } from '../components/model-card'
import { ModelDetailsContent } from '../components/model-details'
import { ModelPriceCell } from '../components/model-price-cell'
import { getModelPriceDisplay } from '../lib/billing-display'
import { getModelQuotaType } from '../lib/filters'
import type { PricingModel } from '../types'

vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'zh',
  resources: { zh: { translation: zh.translation } },
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
})

function model(overrides: Partial<PricingModel>): PricingModel {
  return {
    id: 1,
    model_name: 'fixed-task-model',
    quota_type: 1,
    model_ratio: 0,
    completion_ratio: 1,
    model_price: 0.7189,
    enable_groups: ['default', 'premium'],
    group_ratio: { default: 1, premium: 3 },
    ...overrides,
  }
}

function renderDetails(value: PricingModel, client: QueryClient) {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <ModelBillingModeBadge model={value} />
        <ModelCard model={value} onClick={vi.fn()} />
        <ModelPriceCell
          model={value}
          options={{ selectedGroup: 'premium', tokenUnit: 'M' }}
        />
        <ModelDetailsContent
          model={value}
          groupRatio={value.group_ratio ?? {}}
          usableGroup={{}}
          endpointMap={{}}
          autoGroups={[]}
          priceRate={1}
          usdExchangeRate={1}
          tokenUnit='M'
        />
      </QueryClientProvider>
    </I18nextProvider>
  )
}

afterEach(() => {
  cleanup()
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG },
  })
})

describe('fixed price billing units', () => {
  it('uses the same per-second tag and unit in badge, card, table and details', () => {
    useSystemConfigStore.getState().setConfig({
      currency: { ...DEFAULT_CURRENCY_CONFIG, quotaDisplayType: 'USD' },
    })
    const value = model({
      billing_price_unit: 'second',
      billing_price_unit_source: 'builtin-reviewed',
      billing_usage_schema: {
        seconds: { type: 'number', unit: 'second' },
      },
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    renderDetails(value, client)

    expect(screen.getAllByText('按秒计费').length).toBeGreaterThan(0)
    expect(screen.getAllByText('/ 秒').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$0.7189').length).toBeGreaterThan(0)
    expect(screen.getAllByTitle('2.1567').length).toBeGreaterThan(0)
  })

  it('keeps a seconds schema but shows an explicitly fixed per-request price', () => {
    const value = model({
      model_price: 8.45,
      billing_price_unit: 'request',
      billing_price_unit_source: 'builtin-reviewed',
      billing_usage_schema: {
        seconds: { type: 'number', unit: 'second' },
      },
    })
    expect(getModelPriceDisplay(value)).toEqual({
      kind: 'fixed',
      unit: 'request',
    })
    render(
      <I18nextProvider i18n={i18n}>
        <ModelPriceCell model={value} />
      </I18nextProvider>
    )
    expect(screen.getByText('按次')).toBeVisible()
    expect(screen.getByTitle('8.45')).toBeVisible()
    expect(screen.getByText('USD / 次')).toBeVisible()
  })

  it('separates fixed second and request units even when quota_type is identical', () => {
    const perSecond = model({
      model_name: 'per-second',
      billing_price_unit: 'second',
    })
    const perRequest = model({
      model_name: 'per-request',
      billing_price_unit: 'request',
    })

    expect(perSecond.quota_type).toBe(perRequest.quota_type)
    expect(getModelQuotaType(perSecond)).toBe('second')
    expect(getModelQuotaType(perRequest)).toBe('request')
  })

  it('keeps explicit zero and non-USD currency units aligned with the fixed unit', () => {
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'CNY',
        usdExchangeRate: 7,
      },
    })
    const value = model({
      model_price: 0,
      billing_price_unit: 'second',
      group_ratio: { default: 1, premium: 3 },
    })

    render(
      <I18nextProvider i18n={i18n}>
        <ModelPriceCell
          model={value}
          options={{ selectedGroup: 'premium', tokenUnit: 'M' }}
        />
      </I18nextProvider>
    )

    expect(screen.getByText('按秒计费')).toBeVisible()
    expect(screen.getByTitle('0')).toBeVisible()
    expect(screen.getByText('CNY / 秒')).toBeVisible()
  })

  it('does not guess from a seconds schema when the fixed unit is missing', () => {
    const value = model({
      billing_usage_schema: {
        seconds: { type: 'number', unit: 'second' },
      },
    })
    expect(getModelPriceDisplay(value)).toEqual({ kind: 'unconfigured' })
    render(
      <I18nextProvider i18n={i18n}>
        <ModelBillingModeBadge model={value} />
        <ModelPriceCell model={value} />
      </I18nextProvider>
    )
    expect(screen.getAllByText('计费单位未确认').length).toBe(2)
    expect(screen.queryByText('/ 秒')).not.toBeInTheDocument()
    expect(screen.queryByText('/ 次')).not.toBeInTheDocument()
  })

  it('keeps token pricing and dynamic expressions on their existing units', () => {
    const token = model({
      model_name: 'token-model',
      quota_type: 0,
      model_ratio: 1,
      model_price: undefined,
    })
    const dynamic = model({
      model_name: 'dynamic-video',
      billing_mode: 'tiered_expr',
      billing_expr: 'tier("base", u("seconds") * 0.4)',
      billing_usage_schema: {
        seconds: { type: 'number', unit: 'second' },
      },
    })
    render(
      <I18nextProvider i18n={i18n}>
        <ModelBillingModeBadge model={token} />
        <ModelPriceCell model={token} />
        <ModelBillingModeBadge model={dynamic} />
        <ModelPriceCell model={dynamic} />
      </I18nextProvider>
    )
    expect(screen.getByText('按量计费')).toBeVisible()
    expect(screen.getByText('动态计费')).toBeVisible()
    expect(screen.getAllByText('USD / 1M Token').length).toBeGreaterThan(0)
    expect(screen.getByTitle('0.4/秒')).toBeVisible()
    const badgeGroup = screen.getByText('按量计费').parentElement
    expect(badgeGroup).not.toHaveTextContent('/ 次')
  })
})
