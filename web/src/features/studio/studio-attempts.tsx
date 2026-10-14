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
/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { fetchStudioAttempts, type StudioAttempt } from './api'
import type { StudioProject } from './local-projects'
import { studioCloudRequest, type StudioCloudJob } from './studio-cloud'
import { studioWorkflowProblem } from './studio-workflow-problem'

export type StudioLocalTask = {
  projectId: string
  projectTitle: string
  nodeId: string
  nodeTitle: string
  taskId: string
  model: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress?: number
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: number
  localTasks?: StudioLocalTask[]
  onOpenTask?: (projectId: string, nodeId: string) => void
  projects?: StudioProject[]
  currentProjectId?: string
  onOpenJob?: (
    projectId: string,
    kind: string,
    nodeId?: string,
    status?: string
  ) => void
}

export function StudioAttempts(props: Props) {
  const { t } = useTranslation()
  const [attempts, setAttempts] = useState<StudioAttempt[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)
  const [scope, setScope] = useState('current')
  const [kind, setKind] = useState('all')
  const [jobs, setJobs] = useState<
    (StudioCloudJob & { projectId: string; projectTitle: string })[]
  >([])
  const projectSignature = JSON.stringify(
    (props.projects || [])
      .filter(
        (project) => scope === 'all' || project.id === props.currentProjectId
      )
      .map((project) => ({ id: project.id, title: project.title }))
  )

  useEffect(() => {
    if (!props.open || !props.userId) {
      setAttempts([])
      setJobs([])
      return
    }
    let cancelled = false
    const projectScope = JSON.parse(projectSignature) as {
      id: string
      title: string
    }[]
    setAttempts([])
    setJobs([])
    setError(null)
    setLoading(true)
    const load = async () => {
      const results = await Promise.allSettled([
        fetchStudioAttempts(),
        ...projectScope.map(async (project) =>
          (
            await studioCloudRequest<StudioCloudJob[]>(
              `/projects/${encodeURIComponent(project.id)}/jobs`
            )
          ).map((job) => ({
            ...job,
            projectId: project.id,
            projectTitle: project.title,
          }))
        ),
      ])
      if (cancelled) return
      const submissions = results[0]
      if (submissions.status === 'fulfilled') {
        setAttempts(submissions.value as StudioAttempt[])
      }
      const collected = results
        .slice(1)
        .flatMap((result) =>
          result.status === 'fulfilled' ? (result.value as typeof jobs) : []
        )
      setJobs(collected)
      if (results.some((result) => result.status === 'rejected')) {
        setError(
          t(
            'Some task sources could not be loaded. Available tasks remain visible; retry to refresh.'
          )
        )
      } else setError(null)
    }
    void load().finally(() => {
      if (!cancelled) setLoading(false)
    })
    const timer = window.setInterval(() => void load(), 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [props.open, props.userId, revision, projectSignature, t])

  const stageLabel = (stage: string): string => {
    switch (stage) {
      case 'started':
        return t('studio.attempt.started')
      case 'submitted':
        return t('studio.attempt.submitted')
      case 'accepted':
        return t('studio.attempt.accepted')
      case 'rejected_before_channel':
        return t('studio.attempt.rejectedBeforeChannel')
      case 'rejected_after_channel':
        return t('studio.attempt.rejectedAfterChannel')
      default:
        return stage
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('studio.taskCenter.title')}
      description={t(
        'Generation, editing, audio and delivery tasks are saved with the project.'
      )}
      contentClassName='sm:max-w-xl'
    >
      <div className='flex flex-col gap-3'>
        <div className='flex flex-wrap gap-2'>
          <Select
            value={scope}
            onValueChange={(value) => setScope(value || 'current')}
            items={[
              { value: 'current', label: t('Current project') },
              { value: 'all', label: t('All projects') },
            ]}
          >
            <SelectTrigger aria-label={t('Task project scope')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value='current'>{t('Current project')}</SelectItem>
                <SelectItem value='all'>{t('All projects')}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={kind}
            onValueChange={(value) => setKind(value || 'all')}
            items={['all', ...new Set(jobs.map((job) => job.kind))].map(
              (value) => ({ value, label: t(`studio.taskKind.${value}`) })
            )}
          >
            <SelectTrigger aria-label={t('Task type')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {['all', ...new Set(jobs.map((job) => job.kind))].map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {t(`studio.taskKind.${value}`)}
                    </SelectItem>
                  )
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <section className='max-h-[45vh] space-y-2 overflow-y-auto'>
          {jobs
            .filter((job) => kind === 'all' || job.kind === kind)
            .map((job) => (
              <div
                key={job.id}
                className='space-y-1 rounded-md border p-3 text-sm'
              >
                <p className='font-medium'>
                  {job.projectTitle} ·{' '}
                  {t(`studio.taskKind.${job.kind}`, {
                    defaultValue: t('Creation workflow'),
                  })}
                </p>
                <p>
                  {t(`studio.production.status.${job.status}`)} ·{' '}
                  {Math.round(job.progress || 0)}%
                </p>
                {job.error && (
                  <>
                    <p className='text-destructive'>
                      {t(studioWorkflowProblem(job.error))}
                    </p>
                    <details>
                      <summary>{t('Technical details')}</summary>
                      <p className='break-all'>{job.error}</p>
                    </details>
                  </>
                )}
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() =>
                    props.onOpenJob?.(
                      job.projectId,
                      job.kind,
                      (job.result as { node_id?: string } | undefined)
                        ?.node_id || job.node_ids?.[0],
                      job.status
                    )
                  }
                >
                  {t(
                    job.status === 'failed'
                      ? 'Open task recovery'
                      : 'Open task and results'
                  )}
                </Button>
              </div>
            ))}
        </section>
        {Boolean(props.localTasks?.length) && (
          <section className='flex flex-col gap-2'>
            <h3 className='text-sm font-medium'>
              {t('studio.taskCenter.localTasks')}
            </h3>
            <div className='max-h-48 overflow-y-auto'>
              {props.localTasks?.map((task) => (
                <div
                  key={`${task.projectId}:${task.nodeId}:${task.taskId}`}
                  className='flex items-center justify-between gap-2 border-b py-2 text-sm'
                >
                  <div className='min-w-0'>
                    <p className='truncate'>
                      {task.projectTitle} · {task.nodeTitle}
                    </p>
                    <p className='text-muted-foreground text-xs'>
                      {task.model} · {t(`studio.status.${task.status}`)}
                      {typeof task.progress === 'number'
                        ? ` · ${task.progress}%`
                        : ''}
                    </p>
                  </div>
                  {props.onOpenTask && (
                    <Button
                      size='xs'
                      variant='outline'
                      onClick={() =>
                        props.onOpenTask?.(task.projectId, task.nodeId)
                      }
                    >
                      {t('studio.taskCenter.open')} {task.nodeTitle}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
        <Button
          size='sm'
          variant='outline'
          onClick={() => setRevision((value) => value + 1)}
        >
          {t('studio.attempt.refresh')}
        </Button>
        {loading && (
          <p className='text-muted-foreground text-sm'>{t('studio.loading')}</p>
        )}
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
        {!loading &&
          !error &&
          attempts.length === 0 &&
          jobs.length === 0 &&
          !props.localTasks?.length && (
            <p className='text-muted-foreground text-sm'>
              {t('studio.attempt.empty')}
            </p>
          )}
        <div className='max-h-[60vh] space-y-3 overflow-y-auto'>
          {attempts.map((attempt) => (
            <div
              key={attempt.id}
              className='space-y-2 rounded-lg border p-3 text-sm'
            >
              <div className='flex items-start justify-between gap-3'>
                <strong className='break-all'>
                  {attempt.model || t('studio.model.empty')}
                </strong>
                <span className='text-muted-foreground shrink-0'>
                  {stageLabel(attempt.stage)}
                </span>
              </div>
              <p className='text-muted-foreground break-all'>
                {attempt.group || '—'} · {t('studio.attempt.channel')}{' '}
                {attempt.channelId || '—'} · HTTP {attempt.httpStatus || '—'}
              </p>
              {attempt.errorCode && (
                <div className='text-destructive block break-all'>
                  {t(
                    studioWorkflowProblem(
                      `HTTP ${attempt.httpStatus || ''} ${attempt.errorCode}`
                    )
                  )}
                  <details className='mt-1 text-xs'>
                    <summary>{t('Technical details')}</summary>
                    <code>{attempt.errorCode}</code>
                  </details>
                </div>
              )}
              {attempt.taskId && (
                <p className='break-all'>
                  {t('studio.attempt.task')} {attempt.taskId}
                </p>
              )}
              <div className='flex items-center gap-2'>
                <code className='text-muted-foreground min-w-0 flex-1 truncate text-xs'>
                  {attempt.id}
                </code>
                <CopyButton
                  value={attempt.id}
                  aria-label={t('studio.attempt.copyId')}
                />
              </div>
              <p className='text-muted-foreground text-xs'>
                {attempt.createdAt}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  )
}
