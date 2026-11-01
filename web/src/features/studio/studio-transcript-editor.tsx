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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  studioCloudRequest,
  type StudioCloudProject,
  type StudioCloudJob,
} from './studio-cloud'
import { studioProjectTimeline } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { applyStudioEditWithUndo } from './studio-timeline-history'
import { StudioTimelinePreview } from './studio-timeline-preview'
import { studioWorkflowProblem } from './studio-workflow-problem'

type Span = {
  id: string
  start: number
  end: number
  text: string
  speaker?: string
  confidence?: number
}
type Analysis = {
  id: string
  revision: number
  document: {
    kind?: string
    source_media_id: string
    source_digest: string
    analysis: {
      kind: string
      precision?: string
      segments?: Span[]
      words?: Span[]
    }
  }
}
type EditPlan = {
  id: string
  revision: number
  document: {
    next_document: StudioProject
    request: { action: string }
    impact: { output_seconds: number; ranges: { start: number; end: number }[] }
  }
}

export function StudioTranscriptEditor() {
  const { t } = useTranslation()
  const context = useStudioProductionContext()
  const client = useQueryClient()
  const project = context.props.project
  const getMedia = context.props.getMedia
  const clips = studioProjectTimeline(project)
  const [clipId, setClipId] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [reviewed, setReviewed] = useState(false)
  const [plan, setPlan] = useState<EditPlan>()
  const [overrideId, setOverrideId] = useState('')
  const [correction, setCorrection] = useState<{
    id: string
    text: string
    speaker: string
  }>()
  const [preview, setPreview] = useState('')
  const [submittedJob, setSubmittedJob] = useState<StudioCloudJob>()
  const player = useRef<HTMLVideoElement>(null)
  const clip = clips.find((item) => item.id === clipId) || clips[0]
  const node = project.nodes.find((item) => item.id === clip?.nodeId)
  const take = node?.data.takes?.find((item) => item.id === clip?.takeId)
  const mediaId = clip?.takeId ? take?.mediaId : node?.data.mediaId
  const recognitionJob =
    context.jobs.data?.find(
      (job) => job.kind === 'transcribe' && job.source_media_id === mediaId
    ) || (submittedJob?.source_media_id === mediaId ? submittedJob : undefined)
  const recognitionBusy =
    !!recognitionJob &&
    ['queued', 'running', 'waiting', 'paused', 'uncertain'].includes(
      recognitionJob.status
    )
  const savedResponse = (
    recognitionJob?.result as { response_media_id?: string } | undefined
  )?.response_media_id
  const analyses = useQuery({
    queryKey: ['studio-cloud-analyses', project.id],
    queryFn: () => studioCloudRequest<Analysis[]>(`${context.path}/analyses`),
    enabled: context.props.open,
    refetchInterval: context.props.open ? 5000 : false,
  })
  const match = analyses.data?.find(
    (item) =>
      item.document.source_media_id === mediaId &&
      (item.document.kind === 'transcript' ||
        item.document.analysis.kind === 'transcript')
  )
  const analysisId = overrideId || match?.id
  const transcript = useQuery({
    queryKey: ['studio-cloud-analysis', project.id, analysisId],
    queryFn: () =>
      studioCloudRequest<Analysis>(
        `${context.path}/analyses/${encodeURIComponent(analysisId || '')}`
      ),
    enabled: !!analysisId,
  })
  useEffect(() => {
    setSelected([])
    setReviewed(false)
    setPlan(undefined)
  }, [clip?.id, analysisId, project.updatedAt])
  useEffect(() => {
    setOverrideId('')
    setCorrection(undefined)
  }, [mediaId])
  useEffect(() => {
    let active = true
    let url = ''
    setPreview('')
    if (mediaId) {
      void getMedia(mediaId)
        .then((blob) => {
          if (active && blob) {
            url = URL.createObjectURL(blob)
            setPreview(url)
          }
        })
        .catch(handleServerError)
    }
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [mediaId, getMedia])
  const action = useMutation({
    mutationFn: async (
      operation:
        | 'recognize'
        | 'recover'
        | 'preview'
        | 'apply'
        | 'correct'
        | 'captions'
    ) => {
      await context.props.onSave()
      const current = await studioCloudRequest<StudioCloudProject>(context.path)
      if (operation === 'recognize') {
        if (!mediaId || !context.transcriptionModel.trim()) {
          throw new Error(
            t('Choose a transcription model and a video with audio first.')
          )
        }
        const job = await studioCloudRequest<StudioCloudJob>(
          `${context.path}/jobs`,
          'POST',
          {
            request_id: crypto.randomUUID(),
            revision: current.revision,
            kind: 'transcribe',
            budget: Math.round(
              Number(context.budget) *
                (context.capabilities.data?.quota_per_unit || 500000)
            ),
            confirm_generation: true,
            operation: {
              media_id: mediaId,
              model: context.transcriptionModel,
              group: node?.data.group || '',
              language: '',
              action: 'transcript_only',
            },
          }
        )
        setSubmittedJob({ ...job, source_media_id: mediaId })
        context.setConfirm(false)
      } else if (operation === 'recover' && recognitionJob && savedResponse) {
        await studioCloudRequest(
          `/jobs/${encodeURIComponent(recognitionJob.id)}/control`,
          'POST',
          { action: 'resume', confirm_generation: true }
        )
        await context.jobs.refetch()
      } else if (operation === 'preview') {
        const result = await studioCloudRequest<EditPlan>(
          `${context.path}/edit-plans`,
          'POST',
          {
            request_id: crypto.randomUUID(),
            revision: current.revision,
            action: 'delete_transcript',
            clip_id: clip?.id,
            transcript_id: analysisId,
            utterance_ids: selected,
            review_confirmed: reviewed,
          }
        )
        setPlan(result)
      } else if (operation === 'captions') {
        setPlan(
          await studioCloudRequest<EditPlan>(
            `${context.path}/edit-plans`,
            'POST',
            {
              request_id: crypto.randomUUID(),
              revision: current.revision,
              action: 'transcript_captions',
              clip_id: clip?.id,
              transcript_id: analysisId,
              review_confirmed: true,
            }
          )
        )
      } else if (operation === 'correct' && correction) {
        const saved = await studioCloudRequest<{ id: string }>(
          `${context.path}/analyses/${encodeURIComponent(analysisId || '')}/transcript-corrections`,
          'POST',
          { request_id: crypto.randomUUID(), segments: [correction] }
        )
        setOverrideId(saved.id)
        setCorrection(undefined)
      } else if (plan) {
        await applyStudioEditWithUndo(
          context.path,
          plan,
          context.timelineHistory
        )
        await context.props.onRefresh()
        setPlan(undefined)
        setSelected([])
      }
      await client.invalidateQueries({
        queryKey: ['studio-cloud-jobs', project.id],
      })
      await client.invalidateQueries({
        queryKey: ['studio-cloud-analyses', project.id],
      })
    },
    onError: (error) => handleServerError(error),
  })
  const spans = (transcript.data?.document.analysis.segments || []).filter(
    (span) =>
      span.end > (clip?.trimStart || 0) &&
      span.start < (clip?.trimEnd ?? Infinity)
  )
  return (
    <section
      className='space-y-3 rounded-lg border p-3'
      aria-label={t('Edit video by transcript')}
    >
      <p className='font-medium'>{t('Edit video by transcript')}</p>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Editing subtitle text keeps the sound and video. Select sentences here only when you want to remove their sound and picture from this timeline clip.'
        )}
      </p>
      <FieldGroup>
        <Field>
          <FieldLabel>{t('Timeline clip')}</FieldLabel>
          <Select
            value={clip?.id || ''}
            onValueChange={(value) => setClipId(value || '')}
          >
            <SelectTrigger aria-label={t('Timeline clip')}>
              <SelectValue>
                {clip
                  ? `${clips.indexOf(clip) + 1}. ${node?.data.title || t('Choose a clip')}`
                  : t('Choose a clip')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {clips.map((item, index) => (
                  <SelectItem value={item.id} key={item.id}>
                    {index + 1}.{' '}
                    {
                      project.nodes.find(
                        (candidate) => candidate.id === item.nodeId
                      )?.data.title
                    }
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {!match && (
          <>
            <Field>
              <FieldLabel>{t('Video transcription model')}</FieldLabel>
              <Input
                aria-label={t('Video transcription model')}
                value={context.transcriptionModel}
                onChange={(event) =>
                  context.setTranscriptionModel(event.target.value)
                }
              />
            </Field>
            <Field>
              <FieldLabel>{t('studio.production.budget')}</FieldLabel>
              <Input
                aria-label={t('Transcription budget limit')}
                type='number'
                min={0.001}
                max={4000}
                value={context.budget}
                disabled={!context.writable}
                onChange={(event) => context.setBudget(event.target.value)}
              />
            </Field>
            <label className='flex items-start gap-2 text-sm'>
              <Checkbox
                checked={context.confirm}
                disabled={!context.writable}
                onCheckedChange={(value) => context.setConfirm(value === true)}
              />
              {t('I authorize recognition within this budget.')}
            </label>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Recognition uses this confirmed budget. It preserves the original video.'
              )}
            </p>
            <Button
              variant='outline'
              disabled={
                !context.writable ||
                recognitionBusy ||
                !mediaId ||
                !context.confirm ||
                !context.transcriptionModel.trim() ||
                !Number.isFinite(Number(context.budget)) ||
                Number(context.budget) <= 0 ||
                Number(context.budget) > 4000 ||
                !context.capabilities.data?.generation_credit_available ||
                action.isPending
              }
              onClick={() => action.mutate('recognize')}
            >
              {t('Recognize this clip')}
            </Button>
          </>
        )}
      </FieldGroup>
      {recognitionJob && (
        <div className='space-y-2 rounded-md border p-3' role='status'>
          <p>
            {t('Recognition status')}:{' '}
            {t(`studio.production.status.${recognitionJob.status}`)} ·{' '}
            {recognitionJob.progress}%
          </p>
          {recognitionJob.error && (
            <p className='text-destructive text-sm'>
              {t(studioWorkflowProblem(recognitionJob.error))}
            </p>
          )}
          {recognitionJob.status === 'failed' && savedResponse && (
            <>
              <p className='text-muted-foreground text-sm'>
                {t(
                  'A recognition response is already saved. Recover it without submitting the model again.'
                )}
              </p>
              <Button
                variant='outline'
                disabled={!context.writable || action.isPending}
                onClick={() => action.mutate('recover')}
              >
                {t('Recover saved recognition result')}
              </Button>
            </>
          )}
          {['paused', 'uncertain'].includes(recognitionJob.status) && (
            <p className='text-muted-foreground text-sm'>
              {t(
                'Review this task in the task center before resuming. A new recognition task stays disabled to avoid duplicate work.'
              )}
            </p>
          )}
        </div>
      )}
      {preview && (
        <video
          ref={player}
          src={preview}
          controls
          preload='metadata'
          className='max-h-64 w-full rounded-md bg-black'
          aria-label={t('Transcript source preview')}
        />
      )}
      {(analyses.isLoading || transcript.isLoading) && (
        <p role='status'>{t('Loading transcript…')}</p>
      )}
      {(analyses.isError || transcript.isError) && (
        <p role='alert'>
          {t('The transcript could not be loaded. Check access and retry.')}
        </p>
      )}
      {spans.length > 0 && (
        <>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Check the audio before cutting, especially overlapping voices and uncertain words. Only this occurrence of the clip will change.'
            )}
          </p>
          <div className='max-h-80 space-y-2 overflow-y-auto'>
            {spans.map((span, index) => (
              <div
                key={span.id}
                className='flex flex-wrap items-start gap-2 rounded-md border p-2'
              >
                <Checkbox
                  aria-label={`${t('Select sentence')}: ${span.text}`}
                  checked={selected.includes(span.id)}
                  disabled={
                    !context.writable ||
                    span.start < (clip?.trimStart || 0) ||
                    span.end > (clip?.trimEnd ?? Infinity)
                  }
                  onCheckedChange={(checked) => {
                    setPlan(undefined)
                    setReviewed(false)
                    setSelected((value) =>
                      checked
                        ? [...value, span.id]
                        : value.filter((id) => id !== span.id)
                    )
                  }}
                />
                <div className='min-w-0 flex-1'>
                  <p className='text-sm break-words whitespace-pre-wrap'>
                    {span.text}
                  </p>
                  <p className='text-muted-foreground text-xs'>
                    {span.start.toFixed(2)}–{span.end.toFixed(2)} s ·{' '}
                    {span.speaker || t('Speaker not identified')}
                  </p>
                  {index > 0 &&
                    spans[index - 1].text.replaceAll(/\s/g, '') ===
                      span.text.replaceAll(/\s/g, '') && (
                      <p className='text-muted-foreground text-xs'>
                        {t(
                          'Possible repeated sentence — listen before removing.'
                        )}
                      </p>
                    )}
                  {index > 0 && span.start - spans[index - 1].end > 0.8 && (
                    <p className='text-muted-foreground text-xs'>
                      {t('Pause before this sentence')}:{' '}
                      {(span.start - spans[index - 1].end).toFixed(2)} s
                    </p>
                  )}
                </div>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => {
                    if (player.current) {
                      player.current.currentTime = span.start
                      void player.current.play().catch(handleServerError)
                    }
                  }}
                >
                  {t('Listen')}
                </Button>
                <Button
                  size='sm'
                  variant='ghost'
                  disabled={!context.writable}
                  onClick={() =>
                    setCorrection({
                      id: span.id,
                      text: span.text,
                      speaker: span.speaker || '',
                    })
                  }
                >
                  {t('Correct text or speaker')}
                </Button>
              </div>
            ))}
          </div>
          {correction && (
            <FieldGroup className='rounded-md border p-3'>
              <Field>
                <FieldLabel>{t('Corrected subtitle text')}</FieldLabel>
                <Input
                  aria-label={t('Corrected subtitle text')}
                  value={correction.text}
                  maxLength={10000}
                  onChange={(event) =>
                    setCorrection({ ...correction, text: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel>{t('Speaker name')}</FieldLabel>
                <Input
                  aria-label={t('Speaker name')}
                  value={correction.speaker}
                  maxLength={200}
                  onChange={(event) =>
                    setCorrection({
                      ...correction,
                      speaker: event.target.value,
                    })
                  }
                />
              </Field>
              <p className='text-muted-foreground text-sm'>
                {t(
                  'Saving a text correction does not change the recorded speech. Corrected text keeps sentence timing; it does not claim new word timing.'
                )}
              </p>
              <Button
                variant='outline'
                disabled={!context.writable || action.isPending}
                onClick={() => action.mutate('correct')}
              >
                {t('Save transcript correction')}
              </Button>
            </FieldGroup>
          )}
          <Button
            variant='outline'
            disabled={!context.writable || action.isPending}
            onClick={() => action.mutate('captions')}
          >
            {t('Preview using this transcript as subtitles')}
          </Button>
          <label className='flex items-start gap-2 text-sm'>
            <Checkbox
              checked={reviewed}
              onCheckedChange={(value) => setReviewed(value === true)}
            />
            {t('I reviewed the selected speech and overlapping voices.')}
          </label>
          <Button
            variant='outline'
            disabled={
              !context.writable ||
              selected.length === 0 ||
              !reviewed ||
              action.isPending
            }
            onClick={() => action.mutate('preview')}
          >
            {t('Preview removing selected sentences')}
          </Button>
        </>
      )}
      {plan && (
        <div className='space-y-2 rounded-md border p-3' role='status'>
          <StudioTimelinePreview
            project={plan.document.next_document}
            getMedia={context.props.getMedia}
            compact
          />
          <p>
            {t('Resulting video duration')}:{' '}
            {plan.document.impact.output_seconds.toFixed(2)} s
          </p>
          <p className='text-muted-foreground text-sm'>
            {t(
              plan.document.request.action === 'transcript_captions'
                ? 'This plan updates subtitle text for the selected clip. Sound, video and music keep their timing.'
                : 'The selected clip is split around these sentences. Captions and graphics follow the edit; music stays on the project timeline. The original media and version history are preserved.'
            )}
          </p>
          <div className='flex flex-wrap gap-2'>
            <Button
              disabled={!context.writable || action.isPending}
              onClick={() => action.mutate('apply')}
            >
              {t('Apply this edit')}
            </Button>
            <Button variant='outline' onClick={() => setPlan(undefined)}>
              {t('Keep current edit')}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
