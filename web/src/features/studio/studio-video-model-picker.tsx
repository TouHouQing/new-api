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
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getPricing } from '@/features/pricing/api'
import type { PricingData, PricingModel } from '@/features/pricing/types'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'

import { fetchStudioModels } from './api'
import { estimateStudioVideoCost } from './studio-cost'

type Props = {
  group: string
  selectedModel: string
  durationSeconds: number
  onSelect: (modelId: string) => void
}

type LoadedModels = {
  models: string[]
  pricing?: PricingData
}

const catalogCurrencyOptions = {
  digitsLarge: 4,
  digitsSmall: 4,
  abbreviate: false,
} as const

function catalogPrice(
  modelId: string,
  group: string,
  durationSeconds: number,
  models: readonly string[],
  pricing?: PricingData
): { kind: 'estimate' | 'reference'; amount: string } | null {
  if (!pricing?.success) return null
  const preview = estimateStudioVideoCost(
    { modelId, group, durationSeconds, quantity: 1 },
    pricing,
    models
  )
  if (preview.status === 'estimated') {
    return {
      kind: 'estimate',
      amount: formatBillingCurrencyFromUSD(
        preview.estimatedUsd,
        catalogCurrencyOptions
      ),
    }
  }
  const catalog = pricing.data.find((item) => item.model_name === modelId)
  const ratio = pricing.group_ratio?.[group]
  if (
    catalog?.quota_type === 1 &&
    typeof catalog.model_price === 'number' &&
    Number.isFinite(catalog.model_price) &&
    catalog.model_price >= 0 &&
    typeof ratio === 'number' &&
    Number.isFinite(ratio) &&
    ratio >= 0
  ) {
    return {
      kind: 'reference',
      amount: formatBillingCurrencyFromUSD(
        catalog.model_price * ratio,
        catalogCurrencyOptions
      ),
    }
  }
  return null
}

function modelDescription(model: PricingModel | undefined): string {
  return model?.description?.trim() || ''
}

export function StudioVideoModelPicker(props: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const modelQuery = useQuery<LoadedModels>({
    queryKey: ['studio', 'video-model-picker', props.group],
    enabled: false,
    retry: false,
    meta: { errorToast: false },
    queryFn: async () => {
      const [available, catalog] = await Promise.allSettled([
        fetchStudioModels(props.group),
        getPricing(),
      ])
      if (available.status === 'rejected') throw available.reason
      return {
        models: available.value,
        pricing:
          catalog.status === 'fulfilled' &&
          catalog.value.success &&
          Array.isArray(catalog.value.data)
            ? catalog.value
            : undefined,
      }
    },
  })
  const current =
    modelQuery.isFetching || modelQuery.isError ? null : modelQuery.data

  const matches = (current?.models || []).filter((id) => {
    const details = current?.pricing?.data.find(
      (item) => item.model_name === id
    )
    const needle = query.trim().toLocaleLowerCase()
    return (
      !needle ||
      id.toLocaleLowerCase().includes(needle) ||
      modelDescription(details).toLocaleLowerCase().includes(needle)
    )
  })

  return (
    <>
      <Button
        type='button'
        variant='outline'
        className='h-auto min-h-10 w-full justify-between gap-2 py-2 text-left'
        disabled={!props.group}
        aria-label={props.selectedModel || t('studio.model.select')}
        aria-haspopup='dialog'
        aria-expanded={open}
        onClick={() => {
          setQuery('')
          setOpen(true)
          void modelQuery.refetch()
        }}
      >
        <span className='min-w-0 truncate'>
          {props.selectedModel || t('studio.model.select')}
        </span>
        <ChevronDown aria-hidden='true' className='shrink-0 opacity-60' />
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('studio.model.pickerTitle')}
        description={t('studio.model.pickerDescription', {
          group: props.group,
        })}
        contentClassName='max-h-[85dvh] sm:max-w-3xl'
        contentHeight='min(60dvh, 640px)'
        bodyClassName='flex h-full min-h-0 flex-col gap-3'
        footerClassName='sm:justify-start'
        footer={
          <p className='text-muted-foreground text-xs'>
            {t('studio.model.priceNote')}
          </p>
        }
      >
        <div className='flex shrink-0 gap-2'>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t('studio.model.search')}
            placeholder={t('studio.model.search')}
          />
          <Button
            type='button'
            variant='outline'
            size='icon'
            aria-label={t('studio.model.refresh')}
            onClick={() => void modelQuery.refetch()}
          >
            <RefreshCw aria-hidden='true' />
          </Button>
        </div>
        <div className='flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1'>
          {modelQuery.isFetching && (
            <LoadingState message={t('studio.model.loading')} />
          )}
          {modelQuery.isError && !modelQuery.isFetching && (
            <ErrorState
              title={t('studio.model.loadFailed')}
              onRetry={() => void modelQuery.refetch()}
            />
          )}
          {current && matches.length === 0 && (
            <EmptyState title={t('studio.model.empty')} />
          )}
          {matches.map((id) => {
            const details = current?.pricing?.data.find(
              (item) => item.model_name === id
            )
            const price = catalogPrice(
              id,
              props.group,
              props.durationSeconds,
              current?.models || [],
              current?.pricing
            )
            let priceLabel = t('studio.model.priceUnknown')
            if (price?.kind === 'estimate') {
              priceLabel = t('studio.model.priceEstimated')
            } else if (price?.kind === 'reference') {
              priceLabel = t('studio.model.priceReference')
            }
            return (
              <Button
                key={id}
                type='button'
                variant='outline'
                className='h-auto w-full shrink-0 flex-col items-stretch justify-start gap-2 rounded-lg px-3 py-3 text-left whitespace-normal sm:flex-row sm:items-start sm:justify-between'
                aria-label={id}
                aria-pressed={props.selectedModel === id}
                onClick={() => {
                  props.onSelect(id)
                  setOpen(false)
                }}
              >
                <span className='min-w-0 flex-1'>
                  <span className='flex items-center gap-2 font-medium break-all'>
                    {id}
                    {props.selectedModel === id && (
                      <Check
                        aria-hidden='true'
                        className='text-primary shrink-0'
                      />
                    )}
                  </span>
                  <span className='text-muted-foreground mt-1 block text-xs leading-5 break-words'>
                    {modelDescription(details) ||
                      t('studio.model.descriptionMissing')}
                  </span>
                </span>
                <span className='shrink-0 text-left sm:text-right'>
                  <span className='text-muted-foreground block text-xs'>
                    {priceLabel}
                  </span>
                  {price && (
                    <span className='block font-mono text-sm font-semibold tabular-nums'>
                      {price.amount}
                    </span>
                  )}
                </span>
              </Button>
            )
          })}
        </div>
      </Dialog>
    </>
  )
}
