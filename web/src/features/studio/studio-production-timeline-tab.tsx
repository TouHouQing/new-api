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
import { handleServerError } from '@/lib/handle-server-error'

import {
  pinStudioAudioAnchorClip,
  reconcileStudioAudioAnchors,
  type StudioAudioOrigins,
} from './studio-audio-anchors'
import { StudioBudgetSummary } from './studio-budget-summary'
import { StudioCaptionEditor } from './studio-caption-editor'
import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import { studioCreationProgress } from './studio-creation'
import { StudioFilmFinish, StudioDialogueTiming } from './studio-film-finish'
import { StudioFilmLayout } from './studio-film-layout'
import { StudioMotionGraphics } from './studio-motion-graphics'
import { StudioNumberField } from './studio-number-field'
import {
  studioProductionSchema,
  studioProjectTimeline,
  splitStudioTimelineClip,
} from './studio-production'
import { StudioProductionAnalysis } from './studio-production-analysis'
import { useStudioProductionContext } from './studio-production-context'
import { StudioRenderProgress } from './studio-render-progress'
import { StudioTimelinePreview } from './studio-timeline-preview'
import { StudioTimelineTracks } from './studio-timeline-tracks'
import { StudioTranscriptEditor } from './studio-transcript-editor'
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
    timelineInspector = 'clip',
    setTimelineInspector,
    selectedAudioTrack,
    setSelectedAudioTrack,
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
    updateTimeline,
    audioAnchorDurations,
    submit,
    preview,
    markTimelinePreviewed,
    setActiveTab,
    setMediaDraftNodeId,
    setMediaEntryAction,
  } = useStudioProductionContext()
  const changeTimeline = (
    next: typeof timeline,
    origins?: StudioAudioOrigins
  ) => {
    if (updateTimeline) {
      updateTimeline(next, origins)
      return
    }
    try {
      props.onUpdate(reconcileStudioAudioAnchors(props.project, next, origins))
    } catch (error) {
      handleServerError(error)
    }
  }
  const audioProduction =
    props.project.production || studioProductionSchema.parse({})
  const saveAudio = (
    id: string,
    patch: Partial<(typeof audioProduction.audioTracks)[number]>
  ) => {
    props.onUpdate({
      ...props.project,
      production: {
        ...audioProduction,
        ...(patch.anchorKind !== undefined || patch.speed !== undefined
          ? { documentVersion: 2 as const }
          : {}),
        audioTracks: audioProduction.audioTracks.map((track) =>
          track.id === id ? { ...track, ...patch } : track
        ),
      },
    })
  }
  const bindAudio = (
    track: (typeof audioProduction.audioTracks)[number],
    kind: 'project' | 'clip' | 'source',
    clipId?: string,
    position?: number
  ) => {
    try {
      const oldClip = timeline.find((item) => item.id === track.anchorClipId)
      if (
        oldClip &&
        props.project.nodes.find((node) => node.id === oldClip.nodeId)?.data
          .locked
      ) {
        throw new Error(
          t('Unlock the attached clip before changing its audio.')
        )
      }
      if (kind === 'project') {
        saveAudio(track.id, {
          anchorKind: 'project',
          anchorClipId: undefined,
          anchorSourceStart: undefined,
        })
        return
      }
      const bound =
        timeline.find(
          (item) => item.id === (clipId || track.anchorClipId || selectedClip)
        ) || timeline[0]
      if (!bound) {
        throw new Error(
          t('Choose an existing timeline clip before attaching audio.')
        )
      }
      if (
        props.project.nodes.find((node) => node.id === bound.nodeId)?.data
          .locked
      ) {
        throw new Error(
          t('Unlock the attached clip before changing its audio.')
        )
      }
      let program = 0
      for (const item of timeline) {
        const node = props.project.nodes.find(
          (candidate) => candidate.id === item.nodeId
        )
        const takeId = item.takeId || node?.data.selectedTakeId
        const mediaId = takeId
          ? node?.data.takes?.find(
              (take) => take.id === takeId && take.status === 'completed'
            )?.mediaId
          : node?.data.mediaId
        const end =
          item.trimEnd ??
          (mediaId ? audioAnchorDurations?.current[mediaId] : undefined)
        if (end === undefined || end === null || end <= item.trimStart) {
          throw new Error(
            t('Set the actual clip trim range before attaching audio.')
          )
        }
        if (item.id === bound.id) {
          const value =
            position ??
            (track.anchorKind === kind && track.anchorClipId === bound.id
              ? track.anchorSourceStart
              : undefined) ??
            (kind === 'source' ? item.trimStart : 0)
          const local =
            kind === 'source' ? (value - item.trimStart) / item.speed : value
          if (
            !Number.isFinite(value) ||
            local < 0 ||
            local >= (end - item.trimStart) / item.speed
          ) {
            throw new Error(
              t('The audio anchor must lie inside the selected clip.')
            )
          }
          const pinned = pinStudioAudioAnchorClip(props.project, bound.id)
          if (!pinned.production) return
          props.onUpdate({
            ...pinned,
            production: {
              ...pinned.production,
              audioTracks: pinned.production.audioTracks.map((item) =>
                item.id === track.id
                  ? {
                      ...item,
                      anchorKind: kind,
                      anchorClipId: bound.id,
                      anchorSourceStart: value,
                      offset: program + local,
                    }
                  : item
              ),
            },
          })
          return
        }
        program += (end - item.trimStart) / item.speed
      }
    } catch (error) {
      handleServerError(error)
    }
  }
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
              options.compact ? 'max-h-[26dvh] overflow-y-auto' : undefined
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
          {options.compact && (
            <div
              role='group'
              aria-label={t('Editing controls')}
              className='grid grid-cols-4 gap-1'
            >
              {(['clip', 'captions', 'audio', 'film'] as const).map((key) => (
                <Button
                  key={key}
                  aria-pressed={timelineInspector === key}
                  variant={timelineInspector === key ? 'secondary' : 'ghost'}
                  onClick={() => setTimelineInspector(key)}
                >
                  {t(`studio.inspector.${key}`)}
                </Button>
              ))}
            </div>
          )}
          <div
            hidden={options.compact && timelineInspector !== 'film'}
            className='space-y-3'
          >
            <StudioDialogueTiming />
            <StudioFilmFinish />
            <StudioFilmLayout />
            <StudioProductionAnalysis />
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
                changeTimeline(ordered)
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
          </div>
          <div hidden={options.compact} className='flex flex-wrap gap-2'>
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
          <div hidden={options.compact && timelineInspector !== 'captions'}>
            <StudioWorkspaceCaptions />
          </div>
          <div hidden={options.compact && timelineInspector !== 'clip'}>
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
                      props.project.nodes.find(
                        (node) => node.id === clip.nodeId
                      )?.data.takes || []
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
                        changeTimeline(next)
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
                      changeTimeline(
                        timeline.filter((item) => item.id !== clip.id)
                      )
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
                <Field>
                  <FieldLabel>{t('studio.production.splitAt')}</FieldLabel>
                  <Input
                    type='number'
                    aria-label={t('studio.production.splitAt')}
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
                        changeTimeline(
                          timeline.flatMap((item) =>
                            item.id === clip.id ? split : [item]
                          ),
                          Object.fromEntries(
                            split.map((part) => [part.id, clip.id])
                          )
                        )
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
                    onClick={() => {
                      const duplicate = {
                        ...clip,
                        takeId:
                          clip.takeId ||
                          props.project.nodes.find(
                            (node) => node.id === clip.nodeId
                          )?.data.selectedTakeId,
                        id: crypto.randomUUID(),
                      }
                      changeTimeline([...timeline, duplicate], {
                        [duplicate.id]: clip.id,
                      })
                    }}
                  >
                    {t('studio.production.duplicate')}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div hidden={options.compact && timelineInspector !== 'film'}>
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
          </div>
          <div
            hidden={
              options.compact &&
              !['audio', 'captions'].includes(timelineInspector)
            }
            className='space-y-3'
          >
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
          </div>
          <div
            hidden={options.compact && timelineInspector !== 'captions'}
            className='space-y-3'
          >
            <StudioTranscriptEditor />
            <Collapsible defaultOpen={!options.compact}>
              <CollapsibleTrigger
                render={<Button size='sm' variant='outline' />}
              >
                {t('Recognize an independent audio track')}
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
                      <p
                        role='status'
                        className='text-muted-foreground text-sm'
                      >
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
            <Collapsible>
              <CollapsibleTrigger
                render={<Button size='sm' variant='outline' />}
              >
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
          </div>
          <div
            hidden={options.compact && timelineInspector !== 'audio'}
            className='space-y-3'
          >
            {options.compact && (
              <Field>
                <FieldLabel>{t('Audio track to edit')}</FieldLabel>
                <Select
                  value={selectedAudioTrack || null}
                  onValueChange={(value) => setSelectedAudioTrack(value || '')}
                  items={(props.project.production?.audioTracks || []).map(
                    (track, index) => ({
                      value: track.id,
                      label:
                        props.project.nodes.find(
                          (node) => node.data.mediaId === track.mediaId
                        )?.data.title || `${t('Audio')} ${index + 1}`,
                    })
                  )}
                >
                  <SelectTrigger aria-label={t('Audio track to edit')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {props.project.production?.audioTracks.map(
                      (track, index) => (
                        <SelectItem key={track.id} value={track.id}>
                          {props.project.nodes.find(
                            (node) => node.data.mediaId === track.mediaId
                          )?.data.title || `${t('Audio')} ${index + 1}`}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {selectedAudioTrack &&
              !props.project.production?.audioTracks.some(
                (track) => track.id === selectedAudioTrack
              ) && (
                <>
                  <p>
                    {t(
                      'This audio follows the shot dialogue. Edit its speech or drag its timing in the timeline.'
                    )}
                  </p>
                  <StudioDialogueTiming />
                </>
              )}
            {props.project.production?.audioTracks
              .filter(
                (track) =>
                  !options.compact ||
                  !selectedAudioTrack ||
                  selectedAudioTrack === track.id
              )
              .map((track, index) => {
                const anchorClip = timeline.find(
                  (item) => item.id === track.anchorClipId
                )
                const audioLocked =
                  !!anchorClip &&
                  props.project.nodes.find(
                    (node) => node.id === anchorClip.nodeId
                  )?.data.locked === true
                let anchorLabel = t('Film clock: keep music fixed')
                if (track.anchorKind === 'clip') {
                  anchorLabel = t('This clip: keep a local position')
                } else if (track.anchorKind === 'source') {
                  anchorLabel = t('This source action: follow cuts')
                }
                const source = props.project.nodes.find(
                  (node) =>
                    node.data.mediaId === track.mediaId ||
                    node.data.takes?.some(
                      (take) => take.mediaId === track.mediaId
                    )
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
                        aria-label={t('Preview audio track: {{title}}', {
                          title,
                        })}
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
                        disabled={!writable || audioLocked}
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
                        <Field>
                          <FieldLabel>{t('Audio follows')}</FieldLabel>
                          <Select
                            value={track.anchorKind || 'project'}
                            disabled={!writable || audioLocked}
                            onValueChange={(value) => {
                              if (
                                value === 'project' ||
                                value === 'clip' ||
                                value === 'source'
                              ) {
                                bindAudio(track, value)
                              }
                            }}
                          >
                            <SelectTrigger
                              aria-label={`${title} ${t('Audio follows')}`}
                            >
                              <SelectValue>{anchorLabel}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value='project'>
                                {t('Film clock: keep music fixed')}
                              </SelectItem>
                              <SelectItem value='clip'>
                                {t('This clip: keep a local position')}
                              </SelectItem>
                              <SelectItem value='source'>
                                {t('This source action: follow cuts')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        {(track.anchorKind === 'source' ||
                          track.anchorKind === 'clip') && (
                          <>
                            <Field>
                              <FieldLabel>{t('Attached clip')}</FieldLabel>
                              <Select
                                value={track.anchorClipId || ''}
                                disabled={!writable || audioLocked}
                                onValueChange={(value) => {
                                  if (value) {
                                    bindAudio(
                                      track,
                                      track.anchorKind === 'source'
                                        ? 'source'
                                        : 'clip',
                                      value
                                    )
                                  }
                                }}
                              >
                                <SelectTrigger
                                  aria-label={`${title} ${t('Attached clip')}`}
                                >
                                  <SelectValue>
                                    {anchorClip
                                      ? `${timeline.findIndex((item) => item.id === anchorClip.id) + 1}. ${props.project.nodes.find((node) => node.id === anchorClip.nodeId)?.data.title || t('Clip')}`
                                      : t('Choose a clip')}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {timeline.map((item, clipIndex) => (
                                    <SelectItem key={item.id} value={item.id}>
                                      {clipIndex + 1}.{' '}
                                      {props.project.nodes.find(
                                        (node) => node.id === item.nodeId
                                      )?.data.title || t('Clip')}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </Field>
                            <StudioNumberField
                              id={`studio-audio-${track.id}-anchor`}
                              label={
                                track.anchorKind === 'source'
                                  ? t('Video source time for this sound')
                                  : t('Time inside the attached clip')
                              }
                              disabled={!writable || audioLocked}
                              min={0}
                              max={3600}
                              value={track.anchorSourceStart ?? 0}
                              onChange={(value) => {
                                if (value !== undefined) {
                                  bindAudio(
                                    track,
                                    track.anchorKind === 'source'
                                      ? 'source'
                                      : 'clip',
                                    track.anchorClipId,
                                    value
                                  )
                                }
                              }}
                            />
                            <p className='text-muted-foreground text-xs sm:col-span-2'>
                              {t(
                                'Attached audio follows this exact clip when trimmed or split. Removed source portions are removed from its audio; other uses of the same Take stay independent.'
                              )}
                            </p>
                          </>
                        )}
                        <StudioNumberField
                          id={`studio-audio-${track.id}-speed`}
                          label={t('Audio playback speed')}
                          disabled={!writable || audioLocked}
                          min={0.25}
                          max={4}
                          value={track.speed ?? 1}
                          onChange={(value) => {
                            if (value !== undefined) {
                              saveAudio(track.id, { speed: value })
                            }
                          }}
                        />
                        {(
                          ['start', 'offset', 'duration', 'volume'] as const
                        ).map((key) => (
                          <StudioNumberField
                            key={key}
                            id={`studio-audio-${track.id}-${key}`}
                            label={t(`studio.production.audio.${key}`)}
                            disabled={
                              !writable ||
                              audioLocked ||
                              (key === 'offset' &&
                                (track.anchorKind === 'source' ||
                                  track.anchorKind === 'clip'))
                            }
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
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                    <Button
                      variant='outline'
                      disabled={!writable || audioLocked}
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
      </div>
    </TabsContent>
  )
}
