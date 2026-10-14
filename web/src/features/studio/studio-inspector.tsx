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
import { Upload } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { JsonCodeEditor } from '@/components/json-code-editor'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatQuotaWithCurrency } from '@/lib/currency'

import { type StudioGroup, fetchStudioModels } from './api'
import type {
  StudioCanvasNode,
  StudioCanvasNodeData,
  StudioTake,
} from './canvas-flow'
import type { StudioAsset, StudioProject } from './local-projects'
import {
  buildStudioVideoModel,
  inferStudioVideoFamily,
  parseStudioVideoMetadata,
  parseStudioVideoPayloadPatch,
} from './model-profiles'
import {
  fetchStudioVideoCostPreview,
  studioCostDurationSeconds,
  type StudioVideoCostPreview,
} from './studio-cost'
import { studioDocumentForText, studioDocumentText } from './studio-document'
import { StudioDocumentEditor } from './studio-document-editor'
import { studioImageModelPatch } from './studio-image-parameters'
import { StudioImageSettings } from './studio-image-settings'
import {
  studioMediaTakeDraft,
  studioMediaModelAction,
} from './studio-media-draft'
import { StudioNodeLabels } from './studio-node-organization'
import { studioProductionSchema } from './studio-production'
import { StudioTextResultEditor } from './studio-text-result-editor'
import { StudioVideoModelPicker } from './studio-video-model-picker'
import type { StudioVideoTemplate } from './studio-video-templates'
import { StudioVisualPresetLibrary } from './studio-visual-preset-library'
import { StudioVoicePicker } from './studio-voice-picker'
import { recordStudioTake } from './workspace'

type Props = {
  readOnly?: boolean
  generationAvailable?: boolean
  generationBlockReason?: string
  project?: StudioProject
  onUpdateProject?: (project: StudioProject) => void
  getMedia?: (id: string) => Promise<Blob | null>
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
  onOpenMediaTool?: () => void
  videoTemplates?: StudioVideoTemplate[]
  onApplyVideoTemplate?: (template: StudioVideoTemplate) => void
  onUploadImage?: (file: File) => void
  onUploadAudio?: (file: File) => void
  onUploadVideo?: (file: File) => void
  onUseAudio?: (track: 'soundtrack' | 'voiceover') => void
  assetEditor?: ReactNode
  mediaEditor?: ReactNode
  onClose?: () => void
  onDelete: () => void
  onRetryMedia?: () => void
  onReconcileSubmission?: () => void
  onAbandonSubmission?: () => void
  onSelectTake?: (takeId: string) => void
  archivableTakeIds?: string[]
  onArchiveTake?: (takeId: string) => void
  onSaveTextOutput?: (output: {
    scene: string
    imagePrompt: string
    videoPrompt: string
  }) => void
  availableAssets?: StudioAsset[]
  requestPreview?: string
  referenceSources?: { id: string; title: string }[]
  onChangeFrameReference?: (
    role: 'first_frame' | 'last_frame',
    sourceId?: string
  ) => void
  onRemoveConnection?: (id: string) => void
  connections?: Array<{
    edgeId: string
    sourceId?: string
    role?: string
    sourceTitle: string
    pinnedTakeId?: string
    takes: StudioTake[]
  }>
  onPinConnectionTake?: (edgeId: string, takeId?: string) => void
}

const RATIOS = ['16:9', '9:16', '1:1', '21:9', '4:3', '3:4', 'adaptive']

