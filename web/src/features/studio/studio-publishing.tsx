/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  FieldDescription,
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
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import type { StudioProject } from './local-projects'
import { studioCloudMedia, studioCloudRequest } from './studio-cloud'

type Publication = {
  id: string
  project_revision: number
  render_revision: number
  render_job_id: string
  media_id: string
  source_digest: string
  platform: string
  connector_id: string
  account_id: string
  account_label: string
  title: string
  description: string
  tags: string[] | null
  visibility: string
  schedule_at: number
  cover_at: number
  caption_language: string
  made_for_kids: boolean | null
  synthetic_media: boolean | null
  fingerprint: string
  confirmed_fingerprint?: string
  state: string
  verification: string
  reason?: string
  remote_id?: string
  remote_visibility?: string
  packages: Record<string, string>
  cover_media_id?: string
  metrics?: {
    provider: string
    remote_id: string
    source: string
    fetched_at: string
    window: string
    timezone: string
    views: string | null
    likes: string | null
    comments: string | null
  }
  jobs: Record<string, string>
}
type PublishingSnapshot = {
  publications: Publication[]
  project_revision: number
  role: string
  accounts: {
    id: string
    label: string
    account_id: string
    state: string
    expires_at: number
  }[]
  renders: {
    id: string
    revision: number
    created_at: string
    media_id: string
    duration: number
  }[]
  jobs: {
    id: string
    status: string
    error: string
    progress: number
    action: string
    publication_id: string
  }[]
}
const publishingFormSchema = z
  .object({
    renderId: z.string().min(1),
    platform: z.enum(['youtube', 'douyin', 'xiaohongshu', 'bilibili']),
    connectorId: z.string(),
    title: z.string().trim().min(1).max(100),
    description: z.string().max(5000),
    tags: z.string().max(500),
    visibility: z.enum(['private', 'unlisted', 'public']),
    schedule: z
      .string()
      .refine(
        (value) => !value || Number.isFinite(new Date(value).getTime()),
        'Choose a valid publishing time'
      ),
    coverAt: z.number().min(0).max(3600),
    language: z.string().min(1).max(40),
    madeForKids: z.enum(['unset', 'yes', 'no']),
    syntheticMedia: z.enum(['unset', 'yes', 'no']),
  })
  .superRefine((value, context) => {
    if (value.platform === 'youtube' && value.connectorId) {
      if (value.madeForKids === 'unset') {
        context.addIssue({
          code: 'custom',
          path: ['madeForKids'],
          message: 'Choose the intended audience',
        })
      }
      if (value.syntheticMedia === 'unset') {
        context.addIssue({
          code: 'custom',
          path: ['syntheticMedia'],
          message: 'Choose the synthetic-media disclosure',
        })
      }
    }
  })
type PublishingForm = z.infer<typeof publishingFormSchema>

export function StudioPublishing(props: { project: StudioProject }) {
  const userId = useAuthStore((state) => state.auth.user?.id)
  if (!userId) return null
  return (
    <StudioPublishingContent
      key={`${userId}:${props.project.id}`}
      project={props.project}
      userId={userId}
    />
  )
}

