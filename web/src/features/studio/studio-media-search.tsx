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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { EmptyState } from '@/components/empty-state'
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
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import { studioProjectSchema, type StudioProject } from './local-projects'
import {
  studioCloudRequest,
  type StudioCloudJob,
  type StudioCloudProject,
} from './studio-cloud'
import {
  studioProductionSchema,
  studioProjectTimeline,
  studioTimelineClipSchema,
} from './studio-production'
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

export type StudioMediaSearchHit = {
  id: string
  index_id: string
  source_media_id: string
  source_digest: string
  source_take_id?: string
  source_duration: number
  node_id: string
  title: string
  description: string
  start: number
  end: number
  matched: string[]
  model: string
  review_required: boolean
}
type SearchResponse = {
  hits: StudioMediaSearchHit[]
  total: number
  next_offset?: number
  stale_records: number
  truncated: boolean
  ranking: string
}
type EditPlan = {
  id: string
  revision: number
  document: {
    impact: {
      source_start: number
      source_end: number
      replace_clip_id: string
    }
  }
}
const searchSchema = z.object({ query: z.string().max(200) })

export function StudioMediaSearch(props: {
  project: StudioProject
  getMedia: (id: string) => Promise<Blob | null>
  readOnly: boolean
  onUpdate: (project: StudioProject) => void
  onSave?: () => Promise<void>
  timelineHistory?: import('./studio-timeline-history').StudioTimelineHistory
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const client = useQueryClient()
  const path = `/projects/${encodeURIComponent(props.project.id)}`
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [jobId, setJobId] = useState('')
  const [preview, setPreview] = useState<StudioMediaSearchHit>()
  const [reviewed, setReviewed] = useState(false)
  const [replaceClip, setReplaceClip] = useState('append')
  const [plan, setPlan] = useState<EditPlan>()
  const form = useForm({
    resolver: zodResolver(searchSchema),
    defaultValues: { query: '' },
  })
  const search = useQuery({
    queryKey: [
      'studio-media-search',
      props.project.id,
      query,
      offset,
      props.project.updatedAt,
    ],
    queryFn: () =>
      studioCloudRequest<SearchResponse>(
        `${path}/media-index?query=${encodeURIComponent(query)}&limit=20&offset=${offset}`
      ),
  })
  const jobs = useQuery({
    queryKey: ['studio-cloud-jobs', props.project.id],
    queryFn: () => studioCloudRequest<StudioCloudJob[]>(`${path}/jobs`),
  })
  const available =
    jobs.data?.filter(
      (job) => job.kind === 'analyze' && job.status === 'succeeded'
    ) || []
  const analysisOptions = available.map((job, index) => {
    const result =
      job.result && typeof job.result === 'object'
        ? (job.result as { node_id?: string })
        : undefined
    const note = props.project.nodes.find((node) => node.id === result?.node_id)
    const sourceMediaId = note?.data.derivedFrom?.mediaId
    const source = sourceMediaId
      ? props.project.nodes.find((node) => node.data.mediaId === sourceMediaId)
      : undefined
    return {
      value: job.id,
      label: `${source?.data.title || t('Visual analysis')} · ${formatNumber(index + 1, locale)}`,
    }
  })
  const clips = studioProjectTimeline(props.project)
  useEffect(() => {
    setReviewed(false)
    setPlan(undefined)
  }, [preview?.id, replaceClip, props.project.updatedAt])
  useEffect(() => {
    setPreview(undefined)
    setJobId('')
    setOffset(0)
    setPlan(undefined)
  }, [props.project.id])
  const previewProject = useMemo(() => {
    if (!preview) return undefined
    let project = addStudioNode(
      createStudioProject(
        preview.title || t('Source interval'),
        props.project.id
      ),
      'video',
      'search-preview'
    )
    project = updateStudioNode(project, 'search-preview', {
      title: preview.title,
      mediaId: preview.source_media_id,
      sourceMode: 'upload',
      status: 'completed',
    })
    return {
      ...project,
      production: studioProductionSchema.parse({
        timelineEdited: true,
        timeline: [
          studioTimelineClipSchema.parse({
            id: 'search-preview-clip',
            nodeId: 'search-preview',
            trimStart: preview.start,
            trimEnd: preview.end,
          }),
        ],
      }),
    }
  }, [preview, props.project.id, t])
  const action = useMutation({
    mutationFn: async (operation: 'index' | 'prepare' | 'apply') => {
      if (props.readOnly) throw new Error(t('This project is read only.'))
      if (operation === 'index') {
        if (!jobId) {
          throw new Error(t('Choose a completed visual analysis first.'))
        }
        await studioCloudRequest(`${path}/media-index`, 'POST', {
          job_id: jobId,
        })
        await client.invalidateQueries({
          queryKey: ['studio-media-search', props.project.id],
        })
        return
      }
      if (operation === 'prepare') {
        if (!preview || !reviewed) {
          throw new Error(
            t('Preview and confirm the actual source interval first.')
          )
        }
        if (props.onSave) await props.onSave()
        const current = await studioCloudRequest<StudioCloudProject>(path)
        if (
          !props.onSave &&
          current.document.updatedAt !== props.project.updatedAt
        ) {
          throw new Error(
            t('Save or refresh this project before preparing a change.')
          )
        }
        const prepared = await studioCloudRequest<EditPlan>(
          `${path}/media-index`,
          'POST',
          {
            action: 'prepare',
            request_id: crypto.randomUUID(),
            revision: current.revision,
            index_id: preview.index_id,
            entry_id: preview.id,
            replace_clip_id: replaceClip === 'append' ? '' : replaceClip,
            review_confirmed: reviewed,
          }
        )
        setPlan(prepared)
        return
      }
      if (!plan) throw new Error(t('Prepare the edit plan first.'))
      const result = await applyStudioEditWithUndo(
        path,
        plan,
        props.timelineHistory
      )
      const next = studioProjectSchema.parse(result.project.document)
      props.onUpdate({
        ...next,
        nodes: next.nodes.map((node) => ({
          ...node,
          data: { ...node.data, seconds: node.data.seconds ?? undefined },
        })),
      })
      setPlan(undefined)
      setReviewed(false)
      await client.invalidateQueries({ queryKey: ['studio-cloud-projects'] })
    },
    onError: (error) => handleServerError(error),
  })
  return (
    <section
      className='flex flex-col gap-4'
      aria-label={t('Find footage by its content')}
    >
      <h3 className='font-medium'>{t('Find footage by its content')}</h3>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Search your own analyzed footage, preview the exact source interval, then use it as B-roll. Descriptions may be incomplete because the model sees sampled frames.'
        )}
      </p>
      <form
        onSubmit={form.handleSubmit((values) => {
          setQuery(values.query.trim())
          setOffset(0)
        })}
      >
        <FieldGroup className='flex-row items-end'>
          <Field data-invalid={!!form.formState.errors.query}>
            <FieldLabel htmlFor='studio-media-content-query'>
              {t('Describe the footage you need')}
            </FieldLabel>
            <Input
              id='studio-media-content-query'
              maxLength={200}
              aria-invalid={!!form.formState.errors.query}
              placeholder={t('For example: rainy street or coffee close-up')}
              {...form.register('query')}
            />
          </Field>
          <Button type='submit'>{t('Search footage')}</Button>
        </FieldGroup>
      </form>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Ranking uses description words and a limited Chinese/English dictionary, not an embedding similarity score.'
        )}
      </p>
      <FieldGroup className='sm:flex-row sm:items-end'>
        <Field>
          <FieldLabel>{t('Completed visual analysis')}</FieldLabel>
          <Select
            value={jobId}
            items={analysisOptions}
            onValueChange={(value) => setJobId(value || '')}
          >
            <SelectTrigger aria-label={t('Completed visual analysis')}>
              <SelectValue placeholder={t('Choose an analysis')} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {analysisOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Button
          variant='outline'
          disabled={props.readOnly || !jobId || action.isPending}
          onClick={() => action.mutate('index')}
        >
          {t('Index this analysis')}
        </Button>
      </FieldGroup>
      {!available.length && (
        <p className='text-muted-foreground text-sm'>
          {t(
            'Analyze one of your videos in Reference analysis first. Only completed model receipts can enter this index; indexing does not call a model.'
          )}
        </p>
      )}
      {search.isPending && (
        <LoadingState inline message={t('Searching project footage')} />
      )}
      {search.isError && (
        <ErrorState
          description={String(search.error)}
          onRetry={() => void search.refetch()}
        />
      )}
      {search.data && !search.data.hits.length && (
        <EmptyState
          title={t('No matching footage')}
          description={t(
            'Try fewer words, or index another completed visual analysis. No outside project media are searched.'
          )}
        />
      )}
      {search.data?.stale_records ? (
        <Alert>
          <AlertDescription>
            {t(
              'Some indexed sources were removed or changed and are excluded. Analyze the current source again to rebuild its descriptions.'
            )}
          </AlertDescription>
        </Alert>
      ) : null}
      {search.data?.truncated && (
        <Alert>
          <AlertDescription>
            {t(
              'This search is limited to the latest 500 analysis records. Narrow the project library before relying on complete coverage.'
            )}
          </AlertDescription>
        </Alert>
      )}
      <ul className='flex flex-col gap-3'>
        {search.data?.hits.map((hit) => (
          <li
            key={`${hit.index_id}-${hit.id}`}
            className='flex flex-col gap-2 border-b pb-3'
          >
            <p className='font-medium'>{hit.title}</p>
            <p className='text-muted-foreground text-xs'>
              {formatNumber(hit.start, locale)}–{formatNumber(hit.end, locale)}{' '}
              {t('seconds')} · {hit.model}
            </p>
            <p className='text-sm whitespace-pre-wrap'>{hit.description}</p>
            <p className='text-muted-foreground text-xs'>
              {t('Matched words')}:{' '}
              {hit.matched.join(', ') || t('Browse result')}
            </p>
            <Button
              className='self-start'
              variant='outline'
              onClick={() => setPreview(hit)}
            >
              {t('Preview source interval')}
            </Button>
          </li>
        ))}
      </ul>
      <div className='flex flex-wrap gap-2'>
        {offset > 0 && (
          <Button
            variant='outline'
            onClick={() => setOffset(Math.max(0, offset - 20))}
          >
            {t('Previous')}
          </Button>
        )}
        {search.data?.next_offset != null && (
          <Button
            variant='outline'
            onClick={() => {
              const next = search.data?.next_offset
              if (next != null) setOffset(next)
            }}
          >
            {t('Next')}
          </Button>
        )}
      </div>
      {preview && previewProject && (
        <div className='flex flex-col gap-3 rounded-lg border p-3'>
          <p className='font-medium'>
            {t('Review candidate')}: {preview.title}
          </p>
          <StudioTimelinePreview
            project={previewProject}
            getMedia={props.getMedia}
            compact
          />
          <Field orientation='horizontal'>
            <Checkbox
              id='studio-media-candidate-reviewed'
              checked={reviewed}
              onCheckedChange={(value) => setReviewed(value === true)}
            />
            <FieldLabel htmlFor='studio-media-candidate-reviewed'>
              {t('I checked this source interval and its visual content.')}
            </FieldLabel>
          </Field>
          <Select
            value={replaceClip}
            onValueChange={(value) => setReplaceClip(value || 'append')}
          >
            <SelectTrigger aria-label={t('Where to use this footage')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value='append'>
                  {t('Append to the film')}
                </SelectItem>
                {clips.map((clip, index) => (
                  <SelectItem key={clip.id} value={clip.id}>
                    {t('Replace clip')} {formatNumber(index + 1, locale)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Replacement keeps the existing duration, captions, dialogue and music. A source that is too short is rejected. The original media remain available.'
            )}
          </p>
          <Button
            disabled={props.readOnly || !reviewed || action.isPending}
            onClick={() => action.mutate('prepare')}
          >
            {t('Preview B-roll edit plan')}
          </Button>
          {plan && (
            <Alert>
              <AlertDescription className='flex flex-col gap-2'>
                {t(
                  'The plan is ready. Your film changes only after confirmation.'
                )}
                <Button
                  disabled={props.readOnly || action.isPending}
                  onClick={() => action.mutate('apply')}
                >
                  {t('Apply B-roll edit plan')}
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </section>
  )
}
