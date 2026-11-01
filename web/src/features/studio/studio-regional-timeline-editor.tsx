/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type { StudioProject } from './local-projects'
import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import type { StudioSeriesVersion } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import { studioSeriesEditingProject } from './studio-series'
import { StudioTimelinePreview } from './studio-timeline-preview'

type Plan = {
  id: string
  revision: number
  document: { next_document: StudioProject; impact: { output_seconds: number } }
}

export function StudioRegionalTimelineEditor(options: {
  version: StudioSeriesVersion
}) {
  const { t } = useTranslation()
  const context = useStudioProductionContext()
  const version = options.version
  const [clipId, setClipId] = useState(version.timeline[0]?.id || '')
  const clip =
    version.timeline.find((item) => item.id === clipId) || version.timeline[0]
  const [draft, setDraft] = useState({
    start: String(clip?.trimStart || 0),
    end: String(clip?.trimEnd ?? ''),
    speed: String(clip?.speed || 1),
    take: clip?.takeId || '',
  })
  const [plan, setPlan] = useState<Plan>()
  const [watched, setWatched] = useState(false)
  const [error, setError] = useState('')
  const [undo, setUndo] = useState<{
    before: StudioSeriesVersion
    after: StudioSeriesVersion
  }>()
  const latest = useRef(context.props.project)
  latest.current = context.props.project
  const original = context.props.project.nodes.find(
    (node) => node.id === clip?.nodeId
  )
  const takes =
    original?.data.takes?.filter(
      (take) => take.status === 'completed' && take.mediaId
    ) || []
  const numberStart = Number(draft.start),
    numberEnd = Number(draft.end),
    numberSpeed = Number(draft.speed)
  const valid =
    !!clip &&
    draft.start.trim() !== '' &&
    draft.end.trim() !== '' &&
    draft.speed.trim() !== '' &&
    [numberStart, numberEnd, numberSpeed].every(Number.isFinite) &&
    numberStart >= 0 &&
    numberEnd > numberStart &&
    numberEnd <= 3600 &&
    numberSpeed >= 0.25 &&
    numberSpeed <= 4
  const staged = studioSeriesEditingProject(context.props.project, version)
  const proposedVersion =
    plan?.document.next_document.production?.regionalVersions.find(
      (item) => item.id === version.id
    )
  const proposed =
    plan &&
    proposedVersion &&
    studioSeriesEditingProject(plan.document.next_document, proposedVersion)
  const resetPlan = () => {
    setPlan(undefined)
    setWatched(false)
    setError('')
  }
  const updateDraft = (patch: Partial<typeof draft>) => {
    setDraft({ ...draft, ...patch })
    resetPlan()
  }
  return (
    <section
      aria-label={t('Edit this regional version')}
      className='space-y-3 rounded-md border p-3'
    >
      <h3 className='font-medium'>
        {t('Edit this regional version')}: {version.title}
      </h3>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Changes apply only to this regional version. The master, other languages and original footage are preserved.'
        )}
      </p>
      {error && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
      {context.mutate.error && (
        <div role='alert' className='text-destructive space-y-2 text-sm'>
          <p>{context.mutate.error.message}</p>
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              void context
                .recoverSubmission()
                .then(resetPlan)
                .catch((problem) =>
                  setError(
                    problem instanceof Error ? problem.message : String(problem)
                  )
                )
            }}
          >
            {t('Check the previous request')}
          </Button>
        </div>
      )}
      <Field>
        <FieldLabel>{t('Regional clip')}</FieldLabel>
        <Select
          value={clip?.id}
          onValueChange={(id) => {
            const selected = version.timeline.find((item) => item.id === id)
            if (!selected) return
            setClipId(selected.id)
            setDraft({
              start: String(selected.trimStart),
              end: String(selected.trimEnd ?? ''),
              speed: String(selected.speed),
              take: selected.takeId || '',
            })
            resetPlan()
          }}
        >
          <SelectTrigger aria-label={t('Regional clip')}>
            <SelectValue>
              {clip?.sourceTitle || original?.data.title}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {version.timeline.map((item, index) => (
              <SelectItem key={item.id} value={item.id}>
                {index + 1}.{' '}
                {item.sourceTitle ||
                  context.props.project.nodes.find(
                    (node) => node.id === item.nodeId
                  )?.data.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className='grid gap-2 sm:grid-cols-3'>
        {(
          [
            { key: 'start', label: 'Source trim start', min: 0, max: 3600 },
            { key: 'end', label: 'Source trim end', min: 0, max: 3600 },
            { key: 'speed', label: 'Playback speed', min: 0.25, max: 4 },
          ] as const
        ).map((field) => (
          <Field key={field.key}>
            <FieldLabel>{t(field.label)}</FieldLabel>
            <Input
              aria-label={t(field.label)}
              type='number'
              step='.01'
              min={field.min}
              max={field.max}
              value={draft[field.key]}
              disabled={!context.writable || context.mutate.isPending}
              onChange={(event) =>
                updateDraft({ [field.key]: event.target.value })
              }
            />
          </Field>
        ))}
      </div>
      {takes.length > 0 && (
        <Field>
          <FieldLabel>{t('Pinned footage version')}</FieldLabel>
          <Select
            value={draft.take}
            disabled={!context.writable || context.mutate.isPending}
            onValueChange={(id) => updateDraft({ take: id || '' })}
          >
            <SelectTrigger aria-label={t('Pinned footage version')}>
              <SelectValue>
                {t('Pinned version')}{' '}
                {takes.findIndex((take) => take.id === draft.take) + 1}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {takes.map((take, index) => (
                <SelectItem key={take.id} value={take.id}>
                  {t('Pinned version')} {index + 1} ·{' '}
                  {take.model || t('Uploaded footage')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <Button
        variant='outline'
        disabled={!context.writable || !valid || context.mutate.isPending}
        onClick={() =>
          context.mutate.mutate(async () => {
            resetPlan()
            await context.props.onSave()
            const current = await studioCloudRequest<StudioCloudProject>(
              context.path
            )
            const prepared = await studioCloudRequest<Plan>(
              `${context.path}/edit-plans`,
              'POST',
              {
                request_id: crypto.randomUUID(),
                revision: current.revision,
                action: 'edit_clip',
                version_id: version.id,
                clip_id: clip.id,
                trim_start: numberStart,
                trim_end: numberEnd,
                speed: numberSpeed,
                ...(draft.take ? { take_id: draft.take } : {}),
                review_confirmed: true,
              }
            )
            setPlan(prepared)
          })
        }
      >
        {t('Preview regional edit')}
      </Button>
      <StudioTimelinePreview
        key={`current:${version.id}:${JSON.stringify(version)}`}
        project={staged}
        getMedia={context.props.getMedia}
      />
      {plan && proposed && (
        <section
          aria-label={t('Proposed regional edit')}
          className='space-y-2 border-t pt-3'
        >
          <p>
            {t('Proposed regional edit')} ·{' '}
            {plan?.document.impact.output_seconds}s
          </p>
          <StudioTimelinePreview
            key={plan.id}
            project={proposed}
            getMedia={context.props.getMedia}
            onPreviewed={() => setWatched(true)}
          />
          <Button
            disabled={!context.writable || !watched || context.mutate.isPending}
            onClick={() =>
              context.mutate.mutate(async () => {
                const before = latest.current.production?.regionalVersions.find(
                  (item) => item.id === version.id
                )
                const result = await studioCloudRequest<{
                  project: StudioCloudProject
                }>(
                  `${context.path}/edit-plans/${encodeURIComponent(plan.id)}/apply`,
                  'POST',
                  { revision: plan.revision }
                )
                const after =
                  result.project.document.production?.regionalVersions.find(
                    (item) => item.id === version.id
                  )
                if (before && after) setUndo({ before, after })
                context.props.onUpdate(result.project.document)
                resetPlan()
                await context.props.onRefresh()
              })
            }
          >
            {t('Apply regional edit')}
          </Button>
        </section>
      )}
      {undo && (
        <Button
          variant='outline'
          disabled={!context.writable || context.mutate.isPending}
          onClick={() =>
            context.mutate.mutate(async () => {
              const project = latest.current,
                production = project.production
              if (
                !production ||
                JSON.stringify(
                  production.regionalVersions.find(
                    (item) => item.id === version.id
                  )
                ) !== JSON.stringify(undo.after)
              ) {
                setError(
                  t(
                    'This regional version changed. Review its history before undoing.'
                  )
                )
                return
              }
              context.props.onUpdate({
                ...project,
                production: {
                  ...production,
                  regionalVersions: production.regionalVersions.map((item) =>
                    item.id === version.id ? undo.before : item
                  ),
                },
              })
              await context.props.onSave()
              setUndo(undefined)
              resetPlan()
            })
          }
        >
          {t('Undo this regional edit')}
        </Button>
      )}
    </section>
  )
}