export function StudioInspector(props: Props) {
  const { t } = useTranslation()
  const imageUploadRef = useRef<HTMLInputElement>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [archiveTakeId, setArchiveTakeId] = useState('')
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
  let generationLabel =
    isVideo || props.node.data.model
      ? t('studio.generate')
      : t('Save manual version')
  const isAudio = props.node.data.kind === 'audio'
  const mediaTool =
    ['audio', 'image', 'video'].includes(props.node.data.kind) &&
    Boolean(
      studioMediaTakeDraft(props.node) ||
      studioMediaModelAction(props.node.data.model)
    )
  const audioTool = isAudio && mediaTool
  if (mediaTool) {
    generationLabel = t(
      isAudio
        ? 'Continue editing audio production'
        : 'Continue editing media production'
    )
  }
  const isNote = props.node.data.purpose === 'note'
  const matchingTemplates = (props.videoTemplates || []).filter(
    (template) =>
      template.model === props.node.data.model &&
      template.group === props.videoGroup
  )
  const choices = props.models
  const speechModels = useQuery({
    queryKey: ['studio-speech-models', props.videoGroup],
    queryFn: () => fetchStudioModels(props.videoGroup),
    enabled: isAudio,
  })
  const selectedTake = props.node.data.takes?.find(
    (take) => take.id === props.node.data.selectedTakeId
  )
  const selectModel = (value: string | null) => {
    if (props.node.data.kind === 'image') {
      props.onChange(studioImageModelPatch(props.node.data, value || undefined))
      return
    }
    const currentSeconds = props.node.data.seconds
    props.onChange({
      model: value || undefined,
      videoFamily: undefined,
      seconds:
        typeof currentSeconds === 'number' &&
        Number.isInteger(currentSeconds) &&
        currentSeconds > 0 &&
        currentSeconds <= 3600
          ? currentSeconds
          : 5,
      ratio: props.node.data.ratio || '16:9',
    })
  }
  const inferredFamily = props.node.data.model
    ? inferStudioVideoFamily(props.node.data.model)
    : undefined
  const family = inferredFamily || 'generic'
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
        <div className='flex items-center justify-between gap-2'>
          <CardTitle>{t('studio.inspector.title')}</CardTitle>
          {props.onClose && (
            <Button size='xs' variant='ghost' onClick={props.onClose}>
              {t('studio.inspector.close')}
            </Button>
          )}
        </div>
        <p className='text-muted-foreground text-xs'>
          {t('studio.inspector.description')}
        </p>
      </CardHeader>
      <CardContent className='flex flex-1 flex-col gap-4 pb-4 lg:min-h-0 lg:overflow-y-auto'>
        {props.readOnly && <p role='status'>{t('Read-only project')}</p>}
        {props.mediaEditor}
        <fieldset disabled={props.readOnly} className='contents'>
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
              onChange={(event) =>
                props.onChange({ title: event.target.value })
              }
            />
          </Field>
          <StudioNodeLabels
            data={props.node.data}
            disabled={busy}
            onChange={props.onChange}
          />
          {props.assetEditor}
          {isVideo && props.onChangeFrameReference && (
            <div className='space-y-3 rounded-lg border p-3'>
              {(['first_frame', 'last_frame'] as const).map((role) => (
                <Field key={role}>
                  <FieldLabel>
                    {t(
                      role === 'first_frame'
                        ? 'studio.port.firstFrame'
                        : 'studio.port.lastFrame'
                    )}{' '}
                    · {t('One image per slot')}
                  </FieldLabel>
                  <Select
                    disabled={busy}
                    value={
                      props.connections?.find(
                        (connection) => connection.role === role
                      )?.sourceId || 'none'
                    }
                    onValueChange={(value) =>
                      props.onChangeFrameReference?.(
                        role,
                        value === 'none' ? undefined : value || undefined
                      )
                    }
                    items={[
                      { value: 'none', label: t('No reference selected') },
                      ...(props.referenceSources || []).map((source) => ({
                        value: source.id,
                        label: source.title,
                      })),
                    ]}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value='none'>
                          {t('No reference selected')}
                        </SelectItem>
                        {props.referenceSources?.map((source) => (
                          <SelectItem key={source.id} value={source.id}>
                            {source.title}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              ))}
              {family === 'generic' && (
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'This model has no declared last-frame support. Keep the last-frame slot empty or choose a compatible model.'
                  )}
                </p>
              )}
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Changing references keeps previous Takes and requires another generation confirmation.'
                )}
              </p>
            </div>
          )}
          {isVideo &&
            !props.node.data.pendingRequestId &&
            matchingTemplates.length > 0 && (
              <Field>
                <FieldLabel>{t('studio.video.templateTitle')}</FieldLabel>
                <Select
                  value={null}
                  onValueChange={(value) => {
                    const template = matchingTemplates[Number(value)]
                    if (template) props.onApplyVideoTemplate?.(template)
                  }}
                  items={matchingTemplates.map((template, index) => ({
                    value: String(index),
                    label: `${template.savedAt.slice(0, 16).replace('T', ' ')} · ${t('studio.video.templateChannel', { channel: template.channelId || '—' })}`,
                  }))}
                >
                  <SelectTrigger aria-label={t('studio.video.templateTitle')}>
                    <SelectValue
                      placeholder={t('studio.video.templateSelect')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {matchingTemplates.map((template, index) => (
                        <SelectItem
                          key={`${template.savedAt}:${template.channelId || 0}`}
                          value={String(index)}
                        >
                          {template.savedAt.slice(0, 16).replace('T', ' ')} ·{' '}
                          {t('studio.video.templateChannel', {
                            channel: template.channelId || '—',
                          })}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <p className='text-muted-foreground text-xs'>
                  {t('studio.video.templateHint')}
                </p>
              </Field>
            )}
          {props.connections?.map((connection) => (
            <Field key={connection.edgeId}>
              <FieldLabel>
                {t('studio.connection.version')}: {connection.sourceTitle} ·{' '}
                {t(`studio.reference.${connection.role || 'reference'}`)}
              </FieldLabel>
              {props.onRemoveConnection && (
                <Button
                  size='xs'
                  variant='ghost'
                  disabled={busy}
                  onClick={() => props.onRemoveConnection?.(connection.edgeId)}
                >
                  {t('Remove reference')}
                </Button>
              )}
              <Select
                value={connection.pinnedTakeId || '__follow_current__'}
                onValueChange={(value) =>
                  props.onPinConnectionTake?.(
                    connection.edgeId,
                    value === '__follow_current__'
                      ? undefined
                      : value || undefined
                  )
                }
                items={[
                  {
                    value: '__follow_current__',
                    label: t('studio.connection.followCurrent'),
                  },
                  ...connection.takes
                    .filter((take) => take.status === 'completed')
                    .map((take, index) => ({
                      value: take.id,
                      label: `${t('Take')} ${index + 1}`,
                    })),
                ]}
              >
                <SelectTrigger
                  className='w-full'
                  aria-label={`${t('studio.connection.version')}: ${connection.sourceTitle}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value='__follow_current__'>
                      {t('studio.connection.followCurrent')}
                    </SelectItem>
                    {connection.takes
                      .filter((take) => take.status === 'completed')
                      .map((take, index) => (
                        <SelectItem key={take.id} value={take.id}>
                          {t('Take')} {index + 1}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ))}
          {!isAudio && !isNote && (
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
                  <SelectTrigger
                    className='w-full'
                    aria-label={t('studio.model')}
                  >
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
          )}
          {isAudio && (
            <>
              {audioTool && (
                <p className='text-muted-foreground text-sm'>
                  {t(
                    'Continue this audio Take in the production tools to preserve its lyrics, voice and generation settings.'
                  )}
                </p>
              )}
              {!audioTool && (
                <>
                  <Field>
                    <FieldLabel htmlFor='studio-audio-model'>
                      {t('studio.audio.model')}
                    </FieldLabel>
                    <NativeSelect
                      id='studio-audio-model'
                      aria-label={t('studio.audio.model')}
                      value={props.node.data.model || ''}
                      disabled={busy}
                      onChange={(event) =>
                        props.onChange({
                          model: event.target.value || undefined,
                        })
                      }
                    >
                      <NativeSelectOption value=''>
                        {t('Choose a voice service')}
                      </NativeSelectOption>
                      {[
                        ...new Set([
                          ...(speechModels.data || []).filter(
                            (model) =>
                              /(?:tts|speech|chatterbox)/i.test(model) &&
                              !/(?:translate|clone)/i.test(model)
                          ),
                          ...(props.node.data.model
                            ? [props.node.data.model]
                            : []),
                        ]),
                      ].map((model) => (
                        <NativeSelectOption key={model} value={model}>
                          {model}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    {speechModels.isError && (
                      <p role='alert'>
                        {t(
                          'Could not load voice services. Retry from the project settings.'
                        )}
                      </p>
                    )}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='studio-audio-voice'>
                      {t('studio.audio.voice')}
                    </FieldLabel>
                    {props.project && props.getMedia ? (
                      <StudioVoicePicker
                        project={props.project}
                        getMedia={props.getMedia}
                        value={
                          props.node.data.model === 'chatterbox-local' &&
                          (!props.node.data.voice ||
                            props.node.data.voice === 'alloy')
                            ? 'default'
                            : props.node.data.voice || 'default'
                        }
                        disabled={busy}
                        onChange={(voice) => props.onChange({ voice })}
                      />
                    ) : (
                      <Input
                        id='studio-audio-voice'
                        maxLength={100}
                        value={props.node.data.voice || 'alloy'}
                        disabled={busy}
                        onChange={(event) =>
                          props.onChange({ voice: event.target.value })
                        }
                      />
                    )}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='studio-audio-speed'>
                      {t('studio.audio.speed')}
                    </FieldLabel>
                    <Input
                      id='studio-audio-speed'
                      type='number'
                      min={0.25}
                      max={4}
                      step={0.25}
                      value={props.node.data.speed ?? 1}
                      disabled={busy}
                      onChange={(event) => {
                        const speed = Number(event.target.value)
                        if (
                          Number.isFinite(speed) &&
                          speed >= 0.25 &&
                          speed <= 4
                        ) {
                          props.onChange({ speed })
                        }
                      }}
                    />
                  </Field>
                </>
              )}
              <Field>
                <FieldLabel>{t('studio.audio.upload')}</FieldLabel>
                <Input
                  type='file'
                  accept='audio/*'
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) props.onUploadAudio?.(file)
                    event.target.value = ''
                  }}
                  aria-label={t('studio.audio.upload')}
                />
              </Field>
              <p className='text-muted-foreground text-xs'>
                {t('studio.audio.hint')}
              </p>
              {props.node.data.mediaId &&
                props.node.data.status === 'completed' && (
                  <div className='flex flex-wrap gap-2'>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => props.onUseAudio?.('soundtrack')}
                    >
                      {t('studio.audio.useSoundtrack')}
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => props.onUseAudio?.('voiceover')}
                    >
                      {t('studio.audio.useVoiceover')}
                    </Button>
                  </div>
                )}
            </>
          )}
          {isVideo && (
            <Field>
              <FieldLabel>{t('studio.video.upload')}</FieldLabel>
              <Input
                type='file'
                accept='video/mp4,video/webm'
                disabled={busy}
                aria-label={t('studio.video.upload')}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) props.onUploadVideo?.(file)
                  event.target.value = ''
                }}
              />
            </Field>
          )}
          {props.node.data.kind === 'text' && props.node.data.model && (
            <Field>
              <FieldLabel>{t('studio.text.mode')}</FieldLabel>
              <Select
                value={props.node.data.textMode || 'shot'}
                onValueChange={(value) =>
                  props.onChange({
                    textMode: value === 'plain' ? 'plain' : 'shot',
                  })
                }
                items={[
                  { value: 'shot', label: t('studio.text.modeShot') },
                  { value: 'plain', label: t('studio.text.modePlain') },
                ]}
              >
                <SelectTrigger aria-label={t('studio.text.mode')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value='shot'>
                      {t('studio.text.modeShot')}
                    </SelectItem>
                    <SelectItem value='plain'>
                      {t('studio.text.modePlain')}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
          {props.node.data.kind === 'image' && (
            <Field>
              <FieldLabel>{t('studio.image.local')}</FieldLabel>
              <Input
                ref={imageUploadRef}
                type='file'
                accept='image/png,image/jpeg,image/webp'
                className='hidden'
                aria-label={t('studio.image.local')}
                disabled={busy || props.readOnly}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) props.onUploadImage?.(file)
                  event.target.value = ''
                }}
              />
              <Button
                size='sm'
                variant='outline'
                disabled={busy || props.readOnly}
                onClick={() => imageUploadRef.current?.click()}
              >
                <Upload />
                {t('studio.image.upload')}
              </Button>
              {props.project && props.onUpdateProject && (
                <Select
                  disabled={busy || props.readOnly}
                  value=''
                  onValueChange={(id) => {
                    const source = props.project?.nodes.find(
                      (node) =>
                        node.id === id &&
                        node.data.kind === 'image' &&
                        node.data.mediaId
                    )
                    if (
                      !source?.data.mediaId ||
                      !props.project ||
                      !props.onUpdateProject
                    ) {
                      return
                    }
                    props.onUpdateProject(
                      recordStudioTake(props.project, props.node.id, {
                        id: crypto.randomUUID(),
                        createdAt: new Date().toISOString(),
                        status: 'completed',
                        prompt: '',
                        sourceMode: 'upload',
                        mediaId: source.data.mediaId,
                      })
                    )
                  }}
                >
                  <SelectTrigger aria-label={t('Choose an existing image')}>
                    <SelectValue placeholder={t('Choose an existing image')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {props.project.nodes
                        .filter(
                          (node) =>
                            node.id !== props.node.id &&
                            node.data.kind === 'image' &&
                            node.data.mediaId
                        )
                        .map((node, index) => (
                          <SelectItem key={node.id} value={node.id}>
                            {index + 1}. {node.data.title} · {t('Take')}{' '}
                            {(node.data.takes || []).findIndex(
                              (take) => take.id === node.data.selectedTakeId
                            ) + 1 || 1}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
              <p className='text-muted-foreground text-xs'>
                {t('studio.image.uploadHint')}
              </p>
            </Field>
          )}
          {props.node.data.kind === 'image' && props.node.data.model && (
            <StudioImageSettings
              data={props.node.data}
              disabled={busy}
              onChange={props.onChange}
            />
          )}
          {(props.node.data.kind !== 'image' || props.node.data.model) && (
            <Field>
              <FieldLabel htmlFor='studio-prompt'>
                {t('studio.prompt')}
              </FieldLabel>
              {props.node.data.kind === 'text' ? (
                <StudioDocumentEditor
                  key={props.node.id}
                  value={studioDocumentForText(
                    props.node.data.prompt,
                    props.node.data.textDocument
                  )}
                  disabled={busy || props.node.data.locked}
                  onChange={(textDocument) =>
                    props.onChange({
                      textDocument,
                      prompt: studioDocumentText(textDocument),
                    })
                  }
                />
              ) : (
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
              )}
              {props.node.data.kind === 'text' && (
                <p className='text-muted-foreground text-xs'>
                  {props.node.data.model
                    ? t('studio.text.aiHint')
                    : t('studio.text.manualHint')}
                </p>
              )}
            </Field>
          )}
          {(props.node.data.kind === 'image' || isVideo) && (
            <Collapsible className='rounded-lg border p-3'>
              <CollapsibleTrigger
                render={
                  <Button
                    size='sm'
                    variant='ghost'
                    className='w-full justify-start'
                  />
                }
              >
                {t('studio.camera.title')}
              </CollapsibleTrigger>
              <CollapsibleContent className='mt-3 flex flex-col gap-2'>
                {props.project && props.onUpdateProject && (
                  <StudioVisualPresetLibrary
                    node={props.node}
                    presets={props.project.production?.visualPresets || []}
                    favorites={
                      props.project.production?.visualPresetFavorites || []
                    }
                    disabled={busy || props.node.data.locked}
                    onApply={props.onChange}
                    onSave={(visualPresets, visualPresetFavorites) => {
                      if (props.project) {
                        props.onUpdateProject?.({
                          ...props.project,
                          production: studioProductionSchema.parse({
                            ...props.project.production,
                            visualPresets,
                            visualPresetFavorites,
                          }),
                        })
                      }
                    }}
                  />
                )}
                {(
                  ['shotSize', 'angle', 'movement', 'lens', 'lighting'] as const
                ).map((field) => (
                  <Field key={field}>
                    <FieldLabel htmlFor={`studio-camera-${field}`}>
                      {t(`studio.camera.${field}`)}
                    </FieldLabel>
                    <Input
                      id={`studio-camera-${field}`}
                      maxLength={200}
                      value={props.node.data.camera?.[field] || ''}
                      disabled={busy}
                      onChange={(event) =>
                        props.onChange({
                          camera: {
                            ...props.node.data.camera,
                            [field]: event.target.value,
                          },
                        })
                      }
                    />
                  </Field>
                ))}
              </CollapsibleContent>
            </Collapsible>
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
                    if (stored !== fallback) {
                      props.onChange({ seconds: fallback })
                    }
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
                        props.node.data.ratio === ratio
                          ? 'secondary'
                          : 'outline'
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
          {!mediaTool &&
            !isNote &&
            (isVideo || props.node.data.model) &&
            props.generationAvailable === false && (
              <p role='status'>
                {t(
                  props.generationBlockReason ||
                    'Insufficient generation credit. Add credit or continue with free editing.'
                )}
              </p>
            )}
          <div className='flex gap-2'>
            <Button
              className='flex-1'
              disabled={
                busy ||
                (!mediaTool &&
                  !isNote &&
                  (isVideo || Boolean(props.node.data.model)) &&
                  props.generationAvailable === false) ||
                (mediaTool && !props.onOpenMediaTool) ||
                Boolean(props.node.data.pendingRequestId) ||
                (!mediaTool &&
                  ((!isVideo &&
                    !isAudio &&
                    !mediaTool &&
                    Boolean(props.node.data.model) &&
                    !choices.includes(props.node.data.model || '')) ||
                    (props.node.data.kind === 'image' &&
                      !props.node.data.model &&
                      !props.node.data.mediaId) ||
                    (props.node.data.kind !== 'image' &&
                      !isAudio &&
                      !props.node.data.prompt.trim() &&
                      !props.hasConnectedPrompt) ||
                    (Boolean(props.node.data.model) &&
                      props.node.data.kind === 'image' &&
                      !props.node.data.prompt.trim() &&
                      !props.hasConnectedPrompt) ||
                    (isAudio &&
                      !props.node.data.model &&
                      !props.node.data.mediaId) ||
                    (isAudio &&
                      Boolean(props.node.data.model) &&
                      !props.node.data.prompt.trim() &&
                      !props.hasConnectedPrompt) ||
                    (isVideo &&
                      !mediaTool &&
                      (!props.node.data.model ||
                        !props.videoGroup ||
                        !durationValid ||
                        !metadataValid ||
                        !payloadValid))))
              }
              onClick={mediaTool ? props.onOpenMediaTool : props.onGenerate}
            >
              {busy ? t('studio.generating') : generationLabel}
            </Button>
            <Button variant='outline' onClick={props.onDelete} disabled={busy}>
              {t('studio.deleteNode')}
            </Button>
          </div>
          {isVideo && props.node.data.pendingRequestId && (
            <div className='flex flex-wrap gap-2'>
              <Button variant='outline' onClick={props.onReconcileSubmission}>
                {t('studio.submission.reconcile')}
              </Button>
              <Button variant='ghost' onClick={props.onAbandonSubmission}>
                {t('studio.submission.abandon')}
              </Button>
            </div>
          )}
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
            <Collapsible defaultOpen>
              <CollapsibleTrigger
                render={<Button size='sm' variant='outline' />}
              >
                {t('Candidate versions')} · {props.node.data.takes?.length}
              </CollapsibleTrigger>
              <CollapsibleContent className='pt-3'>
                <Field>
                  <FieldLabel>{t('studio.take.title')}</FieldLabel>
                  <Select
                    value={props.node.data.selectedTakeId || null}
                    onValueChange={(value) =>
                      value && props.onSelectTake?.(value)
                    }
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
                          {index + 1} ·{' '}
                          {take.model || t('studio.source.manual')} ·{' '}
                          {t(`studio.status.${take.status}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </CollapsibleContent>
            </Collapsible>
          )}
          {props.onArchiveTake && Boolean(props.archivableTakeIds?.length) && (
            <Field>
              <FieldLabel>{t('studio.take.archive')}</FieldLabel>
              <Select
                value={archiveTakeId}
                onValueChange={(value) => setArchiveTakeId(value || '')}
              >
                <SelectTrigger aria-label={t('studio.take.archive')}>
                  <SelectValue placeholder={t('studio.take.archiveSelect')} />
                </SelectTrigger>
                <SelectContent>
                  {props.node.data.takes
                    ?.filter((take) =>
                      props.archivableTakeIds?.includes(take.id)
                    )
                    .map((take) => (
                      <SelectItem key={take.id} value={take.id}>
                        {take.model || t('studio.source.manual')} ·{' '}
                        {take.createdAt}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className='text-muted-foreground text-xs'>
                {t('studio.take.archiveHelp')}
              </p>
              <Button
                variant='outline'
                size='sm'
                disabled={!props.archivableTakeIds?.includes(archiveTakeId)}
                onClick={() => {
                  props.onArchiveTake?.(archiveTakeId)
                  setArchiveTakeId('')
                }}
              >
                {t('studio.take.archive')}
              </Button>
            </Field>
          )}
          {isVideo && selectedTake?.requestSnapshot && (
            <Field>
              <FieldLabel>{t('studio.take.submittedParameters')}</FieldLabel>
              <pre className='bg-muted max-h-48 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap'>
                {selectedTake.requestSnapshot}
              </pre>
              {selectedTake.clientRequestId && (
                <p className='text-muted-foreground text-xs break-all'>
                  {t('studio.take.requestId')}: {selectedTake.clientRequestId}
                </p>
              )}
              {selectedTake.channelId && (
                <p className='text-muted-foreground text-xs'>
                  {t('studio.take.channel')}: {selectedTake.channelId}
                </p>
              )}
              {selectedTake.chargedQuota !== undefined && (
                <p className='text-sm' role='status'>
                  {t('studio.take.settledCost')}:{' '}
                  {formatQuotaWithCurrency(selectedTake.chargedQuota)}
                </p>
              )}
            </Field>
          )}
          {props.node.data.kind === 'text' &&
            (props.node.data.status === 'completed' ||
              props.node.data.outputText ||
              props.node.data.outputImagePrompt ||
              props.node.data.outputVideoPrompt) && (
              <StudioTextResultEditor
                node={props.node}
                onSave={props.onSaveTextOutput}
              />
            )}
          {props.node.data.kind === 'image' && props.previewUrl && (
            <img
              className='max-h-72 w-full rounded-lg object-contain'
              src={props.previewUrl}
              alt={props.node.data.title}
            />
          )}
          {isAudio && props.previewUrl && (
            <audio
              src={props.previewUrl}
              controls
              aria-label={t('studio.kind.audio')}
              className='w-full'
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
        </fieldset>
      </CardContent>
    </Card>
  )
}
