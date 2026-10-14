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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import { studioCreationProgress } from './studio-creation'
import {
  studioProductionSchema,
  studioUnapprovedClips,
} from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import { StudioRenderProgress } from './studio-render-progress'
import { StudioTabSection } from './studio-tab-section'

export function StudioProductionDeliveryTab(
  options: { value?: string; inline?: boolean } = {}
) {
  const { t } = useTranslation()
  const {
    props,
    activeRender,
    deliveryPreview,
    preview,
    capabilities,
    writable,
    mutate,
    result,
    submit,
    download,
    path,
    record,
    setReviewTarget,
    captionsReady,
    setActiveTab,
  } = useStudioProductionContext()
  const [shareUrl, setShareUrl] = useState('')
  const [showOldShares, setShowOldShares] = useState(false)
  const defaults = studioProductionSchema.parse({})
  const footageReady = studioCreationProgress(props.project).edit
  const unapproved = props.project.production?.requireApproved
    ? studioUnapprovedClips(props.project)
    : []
  const [numberDrafts, setNumberDrafts] = useState<
    Partial<Record<'width' | 'height' | 'fps', { base: number; text: string }>>
  >({})
  const invalidNumbers = (['width', 'height', 'fps'] as const).some((key) => {
    const value = props.project.production?.[key] ?? defaults[key]
    const draft = numberDrafts[key]
    if (!draft || draft.base !== value) return false
    const min = key === 'fps' ? 12 : 64
    const max = key === 'fps' ? 60 : 4096
    return (
      !/^\d+$/.test(draft.text) ||
      !Number.isInteger(Number(draft.text)) ||
      Number(draft.text) < min ||
      Number(draft.text) > max
    )
  })
  const shares = useQuery({
    queryKey: ['studio-review-shares', props.project.id],
    queryFn: () =>
      studioCloudRequest<
        {
          id: string
          revoked_at: string | null
          expires_at: string
          revision: number
        }[]
      >(`${path}/review-shares`),
    enabled: !!writable,
  })
  return (
    <StudioTabSection
      inline={options.inline}
      value={options.value || 'delivery'}
      className='space-y-4'
    >
      <Field>
        <FieldLabel>{t('Fit footage to the frame')}</FieldLabel>
        <Select
          disabled={!writable}
          value={props.project.production?.fit || 'letterbox'}
          onValueChange={(fit) => {
            const next = studioProductionSchema.safeParse({
              ...(props.project.production || studioProductionSchema.parse({})),
              fit,
            })
            if (next.success) {
              props.onUpdate({ ...props.project, production: next.data })
            }
          }}
          items={['letterbox', 'crop', 'blur'].map((value) => ({
            value,
            label: t(`studio.fit.${value}`),
          }))}
        >
          <SelectTrigger aria-label={t('Fit footage to the frame')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {['letterbox', 'crop', 'blur'].map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`studio.fit.${value}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>{t('Optional watermark')}</FieldLabel>
        <Input
          disabled={!writable}
          maxLength={120}
          value={props.project.production?.watermark || ''}
          onChange={(event) =>
            props.onUpdate({
              ...props.project,
              production: {
                ...(props.project.production ||
                  studioProductionSchema.parse({})),
                watermark: event.target.value,
              },
            })
          }
        />
      </Field>
      <Field>
        <FieldLabel>{t('studio.production.deliveryPreset')}</FieldLabel>
        <Select
          disabled={!writable}
          value={props.project.production?.deliveryPreset || 'custom'}
          onValueChange={(value) => {
            const preset = value as
              | 'custom'
              | 'youtube'
              | 'shorts'
              | 'douyin'
              | 'bilibili'
            const vertical = preset === 'shorts' || preset === 'douyin'
            const dimensions =
              preset === 'custom'
                ? {}
                : {
                    width: vertical ? 1080 : 1920,
                    height: vertical ? 1920 : 1080,
                    fps: 30,
                  }
            props.onUpdate({
              ...props.project,
              production: {
                ...(props.project.production ||
                  studioProductionSchema.parse({})),
                deliveryPreset: preset,
                ...dimensions,
              },
            })
          }}
        >
          <SelectTrigger aria-label={t('studio.production.deliveryPreset')}>
            <SelectValue>
              {t(
                `studio.production.preset.${props.project.production?.deliveryPreset || 'custom'}`
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(
              ['custom', 'youtube', 'shorts', 'douyin', 'bilibili'] as const
            ).map((preset) => (
              <SelectItem key={preset} value={preset}>
                {t(`studio.production.preset.${preset}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <label className='flex items-center gap-2'>
        <Checkbox
          disabled={!writable}
          checked={props.project.production?.requireApproved || false}
          onCheckedChange={(value) =>
            props.onUpdate({
              ...props.project,
              production: {
                ...(props.project.production ||
                  studioProductionSchema.parse({})),
                requireApproved: value === true,
              },
            })
          }
        />
        {t('studio.production.requireApproved')}
      </label>
      <div className='grid gap-3 sm:grid-cols-3'>
        {(['width', 'height', 'fps'] as const).map((key) => {
          const value = props.project.production?.[key] ?? defaults[key]
          const draft = numberDrafts[key]
          const text = draft?.base === value ? draft.text : String(value)
          const min = key === 'fps' ? 12 : 64
          const max = key === 'fps' ? 60 : 4096
          const valid =
            /^\d+$/.test(text) &&
            Number.isInteger(Number(text)) &&
            Number(text) >= min &&
            Number(text) <= max
          return (
            <Field key={key} data-invalid={!valid}>
              <FieldLabel htmlFor={`production-${key}`}>
                {t(`studio.production.${key}`)}
              </FieldLabel>
              <Input
                id={`production-${key}`}
                disabled={!writable}
                inputMode='numeric'
                value={text}
                aria-invalid={!valid}
                aria-describedby={
                  !valid ? `production-${key}-error` : undefined
                }
                onChange={(event) =>
                  setNumberDrafts((current) => ({
                    ...current,
                    [key]: { base: value, text: event.target.value },
                  }))
                }
                onBlur={() => {
                  if (!valid || Number(text) === value) return
                  const number = Number(text)
                  props.onUpdate({
                    ...props.project,
                    production: {
                      ...(props.project.production || defaults),
                      [key]: number,
                    },
                  })
                  setNumberDrafts((current) => ({
                    ...current,
                    [key]: { base: number, text: String(number) },
                  }))
                }}
              />
              {!valid && (
                <FieldError id={`production-${key}-error`}>
                  {t('Enter a whole number between {{min}} and {{max}}', {
                    min,
                    max,
                  })}
                </FieldError>
              )}
            </Field>
          )
        })}
      </div>
      <Button
        disabled={
          !writable ||
          !footageReady ||
          !captionsReady ||
          unapproved.length > 0 ||
          capabilities.data?.storage_available === false ||
          invalidNumbers ||
          mutate.isPending ||
          !!activeRender ||
          !capabilities.data?.render_available
        }
        onClick={() => mutate.mutate(() => submit('render'))}
      >
        {t('studio.production.export')}
      </Button>
      {!captionsReady && (
        <div role='alert' className='space-y-2 text-sm'>
          <p>{t('Finish pending caption edits before exporting.')}</p>
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              setActiveTab('timeline')
              if (props.project.production?.guide) {
                props.onUpdate({
                  ...props.project,
                  production: {
                    ...props.project.production,
                    guide: { ...props.project.production.guide, step: 'edit' },
                  },
                })
              }
            }}
          >
            {t('Return to caption editing')}
          </Button>
        </div>
      )}
      {unapproved.length > 0 && (
        <div role='alert' className='space-y-2 text-sm'>
          <p>
            {t(
              'Approve the current footage for every delivery clip before exporting.'
            )}
          </p>
          {unapproved.map((clip, index) => (
            <Button
              key={clip.id}
              size='sm'
              variant='outline'
              onClick={() => {
                setReviewTarget({ nodeId: clip.nodeId, takeId: clip.takeId })
                props.onSelectNode?.(clip.nodeId)
              }}
            >
              {t('Review current footage')} ·{' '}
              {props.project.nodes.find((node) => node.id === clip.nodeId)?.data
                .title || `${t('Shot')} ${index + 1}`}
            </Button>
          ))}
        </div>
      )}
      <Button
        variant='outline'
        disabled={
          !writable ||
          !footageReady ||
          capabilities.data?.storage_available === false ||
          !captionsReady ||
          invalidNumbers ||
          mutate.isPending ||
          !!activeRender ||
          !capabilities.data?.render_available
        }
        onClick={() => mutate.mutate(() => submit('render', true))}
      >
        {t('Preview the exact export layout')}
      </Button>
      {!footageReady && (
        <p role='status'>
          {t('Add completed footage to the timeline before exporting.')}
        </p>
      )}
      <StudioRenderProgress />
      {capabilities.data?.storage_available === false && (
        <p role='status'>
          {t(
            'Studio storage is unavailable. Restore free space or reconnect storage before generating.'
          )}
        </p>
      )}
      {preview && preview !== deliveryPreview && (
        <video
          src={preview}
          controls
          className='max-h-96 w-full rounded-lg bg-black'
        />
      )}
      {result?.media_id && !deliveryPreview && (
        <p className='text-muted-foreground text-sm'>
          {t(
            'A previous delivery remains available. Render a new preview after changing clips, audio, subtitles or layout.'
          )}
        </p>
      )}
      {deliveryPreview && (
        <video
          src={deliveryPreview}
          controls
          className='aspect-video w-full rounded-lg bg-black'
        />
      )}
      <div className='flex gap-2'>
        {result?.media_id && (
          <Button
            variant='outline'
            onClick={() =>
              mutate.mutate(() =>
                download(result.media_id, `${props.project.title}.mp4`)
              )
            }
          >
            {t('studio.production.downloadVideo')}
          </Button>
        )}
        {result?.package_media_id && (
          <Button
            variant='outline'
            onClick={() =>
              mutate.mutate(() =>
                download(result.package_media_id, `${props.project.title}.zip`)
              )
            }
          >
            {t('studio.production.downloadPackage')}
          </Button>
        )}
      </div>
      <Button
        variant='outline'
        disabled={!writable || !result?.media_id || mutate.isPending}
        onClick={() =>
          mutate.mutate(async () => {
            await props.onSave()
            const current = await studioCloudRequest<StudioCloudProject>(path)
            const created = await studioCloudRequest<{ url: string }>(
              `${path}/review-shares`,
              'POST',
              {
                revision: current.revision,
                media_id: result?.media_id,
                expires_hours: 168,
                allow_comments: true,
              }
            )
            setShareUrl(new URL(created.url, window.location.origin).href)
            await shares.refetch()
          })
        }
      >
        {t('studio.production.createReviewLink')}
      </Button>
      {shareUrl && (
        <div className='flex items-center gap-2'>
          <Input
            readOnly
            aria-label={t('studio.production.reviewLink')}
            value={shareUrl}
          />
          <CopyButton value={shareUrl} />
        </div>
      )}
      <Collapsible open={showOldShares} onOpenChange={setShowOldShares}>
        <CollapsibleTrigger render={<Button variant='outline' size='sm' />}>
          {t('Expired or revoked review links')}
        </CollapsibleTrigger>
        <CollapsibleContent />
      </Collapsible>
      {shares.data
        ?.filter(
          (share) =>
            showOldShares ||
            (!share.revoked_at && Date.parse(share.expires_at) > Date.now())
        )
        .sort((a, b) => b.revision - a.revision)
        .map((share) => (
          <div key={share.id} className='flex items-center gap-2 text-sm'>
            <span className='grow'>
              v{share.revision} · {share.expires_at} ·{' '}
              {share.revoked_at
                ? t('studio.production.revoked')
                : t(
                    Date.parse(share.expires_at) > Date.now()
                      ? 'studio.production.active'
                      : 'Expired'
                  )}
            </span>
            <Button
              size='sm'
              variant='outline'
              aria-label={`${t('studio.production.revokeLink')} · v${share.revision} · ${share.id.slice(0, 8)}`}
              disabled={
                record.data?.role !== 'owner' ||
                !!share.revoked_at ||
                Date.parse(share.expires_at) <= Date.now()
              }
              onClick={() =>
                mutate.mutate(async () => {
                  await studioCloudRequest(
                    `${path}/review-shares/${share.id}`,
                    'DELETE'
                  )
                  await shares.refetch()
                })
              }
            >
              {t('studio.production.revokeLink')}
            </Button>
          </div>
        ))}
    </StudioTabSection>
  )
}
