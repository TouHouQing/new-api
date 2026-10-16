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

import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import { StudioBudgetSummary } from './studio-budget-summary'
import { StudioCaptionEditor } from './studio-caption-editor'
import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import { studioCreationProgress } from './studio-creation'
import { StudioMotionGraphics } from './studio-motion-graphics'
import { StudioNumberField } from './studio-number-field'
import {
  studioProductionSchema,
  studioProjectTimeline,
  splitStudioTimelineClip,
} from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import { StudioRenderProgress } from './studio-render-progress'
import { StudioTimelinePreview } from './studio-timeline-preview'
import { StudioTimelineTracks } from './studio-timeline-tracks'
import { StudioWorkspaceCaptions } from './studio-workspace-captions'

export function StudioProductionTimelineTab(
  options: { value?: string; compact?: boolean } = {}
) {
  const { t } = useTranslation()
  const {
    props,
    mediaPreviewUrls,
    activeRender,
    path,
    budget,
    setBudget,
    confirm,
    setConfirm,
    selectedClip,
    setSelectedClip,
    splitAt,
    setSplitAt,
    audioNode,
    setAudioNode,
    transcriptionModel,
    setTranscriptionModel,
    timeline,
    clip,
    capabilities,
    writable,
    mutate,
    updateClip,
    submit,
    preview,
    markTimelinePreviewed,
    setActiveTab,
    setMediaDraftNodeId,
    setMediaEntryAction,
  } = useStudioProductionContext()
  return (
    <TabsContent value={options.value || 'timeline'} className='space-y-4'>
      <div
        className={
          options.compact
            ? 'grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]'
            : undefined
        }
      >
        <div
          className={
            options.compact
              ? 'bg-background self-start xl:sticky xl:top-0'
              : undefined
          }
          data-timeline-preview
        >
          <StudioTimelinePreview
            compact={options.compact}
            project={props.project}
            getMedia={props.getMedia}
            onPreviewed={markTimelinePreviewed}
          />
          <div
            className={
              options.compact ? 'max-h-[22dvh] overflow-y-auto' : undefined
            }
          >
            <StudioTimelineTracks />
          </div>
        </div>
        <div
          className={
            options.compact
              ? 'flex min-w-0 flex-col gap-3 xl:max-h-[calc(100dvh-290px)] xl:overflow-y-auto xl:pr-2'
              : 'flex flex-col gap-4'
          }
        >
          {!studioCreationProgress(props.project).edit && (
            <p role='status'>
              {t(
                'No footage is ready yet. Generate or import a clip before editing.'
              )}
            </p>
          )}
          <Collapsible>
            <CollapsibleTrigger render={<Button size='sm' variant='ghost' />}>
              {t('Titles and motion graphics')}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <StudioMotionGraphics />
            </CollapsibleContent>
          </Collapsible>
          <Button
            variant='outline'
            disabled={!writable || !timeline.length}
            onClick={() => {
              const production =
                props.project.production || studioProductionSchema.parse({})
              const ordered = studioProjectTimeline({
                ...props.project,
                production: {
                  ...production,
                  timelineEdited: false,
                  timeline: [],
                },
              })
              props.onUpdate({
                ...props.project,
                production: {
                  ...production,
                  timelineEdited: true,
                  timeline: ordered,
                },
              })
            }}
          >
            {t('Build a rough cut from shot order')}
          </Button>

          <StudioRenderProgress />
          {!options.compact && preview && (
            <video
              src={preview}
              aria-label={t('studio.production.preview')}
              controls
              className='aspect-video w-full rounded-lg bg-black'
            />
          )}
          <div className='flex flex-wrap gap-2'>
            {timeline.map((item, index) => (
              <Button
                key={item.id}
                variant={item.id === selectedClip ? 'secondary' : 'outline'}
                onClick={() => {
                  setSelectedClip(item.id)
                  props.onSelectNode?.(item.nodeId)
                }}
              >
                {index + 1}.{' '}
                {
                  props.project.nodes.find((node) => node.id === item.nodeId)
                    ?.data.title
                }
              </Button>
            ))}
          </div>
          {clip && (
            <div className='grid gap-3 sm:grid-cols-2'>
              <label className='flex items-center gap-2'>
                <Checkbox
                  disabled={!writable}
                  checked={clip.muted}
                  onCheckedChange={(value) =>
                    updateClip({ muted: value === true })
                  }
                />
                {t('studio.production.muted')}
              </label>
              <Select
                value={clip.takeId || 'current'}
                items={[
                  {
                    value: 'current',
                    label: t('studio.production.currentTake'),
                  },
                  ...(
                    props.project.nodes.find((node) => node.id === clip.nodeId)
                      ?.data.takes || []
                  )
                    .filter((take) => take.mediaId)
                    .map((take, index) => ({
                      value: take.id,
                      label: `${t('Take')} ${index + 1}`,
                    })),
                ]}
                onValueChange={(value) =>
                  updateClip({
                    takeId:
                      value === 'current' ? undefined : value || undefined,
                  })
                }
              >
                <SelectTrigger
                  disabled={!writable}
                  aria-label={t('studio.production.take')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='current'>
                    {t('studio.production.currentTake')}
                  </SelectItem>
                  {props.project.nodes
                    .find((node) => node.id === clip.nodeId)
                    ?.data.takes?.filter((take) => take.mediaId)
                    .map((take, index) => (
                      <SelectItem key={take.id} value={take.id}>
                        {t('Take')} {index + 1}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <div className='flex gap-2 sm:col-span-2'>
                {[-1, 1].map((direction) => (
                  <Button
                    key={direction}
                    variant='outline'
                    disabled={
                      !writable ||
                      timeline.findIndex((item) => item.id === clip.id) +
                        direction <
                        0 ||
                      timeline.findIndex((item) => item.id === clip.id) +
                        direction >=
                        timeline.length
                    }
                    onClick={() => {
                      const next = [...timeline]
                      const index = next.findIndex(
                        (item) => item.id === clip.id
                      )
                      ;[next[index], next[index + direction]] = [
                        next[index + direction],
                        next[index],
                      ]
                      props.onUpdate({
                        ...props.project,
                        production: {
                          ...(props.project.production ||
                            studioProductionSchema.parse({})),
                          timelineEdited: true,
                          timeline: next,
                        },
                      })
                    }}
                  >
                    {t(
                      direction === -1
                        ? 'studio.production.moveEarlier'
                        : 'studio.production.moveLater'
                    )}
                  </Button>
                ))}
                <Button
                  variant='outline'
                  disabled={!writable}
                  onClick={() =>
                    props.onUpdate({
                      ...props.project,
                      production: {
                        ...(props.project.production ||
                          studioProductionSchema.parse({})),
                        timelineEdited: true,
                        timeline: timeline.filter(
                          (item) => item.id !== clip.id
                        ),
                      },
                    })
                  }
                >
                  {t('studio.production.removeClip')}
                </Button>
              </div>
              <Field className='sm:col-span-2'>
                <FieldLabel>
                  {t('Clip volume')} · {Math.round(clip.volume * 100)}%
                </FieldLabel>
                <Input
                  aria-label={t('Clip volume')}
                  type='range'
                  min={0}
                  max={100}
                  step={1}
                  disabled={!writable}
                  value={Math.round(clip.volume * 100)}
                  onChange={(event) =>
                    updateClip({ volume: Number(event.target.value) / 100 })
                  }
                />
              </Field>
              <Collapsible className='sm:col-span-2'>
                <CollapsibleTrigger
                  render={<Button size='sm' variant='ghost' />}
                >
                  {t('Precise trim, speed and transitions')}
                </CollapsibleTrigger>
                <CollapsibleContent className='grid gap-3 pt-3 sm:grid-cols-2'>
                  {(
                    [
                      'trimStart',
                      'trimEnd',
                      'speed',
                      'volume',
                      'captionOffset',
                      'captionDuration',
                      'fadeIn',
                      'fadeOut',
                    ] as const
                  ).map((key) => {
                    let max = 3600
                    if (key === 'speed') max = 4
                    if (key === 'volume') max = 1
                    if (key === 'fadeIn' || key === 'fadeOut') max = 3
                    return (
                      <StudioNumberField
                        key={`${clip.id}:${key}`}
                        id={`production-${key}`}
                        label={t(`studio.production.${key}`)}
                        disabled={!writable}
                        value={clip[key]}
                        optional={key === 'trimEnd'}
                        min={key === 'speed' ? 0.25 : 0}
                        max={max}
                        onChange={(value) => updateClip({ [key]: value })}
                      />
                    )
                  })}
                </CollapsibleContent>
              </Collapsible>
              <Field className='sm:col-span-2'>
                <FieldLabel htmlFor='production-caption'>
                  {t('studio.production.caption')}
                </FieldLabel>
                <Textarea
                  id='production-caption'
                  disabled={!writable}
                  value={clip.caption}
                  maxLength={30000}
                  onChange={(event) =>
                    updateClip({ caption: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel>{t('studio.production.splitAt')}</FieldLabel>
                <Input
                  type='number'
                  min='0'
                  step='0.1'
                  value={splitAt}
                  onChange={(event) => setSplitAt(event.target.value)}
                />
              </Field>
              <div className='flex items-end gap-2'>
                <Button
                  disabled={!writable}
                  onClick={() => {
                    try {
                      const source = props.project.nodes.find(
                        (node) => node.id === clip.nodeId
                      )
                      const split = splitStudioTimelineClip(
                        {
                          ...clip,
                          takeId: clip.takeId || source?.data.selectedTakeId,
                        },
                        Number(splitAt)
                      )
                      props.onUpdate({
                        ...props.project,
                        production: {
                          ...(props.project.production ||
                            studioProductionSchema.parse({})),
                          timelineEdited: true,
                          timeline: timeline.flatMap((item) =>
                            item.id === clip.id ? split : [item]
                          ),
                        },
                      })
                    } catch (error) {
                      handleServerError(error)
                    }
                  }}
                >
                  {t('studio.production.split')}
                </Button>
                <Button
                  variant='outline'
                  disabled={!writable}
                  onClick={() =>
                    props.onUpdate({
                      ...props.project,
                      production: {
                        ...(props.project.production ||
                          studioProductionSchema.parse({})),
                        timelineEdited: true,
                        timeline: [
                          ...timeline,
                          {
                            ...clip,
                            takeId:
                              clip.takeId ||
                              props.project.nodes.find(
                                (node) => node.id === clip.nodeId
                              )?.data.selectedTakeId,
                            id: crypto.randomUUID(),
                          },
                        ],
                      },
                    })
                  }
                >
                  {t('studio.production.duplicate')}
                </Button>
              </div>
            </div>
          )}
          <Button
            variant='outline'
            disabled={
              !writable ||
              mutate.isPending ||
              !!activeRender ||
              !studioCreationProgress(props.project).edit ||
              !capabilities.data?.render_available
            }
            onClick={() => mutate.mutate(() => submit('render', true))}
          >
            {t('studio.production.preview')}
          </Button>

          <Button
            variant='outline'
            onClick={() => {
              setMediaDraftNodeId('')
              setMediaEntryAction('voice_speech')
              setActiveTab('media')
            }}
          >
            {t('Create voice or music')}
          </Button>

          <Field>
            <FieldLabel>{t('studio.production.audioTracks')}</FieldLabel>
            <Select
              value={audioNode}
              onValueChange={(value) => setAudioNode(value || '')}
            >
              <SelectTrigger aria-label={t('studio.production.audioTracks')}>
                <SelectValue>
                  {
                    props.project.nodes.find((node) => node.id === audioNode)
                      ?.data.title
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {props.project.nodes
                  .filter(
                    (node) => node.data.kind === 'audio' && node.data.mediaId
                  )
                  .map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.data.title}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <Button
            variant='outline'
            disabled={!writable || !audioNode}
            onClick={() => {
              const node = props.project.nodes.find(
                (node) => node.id === audioNode
              )
              if (!node?.data.mediaId) return
              const production =
                props.project.production || studioProductionSchema.parse({})
              props.onUpdate({
                ...props.project,
                production: {
                  ...production,
                  audioTracks: [
                    ...production.audioTracks,
                    {
                      id: crypto.randomUUID(),
                      mediaId: node.data.mediaId,
                      start: 0,
                      offset: 0,
                      volume: 1,
                    },
                  ],
                },
              })
            }}
          >
            {t('studio.production.addAudio')}
          </Button>
          <Collapsible defaultOpen={!options.compact}>
            <CollapsibleTrigger render={<Button size='sm' variant='outline' />}>
              {t('Recognize captions with AI')}
            </CollapsibleTrigger>
            <CollapsibleContent className='flex flex-col gap-3 pt-3'>
              <Collapsible>
                <CollapsibleTrigger render={<Button variant='outline' />}>
                  {t('Advanced model settings')}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Field>
                    <FieldLabel>
                      {t('studio.production.transcriptionModel')}
                    </FieldLabel>
                    <Input
                      aria-label={t('studio.production.transcriptionModel')}
                      value={transcriptionModel}
                      onChange={(event) =>
                        setTranscriptionModel(event.target.value)
                      }
                    />
                  </Field>
                </CollapsibleContent>
              </Collapsible>
              {audioNode && (
                <div className='space-y-3'>
                  <StudioBudgetSummary />
                  <Field>
                    <FieldLabel>{t('studio.production.budget')}</FieldLabel>
                    <Input
                      aria-label={t('studio.production.budget')}
                      type='number'
                      min={0.001}
                      max={4000}
                      value={budget}
                      disabled={!writable}
                      onChange={(event) => setBudget(event.target.value)}
                    />
                  </Field>
                  <label className='flex items-center gap-2'>
                    <Checkbox
                      disabled={!writable}
                      checked={confirm}
                      onCheckedChange={(checked) =>
                        setConfirm(checked === true)
                      }
                    />
                    {t('studio.production.confirm')}
                  </label>
                  {!confirm && (
                    <p role='status' className='text-muted-foreground text-sm'>
                      {t('Confirm the budget before generating.')}
                    </p>
                  )}
                </div>
              )}
              <Button
                variant='outline'
                disabled={
                  !writable ||
                  !confirm ||
                  !audioNode ||
                  capabilities.data?.storage_available === false ||
                  capabilities.data?.generation_credit_available !== true ||
                  !Number.isFinite(Number(budget)) ||
                  Number(budget) <= 0 ||
                  Number(budget) > 4000 ||
                  !transcriptionModel.trim() ||
                  mutate.isPending
                }
                onClick={() =>
                  mutate.mutate(async () => {
                    await props.onSave()
                    const current =
                      await studioCloudRequest<StudioCloudProject>(path)
                    const node = current.document.nodes.find(
                      (node) => node.id === audioNode
                    )
                    if (!node?.data.mediaId) {
                      throw new Error(t('studio.production.mediaMissing'))
                    }
                    await studioCloudRequest(`${path}/jobs`, 'POST', {
                      request_id: crypto.randomUUID(),
                      revision: current.revision,
                      kind: 'transcribe',
                      budget: Math.round(
                        Number(budget) *
                          (capabilities.data?.quota_per_unit || 500000)
                      ),
                      confirm_generation: true,
                      operation: {
                        media_id: node.data.mediaId,
                        model: transcriptionModel,
                        group: node.data.group || '',
                        language: '',
                      },
                    })
                  })
                }
              >
                {t('studio.production.transcribe')}
              </Button>
            </CollapsibleContent>
          </Collapsible>
          <StudioWorkspaceCaptions />
          <Collapsible>
            <CollapsibleTrigger render={<Button size='sm' variant='outline' />}>
              {t('Imported and recognized SRT captions')}
            </CollapsibleTrigger>
            <CollapsibleContent className='pt-3'>
              <StudioCaptionEditor
                value={props.project.captionsText || ''}
                draft={props.project.production?.captionDraft}
                disabled={!writable}
                hasClipCaptions={timeline.some((clip) => !!clip.caption)}
                onChange={(captionsText, captionDraft) =>
                  props.onUpdate({
                    ...props.project,
                    captionsText,
                    production: {
                      ...(props.project.production ||
                        studioProductionSchema.parse({})),
                      captionDraft,
                    },
                  })
                }
              />
            </CollapsibleContent>
          </Collapsible>
          <StudioNumberField
            id='studio-subtitle-offset'
            label={t('studio.production.subtitleOffset')}
            min={0}
            max={3600}
            disabled={!writable}
            value={props.project.captionOffsetSeconds || 0}
            onChange={(value) =>
              props.onUpdate({
                ...props.project,
                captionOffsetSeconds: value ?? 0,
              })
            }
          />
          {props.project.production?.audioTracks.map((track, index) => {
            const source = props.project.nodes.find(
              (node) =>
                node.data.mediaId === track.mediaId ||
                node.data.takes?.some((take) => take.mediaId === track.mediaId)
            )
            const title =
              source?.data.title ||
              t('Audio track {{number}}', { number: index + 1 })
            return (
              <FieldSet
                key={track.id}
                aria-label={title}
                className='grid gap-3 rounded-lg border p-3 sm:grid-cols-4'
              >
                <FieldLegend className='sm:col-span-4'>{title}</FieldLegend>
                {mediaPreviewUrls[track.mediaId] && (
                  <audio
                    controls
                    aria-label={t('Preview audio track: {{title}}', { title })}
                    src={mediaPreviewUrls[track.mediaId]}
                    className='w-full sm:col-span-4'
                  />
                )}
                <Field className='sm:col-span-4'>
                  <FieldLabel>
                    {t('Audio volume')} · {Math.round(track.volume * 100)}%
                  </FieldLabel>
                  <Input
                    type='range'
                    min={0}
                    max={100}
                    step={1}
                    aria-label={`${title} ${t('Audio volume')}`}
                    disabled={!writable}
                    value={Math.round(track.volume * 100)}
                    onChange={(event) => {
                      const production =
                        props.project.production ||
                        studioProductionSchema.parse({})
                      props.onUpdate({
                        ...props.project,
                        production: {
                          ...production,
                          audioTracks: production.audioTracks.map((item) =>
                            item.id === track.id
                              ? {
                                  ...item,
                                  volume: Number(event.target.value) / 100,
                                }
                              : item
                          ),
                        },
                      })
                    }}
                  />
                </Field>
                <Collapsible
                  defaultOpen={!options.compact}
                  className='sm:col-span-4'
                >
                  <CollapsibleTrigger
                    render={<Button size='sm' variant='ghost' />}
                  >
                    {t('Precise audio timing and volume')}
                  </CollapsibleTrigger>
                  <CollapsibleContent className='grid gap-3 pt-3 sm:grid-cols-2'>
                    {(['start', 'offset', 'duration', 'volume'] as const).map(
                      (key) => (
                        <StudioNumberField
                          key={key}
                          id={`studio-audio-${track.id}-${key}`}
                          label={t(`studio.production.audio.${key}`)}
                          disabled={!writable}
                          min={key === 'duration' ? 0.01 : 0}
                          max={key === 'volume' ? 1 : 3600}
                          optional={key === 'duration'}
                          value={track[key]}
                          onChange={(value) => {
                            const production =
                              props.project.production ||
                              studioProductionSchema.parse({})
                            props.onUpdate({
                              ...props.project,
                              production: {
                                ...production,
                                audioTracks: production.audioTracks.map(
                                  (item) =>
                                    item.id === track.id
                                      ? {
                                          ...item,
                                          [key]: value,
                                        }
                                      : item
                                ),
                              },
                            })
                          }}
                        />
                      )
                    )}
                  </CollapsibleContent>
                </Collapsible>
                <Button
                  variant='outline'
                  disabled={!writable}
                  onClick={() => {
                    const production =
                      props.project.production ||
                      studioProductionSchema.parse({})
                    props.onUpdate({
                      ...props.project,
                      production: {
                        ...production,
                        audioTracks: production.audioTracks.filter(
                          (item) => item.id !== track.id
                        ),
                      },
                    })
                  }}
                >
                  {t('studio.production.removeAudio')}
                </Button>
              </FieldSet>
            )
          })}
        </div>
      </div>
    </TabsContent>
  )
}
