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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { toIntlLocale } from '@/i18n/languages'
import { handleServerError } from '@/lib/handle-server-error'

import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import { studioScreenplayDraftSchema } from './studio-creation'
import {
  studioProductionSchema,
  studioTimelineClipSchema,
} from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import { StudioReferenceAnalysisPanel } from './studio-reference-analysis-panel'
/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { applyStudioEditWithUndo } from './studio-timeline-history'
import { StudioTimelinePreview } from './studio-timeline-preview'
import {
  addStudioNode,
  createStudioProject,
  updateStudioNode,
} from './workspace'

type Boundary = {
  time: number
  original_time?: number
  origin?: string
  reason?: string
}
type Evidence = {
  kind: string
  parent_id?: string
  start: number
  end: number
  cuts: Boundary[]
  source_take_id?: string
}
type Analysis = {
  id: string
  document: {
    kind?: string
    source_media_id: string
    source_digest: string
    analysis: Evidence
  }
}
type OwnShot = {
  title: string
  text: string
  image_prompt: string
  video_prompt: string
  camera: string
  dialogue: string
}
type Plan = {
  id: string
  revision: number
  state: string
  document: {
    analysis_id: string
    correction_id?: string
    request: { subject: string }
    next_document: { production?: { screenplayDraft?: string } }
    impact: {
      shots: {
        scene_index: number
        source_start: number
        source_end: number
        draft_seconds: number
      }[]
      duration: number
    }
  }
}

function intervals(source: Evidence, cuts: Boundary[]) {
  const times = [
    source.start,
    ...cuts.map((cut) => cut.time).filter((time) => time < source.end),
    source.end,
  ]
  return times.slice(0, -1).map((start, index) => ({
    start,
    end: times[index + 1],
    key: `${start}:${times[index + 1]}`,
  }))
}

