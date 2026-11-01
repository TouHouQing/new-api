/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import type { StudioProject } from './local-projects'
import { studioCloudMedia, studioCloudRequest } from './studio-cloud'

type ReviewTarget = {
  project_revision: number
  node_id: string
  node_title: string
  take_id?: string
  media_id: string
  digest: string
  kind: string
  start: number
  end: number
}
type Assignment = {
  id: string
  version: number
  title: string
  priority: string
  assignee_id: number
  author_id: number
  state: string
  target: ReviewTarget
  revision_target?: ReviewTarget
  stale: boolean
  events: {
    operation_id: string
    actor_id: number
    operation: string
    state: string
    note: string
    created_at: string
    version: number
  }[]
}
type Snapshot = {
  server_time: number
  project_revision: number
  role: string
  members: {
    user_id: number
    username: string
    display_name: string
    role: string
  }[]
  presence: {
    user_id: number
    username: string
    display_name: string
    node_id: string
    view: string
    expires_at: number
  }[]
  assignments: Assignment[]
}
const safeId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/)
const operationSchema = z.strictObject({
  id: safeId,
  operation_id: safeId,
  operation: z.enum(['create', 'reply', 'status', 'assign', 'revise']),
  expected_version: z.number().int().min(0),
  assignee_id: z.number().int().positive().optional(),
  title: z.string().max(200).optional(),
  priority: z.enum(['normal', 'high']).optional(),
  state: z.string().max(40).optional(),
  note: z.string().max(2000).optional(),
  project_revision: z.number().int().positive().optional(),
  node_id: safeId.optional(),
  take_id: z.string().max(128).optional(),
  media_id: safeId.optional(),
  start: z.number().min(0).max(3600).optional(),
  end: z.number().min(0).max(3600).optional(),
})
type ReviewOperation = z.infer<typeof operationSchema>
const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  assigneeId: z.string().min(1),
  nodeId: z.string().min(1),
  priority: z.enum(['normal', 'high']),
  note: z.string().max(2000),
  start: z.number().min(0).max(3600),
  end: z.number().min(0).max(3600),
})
type CreateForm = z.infer<typeof createSchema>
type Props = {
  project: StudioProject
  selectedNodeId?: string | null
  onInspectNode?: (id: string) => void
}

function currentReviewTarget(project: StudioProject, nodeId: string) {
  const node = project.nodes.find((item) => item.id === nodeId)
  if (!node) return null
  const take = node.data.takes?.find(
    (item) => item.id === node.data.selectedTakeId
  )
  const mediaId = take?.mediaId || node.data.mediaId
  if (!mediaId || !['image', 'video', 'audio'].includes(node.data.kind)) {
    return null
  }
  return {
    node_id: node.id,
    take_id: take?.mediaId ? take.id : '',
    media_id: mediaId,
    kind: node.data.kind,
  }
}

export function StudioCollaboration(props: Props) {
  const userId = useAuthStore((state) => state.auth.user?.id)
  if (!userId) return null
  return (
    <StudioCollaborationContent
      key={`${userId}:${props.project.id}`}
      {...props}
      userId={userId}
    />
  )
}

