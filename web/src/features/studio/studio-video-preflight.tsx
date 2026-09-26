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
*/
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'

import type { StudioVideoRequest } from './model-profiles'
import {
  fetchStudioVideoCostPreview,
  type StudioVideoCostPreview,
} from './studio-cost'
import { inspectStudioVideoRequest } from './studio-video-request-summary'

export type StudioVideoPreflightData =
  | {
      kind: 'video'
      title: string
      group: string
      request: StudioVideoRequest
      costDuration: number | null
      mediaAdapted?: boolean
    }
  | {
      kind: 'batch'
      items: Array<{
        id: string
        title: string
        group: string
        model: string
        seconds: number | null
        prompt: string
        payloadPatch?: string
      }>
      cost:
        | { status: 'estimated'; estimatedUsd: number }
        | { status: 'unknown' }
    }

export function StudioVideoPreflight(props: {
  data: StudioVideoPreflightData
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [cost, setCost] = useState<StudioVideoCostPreview>({
    status: 'unknown',
    reason: 'pricing_unavailable',
  })
  const [costLoading, setCostLoading] = useState(
    props.data.kind === 'video' && props.data.costDuration !== null
  )
  const video = props.data.kind === 'video' ? props.data : null
  const batch = props.data.kind === 'batch' ? props.data : null
  const modelId = video?.request.model || ''
  const group = video?.group || ''
  const costDuration = video?.costDuration ?? null
  useEffect(() => {
    let cancelled = false
    if (video && costDuration !== null) {
      setCostLoading(true)
      void fetchStudioVideoCostPreview({
        modelId,
        group,
        durationSeconds: costDuration,
        quantity: 1,
      })
        .then((value) => {
          if (!cancelled) setCost(value)
        })
        .finally(() => {
          if (!cancelled) setCostLoading(false)
        })
    } else {
      setCostLoading(false)
    }
    return () => {
      cancelled = true
    }
  }, [video, modelId, group, costDuration])
  const inspected = video ? inspectStudioVideoRequest(video.request) : null
  const shownCost = video
    ? cost
    : (batch?.cost ?? { status: 'unknown' as const })
  let costLabel = t('studio.cost.unknown')
  if (costLoading) {
    costLabel = t('studio.model.loading')
  } else if (shownCost.status === 'estimated') {
    costLabel = t('studio.preflight.costEstimated', {
      amount: formatBillingCurrencyFromUSD(shownCost.estimatedUsd, {
        digitsLarge: 4,
        digitsSmall: 4,
        abbreviate: false,
      }),
    })
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onCancel()
      }}
      title={
        video ? t('studio.preflight.title') : t('studio.preflight.batchTitle')
      }
      description={
        video
          ? t('studio.preflight.description')
          : t('studio.preflight.batchDescription')
      }
      contentClassName='max-h-[85dvh] sm:max-w-3xl'
      contentHeight={
        video || (batch?.items.length || 0) > 6 ? 'min(65dvh, 720px)' : 'auto'
      }
      bodyClassName='flex min-h-0 flex-col gap-3 overflow-y-auto'
      footer={
        <div className='flex w-full justify-end gap-2'>
          <Button variant='outline' onClick={props.onCancel}>
            {t('studio.preflight.cancel')}
          </Button>
          <Button disabled={costLoading} onClick={props.onConfirm}>
            {video
              ? t('studio.preflight.confirm')
              : t('studio.preflight.startBatch')}
          </Button>
        </div>
      }
    >
      {video && inspected && (
        <>
          <dl className='grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-sm'>
            <dt>{t('studio.preflight.node')}</dt>
            <dd>{video.title}</dd>
            <dt>{t('studio.video.group')}</dt>
            <dd>{video.group}</dd>
            <dt>{t('studio.model')}</dt>
            <dd className='break-all'>{video.request.model}</dd>
            <dt>{t('studio.duration')}</dt>
            <dd>{inspected.duration}</dd>
            <dt>{t('studio.preflight.media')}</dt>
            <dd>{inspected.roles.join(', ') || t('studio.preflight.none')}</dd>
          </dl>
          <div>
            <h3 className='mb-1 text-sm font-medium'>{t('studio.prompt')}</h3>
            <p className='max-h-28 overflow-auto rounded-md border p-2 text-xs whitespace-pre-wrap'>
              {inspected.prompt}
            </p>
          </div>
          {video.mediaAdapted && (
            <Alert>
              <AlertDescription>
                {t('studio.preflight.frameAdapted')}
              </AlertDescription>
            </Alert>
          )}
          {inspected.roles.filter((role) => role === 'reference_video').length >
            3 && (
            <Alert>
              <AlertDescription>
                {t('studio.preflight.referenceCountWarning')}
              </AlertDescription>
            </Alert>
          )}
          {inspected.media.length > 0 && (
            <div>
              <h3 className='mb-1 text-sm font-medium'>
                {t('studio.preflight.mediaPreview')}
              </h3>
              <div className='flex gap-2 overflow-x-auto pb-1'>
                {inspected.media
                  .slice(0, 8)
                  .map((item) =>
                    item.kind === 'image' ? (
                      <img
                        key={`${item.kind}-${item.role}-${item.url}`}
                        src={item.url}
                        alt={item.role}
                        className='h-24 w-36 shrink-0 rounded-md border object-contain'
                      />
                    ) : (
                      <video
                        key={`${item.kind}-${item.role}-${item.url}`}
                        src={item.url}
                        aria-label={item.role}
                        controls
                        preload='none'
                        className='h-24 w-36 shrink-0 rounded-md border object-contain'
                      />
                    )
                  )}
              </div>
            </div>
          )}
          <div>
            <h3 className='mb-1 text-sm font-medium'>
              {t('studio.preflight.request')}
            </h3>
            <pre className='bg-muted max-h-52 overflow-auto rounded-md p-2 text-xs break-all whitespace-pre-wrap'>
              {inspected.payload}
            </pre>
          </div>
        </>
      )}
      {props.data.kind === 'batch' && (
        <div className='flex flex-col gap-2'>
          {props.data.items.map((item, index) => (
            <div key={item.id} className='rounded-md border p-2 text-xs'>
              <strong>
                {index + 1}. {item.title}
              </strong>
              <span className='ml-2 break-all'>
                {item.group} / {item.model} /{' '}
                {item.seconds === null
                  ? t('studio.preflight.customDuration')
                  : `${item.seconds}s`}
              </span>
              {item.prompt && (
                <p className='mt-1 whitespace-pre-wrap'>
                  {t('studio.preflight.configuredPrompt')}: {item.prompt}
                </p>
              )}
              {item.payloadPatch && (
                <pre className='bg-muted mt-1 max-h-24 overflow-auto rounded p-1 whitespace-pre-wrap'>
                  {t('studio.preflight.overrides')}: {item.payloadPatch}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
      <p className='text-sm font-medium'>{costLabel}</p>
      <p className='text-muted-foreground text-xs'>
        {t('studio.preflight.priceNote')}
      </p>
    </Dialog>
  )
}
