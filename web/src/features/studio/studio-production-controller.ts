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
import { toast } from 'sonner'

import { handleServerError } from '@/lib/handle-server-error'

import { fetchStudioModels } from './api'
import type { StudioProject } from './local-projects'
import {
  studioCloudRequest,
  studioCloudMedia,
  type StudioCloudProject,
  type StudioCloudJob,
  type StudioCloudVersion,
  type StudioCloudComment,
} from './studio-cloud'
import { studioNodeInputFingerprint } from './studio-execution'
import {
  studioProductionSchema,
  studioProjectTimeline,
  studioProjectRenderPlan,
  studioRenderMatchesProject,
  studioUnapprovedClips,
  type StudioTimelineClip,
} from './studio-production'
import { parseStudioSubtitleCues } from './studio-subtitle-cues'
import { studioWorkflowProblem } from './studio-workflow-problem'

export type StudioProductionPanelProps = {
  initialTab?: 'workflow' | 'media'
  open: boolean
  onOpenChange: (open: boolean) => void
  project: StudioProject
  userId: number
  selectedNodeId: string | null
  onSelectNode?: (nodeId: string) => void
  onSave: () => Promise<void>
  onRefresh: () => Promise<void>
  onUpdate: (project: StudioProject) => void
  getMedia: (id: string) => Promise<Blob | null>
}