function StudioCollaborationContent(props: Props & { userId: number }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const key = ['studio', 'collaboration', props.userId, props.project.id]
  const path = `/projects/${encodeURIComponent(props.project.id)}`
  const queueKey = `newapi:studio:review-queue:v1:user:${props.userId}:project:${props.project.id}`
  const [queueState, setQueueState] = useState(() => {
    try {
      const raw = localStorage.getItem(queueKey)
      const parsed = z
        .array(operationSchema)
        .max(20)
        .safeParse(raw ? JSON.parse(raw) : [])
      return {
        valid: parsed.success,
        operations: parsed.success ? parsed.data : ([] as ReviewOperation[]),
      }
    } catch {
      return { valid: false, operations: [] as ReviewOperation[] }
    }
  })
  const [notice, setNotice] = useState('')
  const [discard, setDiscard] = useState<ReviewOperation | null>(null)
  const [clock, setClock] = useState(Date.now())
  const [sessionId] = useState(() => crypto.randomUUID())
  const selectedNode = useRef(props.selectedNodeId || '')
  selectedNode.current = props.selectedNodeId || ''
  const query = useQuery({
    queryKey: key,
    queryFn: () => studioCloudRequest<Snapshot>(`${path}/collaboration`),
    refetchInterval: 10000,
    meta: { errorToast: false },
  })
  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      title: '',
      assigneeId: String(props.userId),
      nodeId: props.selectedNodeId || '',
      priority: 'normal',
      note: '',
      start: 0,
      end: 0,
    },
  })
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const ready = !!query.data
  useEffect(() => {
    if (!ready) return
    const heartbeat = (leave = false) =>
      studioCloudRequest(`${path}/presence`, 'POST', {
        session_id: sessionId,
        node_id: selectedNode.current,
        view: 'review',
        ...(leave ? { action: 'leave' } : {}),
      }).catch(() => {})
    const update = () => {
      void heartbeat(document.visibilityState === 'hidden')
    }
    update()
    const timer = window.setInterval(update, 15000)
    document.addEventListener('visibilitychange', update)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
      void heartbeat(true)
    }
  }, [path, ready, sessionId])
  const persistQueue = (operations: ReviewOperation[]) => {
    if (!queueState.valid) {
      throw new Error(
        t(
          'The saved review queue could not be read. Download a backup before replacing it.'
        )
      )
    }
    localStorage.setItem(queueKey, JSON.stringify(operations))
    setQueueState({ valid: true, operations })
  }
  const mutate = useMutation({
    networkMode: 'always',
    mutationFn: (operation: ReviewOperation) =>
      studioCloudRequest<Assignment>(
        `${path}/assignments${operation.operation === 'create' ? '' : `/${encodeURIComponent(operation.id)}`}`,
        operation.operation === 'create' ? 'POST' : 'PUT',
        operation
      ),
    onSuccess: async (_result, operation) => {
      if (queueState.valid) {
        try {
          persistQueue(
            queueState.operations.filter(
              (item) => item.operation_id !== operation.operation_id
            )
          )
        } catch (error) {
          handleServerError(error)
        }
      }
      setNotice(t('Review task saved. The exact reviewed take is preserved.'))
      if (operation.operation === 'create') {
        form.reset({ ...form.getValues(), title: '', note: '' })
      }
      await client.invalidateQueries({ queryKey: key })
    },
    onError: (error, operation) => {
      if (!navigator.onLine || (isAxiosError(error) && !error.response)) {
        try {
          const next = [
            ...queueState.operations.filter(
              (item) => item.operation_id !== operation.operation_id
            ),
            operation,
          ]
          if (next.length > 20) {
            throw new Error(
              t(
                'The pending review queue is full. Reconnect and synchronize it first.'
              )
            )
          }
          persistQueue(next)
          setNotice(
            t(
              'Saved on this device for retry. It has not been submitted. Reconnect to check permission and the task version before synchronizing.'
            )
          )
        } catch (problem) {
          handleServerError(problem)
        }
      } else {
        handleServerError(error)
        void client.invalidateQueries({ queryKey: key })
      }
    },
  })
  const retry = useMutation({
    networkMode: 'always',
    mutationFn: async (operation: ReviewOperation) => {
      const current = await studioCloudRequest<Snapshot>(
        `${path}/collaboration`
      )
      const task = current.assignments.find((item) => item.id === operation.id)
      const alreadyApplied = task?.events.some(
        (event) => event.operation_id === operation.operation_id
      )
      if (
        !alreadyApplied &&
        operation.operation !== 'create' &&
        task?.version !== operation.expected_version
      ) {
        throw new Error(
          t(
            'This review task changed while you were offline. Read the latest discussion and submit your change again.'
          )
        )
      }
      if (current.role === 'viewer') {
        throw new Error(
          t('Your project permission no longer allows review changes.')
        )
      }
      return mutate.mutateAsync(operation)
    },
    onError: (error) => handleServerError(error),
  })
  const editor = query.data?.role === 'owner' || query.data?.role === 'editor'
  const canWrite =
    !!query.data && query.data.role !== 'viewer' && !query.isError
  const serverNow = query.data
    ? query.data.server_time + Math.max(0, clock - query.dataUpdatedAt) / 1000
    : 0
  const online =
    query.data?.presence.filter((person) => person.expires_at > serverNow) || []
  const reviewNodes = props.project.nodes.filter((node) =>
    currentReviewTarget(props.project, node.id)
  )
  const members = query.data?.members || []
  const submit = form.handleSubmit((values) => {
    const target = currentReviewTarget(props.project, values.nodeId)
    if (!target || !query.data) return
    mutate.mutate({
      id: `review-${crypto.randomUUID()}`,
      operation_id: crypto.randomUUID(),
      operation: 'create',
      expected_version: 0,
      title: values.title,
      assignee_id: Number(values.assigneeId),
      priority: values.priority,
      note: values.note,
      project_revision: query.data.project_revision,
      node_id: target.node_id,
      take_id: target.take_id,
      media_id: target.media_id,
      start: values.start,
      end: values.end,
    })
  })
  return (
    <section
      className='flex min-w-0 flex-col gap-4'
      aria-label={t('Review tasks and collaborators')}
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='font-semibold'>{t('Review tasks and collaborators')}</h3>
        <Button
          variant='outline'
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {t('Refresh review tasks')}
        </Button>
      </div>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Assign feedback to one exact take and time range. Replies, revisions and closure remain in the project. No external messages are sent.'
        )}
      </p>
      {notice && (
        <Alert>
          <AlertDescription role='status'>{notice}</AlertDescription>
        </Alert>
      )}
      {query.isPending && (
        <LoadingState inline message={t('Loading collaboration')} />
      )}
      {query.isError && (
        <ErrorState
          description={t(
            'Collaboration could not be refreshed. Pending changes remain on this device.'
          )}
          onRetry={() => void query.refetch()}
        />
      )}
      <div
        className='flex flex-wrap items-center gap-2'
        aria-label={t('Online project members')}
      >
        <span className='text-sm'>{t('Online now')}</span>
        {online.length === 0 ? (
          <span className='text-muted-foreground text-sm'>
            {t('No recent active sessions')}
          </span>
        ) : (
          online.map((person) => (
            <Badge key={person.user_id} variant='secondary'>
              {person.display_name || person.username} ·{' '}
              {props.project.nodes.find((node) => node.id === person.node_id)
                ?.data.title || t('Project')}
            </Badge>
          ))
        )}
      </div>
      {!queueState.valid && (
        <Alert variant='destructive'>
          <AlertDescription>
            {t(
              'The saved review queue could not be read. Its original data has been preserved.'
            )}
            <Button
              variant='outline'
              onClick={() => {
                const raw = localStorage.getItem(queueKey) || ''
                const url = URL.createObjectURL(
                  new Blob([raw], { type: 'application/json' })
                )
                const anchor = document.createElement('a')
                anchor.href = url
                anchor.download = `studio-review-queue-${props.project.id}.json`
                anchor.click()
                window.setTimeout(() => URL.revokeObjectURL(url), 1000)
              }}
            >
              {t('Download pending review backup')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {!!queueState.operations.length && (
        <Card>
          <CardHeader>
            <CardTitle>{t('Pending review changes on this device')}</CardTitle>
            <CardDescription>
              {t(
                'Each retry checks current membership and the original task version. Conflicts require your decision.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            {queueState.operations.map((operation) => (
              <div
                key={operation.operation_id}
                className='flex flex-wrap items-center gap-2'
              >
                <span className='min-w-0 flex-1 break-words'>
                  {operation.title ||
                    operation.note ||
                    operation.state ||
                    operation.id}
                </span>
                <Button
                  variant='outline'
                  disabled={!canWrite || retry.isPending || mutate.isPending}
                  onClick={() => retry.mutate(operation)}
                >
                  {t('Check and synchronize')}
                </Button>
                <Button
                  variant='ghost'
                  onClick={() => {
                    setDiscard(operation)
                  }}
                >
                  {t('Discard pending change')}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {editor && (
        <Collapsible>
          <CollapsibleTrigger render={<Button variant='outline' />}>
            {t('Assign a review task')}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <form
              aria-label={t('New review task')}
              onSubmit={submit}
              className='pt-4'
            >
              <FieldGroup>
                <Field data-invalid={!!form.formState.errors.title}>
                  <FieldLabel htmlFor='review-task-title'>
                    {t('Review task title')}
                  </FieldLabel>
                  <Input
                    id='review-task-title'
                    aria-invalid={!!form.formState.errors.title}
                    maxLength={200}
                    {...form.register('title')}
                  />
                  <FieldError errors={[form.formState.errors.title]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor='review-task-node'>
                    {t('Exact shot to review')}
                  </FieldLabel>
                  <Select
                    items={reviewNodes.map((node) => ({
                      value: node.id,
                      label: node.data.title,
                    }))}
                    value={form.watch('nodeId')}
                    onValueChange={(value) => {
                      if (value) {
                        form.setValue('nodeId', value, { shouldValidate: true })
                      }
                    }}
                  >
                    <SelectTrigger id='review-task-node'>
                      <SelectValue placeholder={t('Choose a completed shot')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {reviewNodes.map((node) => (
                          <SelectItem key={node.id} value={node.id}>
                            {node.data.title}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldError errors={[form.formState.errors.nodeId]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor='review-task-assignee'>
                    {t('Assigned reviewer')}
                  </FieldLabel>
                  <Select
                    items={members
                      .filter((member) => member.role !== 'viewer')
                      .map((member) => ({
                        value: String(member.user_id),
                        label: member.display_name || member.username,
                      }))}
                    value={form.watch('assigneeId')}
                    onValueChange={(value) => {
                      if (value) {
                        form.setValue('assigneeId', value, {
                          shouldValidate: true,
                        })
                      }
                    }}
                  >
                    <SelectTrigger id='review-task-assignee'>
                      <SelectValue placeholder={t('Choose a reviewer')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {members
                          .filter((member) => member.role !== 'viewer')
                          .map((member) => (
                            <SelectItem
                              key={member.user_id}
                              value={String(member.user_id)}
                            >
                              {member.display_name || member.username}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor='review-task-priority'>
                    {t('Priority')}
                  </FieldLabel>
                  <Select
                    items={[
                      { value: 'normal', label: t('Normal') },
                      { value: 'high', label: t('High') },
                    ]}
                    value={form.watch('priority')}
                    onValueChange={(value) => {
                      if (value === 'normal' || value === 'high') {
                        form.setValue('priority', value)
                      }
                    }}
                  >
                    <SelectTrigger id='review-task-priority'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value='normal'>{t('Normal')}</SelectItem>
                        <SelectItem value='high'>{t('High')}</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor='review-task-start'>
                    {t('Review range start in seconds')}
                  </FieldLabel>
                  <Input
                    id='review-task-start'
                    type='number'
                    min={0}
                    max={3600}
                    step={0.01}
                    {...form.register('start', { valueAsNumber: true })}
                  />
                  <FieldError errors={[form.formState.errors.start]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor='review-task-end'>
                    {t('Review range end in seconds; zero uses the full clip')}
                  </FieldLabel>
                  <Input
                    id='review-task-end'
                    type='number'
                    min={0}
                    max={3600}
                    step={0.01}
                    {...form.register('end', { valueAsNumber: true })}
                  />
                  <FieldError errors={[form.formState.errors.end]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor='review-task-note'>
                    {t('Review instructions')}
                  </FieldLabel>
                  <Textarea
                    id='review-task-note'
                    maxLength={2000}
                    {...form.register('note')}
                  />
                </Field>
                <Button
                  type='submit'
                  disabled={
                    !canWrite || mutate.isPending || !reviewNodes.length
                  }
                >
                  {t('Create review task')}
                </Button>
              </FieldGroup>
            </form>
          </CollapsibleContent>
        </Collapsible>
      )}
      {query.data?.assignments.length === 0 && (
        <EmptyState
          title={t('No review tasks yet')}
          description={t(
            'Assign a completed shot to a project member, or continue using timestamp comments.'
          )}
          className='min-h-24'
        />
      )}
      {query.data?.assignments.map((assignment) => (
        <ReviewAssignmentCard
          key={`${assignment.id}:${assignment.revision_target?.media_id || assignment.target.media_id}`}
          assignment={assignment}
          project={props.project}
          snapshot={query.data}
          userId={props.userId}
          disabled={!canWrite || mutate.isPending || retry.isPending}
          onOperation={(operation) => mutate.mutate(operation)}
          onInspectNode={props.onInspectNode}
        />
      ))}
      <ConfirmDialog
        open={!!discard}
        onOpenChange={(open) => {
          if (!open) setDiscard(null)
        }}
        title={t('Discard this unsent review change?')}
        desc={
          discard?.note ||
          discard?.title ||
          t('This change has not been sent to the project.')
        }
        confirmText={t('Discard pending change')}
        handleConfirm={() => {
          if (!discard) return
          try {
            persistQueue(
              queueState.operations.filter(
                (item) => item.operation_id !== discard.operation_id
              )
            )
            setDiscard(null)
          } catch (error) {
            handleServerError(error)
          }
        }}
      />
    </section>
  )
}

function ReviewAssignmentCard(props: {
  assignment: Assignment
  project: StudioProject
  snapshot: Snapshot
  userId: number
  disabled: boolean
  onOperation: (operation: ReviewOperation) => void
  onInspectNode?: (id: string) => void
}) {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  const [assignee, setAssignee] = useState(String(props.assignment.assignee_id))
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewTarget, setPreviewTarget] = useState<ReviewTarget | null>(null)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const task = props.assignment
  useEffect(() => setAssignee(String(task.assignee_id)), [task.assignee_id])
  const target = task.revision_target || task.target
  const editor =
    props.snapshot.role === 'owner' || props.snapshot.role === 'editor'
  const reviewer = editor || task.assignee_id === props.userId
  const latest = currentReviewTarget(props.project, task.target.node_id)
  const preview = useMutation({
    mutationFn: async (requested: ReviewTarget) => ({
      blob: await studioCloudMedia(props.project.id, requested.media_id),
      target: requested,
    }),
    onSuccess: (result) => {
      if (!active.current) return
      setPreviewTarget(result.target)
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old)
        return URL.createObjectURL(result.blob)
      })
    },
    onError: (error) => handleServerError(error),
  })
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl]
  )
  const submit = (operation: ReviewOperation['operation'], state?: string) => {
    const next: ReviewOperation = {
      id: task.id,
      operation_id: crypto.randomUUID(),
      operation,
      expected_version: task.version,
      note,
    }
    if (state) next.state = state
    if (operation === 'assign') {
      next.assignee_id = Number(assignee)
      next.priority = task.priority === 'high' ? 'high' : 'normal'
    }
    if (operation === 'revise' && latest) {
      Object.assign(next, latest, {
        project_revision: props.snapshot.project_revision,
        start: 0,
        end: 0,
      })
    }
    props.onOperation(next)
  }
  const person = (id: number) =>
    props.snapshot.members.find((member) => member.user_id === id)
      ?.display_name ||
    props.snapshot.members.find((member) => member.user_id === id)?.username ||
    String(id)
  const stateLabels: Record<string, string> = {
    open: t('Awaiting review'),
    in_progress: t('Review in progress'),
    approved: t('Approved'),
    changes_requested: t('Changes requested'),
    revision_submitted: t('Revision submitted'),
    closed: t('Closed'),
  }
  const operationLabels: Record<string, string> = {
    create: t('Review task created'),
    reply: t('Reply added'),
    status: t('Review status updated'),
    assign: t('Reviewer changed'),
    revise: t('Replacement take submitted'),
  }
  const shownTarget = previewTarget || target
  return (
    <Card>
      <CardHeader>
        <CardTitle>{task.title}</CardTitle>
        <CardDescription>
          {person(task.assignee_id)} · {target.node_title} ·{' '}
          {t('Project revision')} {target.project_revision} ·{' '}
          {target.take_id || target.media_id}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        <div className='flex flex-wrap gap-2'>
          <Badge
            variant={task.priority === 'high' ? 'destructive' : 'secondary'}
          >
            {t(task.priority === 'high' ? 'High priority' : 'Normal priority')}
          </Badge>
          <Badge variant='outline'>
            {stateLabels[task.state] || task.state}
          </Badge>
        </div>
        {task.stale && (
          <Alert>
            <AlertDescription>
              {t(
                'The project now uses a different take. This task still reviews the pinned version; it does not approve the current film.'
              )}
            </AlertDescription>
          </Alert>
        )}
        {task.revision_target && (
          <p className='text-muted-foreground text-sm'>
            {t(
              'A replacement take was submitted. The original reviewed take remains in the discussion history.'
            )}{' '}
            {task.target.take_id || task.target.media_id}
          </p>
        )}
        {!!target.end && (
          <p className='text-sm'>
            {target.start}s – {target.end}s
          </p>
        )}
        <div className='flex flex-wrap gap-2'>
          <Button
            variant='outline'
            disabled={preview.isPending}
            onClick={() => preview.mutate(target)}
          >
            {t('Preview exact reviewed media')}
          </Button>
          {task.revision_target && (
            <Button
              variant='outline'
              disabled={preview.isPending}
              onClick={() => preview.mutate(task.target)}
            >
              {t('Preview original reviewed take')}
            </Button>
          )}
          {props.onInspectNode && (
            <Button
              variant='ghost'
              onClick={() => props.onInspectNode?.(task.target.node_id)}
            >
              {t('Open shot')}
            </Button>
          )}
        </div>
        {previewUrl && shownTarget.kind === 'image' && (
          <img
            src={previewUrl}
            alt={shownTarget.node_title}
            className='max-h-64 object-contain'
          />
        )}
        {previewUrl && shownTarget.kind === 'video' && (
          <video
            src={previewUrl}
            controls
            playsInline
            className='max-h-64'
            onLoadedMetadata={(event) => {
              event.currentTarget.currentTime = shownTarget.start
            }}
          />
        )}
        {previewUrl && shownTarget.kind === 'audio' && (
          <audio
            src={previewUrl}
            controls
            onLoadedMetadata={(event) => {
              event.currentTarget.currentTime = shownTarget.start
            }}
          />
        )}
        <ol
          className='flex flex-col gap-2'
          aria-label={t('Review discussion history')}
        >
          {task.events.map((event) => (
            <li
              key={event.operation_id}
              className='rounded-lg border p-3 text-sm'
            >
              <p className='text-muted-foreground'>
                {person(event.actor_id)} · {event.created_at} ·{' '}
                {operationLabels[event.operation] || event.operation} ·{' '}
                {stateLabels[event.state] || event.state}
              </p>
              {event.note && (
                <p className='whitespace-pre-wrap'>{event.note}</p>
              )}
            </li>
          ))}
        </ol>
        <Field>
          <FieldLabel htmlFor={`review-reply-${task.id}`}>
            {t('Reply or explain the revision')}
          </FieldLabel>
          <Textarea
            id={`review-reply-${task.id}`}
            value={note}
            maxLength={2000}
            onChange={(event) => setNote(event.target.value)}
            disabled={props.disabled}
          />
        </Field>
        {editor && (
          <Field>
            <FieldLabel htmlFor={`review-reassign-${task.id}`}>
              {t('Assigned reviewer')}
            </FieldLabel>
            <Select
              items={props.snapshot.members
                .filter((member) => member.role !== 'viewer')
                .map((member) => ({
                  value: String(member.user_id),
                  label: member.display_name || member.username,
                }))}
              value={assignee}
              disabled={props.disabled}
              onValueChange={(value) => {
                if (value) setAssignee(value)
              }}
            >
              <SelectTrigger id={`review-reassign-${task.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {props.snapshot.members
                    .filter((member) => member.role !== 'viewer')
                    .map((member) => (
                      <SelectItem
                        key={member.user_id}
                        value={String(member.user_id)}
                      >
                        {member.display_name || member.username}
                      </SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}
      </CardContent>
      <CardFooter className='flex flex-wrap gap-2'>
        <Button
          variant='outline'
          disabled={props.disabled || !note.trim()}
          onClick={() => submit('reply')}
        >
          {t('Add reply')}
        </Button>
        {reviewer && (
          <>
            <Button
              variant='outline'
              disabled={props.disabled || task.state === 'in_progress'}
              onClick={() => submit('status', 'in_progress')}
            >
              {t('Start review')}
            </Button>
            <Button
              disabled={props.disabled || task.state === 'approved'}
              onClick={() => submit('status', 'approved')}
            >
              {t('Approve reviewed take')}
            </Button>
            <Button
              variant='outline'
              disabled={props.disabled || !note.trim()}
              onClick={() => submit('status', 'changes_requested')}
            >
              {t('Request changes')}
            </Button>
            <Button
              variant='outline'
              disabled={
                props.disabled ||
                task.state === 'closed' ||
                (task.state !== 'approved' && !note.trim())
              }
              onClick={() => submit('status', 'closed')}
            >
              {t('Close review task')}
            </Button>
          </>
        )}
        {editor && (
          <>
            <Button
              variant='outline'
              disabled={
                props.disabled ||
                !latest ||
                (latest.media_id === target.media_id &&
                  latest.take_id === (target.take_id || ''))
              }
              onClick={() => submit('revise')}
            >
              {t('Submit current take as revision')}
            </Button>
            <Button
              variant='ghost'
              disabled={props.disabled || Number(assignee) === task.assignee_id}
              onClick={() => submit('assign')}
            >
              {t('Change assigned reviewer')}
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  )
}
