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
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { handleServerError } from '@/lib/handle-server-error'

import type { StudioProject } from './local-projects'
import { StudioBeatEditor } from './studio-beat-editor'
import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import { studioProjectTimeline } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import { StudioSceneReview } from './studio-scene-review'
/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { applyStudioEditWithUndo } from './studio-timeline-history'
import { StudioTimelinePreview } from './studio-timeline-preview'
import type { StudioCrop, StudioTrackingPoint } from './studio-tracking'
import { StudioTrackingEditor } from './studio-tracking-editor'

type Result = {
  id: string
  document: {
    source_media_id: string
    analysis: {
      kind: string
      chunks?: { record_id: string }[]
      target_aspect?: number
      cuts?: { time: number }[]
      beat_times?: number[]
      sections?: { start: number; end: number; label: string }[]
      points?: StudioTrackingPoint[]
      manual_correction?: { keys?: unknown }
    }
  }
}
type Plan = {
  id: string
  revision: number
  document: { next_document: StudioProject; impact: { output_seconds: number } }
}

export function StudioProductionAnalysis() {
  const { t } = useTranslation()
  const context = useStudioProductionContext()
  const getMedia = useRef(context.props.getMedia)
  getMedia.current = context.props.getMedia
  const clips = studioProjectTimeline(context.props.project)
  const [clipId, setClipId] = useState('')
  const clip = clips.find((item) => item.id === clipId) || clips[0]
  const node = context.props.project.nodes.find(
    (item) => item.id === clip?.nodeId
  )
  const take = node?.data.takes?.find((item) => item.id === clip?.takeId)
  const clipMediaId = clip?.takeId ? take?.mediaId : node?.data.mediaId
  const appliedFraming =
    clip && context.props.project.production?.reframes?.[clip.id]
  const matchingAppliedFraming =
    appliedFraming?.sourceMediaId === clipMediaId ? appliedFraming : undefined
  const [action, setAction] = useState(
    matchingAppliedFraming ? 'subject_track' : 'scene_detect'
  )
  const purposeLabels: Record<string, string> = {
    scene_detect: t('Find actual scene cuts'),
    audio_structure: t('Find beats and sound sections'),
    subject_track: t('Follow a selected subject in portrait video'),
  }
  const sectionLabels: Record<string, string> = {
    section_candidate: t('Acoustic section candidate'),
    silence: t('Quiet interval'),
  }
  const sourceStart = action === 'audio_structure' ? 0 : clip?.trimStart || 0
  const [outputSize, setOutputSize] = useState(
    matchingAppliedFraming
      ? `${matchingAppliedFraming.width}x${matchingAppliedFraming.height}`
      : '720x1280'
  )
  const [outputWidth, outputHeight] = outputSize.split('x').map(Number)
  const [musicId, setMusicId] = useState('')
  const music = context.props.project.nodes.filter(
    (item) => item.data.kind === 'audio' && item.data.mediaId
  )
  const mediaId =
    action === 'audio_structure'
      ? musicId ||
        context.props.project.soundtrackMediaId ||
        context.props.project.production?.audioTracks.find((track) =>
          context.props.project.production?.audioMix?.musicMediaIds.includes(
            track.mediaId
          )
        )?.mediaId ||
        context.props.project.production?.audioTracks[0]?.mediaId ||
        music[0]?.data.mediaId ||
        clipMediaId
      : clipMediaId
  const musicSources = new Map<string, string>()
  for (const item of music) {
    if (item.data.mediaId) musicSources.set(item.data.mediaId, item.data.title)
  }
  for (const [index, track] of (
    context.props.project.production?.audioTracks || []
  ).entries()) {
    if (!musicSources.has(track.mediaId)) {
      musicSources.set(
        track.mediaId,
        t('Audio track {{number}}', { number: index + 1 })
      )
    }
  }
  if (context.props.project.voiceoverMediaId) {
    musicSources.set(
      context.props.project.voiceoverMediaId,
      t('Full-film narration')
    )
  }
  if (context.props.project.soundtrackMediaId) {
    musicSources.set(
      context.props.project.soundtrackMediaId,
      t('studio.timeline.soundtrack')
    )
  }
  if (clipMediaId && !musicSources.has(clipMediaId)) {
    musicSources.set(clipMediaId, t('Current clip audio'))
  }
  const [end, setEnd] = useState('5')
  const [anchor, setAnchor] = useState('0')
  const [roi, setRoi] = useState<StudioCrop>({
    x: 0.25,
    y: 0.2,
    width: 0.5,
    height: 0.6,
  })
  const [url, setUrl] = useState('')
  const [ratio, setRatio] = useState(16 / 9)
  const [reviewed, setReviewed] = useState(false)
  const [plan, setPlan] = useState<Plan>()
  const analysisScope = `${context.props.project.id}:${clip?.id || ''}:${mediaId || ''}:${action}`
  const boundEdits = useRef({ scope: analysisScope, end: false, anchor: false })
  const mediaDurations = useRef(new Map<string, number>())
  function editedBound(field: 'end' | 'anchor') {
    if (boundEdits.current.scope !== analysisScope) {
      boundEdits.current = { scope: analysisScope, end: false, anchor: false }
    }
    boundEdits.current[field] = true
  }
  useEffect(() => {
    if (boundEdits.current.scope !== analysisScope) {
      boundEdits.current = { scope: analysisScope, end: false, anchor: false }
    }
    if (!boundEdits.current.end) {
      setEnd(
        String(
          (action !== 'audio_structure' ? clip?.trimEnd : undefined) ??
            mediaDurations.current.get(mediaId || '') ??
            5
        )
      )
    }
    if (!boundEdits.current.anchor) setAnchor(String(clip?.trimStart || 0))
  }, [analysisScope, action, clip?.trimEnd, clip?.trimStart, mediaId])
  const [resultChoice, setResultChoice] = useState({
    scope: analysisScope,
    id: '',
  })
  const resultId = resultChoice.scope === analysisScope ? resultChoice.id : ''
  const setResultId = (id: string) =>
    setResultChoice({ scope: analysisScope, id })
  const video = useRef<HTMLVideoElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    let alive = true
    let objectUrl = ''
    setResultChoice({ scope: '', id: '' })
    setReviewed(false)
    setPlan(undefined)
    setUrl('')
    if (mediaId) {
      void getMedia
        .current(mediaId)
        .then((blob) => {
          if (alive && blob) {
            objectUrl = URL.createObjectURL(blob)
            setUrl(objectUrl)
          }
        })
        .catch(handleServerError)
    }
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [mediaId])
  const analysisJobs =
    context.jobs.data?.filter(
      (job) =>
        job.kind === 'inspect' &&
        job.status === 'succeeded' &&
        (!job.operation_action || job.operation_action === action) &&
        (job.result as { source_media_id?: string })?.source_media_id ===
          mediaId
    ) || []
  const appliedAnalysisId =
    action === 'subject_track' ? matchingAppliedFraming?.analysisId : undefined
  const chosenId =
    resultId ||
    appliedAnalysisId ||
    (analysisJobs[0]?.result as { record_id?: string })?.record_id
  const result = useQuery({
    queryKey: [
      'studio-production-analysis',
      context.props.project.id,
      chosenId,
    ],
    queryFn: () =>
      studioCloudRequest<Result>(
        `${context.path}/analyses/${encodeURIComponent(chosenId || '')}`
      ),
    enabled: !!chosenId,
  })
  const resultDocument = result.data?.document
  const analysis =
    resultDocument?.source_media_id === mediaId
      ? resultDocument?.analysis
      : undefined
  const invalid =
    analysis?.points?.filter(
      (point) =>
        point.review_required || (point.confidence < 0.45 && !point.manual)
    ).length || 0
  const mutate = useMutation({
    mutationFn: async (operation: 'analyze' | 'plan' | 'apply') => {
      await context.props.onSave()
      const current = await studioCloudRequest<StudioCloudProject>(context.path)
      if (operation === 'analyze') {
        await studioCloudRequest(`${context.path}/jobs`, 'POST', {
          request_id: crypto.randomUUID(),
          revision: current.revision,
          kind: 'inspect',
          budget: 0,
          operation: {
            media_id: mediaId,
            take_id: mediaId === clipMediaId ? clip?.takeId || '' : '',
            action,
            inspect: {
              start: action === 'audio_structure' ? 0 : clip?.trimStart || 0,
              end: Number(end),
              ...(action === 'subject_track'
                ? {
                    roi,
                    anchor_time: Number(anchor),
                    target_aspect: outputWidth / outputHeight,
                  }
                : {}),
            },
          },
        })
        await context.jobs.refetch()
      } else if (operation === 'plan') {
        setPlan(
          await studioCloudRequest<Plan>(`${context.path}/edit-plans`, 'POST', {
            request_id: crypto.randomUUID(),
            revision: current.revision,
            action: 'apply_reframe',
            clip_id: clip?.id,
            analysis_id: chosenId,
            width: outputWidth,
            height: outputHeight,
            review_confirmed: reviewed,
          })
        )
      } else if (plan) {
        await applyStudioEditWithUndo(
          context.path,
          plan,
          context.timelineHistory
        )
        await context.props.onRefresh()
        setPlan(undefined)
      }
    },
    onError: (error) => handleServerError(error),
  })
  return (
    <Collapsible className='space-y-3 rounded-lg border p-3'>
      <CollapsibleTrigger render={<Button variant='outline' />}>
        {t('Analyze cuts, music and subject framing')}
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-3 pt-3'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Local CPU analysis produces suggestions without generating media or spending model credit. Review the result before applying an edit.'
          )}
        </p>
        <FieldGroup>
          <Field>
            <FieldLabel>{t('Timeline clip')}</FieldLabel>
            <Select
              value={clip?.id || ''}
              onValueChange={(value) => {
                setClipId(value || '')
                setPlan(undefined)
              }}
            >
              <SelectTrigger aria-label={t('Analysis source clip')}>
                <SelectValue>
                  {clip
                    ? `${clips.indexOf(clip) + 1}. ${node?.data.title || t('Choose a clip')}`
                    : t('Choose a clip')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {clips.map((item, index) => (
                    <SelectItem key={item.id} value={item.id}>
                      {index + 1}.{' '}
                      {
                        context.props.project.nodes.find(
                          (candidate) => candidate.id === item.nodeId
                        )?.data.title
                      }
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{t('Analysis purpose')}</FieldLabel>
            <Select
              value={action}
              onValueChange={(value) => {
                setAction(value || 'scene_detect')
                setPlan(undefined)
                setReviewed(false)
              }}
            >
              <SelectTrigger aria-label={t('Analysis purpose')}>
                <SelectValue>{purposeLabels[action]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='scene_detect'>
                    {t('Find actual scene cuts')}
                  </SelectItem>
                  <SelectItem value='audio_structure'>
                    {t('Find beats and sound sections')}
                  </SelectItem>
                  <SelectItem value='subject_track'>
                    {t('Follow a selected subject in portrait video')}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{t('Source end time in seconds')}</FieldLabel>
            <Input
              aria-label={t('Source end time in seconds')}
              type='number'
              min={sourceStart + 0.05}
              max={action === 'subject_track' ? sourceStart + 120 : 3600}
              value={end}
              onChange={(event) => {
                editedBound('end')
                setEnd(event.target.value)
              }}
            />
          </Field>
          {action === 'audio_structure' && (
            <Field>
              <FieldLabel>{t('Music or dialogue source')}</FieldLabel>
              <Select
                value={mediaId || ''}
                onValueChange={(value) => setMusicId(value || '')}
              >
                <SelectTrigger aria-label={t('Music or dialogue source')}>
                  <SelectValue>
                    {musicSources.get(mediaId || '') ||
                      t('Selected audio source')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {[...musicSources].map(([id, label]) => (
                      <SelectItem key={id} value={id}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        </FieldGroup>
        {url && (
          <div
            className='relative max-h-96 touch-none overflow-hidden bg-black'
            style={{ aspectRatio: ratio }}
            onPointerDown={(event) => {
              if (action !== 'subject_track') return
              const rect = event.currentTarget.getBoundingClientRect()
              drag.current = {
                x: (event.clientX - rect.left) / rect.width,
                y: (event.clientY - rect.top) / rect.height,
              }
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerUp={(event) => {
              if (!drag.current) return
              const rect = event.currentTarget.getBoundingClientRect()
              const x = Math.min(
                1,
                Math.max(0, (event.clientX - rect.left) / rect.width)
              )
              const y = Math.min(
                1,
                Math.max(0, (event.clientY - rect.top) / rect.height)
              )
              setRoi({
                x: Math.min(x, drag.current.x),
                y: Math.min(y, drag.current.y),
                width: Math.abs(x - drag.current.x),
                height: Math.abs(y - drag.current.y),
              })
              drag.current = null
            }}
          >
            <video
              ref={video}
              src={url}
              controls={action !== 'subject_track'}
              className='h-full w-full'
              preload='metadata'
              aria-label={t('Analysis source preview')}
              onLoadedMetadata={(event) => {
                const element = event.currentTarget
                if (element.videoWidth && element.videoHeight) {
                  setRatio(element.videoWidth / element.videoHeight)
                }
                if (mediaId && Number.isFinite(element.duration)) {
                  mediaDurations.current.set(mediaId, element.duration)
                }
                if (boundEdits.current.scope !== analysisScope) {
                  boundEdits.current = {
                    scope: analysisScope,
                    end: false,
                    anchor: false,
                  }
                }
                if (!boundEdits.current.end) {
                  setEnd(
                    String(
                      mediaId === clipMediaId
                        ? (clip?.trimEnd ?? element.duration)
                        : element.duration
                    )
                  )
                }
                if (!boundEdits.current.anchor) {
                  setAnchor(String(clip?.trimStart || 0))
                }
              }}
            />
            {action === 'subject_track' && (
              <div
                className='border-primary pointer-events-none absolute border-2'
                style={{
                  left: `${roi.x * 100}%`,
                  top: `${roi.y * 100}%`,
                  width: `${roi.width * 100}%`,
                  height: `${roi.height * 100}%`,
                }}
              />
            )}
          </div>
        )}
        {action === 'subject_track' && (
          <FieldGroup>
            <Field>
              <FieldLabel>{t('Output aspect ratio')}</FieldLabel>
              <Select
                value={outputSize}
                onValueChange={(value) => {
                  if (value) setOutputSize(value)
                  setPlan(undefined)
                  setReviewed(false)
                }}
              >
                <SelectTrigger aria-label={t('Output aspect ratio')}>
                  <SelectValue>{outputSize}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value='720x1280'>9:16</SelectItem>
                    <SelectItem value='1280x720'>16:9</SelectItem>
                    <SelectItem value='1024x1024'>1:1</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Drag a rectangle around the person or product. Choose a source time where it is visible; tracking runs in both directions. Tracking is limited to 120 seconds.'
              )}
            </p>
            <Field>
              <FieldLabel>{t('Subject visible at source time')}</FieldLabel>
              <Input
                aria-label={t('Subject visible at source time')}
                type='number'
                min={0}
                max={Number(end)}
                value={anchor}
                onChange={(event) => {
                  editedBound('anchor')
                  setAnchor(event.target.value)
                  if (video.current) {
                    video.current.currentTime = Number(event.target.value)
                  }
                }}
              />
            </Field>
            <div className='grid grid-cols-2 gap-2'>
              {(['x', 'y', 'width', 'height'] as const).map((key) => (
                <Field key={key}>
                  <FieldLabel>{t(key)} %</FieldLabel>
                  <Input
                    aria-label={`${t('Subject rectangle')} ${key}`}
                    type='number'
                    min={0}
                    max={100}
                    value={Math.round(roi[key] * 100)}
                    onChange={(event) =>
                      setRoi({
                        ...roi,
                        [key]: Number(event.target.value) / 100,
                      })
                    }
                  />
                </Field>
              ))}
            </div>
          </FieldGroup>
        )}
        <Button
          variant='outline'
          disabled={
            !context.writable ||
            !mediaId ||
            !Number.isFinite(Number(end)) ||
            Number(end) <= sourceStart ||
            (action === 'subject_track' &&
              (Number(end) - sourceStart > 120 ||
                !Number.isFinite(Number(anchor)) ||
                Number(anchor) < sourceStart ||
                Number(anchor) > Number(end) ||
                roi.width <= 0 ||
                roi.height <= 0 ||
                roi.x < 0 ||
                roi.y < 0 ||
                roi.x + roi.width > 1 ||
                roi.y + roi.height > 1)) ||
            mutate.isPending
          }
          onClick={() => mutate.mutate('analyze')}
        >
          {t('Analyze without generating media')}
        </Button>
        {(analysisJobs.length > 0 || chosenId) && (
          <Field>
            <FieldLabel>{t('Analysis result')}</FieldLabel>
            <Select
              value={chosenId || ''}
              onValueChange={(value) => {
                setResultId(value || '')
                setPlan(undefined)
                setReviewed(false)
              }}
            >
              <SelectTrigger aria-label={t('Analysis result')}>
                <SelectValue>
                  {purposeLabels[analysis?.kind || ''] || t('Choose a result')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {appliedAnalysisId &&
                    !analysisJobs.some(
                      (job) =>
                        (job.result as { record_id?: string })?.record_id ===
                        appliedAnalysisId
                    ) && (
                      <SelectItem value={appliedAnalysisId}>
                        {t('Applied framing correction')}
                      </SelectItem>
                    )}
                  {resultId &&
                    resultId !== appliedAnalysisId &&
                    !analysisJobs.some(
                      (job) =>
                        (job.result as { record_id?: string })?.record_id ===
                        resultId
                    ) && (
                      <SelectItem value={resultId}>
                        {t('Current crop correction')}
                      </SelectItem>
                    )}
                  {analysisJobs.map((job) => (
                    <SelectItem
                      key={job.id}
                      value={(job.result as { record_id: string }).record_id}
                    >
                      {purposeLabels[
                        (job.result as { kind?: string }).kind || ''
                      ] || t('Analysis result')}{' '}
                      · {job.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}
        {analysis?.cuts && (
          <div
            className='flex flex-wrap gap-2'
            aria-label={t('Detected scene cut candidates')}
          >
            {analysis.cuts.map((cut) => (
              <Button
                key={cut.time}
                size='sm'
                variant='outline'
                onClick={() => {
                  if (video.current) video.current.currentTime = cut.time
                }}
              >
                {cut.time.toFixed(3)} s
              </Button>
            ))}
            <p className='text-muted-foreground w-full text-sm'>
              {t(
                'Scene differences are candidates. Flashes and transitions need review; original footage is preserved.'
              )}
            </p>
          </div>
        )}
        {analysis?.kind === 'scene_detect' &&
          !!analysis.chunks?.length &&
          chosenId && (
            <StudioSceneReview key={chosenId} analysisId={chosenId} />
          )}
        {analysis?.beat_times && (
          <>
            <p>
              {t('Detected beats')}: {analysis.beat_times.length}
            </p>
            <div className='flex flex-wrap gap-2'>
              {analysis.beat_times.slice(0, 60).map((time) => (
                <Button
                  size='sm'
                  variant='ghost'
                  key={time}
                  onClick={() => {
                    if (video.current) video.current.currentTime = time
                  }}
                >
                  {time.toFixed(2)} s
                </Button>
              ))}
            </div>
            {analysis.sections?.map((section) => (
              <p key={section.start} className='text-muted-foreground text-sm'>
                {section.start.toFixed(2)}–{section.end.toFixed(2)} s ·{' '}
                {sectionLabels[section.label] || section.label}
              </p>
            ))}
            <StudioBeatEditor key={chosenId} analysisId={chosenId || ''} />
          </>
        )}
        {analysis?.points && (
          <>
            <StudioTrackingEditor
              key={chosenId}
              path={context.path}
              analysisId={chosenId || ''}
              points={analysis.points}
              manualKeys={
                analysis.manual_correction
                  ? (analysis.manual_correction.keys ?? null)
                  : undefined
              }
              url={url}
              targetAspect={analysis.target_aspect}
              readOnly={!context.writable}
              onCorrect={(id) => {
                setResultId(id)
                setReviewed(false)
                setPlan(undefined)
              }}
            />
            <p role='status'>
              {t('Tracked samples')}: {analysis.points.length} ·{' '}
              {t('Needs correction')}: {invalid}
            </p>
            {invalid > 0 && (
              <p className='text-destructive text-sm'>
                {t(
                  'The subject was lost or occluded. Select a shorter interval or a new visible anchor; unreviewed tracking cannot be applied.'
                )}
              </p>
            )}
            <label className='flex items-center gap-2 text-sm'>
              <Checkbox
                checked={reviewed}
                disabled={!context.writable}
                onCheckedChange={(value) => setReviewed(value === true)}
              />
              {t('I reviewed this trajectory and the portrait framing.')}
            </label>
            <Button
              variant='outline'
              disabled={
                !context.writable ||
                invalid > 0 ||
                !reviewed ||
                mutate.isPending
              }
              onClick={() => mutate.mutate('plan')}
            >
              {t('Preview portrait reframe plan')}
            </Button>
          </>
        )}
        {plan && (
          <div role='status' className='space-y-2 rounded-md border p-3'>
            <StudioTimelinePreview
              project={plan.document.next_document}
              getMedia={context.props.getMedia}
              compact
            />
            <p>
              {t(
                'This plan changes the selected clip framing and the project output size. Other source media and Takes are preserved.'
              )}{' '}
              {outputWidth} × {outputHeight}
            </p>
            <div className='flex gap-2'>
              <Button
                disabled={!context.writable || mutate.isPending}
                onClick={() => mutate.mutate('apply')}
              >
                {t('Apply this edit')}
              </Button>
              <Button variant='outline' onClick={() => setPlan(undefined)}>
                {t('Keep current edit')}
              </Button>
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