export function useStudioProductionController(
  props: StudioProductionPanelProps
) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const path = `/projects/${encodeURIComponent(props.project.id)}`
  const [budget, setBudget] = useState('5')
  const [confirm, setConfirm] = useState(false)
  const [activeTab, setActiveTab] = useState<string>(
    props.initialTab || 'workflow'
  )
  const [mediaDraftNodeId, setMediaDraftNodeId] = useState(
    props.selectedNodeId || ''
  )
  const [selectedNodes, setSelectedNodes] = useState<string[]>(
    props.selectedNodeId ? [props.selectedNodeId] : []
  )
  useEffect(() => {
    if (props.open && props.selectedNodeId) {
      setSelectedNodes([props.selectedNodeId])
      setMediaDraftNodeId(props.selectedNodeId)
    }
  }, [props.open, props.selectedNodeId])
  const approvalSignature = JSON.stringify([
    budget,
    selectedNodes,
    props.project.nodes
      .filter((node) => selectedNodes.includes(node.id))
      .map((node) => studioNodeInputFingerprint(props.project, node.id)),
  ])
  useEffect(() => setConfirm(false), [approvalSignature])
  const [selectedClip, setSelectedClip] = useState('')
  const [reviewTarget, setReviewTarget] = useState<{
    nodeId: string
    takeId?: string
  } | null>(null)
  const [splitAt, setSplitAt] = useState('1')
  const [comment, setComment] = useState('')
  const [seconds, setSeconds] = useState('0')
  const [memberId, setMemberId] = useState('')
  const [memberRole, setMemberRole] = useState('editor')
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  const [audioNode, setAudioNode] = useState('')
  const [screenplay, setScreenplay] = useState('')
  const [transcriptionModel, setTranscriptionModel] = useState('')
  const availableModels = useQuery({
    queryKey: ['studio-production-models', props.userId],
    queryFn: () => fetchStudioModels(''),
    enabled: props.open,
  })
  useEffect(() => {
    const recognition = availableModels.data?.find((model) =>
      /whisper|transcrib|asr|sensevoice|paraformer|识别|字幕/i.test(model)
    )
    if (recognition) setTranscriptionModel((current) => current || recognition)
  }, [availableModels.data])
  const timeline = studioProjectTimeline(props.project)
  let captionsReady = !props.project.production?.captionDraft?.length
  try {
    parseStudioSubtitleCues(props.project.captionsText || '')
  } catch {
    captionsReady = false
  }
  let previewSignature = ''
  try {
    previewSignature = JSON.stringify(
      studioProjectRenderPlan(props.project, true)
    )
  } catch {
    /* Incomplete footage has no playable signature. */
  }
  const previewKey = `studio-preview:${props.userId}:${props.project.id}`
  const [watched, setWatched] = useState(() => {
    try {
      return localStorage.getItem(previewKey) || ''
    } catch {
      return ''
    }
  })
  const timelinePreviewed = !!previewSignature && watched === previewSignature
  const markTimelinePreviewed = () => {
    setWatched(previewSignature)
    try {
      localStorage.setItem(previewKey, previewSignature)
    } catch {
      /* Preview remains valid for this session. */
    }
  }
  const clip = timeline.find((clip) => clip.id === selectedClip)
  const capabilities = useQuery({
    queryKey: ['studio-cloud-capabilities', props.userId],
    queryFn: () =>
      studioCloudRequest<{
        render_available: boolean
        quota_per_unit: number
        available_quota: number
        generation_credit_available: boolean
        storage_available?: boolean
      }>('/capabilities'),
    enabled: props.open,
    refetchInterval: 30_000,
  })
  const record = useQuery({
    queryKey: ['studio-cloud-project', props.project.id],
    queryFn: () => studioCloudRequest<StudioCloudProject>(path),
    enabled: props.open,
  })
  const jobs = useQuery({
    queryKey: ['studio-cloud-jobs', props.project.id],
    queryFn: () => studioCloudRequest<StudioCloudJob[]>(`${path}/jobs`),
    enabled: props.open,
    refetchInterval: props.open ? 3000 : false,
  })
  const comments = useQuery({
    queryKey: ['studio-cloud-comments', props.project.id],
    queryFn: () => studioCloudRequest<StudioCloudComment[]>(`${path}/comments`),
    enabled: props.open,
  })
  const versions = useQuery({
    queryKey: ['studio-cloud-versions', props.project.id],
    queryFn: () => studioCloudRequest<StudioCloudVersion[]>(`${path}/versions`),
    enabled: props.open,
  })
  const members = useQuery({
    queryKey: ['studio-cloud-members', props.project.id],
    queryFn: () =>
      studioCloudRequest<
        {
          user_id: number
          role: string
          username?: string
          display_name?: string
        }[]
      >(`${path}/members`),
    enabled: props.open,
  })
  const writable = record.data && ['owner', 'editor'].includes(record.data.role)
  const refreshAccess = useRef({
    onSave: props.onSave,
    onRefresh: props.onRefresh,
  })
  refreshAccess.current = { onSave: props.onSave, onRefresh: props.onRefresh }
  const completedJobs = useRef(new Set<string>())
  useEffect(() => {
    const completed =
      jobs.data?.filter(
        (job) =>
          ['succeeded', 'failed', 'uncertain', 'cancelled'].includes(
            job.status
          ) && !completedJobs.current.has(`${job.id}:${job.status}`)
      ) || []
    if (!completed.length) return
    for (const job of completed) {
      completedJobs.current.add(`${job.id}:${job.status}`)
    }
    void client.invalidateQueries({ queryKey: ['studio-cloud-capabilities'] })
    void refreshAccess.current
      .onSave()
      .then(() => refreshAccess.current.onRefresh())
      .catch(handleServerError)
  }, [jobs.data, client])
  const events = useQuery({
    queryKey: ['studio-cloud-events', props.project.id, props.userId],
    queryFn: async () => {
      const key = `studio-events:v2:${props.userId}:${props.project.id}`
      const after = localStorage.getItem(key) || ''
      const result = await studioCloudRequest<{
        events: { id: string; kind: string; status: string; error: string }[]
        cursor: string
      }>(`${path}/events${after ? `?after=${encodeURIComponent(after)}` : ''}`)
      for (const event of result.events.slice(-5)) {
        const message = `${t('studio.production.workflowNotification')}: ${t(`studio.production.${event.kind}`)} · ${t(`studio.production.status.${event.status}`)}`
        if (event.status === 'succeeded') toast.success(message)
        else if (event.status === 'cancelled') toast.message(message)
        else {
          toast.error(`${message} · ${t(studioWorkflowProblem(event.error))}`)
        }
      }
      if (result.cursor) localStorage.setItem(key, result.cursor)
      return result
    },
    enabled: props.open,
    refetchInterval: props.open ? 5000 : false,
  })
  const mutate = useMutation({
    mutationFn: async (operation: () => Promise<unknown>) => operation(),
    onSuccess: async () => {
      for (const name of [
        'jobs',
        'versions',
        'comments',
        'members',
        'project',
      ]) {
        await client.invalidateQueries({
          queryKey: [`studio-cloud-${name}`, props.project.id],
        })
      }
    },
  })
  const latest = jobs.data?.find(
    (job) =>
      job.kind === 'render' &&
      job.status === 'succeeded' &&
      !(job.result as { variant_id?: string })?.variant_id
  )
  const activeRender = jobs.data?.find(
    (job) =>
      job.kind === 'render' &&
      ['queued', 'running', 'waiting'].includes(job.status)
  )
  const latestDelivery = jobs.data?.find(
    (job) =>
      job.kind === 'render' &&
      job.status === 'succeeded' &&
      !(job.result as { variant_id?: string })?.variant_id &&
      !!(job.result as { package_media_id?: string } | undefined)
        ?.package_media_id
  )
  const result = latestDelivery?.result as
    | { media_id?: string; package_media_id?: string }
    | undefined
  const isOpen = props.open
  const previewMediaId = (latest?.result as { media_id?: string } | undefined)
    ?.media_id
  const deliveryMediaId = result?.media_id
  const preview = studioRenderMatchesProject(props.project, latest?.result)
    ? previewUrls[previewMediaId || ''] || ''
    : ''
  const deliveryPreview =
    captionsReady &&
    studioRenderMatchesProject(props.project, latestDelivery?.result)
      ? previewUrls[deliveryMediaId || ''] || ''
      : ''
  const mediaAccess = useRef(props.getMedia)
  const audioMediaIds = [
    ...new Set(
      props.project.production?.audioTracks.map((track) => track.mediaId) || []
    ),
  ].join('\n')
  mediaAccess.current = (id) => studioCloudMedia(props.project.id, id)
  useEffect(() => {
    if (!isOpen) return
    let disposed = false
    const urls: Record<string, string> = {}
    const ids = [
      ...new Set(
        [previewMediaId, deliveryMediaId, ...audioMediaIds.split('\n')].filter(
          (id): id is string => !!id
        )
      ),
    ]
    void Promise.all(
      ids.map(async (id) => {
        const blob = await mediaAccess.current(id)
        if (blob && !disposed) urls[id] = URL.createObjectURL(blob)
      })
    )
      .then(() => {
        if (!disposed) setPreviewUrls(urls)
      })
      .catch((error) => {
        if (!disposed) handleServerError(error)
      })
    return () => {
      disposed = true
      for (const url of Object.values(urls)) URL.revokeObjectURL(url)
    }
  }, [
    isOpen,
    props.userId,
    props.project.id,
    previewMediaId,
    deliveryMediaId,
    audioMediaIds,
  ])
  const updateClip = (patch: Partial<StudioTimelineClip>): void => {
    props.onUpdate({
      ...props.project,
      production: {
        ...(props.project.production || studioProductionSchema.parse({})),
        timelineEdited: true,
        timeline: timeline.map((item) =>
          item.id === selectedClip ? { ...item, ...patch } : item
        ),
      },
      updatedAt: new Date().toISOString(),
    })
  }
  const submit = async (
    kind: 'generate' | 'render' | 'quality',
    draft = false,
    runAfter = 0
  ): Promise<void> => {
    if (kind === 'render' && !captionsReady) {
      throw new Error(t('Finish pending caption edits before exporting.'))
    }
    if (
      kind === 'render' &&
      !draft &&
      props.project.production?.requireApproved &&
      studioUnapprovedClips(props.project).length
    ) {
      throw new Error(
        t(
          'Approve the current footage for every delivery clip before exporting.'
        )
      )
    }
    await props.onSave()
    const current = await studioCloudRequest<StudioCloudProject>(
      kind === 'render' ? `${path}/materialize` : path,
      kind === 'render' ? 'POST' : 'GET'
    )
    if (
      kind === 'render' &&
      !draft &&
      current.document.production?.requireApproved &&
      studioUnapprovedClips(current.document).length
    ) {
      throw new Error(
        t(
          'Approve the current footage for every delivery clip before exporting.'
        )
      )
    }
    await studioCloudRequest(`${path}/jobs`, 'POST', {
      request_id: crypto.randomUUID(),
      kind,
      run_after: runAfter,
      revision: current.revision,
      budget:
        kind === 'generate'
          ? Math.round(
              Number(budget) * (capabilities.data?.quota_per_unit || 500000)
            )
          : 0,
      node_ids: selectedNodes,
      confirm_generation: confirm,
      render:
        kind === 'render'
          ? studioProjectRenderPlan(current.document, draft)
          : undefined,
    })
  }
  const download = async (
    mediaId: string | undefined,
    filename: string
  ): Promise<void> => {
    if (!mediaId) throw new Error(t('studio.production.mediaMissing'))
    const blob = await studioCloudMedia(props.project.id, mediaId)
    if (!blob) throw new Error(t('studio.production.mediaMissing'))
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }
  return {
    props,
    activeTab,
    setActiveTab,
    mediaDraftNodeId,
    setMediaDraftNodeId,
    path,
    budget,
    setBudget,
    confirm,
    setConfirm,
    selectedNodes,
    setSelectedNodes,
    selectedClip,
    reviewTarget,
    setReviewTarget,
    setSelectedClip,
    splitAt,
    setSplitAt,
    comment,
    setComment,
    seconds,
    setSeconds,
    memberId,
    setMemberId,
    memberRole,
    setMemberRole,
    preview,
    deliveryPreview,
    activeRender,
    mediaPreviewUrls: previewUrls,
    audioNode,
    setAudioNode,
    screenplay,
    setScreenplay,
    transcriptionModel,
    setTranscriptionModel,
    timeline,
    captionsReady,
    timelinePreviewed,
    markTimelinePreviewed,
    clip,
    capabilities,
    record,
    jobs,
    comments,
    versions,
    members,
    events,
    writable,
    mutate,
    result,
    updateClip,
    submit,
    download,
  }
}
