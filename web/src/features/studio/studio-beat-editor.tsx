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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { Textarea } from '@/components/ui/textarea'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import { studioProjectSchema, type StudioProject } from './local-projects'
import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import { StudioMediaThumbnail } from './studio-media-thumbnail'
import { studioProjectTimeline } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { applyStudioEditWithUndo } from './studio-timeline-history'
import { StudioTimelinePreview } from './studio-timeline-preview'

type SongSection = { start: number; end: number; label: string }
type BeatAnalysis = {
  id: string
  created_at?: string
  document: {
    source_media_id: string
    source_digest: string
    analysis: {
      kind: string
      parent_id?: string
      start: number
      end: number
      beat_times?: number[]
      sections?: SongSection[]
    }
  }
}
type BeatPlan = {
  id: string
  revision: number
  state: string
  document: {
    analysis_id: string
    correction_id?: string
    request: { pace: string; direction: string; start: number; end: number }
    next_document: unknown
    impact: {
      duration: number
      cuts: {
        time: number
        nearest_beat_distance: number
        protected: boolean
      }[]
      warnings: string[]
    }
  }
}

function parseStudioBeatEdits(
  beatsText: string,
  sectionsText: string,
  start: number,
  end: number,
  messages: { beats: string; sectionFormat: string; sectionBounds: string }
) {
  const beats = beatsText
    .split(/[,，\s]+/)
    .filter(Boolean)
    .map(Number)
  if (
    beats.length < 2 ||
    beats.length > 20000 ||
    beats.some(
      (value, index) =>
        !Number.isFinite(value) ||
        value < start ||
        value > end ||
        (index > 0 && value <= beats[index - 1])
    )
  ) {
    throw new Error(messages.beats)
  }
  const starts = sectionsText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d+(?:\.\d+)?)\s+(.+)$/.exec(line)
      if (!match) {
        throw new Error(messages.sectionFormat)
      }
      return { start: Number(match[1]), label: match[2].trim() }
    })
  const sections = starts.map((section, index) => ({
    ...section,
    end: starts[index + 1]?.start ?? end,
  }))
  if (
    sections.length > 1000 ||
    sections.some(
      (section, index) =>
        !Number.isFinite(section.start) ||
        section.start < start ||
        section.end > end ||
        section.end <= section.start ||
        section.label.length > 100 ||
        (index > 0 && section.start < sections[index - 1].end)
    )
  ) {
    throw new Error(messages.sectionBounds)
  }
  return { beat_times: beats, sections }
}

function studioBeatPreviewProject(
  document: unknown
): StudioProject | undefined {
  const parsed = studioProjectSchema.safeParse(document)
  if (!parsed.success) return undefined
  return {
    ...parsed.data,
    nodes: parsed.data.nodes.map((node) => ({
      ...node,
      data: { ...node.data, seconds: node.data.seconds ?? undefined },
    })),
  }
}