function StudioPublishingContent(props: {
  project: StudioProject
  userId: number
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const client = useQueryClient()
  const key = ['studio', 'publishing', props.userId, props.project.id]
  const path = `/projects/${encodeURIComponent(props.project.id)}/publications`
  const query = useQuery({
    queryKey: key,
    queryFn: () => studioCloudRequest<PublishingSnapshot>(path),
    refetchInterval: 5000,
    meta: { errorToast: false },
  })
  const [selectedId, setSelectedId] = useState('')
  const [editing, setEditing] = useState(true)
  const [confirm, setConfirm] = useState<'publish' | 'cancel' | null>(null)
  const [notice, setNotice] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const video = useRef<HTMLVideoElement>(null)
  const mounted = useRef(true)
  const pendingDraft = useRef(`publication-${crypto.randomUUID()}`)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const form = useForm<PublishingForm>({
    resolver: zodResolver(publishingFormSchema),
    defaultValues: {
      renderId: '',
      platform: 'youtube',
      connectorId: '',
      title: props.project.title,
      description: '',
      tags: '',
      visibility: 'private',
      schedule: '',
      coverAt: 0,
      language: 'zh-Hans',
      madeForKids: 'unset',
      syntheticMedia: 'unset',
    },
  })
  const draft = query.data?.publications.find((item) => item.id === selectedId)
  const renderId = form.watch('renderId')
  const render = query.data?.renders.find((item) => item.id === renderId)
  const coverAt = form.watch('coverAt')
  const inputKey = JSON.stringify(form.watch())
  useEffect(() => {
    pendingDraft.current = `publication-${crypto.randomUUID()}`
  }, [inputKey])
  useEffect(() => {
    if (!form.getValues('renderId') && query.data?.renders[0]) {
      form.setValue('renderId', query.data.renders[0].id)
    }
  }, [query.data?.renders, form])
  useEffect(() => {
    if (video.current && Number.isFinite(coverAt)) {
      video.current.currentTime = Math.max(
        0,
        Math.min(coverAt, video.current.duration || coverAt)
      )
    }
  }, [coverAt])
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl]
  )
  const preview = useMutation({
    mutationFn: async () => {
      if (!render) throw new Error(t('Choose a completed render'))
      return {
        id: render.id,
        blob: await studioCloudMedia(props.project.id, render.media_id),
      }
    },
    onSuccess: (result) => {
      if (!mounted.current || form.getValues('renderId') !== result.id) return
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old)
        return URL.createObjectURL(result.blob)
      })
    },
    onError: (error) => handleServerError(error),
  })
  const prepare = useMutation({
    mutationFn: (values: PublishingForm) =>
      studioCloudRequest<Publication>(path, 'POST', {
        id: pendingDraft.current,
        project_revision: query.data?.project_revision,
        render_job_id: values.renderId,
        platform: values.platform,
        connector_id: values.platform === 'youtube' ? values.connectorId : '',
        title: values.title,
        description: values.description,
        tags: [
          ...new Set(
            values.tags
              .split(/[,，]/)
              .map((tag) => tag.trim())
              .filter(Boolean)
          ),
        ],
        visibility: values.visibility,
        schedule_at: values.schedule
          ? Math.floor(new Date(values.schedule).getTime() / 1000)
          : 0,
        cover_at: values.coverAt,
        caption_language: values.language,
        made_for_kids:
          values.madeForKids === 'unset' ? null : values.madeForKids === 'yes',
        synthetic_media:
          values.syntheticMedia === 'unset'
            ? null
            : values.syntheticMedia === 'yes',
      }),
    onSuccess: async (value) => {
      pendingDraft.current = `publication-${crypto.randomUUID()}`
      setSelectedId(value.id)
      setEditing(false)
      setNotice(
        t(
          'Publishing version prepared. Review its fixed content before uploading.'
        )
      )
      await client.invalidateQueries({ queryKey: key })
    },
    onError: (error) => {
      handleServerError(error)
      void client.invalidateQueries({ queryKey: key })
    },
  })
  const action = useMutation({
    mutationFn: async (value: {
      publication: Publication
      action: 'package' | 'publish' | 'status' | 'metrics' | 'cancel'
    }) => {
      const endpoint = `${path}/${encodeURIComponent(value.publication.id)}`
      if (value.action === 'cancel') {
        return studioCloudRequest(`${endpoint}/cancel`, 'POST', {})
      }
      if (
        value.action === 'publish' &&
        value.publication.confirmed_fingerprint !==
          value.publication.fingerprint
      ) {
        await studioCloudRequest(`${endpoint}/confirm`, 'POST', {
          fingerprint: value.publication.fingerprint,
          confirm_external_write: true,
        })
      }
      return studioCloudRequest(`${endpoint}/jobs`, 'POST', {
        action: value.action,
        request_id: crypto.randomUUID(),
      })
    },
    onSuccess: async () => {
      setConfirm(null)
      setNotice(
        t(
          'Publishing task submitted. Its status is saved on the server and can be checked after reopening the project.'
        )
      )
      await client.invalidateQueries({ queryKey: key })
    },
    onError: (error) => handleServerError(error),
  })
  const download = useMutation({
    mutationFn: async (value: { id: string; platform: string }) => ({
      blob: await studioCloudMedia(props.project.id, value.id),
      platform: value.platform,
    }),
    onSuccess: (value) => {
      const url = URL.createObjectURL(value.blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${value.platform}-publishing-package.zip`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
    onError: (error) => handleServerError(error),
  })
  const writable = query.data?.role === 'owner' && !query.isError
  const busy = prepare.isPending || action.isPending
  const platformLabels: Record<string, string> = {
    youtube: 'YouTube',
    douyin: t('Douyin'),
    xiaohongshu: t('Xiaohongshu'),
    bilibili: t('Bilibili'),
  }
  const visibilityLabels: Record<string, string> = {
    private: t('Private'),
    unlisted: t('Unlisted'),
    public: t('Public'),
  }
  const declarationLabel = (value: boolean | null) => {
    if (value === null) return t('Not specified')
    return t(value ? 'Yes' : 'No')
  }
  const stateLabels: Record<string, string> = {
    draft: t('Ready for review'),
    confirmed: t('Confirmed'),
    queued: t('Queued'),
    scheduled: t('Scheduled'),
    queued_packages: t('Preparing publishing packages'),
    building_packages: t('Preparing publishing packages'),
    packages_ready: t('Publishing packages ready'),
    verification_blocked: t('Authorization or source needs attention'),
    uncertain: t('Upload result needs verification'),
    uploaded_incomplete: t('Video uploaded; cover or captions need completion'),
    uploaded: t('Uploaded'),
    processing: t('Provider processing'),
    published: t('Published'),
    published_unlisted: t('Published as unlisted'),
    uploaded_private: t('Uploaded as private'),
    visibility_mismatch: t('Provider visibility differs'),
    provider_rejected: t('Provider rejected the upload'),
    cancelled: t('Cancelled before upload'),
    cancellation_requested: t('Stopping; verification pending'),
    stopped_pending_verification: t(
      'Stopped; upload status needs verification'
    ),
    upload_incomplete: t('Upload incomplete'),
    cancelled_before_publication: t('Stopped before publication'),
    schedule_missed: t('Publishing time missed; confirm a new schedule'),
  }
  const accountAvailable =
    !!draft &&
    query.data?.accounts.some(
      (account) =>
        account.id === draft.connector_id &&
        account.account_id === draft.account_id &&
        account.state === 'configured'
    )
  const canPublish =
    !!draft &&
    draft.platform === 'youtube' &&
    !!draft.account_id &&
    accountAvailable &&
    draft.made_for_kids !== null &&
    draft.synthetic_media !== null &&
    ![
      'cancelled',
      'cancelled_before_publication',
      'cancellation_requested',
      'stopped_pending_verification',
      'schedule_missed',
    ].includes(draft.state) &&
    (!draft.remote_id || draft.state === 'uploaded_incomplete')
  const relevantJobs =
    query.data?.jobs.filter((job) => job.publication_id === draft?.id) || []
  const pending = relevantJobs.some((job) =>
    ['queued', 'running', 'waiting'].includes(job.status)
  )
  return (
    <section
      className='flex min-w-0 flex-col gap-4'
      aria-label={t('Publish and measure')}
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='font-semibold'>{t('Publish and measure')}</h3>
        <Button
          variant='outline'
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          {t('Refresh publishing versions')}
        </Button>
      </div>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Start with a finished render. Prepare four platform packages, or review and confirm a connected YouTube upload. Publishing does not run a generation model.'
        )}
      </p>
      {notice && (
        <Alert>
          <AlertDescription role='status'>{notice}</AlertDescription>
        </Alert>
      )}
      {query.isPending && (
        <LoadingState inline message={t('Loading publishing versions')} />
      )}
      {query.isError && (
        <ErrorState
          description={t(
            'Publishing versions could not be loaded. Your video is preserved.'
          )}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data?.renders.length === 0 && (
        <EmptyState
          title={t('Export a finished video first')}
          description={t(
            'A publishing version must reference an actual completed render. Return to Export, render the film, then refresh this panel.'
          )}
          className='min-h-28'
        />
      )}
      {!!query.data?.publications.length && (
        <Field>
          <FieldLabel htmlFor='publishing-version'>
            {t('Prepared publishing version')}
          </FieldLabel>
          <Select
            value={selectedId}
            items={query.data.publications.map((item) => ({
              value: item.id,
              label: item.title,
            }))}
            onValueChange={(value) => {
              if (value) {
                setSelectedId(value)
                setEditing(false)
                setConfirm(null)
              }
            }}
          >
            <SelectTrigger id='publishing-version'>
              <SelectValue placeholder={t('Choose a publishing version')} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {query.data.publications.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.title} · {stateLabels[item.state] || item.state}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}
      {writable && !!query.data?.renders.length && (
        <Collapsible
          open={editing}
          onOpenChange={(open) => {
            setEditing(open)
            if (open) setSelectedId('')
          }}
        >
          <CollapsibleTrigger render={<Button variant='outline' />}>
            {t('Prepare a new publishing version')}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <form
              className='pt-4'
              aria-label={t('Publishing version details')}
              onSubmit={form.handleSubmit((values) => prepare.mutate(values))}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor='publishing-render'>
                    {t('Finished video')}
                  </FieldLabel>
                  <Select
                    value={renderId}
                    items={query.data.renders.map((item) => ({
                      value: item.id,
                      label: `${t('Project revision')} ${item.revision} · ${formatNumber(item.duration, locale)}s`,
                    }))}
                    onValueChange={(value) => {
                      if (value) {
                        form.setValue('renderId', value, {
                          shouldValidate: true,
                        })
                        form.setValue('coverAt', 0)
                        setPreviewUrl('')
                      }
                    }}
                  >
                    <SelectTrigger id='publishing-render'>
                      <SelectValue
                        placeholder={t('Choose a completed render')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {query.data.renders.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {t('Project revision')} {item.revision} ·{' '}
                            {formatNumber(item.duration, locale)}s
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldError errors={[form.formState.errors.renderId]} />
                </Field>
                <Field data-invalid={!!form.formState.errors.title}>
                  <FieldLabel htmlFor='publishing-title'>
                    {t('Publication title')}
                  </FieldLabel>
                  <Input
                    id='publishing-title'
                    maxLength={100}
                    aria-invalid={!!form.formState.errors.title}
                    {...form.register('title')}
                  />
                  <FieldError errors={[form.formState.errors.title]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor='publishing-description'>
                    {t('Publication description')}
                  </FieldLabel>
                  <Textarea
                    id='publishing-description'
                    maxLength={5000}
                    {...form.register('description')}
                  />
                </Field>
                <Button
                  variant='outline'
                  disabled={!render || preview.isPending}
                  onClick={() => preview.mutate()}
                >
                  {t('Preview finished video and choose cover')}
                </Button>
                {previewUrl && (
                  <>
                    <video
                      ref={video}
                      src={previewUrl}
                      controls
                      playsInline
                      className='max-h-64 rounded-lg'
                      onLoadedMetadata={(event) => {
                        event.currentTarget.currentTime = coverAt
                      }}
                    />
                    <Button
                      variant='outline'
                      onClick={() => {
                        if (video.current) {
                          form.setValue('coverAt', video.current.currentTime)
                        }
                      }}
                    >
                      {t('Use current frame as cover')}
                    </Button>
                  </>
                )}
                <Field>
                  <FieldLabel htmlFor='publishing-cover-at'>
                    {t('Cover frame time in seconds')}
                  </FieldLabel>
                  <Input
                    id='publishing-cover-at'
                    type='number'
                    min={0}
                    max={render?.duration || 3600}
                    step={0.01}
                    {...form.register('coverAt', { valueAsNumber: true })}
                  />
                  <FieldError errors={[form.formState.errors.coverAt]} />
                </Field>
                <Collapsible>
                  <CollapsibleTrigger render={<Button variant='ghost' />}>
                    {t('Platform, audience and scheduling')}
                  </CollapsibleTrigger>
                  <CollapsibleContent className='pt-4'>
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor='publishing-platform'>
                          {t('Publishing destination')}
                        </FieldLabel>
                        <Select
                          value={form.watch('platform')}
                          items={Object.entries(platformLabels).map(
                            ([value, label]) => ({ value, label })
                          )}
                          onValueChange={(value) => {
                            if (
                              value === 'youtube' ||
                              value === 'douyin' ||
                              value === 'xiaohongshu' ||
                              value === 'bilibili'
                            ) {
                              form.setValue('platform', value)
                            }
                          }}
                        >
                          <SelectTrigger id='publishing-platform'>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {Object.entries(platformLabels).map(
                                ([value, label]) => (
                                  <SelectItem key={value} value={value}>
                                    {label}
                                  </SelectItem>
                                )
                              )}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FieldDescription>
                          {t(
                            'All four downloadable packages are included. Direct publishing is available only through the YouTube adapter and still requires account authorization.'
                          )}
                        </FieldDescription>
                      </Field>
                      {form.watch('platform') === 'youtube' && (
                        <Field>
                          <FieldLabel htmlFor='publishing-account'>
                            {t('YouTube publishing account')}
                          </FieldLabel>
                          <Select
                            value={form.watch('connectorId') || 'package-only'}
                            items={[
                              {
                                value: 'package-only',
                                label: t('Download packages only'),
                              },
                              ...query.data.accounts.map((account) => ({
                                value: account.id,
                                label: account.label,
                              })),
                            ]}
                            onValueChange={(value) => {
                              if (value) {
                                form.setValue(
                                  'connectorId',
                                  value === 'package-only' ? '' : value
                                )
                              }
                            }}
                          >
                            <SelectTrigger id='publishing-account'>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value='package-only'>
                                  {t('Download packages only')}
                                </SelectItem>
                                {query.data.accounts.map((account) => (
                                  <SelectItem
                                    key={account.id}
                                    value={account.id}
                                    disabled={account.state !== 'configured'}
                                  >
                                    {account.label} · {account.account_id} ·{' '}
                                    {t(
                                      account.state === 'configured'
                                        ? 'Configured'
                                        : 'Authorization unavailable'
                                    )}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          <FieldDescription>
                            {t(
                              'Account credentials stay on the server. If no account is connected, use the publishing packages.'
                            )}
                          </FieldDescription>
                        </Field>
                      )}
                      <Field>
                        <FieldLabel htmlFor='publishing-visibility'>
                          {t('Video visibility')}
                        </FieldLabel>
                        <Select
                          value={form.watch('visibility')}
                          items={Object.entries(visibilityLabels).map(
                            ([value, label]) => ({ value, label })
                          )}
                          onValueChange={(value) => {
                            if (
                              value === 'private' ||
                              value === 'unlisted' ||
                              value === 'public'
                            ) {
                              form.setValue('visibility', value)
                            }
                          }}
                        >
                          <SelectTrigger id='publishing-visibility'>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {Object.entries(visibilityLabels).map(
                                ([value, label]) => (
                                  <SelectItem key={value} value={value}>
                                    {label}
                                  </SelectItem>
                                )
                              )}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor='publishing-time'>
                          {t('Optional publishing time')}
                        </FieldLabel>
                        <Input
                          id='publishing-time'
                          type='datetime-local'
                          {...form.register('schedule')}
                        />
                        <FieldDescription>
                          {t(
                            'Schedule within seven days. A missed publishing window requires a new confirmation.'
                          )}
                        </FieldDescription>
                        <FieldError errors={[form.formState.errors.schedule]} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor='publishing-tags'>
                          {t('Tags separated by commas')}
                        </FieldLabel>
                        <Input
                          id='publishing-tags'
                          maxLength={500}
                          {...form.register('tags')}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor='publishing-language'>
                          {t('Caption language')}
                        </FieldLabel>
                        <Input
                          id='publishing-language'
                          maxLength={40}
                          {...form.register('language')}
                        />
                      </Field>
                      {(['madeForKids', 'syntheticMedia'] as const).map(
                        (name) => (
                          <Field
                            key={name}
                            data-invalid={!!form.formState.errors[name]}
                          >
                            <FieldLabel htmlFor={`publishing-${name}`}>
                              {t(
                                name === 'madeForKids'
                                  ? 'Is this video made for children?'
                                  : 'Does this video contain realistic synthetic media?'
                              )}
                            </FieldLabel>
                            <Select
                              value={form.watch(name)}
                              items={[
                                { value: 'unset', label: t('Choose') },
                                { value: 'yes', label: t('Yes') },
                                { value: 'no', label: t('No') },
                              ]}
                              onValueChange={(value) => {
                                if (
                                  value === 'unset' ||
                                  value === 'yes' ||
                                  value === 'no'
                                ) {
                                  form.setValue(name, value, {
                                    shouldValidate: true,
                                  })
                                }
                              }}
                            >
                              <SelectTrigger
                                id={`publishing-${name}`}
                                aria-invalid={!!form.formState.errors[name]}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value='unset'>
                                    {t('Choose')}
                                  </SelectItem>
                                  <SelectItem value='yes'>
                                    {t('Yes')}
                                  </SelectItem>
                                  <SelectItem value='no'>{t('No')}</SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            <FieldError
                              errors={[form.formState.errors[name]]}
                            />
                          </Field>
                        )
                      )}
                    </FieldGroup>
                  </CollapsibleContent>
                </Collapsible>
                <Button type='submit' disabled={!writable || busy}>
                  {t(
                    prepare.isPending
                      ? 'Preparing publishing version'
                      : 'Prepare publishing version'
                  )}
                </Button>
              </FieldGroup>
            </form>
          </CollapsibleContent>
        </Collapsible>
      )}
      {draft && (
        <Card>
          <CardHeader>
            <CardTitle>{draft.title}</CardTitle>
            <CardDescription>
              {platformLabels[draft.platform]} · {t('Rendered version')}{' '}
              {formatNumber(draft.render_revision, locale)} ·{' '}
              {visibilityLabels[draft.visibility]}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <div className='flex flex-wrap gap-2'>
              <Badge variant='secondary'>
                {stateLabels[draft.state] || draft.state}
              </Badge>
              {Object.keys(draft.packages).length === 4 && (
                <Badge variant='outline'>
                  {t('Four publishing packages available')}
                </Badge>
              )}
            </div>
            {draft.description && (
              <p className='text-sm whitespace-pre-wrap'>{draft.description}</p>
            )}
            <p className='text-muted-foreground text-sm'>
              {draft.account_id
                ? `${draft.account_label} · ${draft.account_id}`
                : t(
                    'No authorized account is attached. Download the packages for manual upload.'
                  )}
            </p>
            {!!draft.schedule_at && (
              <p>
                {t('Planned publishing time')}:{' '}
                {new Date(draft.schedule_at * 1000).toLocaleString(locale)}
              </p>
            )}
            {draft.state === 'uncertain' && (
              <Alert>
                <AlertDescription>
                  {t(
                    'The upload may already exist. Continue this same publishing version so the server checks its saved session before sending anything again.'
                  )}
                </AlertDescription>
              </Alert>
            )}
            {draft.state === 'uploaded_incomplete' && (
              <Alert>
                <AlertDescription>
                  {t(
                    'The video already exists. Resume this version to finish its cover or captions; do not prepare another upload.'
                  )}
                </AlertDescription>
              </Alert>
            )}
            {[
              'cancelled',
              'cancelled_before_publication',
              'schedule_missed',
            ].includes(draft.state) && (
              <Alert>
                <AlertDescription>
                  {t(
                    'This publishing version is stopped. Check the provider status if an upload had started, then prepare a new version to publish again. Existing downloads are preserved.'
                  )}
                </AlertDescription>
              </Alert>
            )}
            {relevantJobs.map((job) => (
              <p key={job.id} className='text-muted-foreground text-sm'>
                {t(
                  job.action === 'package'
                    ? 'Publishing packages'
                    : 'Publishing task'
                )}{' '}
                ·{' '}
                {t(`studio.production.job.${job.status}`, {
                  defaultValue: job.status,
                })}{' '}
                · {formatNumber(job.progress, locale)}%
                {job.error && (
                  <span className='text-destructive'> · {job.error}</span>
                )}
              </p>
            ))}
            {!!Object.keys(draft.packages).length && (
              <FieldGroup>
                {Object.entries(draft.packages).map(([platform, id]) => (
                  <Button
                    key={platform}
                    variant='outline'
                    disabled={download.isPending}
                    onClick={() => download.mutate({ id, platform })}
                  >
                    {t('Download publishing package')} ·{' '}
                    {platformLabels[platform] || platform}
                  </Button>
                ))}
              </FieldGroup>
            )}
            {draft.metrics && (
              <div className='flex flex-col gap-2'>
                <h4 className='font-medium'>{t('Provider statistics')}</h4>
                <dl className='grid grid-cols-3 gap-3'>
                  {(
                    [
                      ['Views', draft.metrics.views],
                      ['Likes', draft.metrics.likes],
                      ['Comments', draft.metrics.comments],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt className='text-muted-foreground text-sm'>
                        {t(label)}
                      </dt>
                      <dd>{value === null ? t('Unknown') : value}</dd>
                    </div>
                  ))}
                </dl>
                <p className='text-muted-foreground text-sm'>
                  {t('Fetched at')}:{' '}
                  {new Date(draft.metrics.fetched_at).toLocaleString(locale)} ·{' '}
                  {draft.metrics.source}
                </p>
                <p className='text-muted-foreground text-sm'>
                  {t(
                    'These are cumulative provider counters. Missing metrics stay unknown; they do not establish conversion or a winning creative.'
                  )}
                </p>
              </div>
            )}
            <Collapsible>
              <CollapsibleTrigger render={<Button variant='ghost' />}>
                {t('Fixed source and metadata details')}
              </CollapsibleTrigger>
              <CollapsibleContent className='flex flex-col gap-2 text-sm break-all'>
                <p>
                  {t('Finished video digest')}: {draft.source_digest}
                </p>
                <p>
                  {t('Render task')}: {draft.render_job_id}
                </p>
                <p>
                  {t('Caption language')}: {draft.caption_language}
                </p>
                <p>
                  {t('Cover frame time in seconds')}:{' '}
                  {formatNumber(draft.cover_at, locale)}
                </p>
                <p>
                  {t('Tags')}: {(draft.tags || []).join(', ')}
                </p>
                <p>
                  {t(
                    'Publishing packages contain the actual MP4, cover image, title and description, subtitles, output specs and a version manifest. They do not represent an API publication.'
                  )}
                </p>
                {draft.remote_id && (
                  <p>
                    {t('Remote video')}: {draft.remote_id} ·{' '}
                    {visibilityLabels[draft.remote_visibility || ''] ||
                      draft.remote_visibility}
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>
            {draft.remote_id && (
              <a
                href={`https://www.youtube.com/watch?v=${encodeURIComponent(draft.remote_id)}`}
                target='_blank'
                rel='noreferrer'
                className='underline'
              >
                {t('Open uploaded video on YouTube')}
              </a>
            )}
          </CardContent>
          <CardFooter className='flex flex-wrap gap-2'>
            <Button
              disabled={
                !writable ||
                busy ||
                pending ||
                ['cancelled', 'cancelled_before_publication'].includes(
                  draft.state
                ) ||
                relevantJobs.some(
                  (job) =>
                    job.action === 'package' &&
                    ['queued', 'running', 'waiting'].includes(job.status)
                )
              }
              onClick={() =>
                action.mutate({ publication: draft, action: 'package' })
              }
            >
              {t('Prepare four publishing packages')}
            </Button>
            {canPublish && (
              <Button
                variant='outline'
                disabled={!writable || busy || pending || !accountAvailable}
                onClick={() => setConfirm('publish')}
              >
                {t(
                  draft.confirmed_fingerprint === draft.fingerprint
                    ? 'Review and continue the confirmed upload'
                    : 'Review and confirm YouTube upload'
                )}
              </Button>
            )}
            {!!draft.account_id && (
              <Button
                variant='outline'
                disabled={!writable || busy || pending || !accountAvailable}
                onClick={() =>
                  action.mutate({ publication: draft, action: 'status' })
                }
              >
                {t('Check provider upload status')}
              </Button>
            )}
            {!!draft.remote_id && (
              <Button
                variant='outline'
                disabled={!writable || busy || pending || !accountAvailable}
                onClick={() =>
                  action.mutate({ publication: draft, action: 'metrics' })
                }
              >
                {t('Fetch provider statistics')}
              </Button>
            )}
            {!draft.remote_id &&
              !['cancelled', 'cancelled_before_publication'].includes(
                draft.state
              ) && (
                <Button
                  variant='ghost'
                  disabled={!writable || busy}
                  onClick={() => setConfirm('cancel')}
                >
                  {t('Cancel local publishing task')}
                </Button>
              )}
          </CardFooter>
        </Card>
      )}
      <ConfirmDialog
        open={!!draft && !!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title={t(
          confirm === 'cancel'
            ? 'Stop this local publishing task?'
            : 'Confirm this exact YouTube upload'
        )}
        desc={
          draft ? (
            <div className='flex flex-col gap-2'>
              <p>{draft.title}</p>
              <p>
                {draft.account_label} · {draft.account_id}
              </p>
              <p>
                {t('Video visibility')}: {visibilityLabels[draft.visibility]}
              </p>
              <p>
                {t('Rendered version')}: {draft.render_revision}
              </p>
              <p>
                {t('Planned publishing time')}:{' '}
                {draft.schedule_at
                  ? new Date(draft.schedule_at * 1000).toLocaleString(locale)
                  : t('After confirmation')}
              </p>
              <p>
                {t('Made for children')}:{' '}
                {declarationLabel(draft.made_for_kids)} · {t('Synthetic media')}
                : {declarationLabel(draft.synthetic_media)}
              </p>
              <p className='break-all'>
                {t('Finished video digest')}: {draft.source_digest}
              </p>
              <p>
                {t(
                  confirm === 'cancel'
                    ? 'Cancellation stops the local task. It does not delete or unpublish a video that the provider already received.'
                    : 'This sends the fixed video, cover, captions and metadata to the displayed account. Changes require preparing a new publishing version.'
                )}
              </p>
            </div>
          ) : (
            ''
          )
        }
        confirmText={t(
          confirm === 'cancel'
            ? 'Stop local task'
            : 'Confirm upload to this account'
        )}
        handleConfirm={() => {
          if (draft && confirm) {
            action.mutate({ publication: draft, action: confirm })
          }
        }}
      />
    </section>
  )
}
