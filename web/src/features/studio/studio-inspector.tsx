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
import { Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { JsonCodeEditor } from '@/components/json-code-editor'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import type { StudioGroup } from './api'
import type { StudioCanvasNode, StudioCanvasNodeData } from './canvas-flow'
import type { StudioAsset } from './local-projects'
import {
  buildStudioVideoModel,
  inferStudioVideoFamily,
  parseStudioVideoMetadata,
  parseStudioVideoPayloadPatch,
  type StudioVideoFamily,
} from './model-profiles'
import {
  fetchStudioVideoCostPreview,
  studioCostDurationSeconds,
  type StudioVideoCostPreview,
} from './studio-cost'
import { StudioVideoModelPicker } from './studio-video-model-picker'

type Props = {
  node: StudioCanvasNode
  models: string[]
  videoGroups: StudioGroup[]
  videoGroup: string
  providerConfigured: boolean
  hasConnectedPrompt?: boolean
  onConfigureProvider: () => void
  previewUrl?: string
  onChange: (patch: Partial<StudioCanvasNodeData>) => void
  onGenerate: () => void
  onUploadImage?: (file: File) => void
  onDelete: () => void
  onRetryMedia?: () => void
  onSelectTake?: (takeId: string) => void
  availableAssets?: StudioAsset[]
  requestPreview?: string
}

const RATIOS = ['16:9', '9:16', '1:1', '21:9', '4:3', '3:4', 'adaptive']

export function StudioInspector(props: Props) {
  const { t } = useTranslation()
  const imageUploadRef = useRef<HTMLInputElement>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [costPreview, setCostPreview] = useState<StudioVideoCostPreview>()
  const [metadataDraft, setMetadataDraft] = useState(
    props.node.data.metadataJson || ''
  )
  const [payloadDraft, setPayloadDraft] = useState(
    props.node.data.payloadPatchJson || ''
  )
  useEffect(() => {
    setMetadataDraft(props.node.data.metadataJson || '')
  }, [props.node.id, props.node.data.metadataJson])
  useEffect(() => {
    setPayloadDraft(props.node.data.payloadPatchJson || '')
  }, [props.node.id, props.node.data.payloadPatchJson])
  const isVideo = props.node.data.kind === 'video'
  const choices = props.models
  const selectModel = (value: string | null) => {
    const nextFamily =
      value && isVideo ? inferStudioVideoFamily(value) : undefined
    const next =
      value && nextFamily ? buildStudioVideoModel(value, nextFamily) : undefined
    const currentSeconds = props.node.data.seconds
    props.onChange({
      model: value || undefined,
      videoFamily: nextFamily,
      resolution: props.node.data.resolution || next?.resolutions[0],
      seconds:
        typeof currentSeconds === 'number' &&
        Number.isInteger(currentSeconds) &&
        currentSeconds > 0 &&
        currentSeconds <= 3600
          ? currentSeconds
          : (next?.defaultSeconds ?? 5),
      ratio: props.node.data.ratio || '16:9',
    })
  }
  const inferredFamily = props.node.data.model
    ? inferStudioVideoFamily(props.node.data.model)
    : undefined
  const family = props.node.data.videoFamily || inferredFamily || 'generic'
  const model =
    isVideo && props.node.data.model && family
      ? buildStudioVideoModel(props.node.data.model, family)
      : undefined
  const [durationDraft, setDurationDraft] = useState(
    String(props.node.data.seconds ?? model?.defaultSeconds ?? 5)
  )
  useEffect(() => {
    setDurationDraft(
      String(props.node.data.seconds ?? model?.defaultSeconds ?? 5)
    )
  }, [
    props.node.id,
    props.node.data.model,
    props.node.data.seconds,
    model?.family,
    model?.defaultSeconds,
  ])
  const durationNumber = Number(durationDraft)
  const durationValid = Boolean(
    durationDraft.trim() !== '' &&
    Number.isInteger(durationNumber) &&
    durationNumber >= 1 &&
    durationNumber <= 3600
  )
  let metadataValid = true
  try {
    parseStudioVideoMetadata(metadataDraft)
  } catch {
    metadataValid = false
  }
  let payloadValid = true
  try {
    parseStudioVideoPayloadPatch(payloadDraft)
  } catch {
    payloadValid = false
  }
  const busy =
    props.node.data.status === 'submitting' ||
    props.node.data.status === 'queued' ||
    props.node.data.status === 'processing'

  useEffect(() => {
    const modelId = props.node.data.model
    const durationSeconds = studioCostDurationSeconds(
      props.node.data.seconds ?? 5,
      props.node.data.payloadPatchJson
    )
    if (
      props.node.data.kind !== 'video' ||
      !modelId ||
      !props.videoGroup ||
      durationSeconds === null
    ) {
      setCostPreview({ status: 'unknown', reason: 'dynamic_pricing' })
      return
    }
    let cancelled = false
    void fetchStudioVideoCostPreview({
      modelId,
      group: props.videoGroup,
      durationSeconds,
      quantity: 1,
    }).then((preview) => {
      if (!cancelled) setCostPreview(preview)
    })
    return () => {
      cancelled = true
    }
  }, [
    props.node.data.kind,
    props.node.data.model,
    props.node.data.seconds,
    props.node.data.payloadPatchJson,
    props.videoGroup,
  ])

  return (
    <Card className='min-h-[560px] rounded-none border-0 ring-0 lg:h-full lg:min-h-0'>
      <CardHeader className='border-b'>
        <CardTitle>{t('studio.inspector.title')}</CardTitle>
        <p className='text-muted-foreground text-xs'>
          {t('studio.inspector.description')}
        </p>
      </CardHeader>
      <CardContent className='flex flex-1 flex-col gap-4 pb-4 lg:min-h-0 lg:overflow-y-auto'>
        {isVideo && (
          <Field>
            <FieldLabel>{t('studio.video.group')}</FieldLabel>
            <Select
              value={props.videoGroup || null}
              onValueChange={(value) =>
                props.onChange({
                  group: value || undefined,
                  model: undefined,
                  videoFamily: undefined,
                })
              }
              items={props.videoGroups.map((group) => ({
                value: group.id,
                label: group.description || group.id,
              }))}
            >
              <SelectTrigger
                className='w-full'
                aria-label={t('studio.video.group')}
              >
                <SelectValue placeholder={t('studio.video.group.select')} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {props.videoGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.description
                        ? `${group.description} (${group.id})`
                        : group.id}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor='studio-node-title'>
            {t('studio.node.title')}
          </FieldLabel>
          <Input
            id='studio-node-title'
            value={props.node.data.title}
            maxLength={200}
            onChange={(event) => props.onChange({ title: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel>{t('studio.model')}</FieldLabel>
          {isVideo ? (
            <StudioVideoModelPicker
              group={props.videoGroup}
              selectedModel={props.node.data.model || ''}
              durationSeconds={props.node.data.seconds ?? 5}
              onSelect={selectModel}
            />
          ) : (
            <Select
              value={props.node.data.model || null}
              onValueChange={selectModel}
              items={choices.map((id) => ({ value: id, label: id }))}
            >
              <SelectTrigger className='w-full' aria-label={t('studio.model')}>
                <SelectValue placeholder={t('studio.source.manual')} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {choices.map((id) => (
                    <SelectItem key={id} value={id}>
                      {id}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
          {choices.length === 0 && !isVideo && props.node.data.model && (
            <p className='text-muted-foreground text-xs'>
              {!props.providerConfigured
                ? t('studio.provider.configureHint')
                : t('studio.model.empty')}
            </p>
          )}
          {!isVideo && (
            <div className='flex flex-wrap gap-2'>
              <Button
                size='sm'
                variant='outline'
                onClick={props.onConfigureProvider}
              >
                {t('studio.provider.settings')}
              </Button>
              {props.node.data.model && (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => props.onChange({ model: undefined })}
                >
                  {t('studio.source.manual')}
                </Button>
              )}
            </div>
          )}
        </Field>
        {props.node.data.kind === 'image' && !props.node.data.model && (
          <Field>
            <FieldLabel>{t('studio.image.local')}</FieldLabel>
            <Input
              ref={imageUploadRef}
              type='file'
              accept='image/png,image/jpeg,image/webp'
              className='hidden'
              aria-label={t('studio.image.local')}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) props.onUploadImage?.(file)
                event.target.value = ''
              }}
            />
            <Button
              size='sm'
              variant='outline'
              onClick={() => imageUploadRef.current?.click()}
            >
              <Upload />
              {t('studio.image.upload')}
            </Button>
            <p className='text-muted-foreground text-xs'>
              {t('studio.image.uploadHint')}
            </p>
          </Field>
        )}
        {props.node.data.kind === 'image' && props.node.data.model && (
          <div className='grid grid-cols-3 gap-2'>
            <Field>
              <FieldLabel htmlFor='studio-image-size'>
                {t('studio.image.size')}
              </FieldLabel>
              <Input
                id='studio-image-size'
                value={props.node.data.imageSize || ''}
                maxLength={40}
                placeholder='auto'
                onChange={(event) =>
                  props.onChange({ imageSize: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='studio-image-quality'>
                {t('studio.image.quality')}
              </FieldLabel>
              <Input
                id='studio-image-quality'
                value={props.node.data.imageQuality || ''}
                maxLength={40}
                placeholder='auto'
                onChange={(event) =>
                  props.onChange({ imageQuality: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='studio-image-count'>
                {t('studio.image.count')}
              </FieldLabel>
              <Input
                id='studio-image-count'
                type='number'
                min={1}
                max={10}
                value={props.node.data.imageCount ?? 1}
                onChange={(event) => {
                  const count = Number(event.target.value)
                  if (Number.isInteger(count) && count >= 1 && count <= 10) {
                    props.onChange({ imageCount: count })
                  }
                }}
              />
            </Field>
            <p className='text-muted-foreground col-span-3 text-xs'>
              {t('studio.image.optionsHint')}
            </p>
          </div>
        )}
        {isVideo && props.node.data.model && (
          <Field>
            <FieldLabel>{t('studio.video.family')}</FieldLabel>
            <Select
              value={family || null}
              onValueChange={(value) => {
                const modelId = props.node.data.model
                if (!modelId) return
                const selected = value as StudioVideoFamily
                const profile = buildStudioVideoModel(modelId, selected)
                props.onChange({
                  videoFamily: selected,
                  resolution:
                    props.node.data.resolution || profile.resolutions[0],
                  seconds: props.node.data.seconds ?? profile.defaultSeconds,
                })
              }}
              items={[
                {
                  value: 'generic',
                  label: t('studio.video.family.generic'),
                },
                {
                  value: 'seedance-2',
                  label: t('studio.video.family.seedance'),
                },
                {
                  value: 'seedance-2.5',
                  label: t('studio.video.family.seedance25'),
                },
                {
                  value: 'minimax-h3',
                  label: t('studio.video.family.minimax'),
                },
              ]}
            >
              <SelectTrigger
                className='w-full'
                aria-label={t('studio.video.family')}
              >
                <SelectValue placeholder={t('studio.video.family.select')} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='generic'>
                    {t('studio.video.family.generic')}
                  </SelectItem>
                  <SelectItem value='seedance-2'>
                    {t('studio.video.family.seedance')}
                  </SelectItem>
                  <SelectItem value='seedance-2.5'>
                    {t('studio.video.family.seedance25')}
                  </SelectItem>
                  <SelectItem value='minimax-h3'>
                    {t('studio.video.family.minimax')}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className='text-muted-foreground text-xs'>
              {t('studio.video.familyHint')}
            </p>
          </Field>
        )}
        {(props.node.data.kind !== 'image' || props.node.data.model) && (
          <Field>
            <FieldLabel htmlFor='studio-prompt'>
              {t('studio.prompt')}
            </FieldLabel>
            <Textarea
              id='studio-prompt'
              className='min-h-32'
              value={props.node.data.prompt}
              maxLength={30000}
              onChange={(event) =>
                props.onChange({ prompt: event.target.value })
              }
              placeholder={t('studio.prompt.placeholder')}
            />
            {props.node.data.kind === 'text' && (
              <p className='text-muted-foreground text-xs'>
                {props.node.data.model
                  ? t('studio.text.aiHint')
                  : t('studio.text.manualHint')}
              </p>
            )}
          </Field>
        )}
        {Boolean(props.availableAssets?.length) && (
          <Field>
            <FieldLabel>{t('studio.asset.use')}</FieldLabel>
            <div className='space-y-2 rounded-md border p-3'>
              {props.availableAssets?.map((asset) => (
                <label
                  key={asset.id}
                  className='flex items-center gap-2 text-xs'
                >
                  <input
                    type='checkbox'
                    checked={Boolean(
                      props.node.data.assetIds?.includes(asset.id)
                    )}
                    onChange={(event) => {
                      const selected = new Set(props.node.data.assetIds || [])
                      if (event.target.checked) selected.add(asset.id)
                      else selected.delete(asset.id)
                      props.onChange({ assetIds: [...selected] })
                    }}
                  />
                  {t(`studio.asset.${asset.kind}`)} · {asset.title}
                </label>
              ))}
            </div>
          </Field>
        )}
        {props.node.data.kind === 'video' && model && (
          <>
            <Field>
              <FieldLabel htmlFor='studio-seconds'>
                {t('studio.duration')}
              </FieldLabel>
              <Input
                id='studio-seconds'
                type='number'
                min={model.minSeconds}
                max={model.maxSeconds}
                step={1}
                value={durationDraft}
                aria-invalid={!durationValid}
                onChange={(event) => {
                  const draft = event.target.value
                  setDurationDraft(draft)
                  const seconds = Number(draft)
                  if (
                    draft.trim() !== '' &&
                    Number.isInteger(seconds) &&
                    seconds >= model.minSeconds &&
                    seconds <= model.maxSeconds
                  ) {
                    props.onChange({ seconds })
                  }
                }}
                onBlur={() => {
                  if (durationValid) return
                  const stored = props.node.data.seconds
                  const fallback =
                    typeof stored === 'number' &&
                    Number.isInteger(stored) &&
                    stored >= model.minSeconds &&
                    stored <= model.maxSeconds
                      ? stored
                      : model.defaultSeconds
                  setDurationDraft(String(fallback))
                  if (stored !== fallback) props.onChange({ seconds: fallback })
                }}
              />
              <p className='text-muted-foreground text-xs'>
                {model.minSeconds}–{model.maxSeconds} {t('studio.seconds')} ·{' '}
                {t('studio.duration.modelHint')}
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor='studio-resolution'>
                {t('studio.resolution')}
              </FieldLabel>
              <Input
                id='studio-resolution'
                value={props.node.data.resolution || ''}
                maxLength={100}
                onChange={(event) =>
                  props.onChange({ resolution: event.target.value })
                }
              />
              <div className='flex flex-wrap gap-2'>
                {model.resolutions.map((resolution) => (
                  <Button
                    key={resolution}
                    size='sm'
                    variant={
                      props.node.data.resolution === resolution
                        ? 'secondary'
                        : 'outline'
                    }
                    onClick={() => props.onChange({ resolution })}
                  >
                    {resolution}
                  </Button>
                ))}
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor='studio-ratio'>
                {t('studio.ratio')}
              </FieldLabel>
              <Input
                id='studio-ratio'
                value={props.node.data.ratio || ''}
                maxLength={40}
                onChange={(event) =>
                  props.onChange({ ratio: event.target.value })
                }
              />
              <div className='flex flex-wrap gap-2'>
                {RATIOS.map((ratio) => (
                  <Button
                    key={ratio}
                    size='sm'
                    variant={
                      props.node.data.ratio === ratio ? 'secondary' : 'outline'
                    }
                    onClick={() => props.onChange({ ratio })}
                  >
                    {ratio}
                  </Button>
                ))}
              </div>
              <p className='text-muted-foreground text-xs'>
                {t('studio.ratio.adaptiveHint')}
              </p>
            </Field>
            <Field>
              <Button
                size='sm'
                variant='outline'
                onClick={() => setAdvancedOpen((open) => !open)}
              >
                {t('studio.video.advanced')}
              </Button>
              {advancedOpen && (
                <>
                  <JsonCodeEditor
                    value={metadataDraft}
                    onChange={(value) => {
                      setMetadataDraft(value)
                      try {
                        parseStudioVideoMetadata(value)
                        props.onChange({ metadataJson: value })
                      } catch {
                        // Keep invalid drafts in component state, never in project storage.
                      }
                    }}
                    heightClassName='h-40 min-h-40 max-h-40'
                    ariaLabel={t('studio.video.metadata')}
                  />
                  <p className='text-muted-foreground text-xs'>
                    {t('studio.video.metadataHint')}
                  </p>
                  <JsonCodeEditor
                    value={payloadDraft}
                    onChange={(value) => {
                      setPayloadDraft(value)
                      try {
                        parseStudioVideoPayloadPatch(value)
                        props.onChange({ payloadPatchJson: value })
                      } catch {
                        // Invalid drafts stay local to the editor.
                      }
                    }}
                    heightClassName='h-40 min-h-40 max-h-40'
                    ariaLabel={t('studio.video.payloadPatch')}
                  />
                  <p className='text-muted-foreground text-xs'>
                    {t('studio.video.payloadPatchHint')}
                  </p>
                </>
              )}
              {!metadataValid && (
                <p className='text-destructive text-xs' role='alert'>
                  {t('studio.video.metadataInvalid')}
                </p>
              )}
              {!payloadValid && (
                <p className='text-destructive text-xs' role='alert'>
                  {t('studio.video.payloadPatchInvalid')}
                </p>
              )}
            </Field>
          </>
        )}
        <div className='flex gap-2'>
          <Button
            className='flex-1'
            disabled={
              busy ||
              (!isVideo &&
                props.node.data.model !== undefined &&
                !choices.includes(props.node.data.model)) ||
              (props.node.data.kind === 'image' &&
                !props.node.data.model &&
                !props.node.data.mediaId) ||
              (props.node.data.kind !== 'image' &&
                !props.node.data.prompt.trim() &&
                !props.hasConnectedPrompt) ||
              (Boolean(props.node.data.model) &&
                props.node.data.kind === 'image' &&
                !props.node.data.prompt.trim() &&
                !props.hasConnectedPrompt) ||
              (isVideo &&
                (!props.node.data.model ||
                  !props.videoGroup ||
                  !durationValid ||
                  !metadataValid ||
                  !payloadValid))
            }
            onClick={props.onGenerate}
          >
            {busy ? t('studio.generating') : t('studio.generate')}
          </Button>
          <Button variant='outline' onClick={props.onDelete}>
            {t('studio.deleteNode')}
          </Button>
        </div>
        {isVideo && props.node.data.model && (
          <p className='text-muted-foreground text-xs' role='status'>
            {costPreview?.status === 'estimated'
              ? t('studio.cost.estimated', {
                  amount: costPreview.estimatedUsd.toFixed(4),
                })
              : t('studio.cost.unknown')}
          </p>
        )}
        {isVideo && props.requestPreview && (
          <Field>
            <FieldLabel>{t('studio.video.requestPreview')}</FieldLabel>
            <pre className='bg-muted max-h-64 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap'>
              {props.requestPreview}
            </pre>
          </Field>
        )}
        {props.node.data.status && props.node.data.status !== 'idle' && (
          <p className='text-muted-foreground text-xs' role='status'>
            {t(`studio.status.${props.node.data.status}`)}{' '}
            {typeof props.node.data.progress === 'number'
              ? `${props.node.data.progress}%`
              : ''}
          </p>
        )}
        {props.node.data.error && (
          <p className='text-destructive text-sm' role='alert'>
            {props.node.data.error}
          </p>
        )}
        {Boolean(props.node.data.takes?.length) && (
          <Field>
            <FieldLabel>{t('studio.take.title')}</FieldLabel>
            <Select
              value={props.node.data.selectedTakeId || null}
              onValueChange={(value) => value && props.onSelectTake?.(value)}
              items={(props.node.data.takes || []).map((take, index) => ({
                value: take.id,
                label: `${index + 1} · ${take.model || t('studio.source.manual')} · ${t(`studio.status.${take.status}`)}`,
              }))}
            >
              <SelectTrigger
                className='w-full'
                aria-label={t('studio.take.title')}
              >
                <SelectValue placeholder={t('studio.take.select')} />
              </SelectTrigger>
              <SelectContent>
                {(props.node.data.takes || []).map((take, index) => (
                  <SelectItem key={take.id} value={take.id}>
                    {index + 1} · {take.model || t('studio.source.manual')} ·{' '}
                    {t(`studio.status.${take.status}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {props.node.data.kind === 'text' && props.node.data.outputText && (
          <Field>
            <FieldLabel>{t('studio.text.scene')}</FieldLabel>
            <pre className='bg-muted max-h-64 overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap'>
              {props.node.data.outputText}
            </pre>
          </Field>
        )}
        {props.node.data.kind === 'text' &&
          props.node.data.outputImagePrompt && (
            <Field>
              <FieldLabel>{t('studio.text.imagePrompt')}</FieldLabel>
              <pre className='bg-muted max-h-64 overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap'>
                {props.node.data.outputImagePrompt}
              </pre>
            </Field>
          )}
        {props.node.data.kind === 'text' &&
          props.node.data.outputVideoPrompt && (
            <Field>
              <FieldLabel>{t('studio.text.videoPrompt')}</FieldLabel>
              <pre className='bg-muted max-h-64 overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap'>
                {props.node.data.outputVideoPrompt}
              </pre>
            </Field>
          )}
        {props.node.data.kind === 'image' && props.previewUrl && (
          <img
            className='max-h-72 w-full rounded-lg object-contain'
            src={props.previewUrl}
            alt={props.node.data.title}
          />
        )}
        {props.node.data.kind === 'video' && props.previewUrl && (
          <video
            className='max-h-72 w-full rounded-lg'
            src={props.previewUrl}
            controls
            preload='metadata'
          />
        )}
        {props.node.data.kind !== 'text' &&
          props.node.data.status === 'completed' &&
          !props.previewUrl && (
            <p className='text-muted-foreground text-sm'>
              {t('studio.media.missing')}
            </p>
          )}
        {props.node.data.kind !== 'text' &&
          props.node.data.status === 'completed' &&
          !props.node.data.mediaId &&
          props.onRetryMedia && (
            <Button variant='outline' onClick={props.onRetryMedia}>
              {t('studio.media.retry')}
            </Button>
          )}
      </CardContent>
    </Card>
  )
}