export function StudioBeatEditor(props: { analysisId: string }) {
  const { t, i18n } = useTranslation()
  const context = useStudioProductionContext()
  const client = useQueryClient()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const translate = useRef(t)
  translate.current = t
  const paceLabels: Record<string, string> = {
    slow: t('Relaxed pacing'),
    normal: t('Balanced pacing'),
    tight: t('Energetic pacing'),
  }
  const directionLabels: Record<string, string> = {
    narrative: t('Narrative: preserve story order'),
    concept: t('Visual concept: alternate available angles'),
    performance: t('Performance: edit existing performance footage'),
  }
  const validationMessages = {
    beats: t(
      'Beats must be increasing source times inside the analyzed interval.'
    ),
    sectionFormat: t(
      'Write one section per line: source seconds, then its name.'
    ),
    sectionBounds: t('Sections must be ordered inside the analyzed interval.'),
  }
  const [beats, setBeats] = useState('')
  const [sections, setSections] = useState('')
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(30)
  const [direction, setDirection] = useState('narrative')
  const [reviewed, setReviewed] = useState(false)
  const [lyrics, setLyrics] = useState(false)
  const [correction, setCorrection] = useState('')
  const [drafts, setDrafts] = useState<BeatPlan[]>([])
  const [selected, setSelected] = useState('')
  const [watched, setWatched] = useState(false)
  const [failures, setFailures] = useState<string[]>([])
  const [structureEdited, setStructureEdited] = useState(false)
  const [historyChoice, setHistoryChoice] = useState('original')
  const [historyError, setHistoryError] = useState('')
  const initialized = useRef('')
  const edits = useRef(0)
  const analysis = useQuery({
    queryKey: [
      'studio-beat-analysis',
      context.props.project.id,
      props.analysisId,
    ],
    queryFn: () =>
      studioCloudRequest<BeatAnalysis>(
        `${context.path}/analyses/${encodeURIComponent(props.analysisId)}`
      ),
    enabled: !!props.analysisId,
  })
  const saved = useQuery({
    queryKey: ['studio-beat-plans', context.props.project.id],
    queryFn: () => studioCloudRequest<BeatPlan[]>(`${context.path}/beat-plans`),
  })
  // List immutable pointers only. Load a correction artifact when the user
  // chooses it, rather than reading every historical beat array in advance.
  const history = useQuery({
    queryKey: ['studio-beat-history', context.props.project.id],
    queryFn: () =>
      studioCloudRequest<BeatAnalysis[]>(`${context.path}/analyses`),
  })
  const measured = analysis.data?.document.analysis
  const scope = `${context.props.project.id}:${props.analysisId}:${analysis.data?.document.source_media_id || ''}:${analysis.data?.document.source_digest || ''}`
  const activeScope = useRef(scope)
  activeScope.current = scope
  const corrections = (history.data || []).filter(
    (item) =>
      item.document.analysis.kind === 'beat_correction' &&
      item.document.source_media_id ===
        analysis.data?.document.source_media_id &&
      item.document.source_digest === analysis.data?.document.source_digest
  )
  const structureText = useCallback(
    (source: BeatAnalysis['document']['analysis']) =>
      (source.sections || [])
        .map(
          (section, index) =>
            `${section.start} ${section.label === 'section_candidate' ? `${translate.current('Section')} ${index + 1}` : section.label}`
        )
        .join('\n'),
    []
  )
  useEffect(() => {
    const source = measured
    if (!source || initialized.current === scope) return
    initialized.current = scope
    edits.current++
    setBeats((source.beat_times || []).join(', '))
    setSections(structureText(source))
    setStart(source.start)
    setEnd(Math.min(source.end, source.start + 30))
    setCorrection('')
    setDrafts([])
    setSelected('')
    setReviewed(false)
    setFailures([])
    setStructureEdited(false)
    setHistoryChoice('original')
    setHistoryError('')
  }, [measured, scope, structureText])
  const restore = useMutation({
    mutationFn: async (id: string) => {
      const expected = analysis.data
      if (!expected) return
      const version = ++edits.current
      const expectedScope = scope
      setHistoryError('')
      setReviewed(false)
      const result =
        id === 'original'
          ? expected
          : await studioCloudRequest<BeatAnalysis>(
              `${context.path}/analyses/${encodeURIComponent(id)}`
            )
      if (activeScope.current !== expectedScope || edits.current !== version) {
        return
      }
      if (
        result.document.source_media_id !== expected.document.source_media_id ||
        result.document.source_digest !== expected.document.source_digest ||
        (id !== 'original' &&
          (result.document.analysis.kind !== 'beat_correction' ||
            result.document.analysis.parent_id !== props.analysisId ||
            result.document.analysis.start !==
              expected.document.analysis.start ||
            result.document.analysis.end !== expected.document.analysis.end))
      ) {
        throw new Error(
          t('This saved structure belongs to another analysis or source.')
        )
      }
      setBeats((result.document.analysis.beat_times || []).join(', '))
      setSections(structureText(result.document.analysis))
      setHistoryChoice(id)
      setCorrection(id === 'original' ? '' : id)
      setReviewed(false)
      setStructureEdited(false)
      setDrafts([])
      setSelected('')
      setFailures([])
    },
    onError: (error) => setHistoryError(error.message),
  })
  useEffect(() => {
    setSelected('')
    setDrafts([])
  }, [start, end, direction, lyrics, context.props.project.updatedAt])
  useEffect(() => setReviewed(false), [start, end])
  const visible = drafts.length
    ? drafts
    : (saved.data || []).filter(
        (item) =>
          !structureEdited &&
          item.document.analysis_id === props.analysisId &&
          item.document.request.direction === direction &&
          Math.abs(item.document.request.start - start) < 0.001 &&
          Math.abs(item.document.request.end - end) < 0.001 &&
          (!correction || item.document.correction_id === correction)
      )
  const plan = visible.find((item) => item.id === selected)
  useEffect(() => setWatched(false), [selected])
  const preview = useMemo(() => {
    return studioBeatPreviewProject(plan?.document.next_document)
  }, [plan])
  const action = useMutation({
    mutationFn: async (operation: 'correct' | 'prepare' | 'apply') => {
      if (!context.writable) throw new Error(t('This project is read only.'))
      if (operation === 'apply') {
        if (!plan || !watched) {
          throw new Error(t('Choose and preview a pacing draft first.'))
        }
        await applyStudioEditWithUndo(
          context.path,
          plan,
          context.timelineHistory
        )
        await context.props.onRefresh()
        setDrafts([])
        setSelected('')
        await client.invalidateQueries({
          queryKey: ['studio-beat-plans', context.props.project.id],
        })
        return
      }
      const editVersion = edits.current
      const editScope = scope
      const source = analysis.data?.document.analysis
      if (!source || !reviewed) {
        throw new Error(
          t('Listen to the music and confirm its beats and sections first.')
        )
      }
      await context.props.onSave()
      const current = await studioCloudRequest<StudioCloudProject>(context.path)
      if (operation === 'correct') {
        const changes = parseStudioBeatEdits(
          beats,
          sections,
          source.start,
          source.end,
          validationMessages
        )
        const record = await studioCloudRequest<{ id: string }>(
          `${context.path}/beat-plans`,
          'POST',
          {
            action: 'correct',
            request_id: crypto.randomUUID(),
            analysis_id: props.analysisId,
            ...changes,
            review_confirmed: true,
          }
        )
        await client.invalidateQueries({
          queryKey: ['studio-beat-history', context.props.project.id],
        })
        if (
          activeScope.current !== editScope ||
          edits.current !== editVersion
        ) {
          return
        }
        setCorrection(record.id)
        setHistoryChoice(record.id)
        setStructureEdited(false)
        return
      }
      const changes = parseStudioBeatEdits(
        beats,
        sections,
        source.start,
        source.end,
        validationMessages
      )
      // Persist reviewed values before producing plans, even when unchanged.
      const reviewedEvidence = await studioCloudRequest<{ id: string }>(
        `${context.path}/beat-plans`,
        'POST',
        {
          action: 'correct',
          request_id: crypto.randomUUID(),
          analysis_id: props.analysisId,
          ...changes,
          review_confirmed: true,
        }
      )
      await client.invalidateQueries({
        queryKey: ['studio-beat-history', context.props.project.id],
      })
      if (activeScope.current !== editScope || edits.current !== editVersion) {
        return
      }
      setCorrection(reviewedEvidence.id)
      setHistoryChoice(reviewedEvidence.id)
      setStructureEdited(false)
      const prepared: BeatPlan[] = []
      const rejected: string[] = []
      for (const pace of ['slow', 'normal', 'tight']) {
        try {
          prepared.push(
            await studioCloudRequest<BeatPlan>(
              `${context.path}/beat-plans`,
              'POST',
              {
                action: 'prepare',
                request_id: crypto.randomUUID(),
                revision: current.revision,
                analysis_id: props.analysisId,
                correction_id: reviewedEvidence.id,
                pace,
                direction,
                start,
                end,
                review_confirmed: true,
                lyrics_follow_music: lyrics,
              }
            )
          )
        } catch (error) {
          rejected.push(
            `${paceLabels[pace]}: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }
      const signatures = new Set<string>()
      const distinct = prepared.filter((item) => {
        const project = studioBeatPreviewProject(item.document.next_document)
        if (!project) return false
        const signature = JSON.stringify(
          studioProjectTimeline(project).map((clip) => {
            const node = project.nodes.find((node) => node.id === clip.nodeId)
            const media = clip.takeId
              ? node?.data.takes?.find((take) => take.id === clip.takeId)
                  ?.mediaId
              : node?.data.mediaId
            return [media, clip.trimStart, clip.trimEnd, clip.speed]
          })
        )
        if (signatures.has(signature)) return false
        signatures.add(signature)
        return true
      })
      if (distinct.length < prepared.length) {
        rejected.push(
          t(
            'Some pacing choices produce the same cut under the current footage and protection constraints. Only distinct drafts are shown.'
          )
        )
      }
      setDrafts(distinct)
      setFailures(rejected)
      setSelected('')
      await client.invalidateQueries({
        queryKey: ['studio-beat-plans', context.props.project.id],
      })
      if (!prepared.length) {
        throw new Error(
          t(
            'No pacing draft fits the protected clips and available footage. Shorten the music interval or add footage.'
          )
        )
      }
    },
    onError: (error) => handleServerError(error),
  })
  if (analysis.isPending) {
    return (
      <LoadingState inline message={t('Loading measured music structure')} />
    )
  }
  if (analysis.isError) {
    return (
      <ErrorState
        description={String(analysis.error)}
        onRetry={() => void analysis.refetch()}
      />
    )
  }
  const source = analysis.data?.document.analysis
  if (!source) return null
  let historyLabel = t('Saved correction')
  if (historyChoice === 'original') {
    historyLabel = t('Original measured structure')
  } else if (historyChoice === 'custom') {
    historyLabel = t('Unsaved changes')
  }
  return (
    <section
      className='flex flex-col gap-4'
      aria-label={t('Cut to music and make an MV')}
    >
      <h3 className='font-medium'>{t('Cut to music and make an MV')}</h3>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Keep this song, review its structure, choose a direction, compare pacing drafts, then finish in the same five creation steps. No new media are generated here.'
        )}
      </p>
      <StudioMediaThumbnail
        mediaId={analysis.data.document.source_media_id}
        kind='audio'
        title={t('Original analyzed music')}
        getMedia={context.props.getMedia}
      />
      <FieldGroup>
        <Field>
          <FieldLabel>{t('Music structure version')}</FieldLabel>
          <Select
            value={historyChoice}
            disabled={restore.isPending || history.isLoading}
            onValueChange={(value) => {
              if (value && value !== 'custom') restore.mutate(value)
            }}
          >
            <SelectTrigger aria-label={t('Music structure version')}>
              <SelectValue>{historyLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value='original'>
                  {t('Original measured structure')}
                </SelectItem>
                {historyChoice === 'custom' && (
                  <SelectItem value='custom' disabled>
                    {t('Unsaved changes')}
                  </SelectItem>
                )}
                {corrections.map((item, index) => (
                  <SelectItem key={item.id} value={item.id}>
                    {t('Saved correction')} {formatNumber(index + 1, locale)}
                    {item.created_at &&
                      ` · ${new Date(item.created_at).toLocaleString(locale)}`}
                  </SelectItem>
                ))}
                {correction &&
                  !corrections.some((item) => item.id === correction) && (
                    <SelectItem value={correction}>
                      {t('Saved correction')}
                    </SelectItem>
                  )}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Restore saved beats and section names, then listen and confirm before applying.'
            )}
          </p>
          {historyError && (
            <p role='alert' className='text-destructive text-sm'>
              {historyError}
            </p>
          )}
          {history.isError && (
            <div role='alert' className='flex items-center gap-2'>
              <span>{t('Could not load saved corrections.')}</span>
              <Button variant='outline' onClick={() => void history.refetch()}>
                {t('Retry')}
              </Button>
            </div>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor='studio-beat-times'>
            {t('Reviewed beat times in source seconds')}
          </FieldLabel>
          <Textarea
            id='studio-beat-times'
            value={beats}
            onChange={(event) => {
              edits.current++
              setHistoryChoice('custom')
              setBeats(event.target.value)
              setStructureEdited(true)
              setDrafts([])
              setCorrection('')
              setReviewed(false)
              setSelected('')
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor='studio-song-sections'>
            {t('Song sections: source seconds and name, one per line')}
          </FieldLabel>
          <Textarea
            id='studio-song-sections'
            value={sections}
            onChange={(event) => {
              edits.current++
              setHistoryChoice('custom')
              setSections(event.target.value)
              setStructureEdited(true)
              setDrafts([])
              setCorrection('')
              setReviewed(false)
              setSelected('')
            }}
          />
        </Field>
        <Field orientation='horizontal'>
          <Checkbox
            id='studio-beat-reviewed'
            checked={reviewed}
            onCheckedChange={(value) => setReviewed(value === true)}
          />
          <FieldLabel htmlFor='studio-beat-reviewed'>
            {t('I listened and reviewed these beat times and section names.')}
          </FieldLabel>
        </Field>
        <Button
          variant='outline'
          disabled={!context.writable || !reviewed || action.isPending}
          onClick={() => action.mutate('correct')}
        >
          {t('Save reviewed music structure')}
        </Button>
        {correction && (
          <p role='status' className='text-muted-foreground text-sm'>
            {t(
              'Reviewed structure saved. The original measurements remain available.'
            )}
          </p>
        )}
        <div className='grid gap-3 sm:grid-cols-2'>
          <Field>
            <FieldLabel htmlFor='studio-song-start'>
              {t('Song interval start')}
            </FieldLabel>
            <Input
              id='studio-song-start'
              type='number'
              min={source.start}
              max={source.end}
              step='.01'
              value={start}
              onChange={(event) => {
                edits.current++
                setStart(Number(event.target.value))
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='studio-song-end'>
              {t('Song interval end')}
            </FieldLabel>
            <Input
              id='studio-song-end'
              type='number'
              min={source.start}
              max={source.end}
              step='.01'
              value={end}
              onChange={(event) => {
                edits.current++
                setEnd(Number(event.target.value))
              }}
            />
          </Field>
        </div>
        <Button
          variant='outline'
          onClick={() => setEnd(Math.min(source.end, start + 30))}
        >
          {t('Use a 30-second section')}
        </Button>
        <Field>
          <FieldLabel>{t('Music video direction')}</FieldLabel>
          <Select
            value={direction}
            onValueChange={(value) => setDirection(value || 'narrative')}
          >
            <SelectTrigger aria-label={t('Music video direction')}>
              <SelectValue>{directionLabels[direction]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value='narrative'>
                  {t('Narrative: preserve story order')}
                </SelectItem>
                <SelectItem value='concept'>
                  {t('Visual concept: alternate available angles')}
                </SelectItem>
                <SelectItem value='performance'>
                  {t('Performance: edit existing performance footage')}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {direction === 'performance' && (
          <Alert>
            <AlertDescription>
              {t(
                'This edits existing performance footage. New lip-sync or VACE generation requires a supported media-production model and a separate confirmation; it is not native audio generation.'
              )}
              <Button
                variant='outline'
                onClick={() => context.setActiveTab('media')}
              >
                {t('Review performance production tools')}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <Field orientation='horizontal'>
          <Checkbox
            id='studio-song-lyrics'
            checked={lyrics}
            onCheckedChange={(value) => setLyrics(value === true)}
          />
          <FieldLabel htmlFor='studio-song-lyrics'>
            {t(
              'The existing global captions are song lyrics and should follow the original music clock.'
            )}
          </FieldLabel>
        </Field>
      </FieldGroup>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Locked clips, audible dialogue and separate voice tracks stay whole at their existing program times. Short footage is rejected instead of repeating a frame. All drafts keep the analyzed song and its selected source offset.'
        )}
      </p>
      <Button
        disabled={!context.writable || !reviewed || action.isPending}
        onClick={() => action.mutate('prepare')}
      >
        {t('Prepare three pacing drafts')}
      </Button>
      {failures.length > 0 && (
        <Alert>
          <AlertDescription>
            <ul>
              {failures.map((failure) => (
                <li key={failure}>{failure}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {visible.length > 0 && (
        <Select
          value={selected}
          onValueChange={(value) => setSelected(value || '')}
        >
          <SelectTrigger aria-label={t('Pacing draft')}>
            <SelectValue placeholder={t('Choose a pacing draft to preview')}>
              {plan &&
                `${paceLabels[plan.document.request.pace] || plan.document.request.pace} · ${formatNumber(plan.document.impact.duration, locale)} ${t('seconds')} · ${formatNumber(plan.document.impact.cuts.length, locale)} ${t('cuts')}`}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {visible.map((item, index) => (
                <SelectItem key={item.id} value={item.id}>
                  {paceLabels[item.document.request.pace] ||
                    item.document.request.pace}{' '}
                  · {formatNumber(item.document.impact.duration, locale)}{' '}
                  {t('seconds')} ·{' '}
                  {formatNumber(item.document.impact.cuts.length, locale)}{' '}
                  {t('cuts')} · {formatNumber(index + 1, locale)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
      {plan && preview && (
        <div className='flex flex-col gap-3'>
          <StudioTimelinePreview
            project={preview}
            getMedia={context.props.getMedia}
            onPreviewed={() => setWatched(true)}
            compact
          />
          {plan.document.impact.warnings.map((warning) => (
            <p className='text-muted-foreground text-sm' key={warning}>
              {t(warning)}
            </p>
          ))}
          <p className='text-muted-foreground text-sm'>
            {t(
              'Applying replaces the editable timeline after revision checking. Original media, chosen Takes, song and project history are preserved.'
            )}
          </p>
          <Button
            disabled={
              !context.writable ||
              !watched ||
              action.isPending ||
              plan.state === 'applied'
            }
            onClick={() => action.mutate('apply')}
          >
            {t('Apply this pacing draft')}
          </Button>
        </div>
      )}
    </section>
  )
}