export function StudioSceneReview(props: { analysisId: string }) {
  const { t, i18n } = useTranslation()
  const context = useStudioProductionContext()
  const client = useQueryClient()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const timeFormat = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }),
    [locale]
  )
  const [cuts, setCuts] = useState<Boundary[]>([])
  const [correction, setCorrection] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [active, setActive] = useState(0)
  const [page, setPage] = useState(0)
  const [splitAt, setSplitAt] = useState('')
  const [subject, setSubject] = useState('')
  const [brand, setBrand] = useState('')
  const [goal, setGoal] = useState('')
  const [title, setTitle] = useState('')
  const [selection, setSelection] = useState<number[]>([])
  const [ownShots, setOwnShots] = useState<Record<string, Partial<OwnShot>>>({})
  const [plan, setPlan] = useState<Plan>()
  const [planReviewed, setPlanReviewed] = useState(false)
  const [replaceDraft, setReplaceDraft] = useState(false)
  const [semantic, setSemantic] = useState<{
    mediaId: string
    takeId?: string
    start: number
    end: number
  }>()
  const source = useQuery({
    queryKey: [
      'studio-scene-analysis',
      context.props.project.id,
      props.analysisId,
    ],
    queryFn: () =>
      studioCloudRequest<Analysis>(
        `${context.path}/analyses/${encodeURIComponent(props.analysisId)}`
      ),
    enabled: !!props.analysisId,
  })
  const saved = useQuery({
    queryKey: ['studio-scene-studies', context.props.project.id],
    queryFn: () =>
      studioCloudRequest<(Plan | Analysis)[]>(`${context.path}/scene-studies`),
  })
  const evidence = source.data?.document.analysis
  useEffect(() => {
    if (!evidence) return
    const initial = evidence.cuts
      .filter((cut) => cut.time < evidence.end)
      .map((cut) => ({ ...cut, original_time: cut.time }))
    setCuts(initial)
    setSelection(
      Array.from(
        { length: Math.min(100, initial.length + 1) },
        (_, index) => index
      )
    )
    setReviewed(false)
    setCorrection('')
    setPlan(undefined)
    setActive(0)
    setPage(0)
    setOwnShots({})
    setSemantic(undefined)
  }, [evidence])
  useEffect(() => {
    setPlan(undefined)
    setPlanReviewed(false)
  }, [
    context.props.project.updatedAt,
    subject,
    brand,
    goal,
    title,
    ownShots,
    cuts,
    selection,
    replaceDraft,
  ])
  const scenes = useMemo(
    () => (evidence ? intervals(evidence, cuts) : []),
    [evidence, cuts]
  )
  useEffect(() => {
    setActive((value) => Math.max(0, Math.min(value, scenes.length - 1)))
    setPage((value) =>
      Math.max(0, Math.min(value, Math.ceil(scenes.length / 20) - 1))
    )
  }, [scenes.length])
  const current = scenes[active]
  const preview = useMemo(() => {
    if (!source.data || !current || current.end <= current.start) {
      return undefined
    }
    const project = updateStudioNode(
      addStudioNode(
        createStudioProject(t('Source interval'), context.props.project.id),
        'video',
        'scene-source'
      ),
      'scene-source',
      {
        title: t('Original source'),
        sourceMode: 'upload',
        mediaId: source.data.document.source_media_id,
        status: 'completed',
      }
    )
    return {
      ...project,
      production: studioProductionSchema.parse({
        timelineEdited: true,
        timeline: [
          studioTimelineClipSchema.parse({
            id: 'scene-interval',
            nodeId: 'scene-source',
            trimStart: current.start,
            trimEnd: current.end,
          }),
        ],
      }),
    }
  }, [source.data, current, context.props.project.id, t])
  const getShot = (index: number): OwnShot => {
    const scene = scenes[index]
    const name = [subject.trim(), brand.trim()].filter(Boolean).join(' · ')
    let role = t(
      'Show one concrete action or detail of {{subject}} in your own setting.',
      { subject: name }
    )
    if (index === 0) {
      role = t('Introduce {{subject}} in your own setting.', { subject: name })
    } else if (index === scenes.length - 1) {
      role = t('End with {{subject}} and your own closing message.', {
        subject: name,
      })
    }
    return {
      title: t('My shot {{number}}', { number: index + 1 }),
      text: role,
      image_prompt: role,
      video_prompt: role,
      camera: '',
      dialogue: '',
      ...ownShots[scene?.key || ''],
    }
  }
  const own = current ? getShot(active) : undefined
  const parsedDraft = useMemo(() => {
    const raw = plan?.document.next_document.production?.screenplayDraft
    if (!raw) return undefined
    try {
      return studioScreenplayDraftSchema.parse(JSON.parse(raw))
    } catch {
      return undefined
    }
  }, [plan])
  const invalidateCuts = (values: Boundary[]) => {
    setCuts(values)
    setCorrection('')
    setReviewed(false)
    setSemantic(undefined)
    setPlan(undefined)
  }
  const validateCuts = () => {
    if (
      !evidence ||
      cuts.some(
        (cut, index) =>
          !Number.isFinite(cut.time) ||
          cut.time <= (index ? cuts[index - 1].time : evidence.start) ||
          cut.time >= evidence.end
      )
    ) {
      throw new Error(
        t(
          'Cut times must increase strictly inside the analyzed source interval.'
        )
      )
    }
  }
  const action = useMutation({
    mutationFn: async (operation: 'correct' | 'prepare' | 'apply') => {
      if (!context.writable) throw new Error(t('This project is read only.'))
      if (operation === 'apply') {
        if (!plan || !planReviewed || !parsedDraft) {
          throw new Error(
            t('Review the complete source-to-draft comparison before applying.')
          )
        }
        await applyStudioEditWithUndo(
          context.path,
          plan,
          context.timelineHistory
        )
        await context.props.onRefresh()
        context.setActiveTab('plan')
        setPlan(undefined)
        await client.invalidateQueries({
          queryKey: ['studio-scene-studies', context.props.project.id],
        })
        return
      }
      validateCuts()
      if (!reviewed) {
        throw new Error(
          t('Preview the source and confirm the scene boundaries first.')
        )
      }
      if (
        operation === 'prepare' &&
        (!subject.trim() ||
          !title.trim() ||
          !selection.length ||
          selection.length > 100)
      ) {
        throw new Error(
          t(
            'Name your own subject and draft, then select one to one hundred scenes.'
          )
        )
      }
      await context.props.onSave()
      const currentProject = await studioCloudRequest<StudioCloudProject>(
        context.path
      )
      let correctionId = correction
      if (!correctionId) {
        const record = await studioCloudRequest<{ id: string }>(
          `${context.path}/scene-studies`,
          'POST',
          {
            action: 'correct',
            request_id: crypto.randomUUID(),
            analysis_id: props.analysisId,
            cuts,
            review_confirmed: true,
          }
        )
        const corrected = await studioCloudRequest<Analysis>(
          `${context.path}/analyses/${encodeURIComponent(record.id)}`
        )
        // A manual boundary may move to a nearby source PTS. Keep its own edits
        // only when its exact interval survives; otherwise review that scene again.
        const changed = corrected.document.analysis.cuts.some(
          (cut, index) => Math.abs(cut.time - (cuts[index]?.time ?? -1)) > 1e-7
        )
        if (changed) setCuts(corrected.document.analysis.cuts)
        setCorrection(record.id)
        correctionId = record.id
        setReviewed(!changed)
        if (changed && operation === 'prepare') {
          throw new Error(
            t(
              'Manual boundaries were aligned to actual source frames. Review the updated intervals, then prepare again.'
            )
          )
        }
      }
      if (operation === 'correct') {
        await client.invalidateQueries({
          queryKey: ['studio-scene-studies', context.props.project.id],
        })
        return
      }
      setPlan(
        await studioCloudRequest<Plan>(
          `${context.path}/scene-studies`,
          'POST',
          {
            action: 'prepare',
            request_id: crypto.randomUUID(),
            revision: currentProject.revision,
            analysis_id: props.analysisId,
            correction_id: correctionId,
            subject: subject.trim(),
            brand: brand.trim(),
            goal: goal.trim(),
            title: title.trim(),
            shots: selection
              .filter((index) => scenes[index])
              .sort((a, b) => a - b)
              .map((index) => ({ scene_index: index, ...getShot(index) })),
            review_confirmed: true,
            replace_draft: replaceDraft,
          }
        )
      )
      setPlanReviewed(false)
    },
    onError: (error) => handleServerError(error),
  })
  const getMedia = useRef(context.props.getMedia)
  getMedia.current = context.props.getMedia
  const restore = useMutation({
    mutationFn: async (item: Plan | Analysis) => {
      if ('impact' in item.document) {
        setPlan(item as Plan)
        setPlanReviewed(false)
        return
      }
      const corrected = await studioCloudRequest<Analysis>(
        `${context.path}/analyses/${encodeURIComponent(item.id)}`
      )
      if (
        corrected.document.analysis.parent_id !== props.analysisId ||
        corrected.document.source_digest !== source.data?.document.source_digest
      ) {
        throw new Error(
          t(
            'These reviewed cuts belong to another measured interval. Choose a matching result.'
          )
        )
      }
      setCuts(corrected.document.analysis.cuts)
      setCorrection(item.id)
      setSelection(
        Array.from(
          {
            length: Math.min(100, corrected.document.analysis.cuts.length + 1),
          },
          (_, index) => index
        )
      )
      setReviewed(false)
      setPlan(undefined)
      setActive(0)
      setPage(0)
      setSemantic(undefined)
    },
    onError: (error) => handleServerError(error),
  })
  if (source.isPending) return <LoadingState />
  if (source.isError) {
    return (
      <ErrorState
        description={source.error.message}
        onRetry={() => void source.refetch()}
      />
    )
  }
  if (!evidence || evidence.kind !== 'scene_detect') {
    return <EmptyState title={t('Choose a completed scene-cut analysis.')} />
  }
  const pageCount = Math.max(1, Math.ceil(scenes.length / 20))
  const segmentTooLong =
    !current ||
    current.end - current.start > 60 ||
    current.end - current.start < 0.1
  const draftCount = (saved.data || []).filter(
    (item) =>
      'impact' in item.document &&
      item.document.analysis_id === props.analysisId
  ).length
  const history = (saved.data || [])
    .filter((item) =>
      'impact' in item.document
        ? item.document.analysis_id === props.analysisId
        : item.document.kind === 'scene_correction' &&
          item.document.source_media_id ===
            source.data?.document.source_media_id
    )
    .slice(0, 10)
  const stalePlan =
    !!plan &&
    !!context.record?.data &&
    context.record.data.revision !== plan.revision
  return (
    <section className='space-y-5' aria-label={t('Scene structure review')}>
      <div className='space-y-1'>
        <h3 className='font-medium'>
          {t('Learn the structure, create your own story')}
        </h3>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Review measured cuts, correct flashes or transitions, then write a draft for your own subject. Actions and dialogue remain unknown until reviewed; no model runs here.'
          )}
        </p>
      </div>
      <div className='grid gap-4 xl:grid-cols-2'>
        <div className='space-y-3'>
          {preview && (
            <StudioTimelinePreview
              key={current.key}
              project={preview}
              getMedia={(id) => getMedia.current(id)}
              compact
            />
          )}
          {current && (
            <p className='text-muted-foreground text-sm'>
              {t('Original interval')}: {timeFormat.format(current.start)}–
              {timeFormat.format(current.end)} {t('seconds')}
            </p>
          )}
          <Button
            variant='outline'
            disabled={!context.writable || segmentTooLong}
            onClick={() => {
              if (source.data && current) {
                setSemantic({
                  mediaId: source.data.document.source_media_id,
                  takeId: evidence.source_take_id,
                  start: current.start,
                  end: current.end,
                })
              }
            }}
          >
            {t('Choose this segment for semantic analysis')}
          </Button>
          {segmentTooLong && (
            <p className='text-muted-foreground text-sm'>
              {t(
                'Semantic analysis needs a selected interval of 0.1 to 60 seconds. Split this scene first; choosing a segment does not start a paid task.'
              )}
            </p>
          )}
        </div>
        <div className='space-y-2'>
          <p className='text-sm'>
            {t('Source scenes')}: {scenes.length} · {t('Selected for my draft')}
            : {selection.length}/100
          </p>
          <div className='max-h-80 space-y-1 overflow-y-auto rounded-md border p-2'>
            {scenes.slice(page * 20, (page + 1) * 20).map((scene, offset) => {
              const index = page * 20 + offset
              return (
                <div
                  key={scene.key}
                  className='flex flex-wrap items-center gap-2 rounded-md p-1'
                >
                  <Checkbox
                    aria-label={t('Include source scene {{number}}', {
                      number: index + 1,
                    })}
                    checked={selection.includes(index)}
                    disabled={
                      !context.writable ||
                      (!selection.includes(index) && selection.length >= 100)
                    }
                    onCheckedChange={(checked) =>
                      setSelection((current) =>
                        checked
                          ? [...current, index]
                          : current.filter((value) => value !== index)
                      )
                    }
                  />
                  <Button
                    size='sm'
                    variant={active === index ? 'secondary' : 'ghost'}
                    aria-pressed={active === index}
                    onClick={() => {
                      setActive(index)
                      setSplitAt(String((scene.start + scene.end) / 2))
                    }}
                  >
                    {t('Scene {{number}}', { number: index + 1 })} ·{' '}
                    {timeFormat.format(scene.start)}–
                    {timeFormat.format(scene.end)} s
                  </Button>
                  {index < cuts.length && (
                    <Button
                      size='sm'
                      variant='ghost'
                      disabled={!context.writable}
                      aria-label={t('Merge scene {{number}} with next', {
                        number: index + 1,
                      })}
                      onClick={() => {
                        invalidateCuts(
                          cuts.filter((_, cutIndex) => cutIndex !== index)
                        )
                        setActive(Math.min(index, scenes.length - 2))
                        setSelection((values) => [
                          ...new Set(
                            values.map((value) =>
                              value > index ? value - 1 : value
                            )
                          ),
                        ])
                      }}
                    >
                      {t('Merge next')}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
          {pageCount > 1 && (
            <div className='flex items-center gap-2'>
              <Button
                size='sm'
                variant='outline'
                disabled={page === 0}
                onClick={() => setPage((value) => value - 1)}
              >
                {t('Previous')}
              </Button>
              <span>
                {Math.min(page + 1, pageCount)}/{pageCount}
              </span>
              <Button
                size='sm'
                variant='outline'
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((value) => value + 1)}
              >
                {t('Next')}
              </Button>
            </div>
          )}
        </div>
      </div>
      <Collapsible className='space-y-3 rounded-md border p-3'>
        <CollapsibleTrigger render={<Button variant='outline' />}>
          {t('Correct cuts or split a scene')}
        </CollapsibleTrigger>
        <CollapsibleContent className='space-y-4 pt-3'>
          {current && (
            <div className='flex flex-wrap items-end gap-2'>
              <Field className='min-w-48 flex-1'>
                <FieldLabel>{t('Split at source seconds')}</FieldLabel>
                <Input
                  aria-label={t('Split at source seconds')}
                  type='number'
                  min={current.start}
                  max={current.end}
                  step='.001'
                  value={splitAt}
                  disabled={!context.writable}
                  onChange={(event) => setSplitAt(event.target.value)}
                />
              </Field>
              <Button
                variant='outline'
                disabled={!context.writable}
                onClick={() => {
                  const value = Number(splitAt)
                  if (
                    !splitAt.trim() ||
                    !Number.isFinite(value) ||
                    value <= current.start ||
                    value >= current.end
                  ) {
                    handleServerError(
                      new Error(
                        t(
                          'Choose a split time strictly inside the current source scene.'
                        )
                      )
                    )
                    return
                  }
                  invalidateCuts([
                    ...cuts.slice(0, active),
                    { time: value, reason: 'manual_split' },
                    ...cuts.slice(active),
                  ])
                  setSelection((values) =>
                    values.flatMap((index) =>
                      index === active && values.length < 100
                        ? [index, index + 1]
                        : [index > active ? index + 1 : index]
                    )
                  )
                }}
              >
                {t('Split current scene')}
              </Button>
            </div>
          )}
          {cuts.slice(page * 20, (page + 1) * 20).map((cut, offset) => {
            const index = page * 20 + offset
            const lower = index ? cuts[index - 1].time : evidence.start
            const upper = cuts[index + 1]?.time ?? evidence.end
            return (
              <Field key={index}>
                <FieldLabel>
                  {t('Boundary {{number}} in source seconds', {
                    number: index + 1,
                  })}
                </FieldLabel>
                <div className='grid items-center gap-3 sm:grid-cols-[1fr_9rem]'>
                  <Slider
                    aria-label={t('Drag boundary {{number}}', {
                      number: index + 1,
                    })}
                    min={lower + 0.001}
                    max={upper - 0.001}
                    step={0.001}
                    value={[cut.time]}
                    disabled={!context.writable}
                    onValueChange={(value) =>
                      invalidateCuts(
                        cuts.map((item, position) =>
                          position === index
                            ? {
                                ...item,
                                time: Array.isArray(value) ? value[0] : value,
                              }
                            : item
                        )
                      )
                    }
                  />
                  <Input
                    aria-label={t('Boundary {{number}} in source seconds', {
                      number: index + 1,
                    })}
                    type='number'
                    min={lower}
                    max={upper}
                    step='.001'
                    value={cut.time}
                    disabled={!context.writable}
                    onChange={(event) =>
                      invalidateCuts(
                        cuts.map((item, position) =>
                          position === index
                            ? { ...item, time: Number(event.target.value) }
                            : item
                        )
                      )
                    }
                  />
                </div>
              </Field>
            )
          })}
          <p className='text-muted-foreground text-xs'>
            {t(
              'Manual boundaries align to actual source frames when saved. The original measured cuts and reasons remain available in history.'
            )}
          </p>
        </CollapsibleContent>
      </Collapsible>
      <label className='flex items-center gap-2 text-sm'>
        <Checkbox
          checked={reviewed}
          disabled={!context.writable}
          onCheckedChange={(value) => setReviewed(value === true)}
        />
        {t('I previewed the source and reviewed these scene boundaries.')}
      </label>
      <Button
        variant='outline'
        disabled={!context.writable || !reviewed || action.isPending}
        onClick={() => action.mutate('correct')}
      >
        {t('Save reviewed scene boundaries')}
      </Button>
      {correction && (
        <p role='status' className='text-muted-foreground text-sm'>
          {t('Reviewed cuts saved; the measured original is preserved.')}
        </p>
      )}
      {semantic && (
        <StudioReferenceAnalysisPanel
          key={`${semantic.mediaId}:${semantic.start}:${semantic.end}`}
          initialSegment={semantic}
          openInitially
        />
      )}
      <FieldGroup className='rounded-md border p-3'>
        <h4 className='font-medium'>{t('My independent storyboard')}</h4>
        <p className='text-muted-foreground text-sm'>
          {t(
            'The starter text is an editable local template. Describe your own actions, setting and message before generating. Only timing and order come from the reference.'
          )}
        </p>
        <Field>
          <FieldLabel>{t('My subject')}</FieldLabel>
          <Textarea
            aria-label={t('My subject')}
            maxLength={2000}
            value={subject}
            disabled={!context.writable}
            onChange={(event) => setSubject(event.target.value)}
          />
        </Field>
        <div className='grid gap-3 sm:grid-cols-2'>
          <Field>
            <FieldLabel>{t('My brand (optional)')}</FieldLabel>
            <Input
              aria-label={t('My brand (optional)')}
              maxLength={200}
              value={brand}
              disabled={!context.writable}
              onChange={(event) => setBrand(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>{t('Storyboard draft title')}</FieldLabel>
            <Input
              aria-label={t('Storyboard draft title')}
              maxLength={200}
              value={title}
              disabled={!context.writable}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel>{t('My message or goal')}</FieldLabel>
          <Input
            aria-label={t('My message or goal')}
            maxLength={2000}
            value={goal}
            disabled={!context.writable}
            onChange={(event) => setGoal(event.target.value)}
          />
        </Field>
        {own && current && (
          <fieldset className='space-y-3 rounded-md border p-3'>
            <legend className='px-1 text-sm font-medium'>
              {t('My shot {{number}}', { number: active + 1 })} ·{' '}
              {t('Edit the selected scene above')}
            </legend>
            {(
              [
                { key: 'title', label: t('Shot title'), max: 200 },
                { key: 'text', label: t('My action'), max: 30000 },
                {
                  key: 'image_prompt',
                  label: t('My first-frame description'),
                  max: 30000,
                },
                {
                  key: 'video_prompt',
                  label: t('My movement description'),
                  max: 30000,
                },
                { key: 'camera', label: t('My camera choice'), max: 2000 },
                {
                  key: 'dialogue',
                  label: t('My dialogue or narration'),
                  max: 30000,
                },
              ] as const
            ).map((field) => (
              <Field key={field.key}>
                <FieldLabel>{field.label}</FieldLabel>
                <Textarea
                  aria-label={field.label}
                  maxLength={field.max}
                  disabled={!context.writable}
                  value={own[field.key]}
                  onChange={(event) =>
                    setOwnShots((values) => ({
                      ...values,
                      [current.key]: {
                        ...values[current.key],
                        [field.key]: event.target.value,
                      },
                    }))
                  }
                />
              </Field>
            ))}
          </fieldset>
        )}
        {context.props.project.production?.screenplayDraft && (
          <label className='flex items-center gap-2 text-sm'>
            <Checkbox
              checked={replaceDraft}
              disabled={!context.writable}
              onCheckedChange={(value) => setReplaceDraft(value === true)}
            />
            {t('Replace my existing unsent storyboard draft after preview.')}
          </label>
        )}
        <Button
          disabled={
            !context.writable ||
            !reviewed ||
            !subject.trim() ||
            !title.trim() ||
            !selection.length ||
            action.isPending ||
            (!!context.props.project.production?.screenplayDraft &&
              !replaceDraft)
          }
          onClick={() => action.mutate('prepare')}
        >
          {t('Preview my adapted storyboard')}
        </Button>
      </FieldGroup>
      {plan && parsedDraft && (
        <div
          className='space-y-4 rounded-md border p-3'
          aria-label={t('Source-to-draft comparison')}
        >
          <p className='font-medium'>
            {parsedDraft.title} · {plan.document.impact.duration} {t('seconds')}
          </p>
          {parsedDraft.shots.map((shot, index) => {
            const compare = plan.document.impact.shots[index]
            return (
              <div key={shot.id} className='space-y-1 border-b pb-3'>
                <p className='text-muted-foreground text-xs'>
                  {t('Original interval')}: {compare.source_start}–
                  {compare.source_end} s → {shot.seconds} s
                </p>
                <p className='font-medium'>{shot.title}</p>
                <p className='text-sm whitespace-pre-wrap'>{shot.text}</p>
                <Collapsible>
                  <CollapsibleTrigger
                    render={<Button size='sm' variant='ghost' />}
                  >
                    {t('Review prompts and dialogue')}
                  </CollapsibleTrigger>
                  <CollapsibleContent className='space-y-1 text-sm'>
                    <p>{shot.imagePrompt}</p>
                    <p>{shot.videoPrompt}</p>
                    <p>{shot.camera}</p>
                    <p>{shot.dialogue}</p>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )
          })}
          <Alert>
            <AlertDescription>
              {t(
                'Applying saves an editable storyboard draft in this project. Existing footage and timeline stay available. Generation requires a separate review and confirmation.'
              )}
            </AlertDescription>
          </Alert>
          <label className='flex items-center gap-2 text-sm'>
            <Checkbox
              checked={planReviewed}
              disabled={!context.writable}
              onCheckedChange={(value) => setPlanReviewed(value === true)}
            />
            {t('I reviewed every adapted shot and the source-to-draft timing.')}
          </label>
          <div className='flex flex-wrap gap-2'>
            <Button
              disabled={
                !context.writable ||
                !planReviewed ||
                action.isPending ||
                stalePlan ||
                plan.state === 'applied'
              }
              onClick={() => action.mutate('apply')}
            >
              {t('Apply my storyboard draft')}
            </Button>
            <Button variant='outline' onClick={() => setPlan(undefined)}>
              {t('Keep current draft')}
            </Button>
          </div>
        </div>
      )}
      {stalePlan && (
        <p role='status' className='text-muted-foreground text-sm'>
          {t(
            'The project changed after this preview. Prepare a new preview before applying.'
          )}
        </p>
      )}
      {history.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger render={<Button variant='outline' />}>
            {t('Saved scene-review history')}
          </CollapsibleTrigger>
          <CollapsibleContent className='flex flex-wrap gap-2 pt-3'>
            {history.map((item, index) => (
              <Button
                key={item.id}
                size='sm'
                variant='outline'
                disabled={restore.isPending}
                onClick={() => restore.mutate(item)}
              >
                {'impact' in item.document
                  ? t('Storyboard preview {{number}}', { number: index + 1 })
                  : t('Reviewed cuts {{number}}', { number: index + 1 })}
              </Button>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
      {draftCount > 0 && (
        <p className='text-muted-foreground text-xs'>
          {t('Saved adaptation previews')}: {draftCount}
        </p>
      )}
      {saved.isError && (
        <ErrorState
          description={saved.error.message}
          onRetry={() => void saved.refetch()}
        />
      )}
    </section>
  )
}
