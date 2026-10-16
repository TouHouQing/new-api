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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { getPricing } from '@/features/pricing/api'
import { toIntlLocale } from '@/i18n/languages'
import {
  formatBillingCurrencyFromUSD,
  formatCurrencyFromUSD,
} from '@/lib/currency'
import { formatNumber } from '@/lib/format'

import {
  studioCostDurationSeconds,
  estimateStudioVideoCost,
} from './studio-cost'
import { useStudioProductionContext } from './studio-production-context'
import { studioWorkflowScope } from './studio-workflow-scope'

export function StudioGenerationEstimate() {
  const { t, i18n } = useTranslation()
  const { props, selectedNodes, budget } = useStudioProductionContext()
  const pricing = useQuery({
    queryKey: ['studio-creation-pricing'],
    queryFn: getPricing,
  })
  const planned = new Map<string, (typeof props.project.nodes)[number]>()
  let error = ''
  try {
    for (const node of studioWorkflowScope(props.project, selectedNodes)) {
      if (
        node.data.sourceMode !== 'upload' &&
        node.data.purpose !== 'note' &&
        node.data.purpose !== 'assembly'
      ) {
        planned.set(node.id, node)
      }
    }
  } catch (failure) {
    error = failure instanceof Error ? failure.message : String(failure)
  }
  const locale = toIntlLocale(i18n.language)
  return (
    <div className='space-y-2 rounded-lg border p-3'>
      <p className='font-medium'>{t('Review the generation scope')}</p>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Only the tasks listed below will run. Completed dependencies are reused. Estimated prices and the maximum spending limit are different; unknown prices require checking the model catalog.'
        )}
      </p>
      {[...planned.values()].map((node) => {
        const duration = studioCostDurationSeconds(
          node.data.seconds || 5,
          node.data.payloadPatchJson
        )
        const preview =
          node.data.kind === 'video' && pricing.data && duration !== null
            ? estimateStudioVideoCost(
                {
                  modelId: node.data.model || '',
                  group:
                    node.data.group ||
                    props.project.defaults?.videoGroup ||
                    'default',
                  durationSeconds: duration,
                  quantity: 1,
                },
                pricing.data,
                props.project.nodes.map((node) => node.data.model || '')
              )
            : undefined
        const quantity =
          node.data.kind === 'image' ? node.data.imageCount || 1 : 1
        const ready =
          !selectedNodes.includes(node.id) &&
          node.data.status === 'completed' &&
          (node.data.mediaId || node.data.outputText)
        let cost = t(
          'Price is not available. Check model pricing before confirming.'
        )
        const catalogModel = pricing.data?.data?.find(
          (model) => model.model_name === node.data.model
        )
        const group =
          node.data.group || props.project.defaults?.videoGroup || 'default'
        const zeroCatalog =
          pricing.data?.success &&
          Object.hasOwn(pricing.data.usable_group || {}, group) &&
          catalogModel?.enable_groups.includes(group) &&
          !catalogModel.billing_plugin_variants?.length &&
          catalogModel.billing_mode !== 'tiered_expr' &&
          ((catalogModel.quota_type === 1 && catalogModel.model_price === 0) ||
            (catalogModel.quota_type === 0 &&
              catalogModel.model_ratio === 0 &&
              catalogModel.completion_ratio === 0))
        if (zeroCatalog) cost = t('Current catalog price: zero model charge')
        if (ready) cost = t('Reuse completed input')
        else if (preview?.status === 'estimated') {
          cost =
            preview.estimatedUsd === 0
              ? t('Current catalog price: zero model charge')
              : formatBillingCurrencyFromUSD(preview.estimatedUsd, {
                  digitsLarge: 4,
                  digitsSmall: 4,
                  abbreviate: false,
                })
        }
        return (
          <div
            key={node.id}
            className='flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-sm'
          >
            <span className='mr-auto'>
              {node.data.title} ·{' '}
              {node.data.model ||
                t(
                  ready ? 'Reuse completed input' : 'Choose an available model'
                )}
            </span>
            <span>
              {t('Quantity')}: {formatNumber(quantity, locale)}
            </span>
            {node.data.kind === 'video' && (
              <span>
                {t('Seconds')}: {formatNumber(duration, locale)}
              </span>
            )}
            <span>{cost}</span>
          </div>
        )
      })}
      <p className='text-sm'>
        {t('Maximum spend')}: {formatCurrencyFromUSD(Number(budget) || 0)}
      </p>
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
    </div>
  )
}
