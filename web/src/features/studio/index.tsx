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
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { t as translate } from 'i18next'
import { Film, ImagePlus, Type } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useAuthStore } from '@/stores/auth-store'

import {
  createStudioVideo,
  deleteStudioProviderConfig,
  fetchStudioGroups,
  fetchStudioAttemptByRequest,
  fetchStudioModels,
  fetchStudioProviderConfigs,
  fetchStudioProviderModels,
  generateStudioImage,
  generateStudioSpeech,
  generateStudioStoryboard,
  generateStudioText,
  getStudioVideoContentUrl,
  getStudioVideoTask,
  saveStudioProviderConfig,
  type StudioGroup,
  type StudioShotDraft,
  type StudioTaskState,
  type StudioProviderConfigs,
  type StudioProviderKind,
} from './api'
import { loadStudioAssemblyBlobs } from './assembly-media'
import {
  planStudioAssembly,
  reconcileStudioAssembly,
  StudioAssemblyError,
  studioAssemblyFingerprint,
  studioAssemblyProjectFromCanvas,
} from './assembly-plan'
import {
  connectedGenerationInput,
  planStudioExecution,
  resolveStudioEdgeSource,
  studioNodeInputsChanged,
  type StudioCanvasNode,
  type StudioCanvasNodeData,
  type StudioTake,
} from './canvas-flow'
import {
  loadStudioProjects,
  parseStudioProjectImport,
  saveStudioProjects,
  serializeStudioProjectExport,
  StudioProjectStorageError,
  studioProjectsKey,
  type StudioProject,
  type StudioShot,
  type StudioAssetProfile,
} from './local-projects'
import { studioMediaStore } from './media-store'
import {
  buildStudioVideoModel,
  buildStudioVideoRequest,
  applyStudioVideoPayloadPatch,
  parseStudioVideoMetadata,
} from './model-profiles'
import {
  getStudioStorageHealth,
  migrateLegacyStudioProjects,
  type StudioStorageHealth,
} from './project-storage'
import { StudioProviderSettings } from './provider-settings'
import {
  studioAgentSnapshot,
  useStudioAgentBridge,
} from './studio-agent-bridge'
import { StudioAgentPanel } from './studio-agent-panel'
import { StudioAssemblyNodeInspector } from './studio-assembly-node-inspector'
import { StudioAssetLibrary } from './studio-asset-library'
import { StudioAssetProfileEditor } from './studio-asset-profile-editor'
import { StudioAttempts, type StudioLocalTask } from './studio-attempts'
import {
  applyStudioCanvasOperations,
  StudioCanvasHistory,
  studioNodeBusy,
  studioCanvasDocumentFingerprint,
  type StudioCanvasOperation,
} from './studio-canvas-commands'
import { StudioCanvasEditor } from './studio-canvas-editor'
import {
  studioCloudRequest,
  studioCloudMedia,
  refreshStudioProjects,
  type StudioCloudProject,
  type StudioCloudJob,
} from './studio-cloud'
import { mergeStudioCloudDocument } from './studio-cloud-merge'
import {
  compileStudioContinuityPrompt,
  resolveStudioAssetReference,
  studioNodeAssetContext,
} from './studio-continuity'
import {
  fetchStudioVideoCostPreview,
  studioCostDurationSeconds,
  type StudioVideoCostPreview,
} from './studio-cost'
import { loadStudioEditingExample } from './studio-creation-demo'
import { classifyStudioCreationModels } from './studio-creation-models'
import { StudioCreationWorkspace } from './studio-creation-workspace'
import { studioRecipeProject } from './studio-creative-plan'
import {
  StudioExecutionCoordinator,
  studioNodeInputFingerprint,
  planStudioVideoBatch,
} from './studio-execution'
import { captureStudioLastFrame } from './studio-frame-grab'
import { StudioInspector } from './studio-inspector'
import {
  createStudioEditedNode,
  studioEditedMediaTitle,
} from './studio-media-editing'
import { StudioMediaEditor } from './studio-media-editor'
import {
  studioProductionSchema,
  studioProjectRenderPlan,
} from './studio-production'
import {
  exportStudioProjectBundle,
  importStudioProjectBundle,
} from './studio-project-bundle'
import { StudioProjectMedia } from './studio-project-media'
import { StudioProjectToolbar } from './studio-project-toolbar'
import { StudioSaveRecovery } from './studio-save-recovery'
import { StudioStoryboard } from './studio-storyboard'
import {
  StudioTaskPollSchedule,
  pollStudioTasksBounded,
} from './studio-task-scheduler'
import { StudioTemplateLibrary } from './studio-template-library'
import {
  StudioVideoPreflight,
  type StudioVideoPreflightData,
} from './studio-video-preflight'
import { safeStudioVideoRequestSnapshot } from './studio-video-request-summary'
import {
  createStudioVideoTemplateDraft,
  loadStudioVideoTemplates,
  saveStudioVideoTemplate,
  type StudioVideoTemplate,
} from './studio-video-templates'
import { studioWorkflowProblem } from './studio-workflow-problem'
import { studioWorkspaceEntry } from './studio-workspace-navigation'
import {
  applyStudioAssetToAllShots,
  addPlannedStudioShots,
  addStudioShot,
  createStudioProject,
  copyStudioShotReferences,
  ensureStudioFinalVideo,
  invalidateStudioBranch,
  markStudioDependentWaiting,
  moveStudioShot,
  pinStudioConnectionTake,
  pinStudioShotAssetVersion,
  recordStudioTake,
  reviseStudioTextOutput,
  retainStudioTake,
  selectStudioTake,
  archiveStudioTake,
  archivableStudioTakeIds,
  setStudioShotAssets,
  setStudioFinalVideoReference,
  studioBranchNodeIds,
  studioUnpinnedDependentTargets,
  updateStudioNode,
  updateStudioTake,
} from './workspace'

type WorkspaceState = {
  ownerId: number
  projects: StudioProject[]
  activeId: string
  ready: boolean
}
type StudioMediaRef = {
  projectId: string
  nodeId: string
  mediaId: string
  kind:
    | 'node'
    | 'assembly'
    | 'soundtrack'
    | 'voiceover'
    | 'asset'
    | 'asset-version'
    | 'shot-voiceover'
    | 'take'
}
class StudioInputChangedError extends Error {}
class StudioUpstreamWaitError extends Error {}
class StudioSubmissionCancelledError extends Error {}
class StudioSubmissionUncertainError extends Error {}

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const mapped = studioWorkflowProblem(raw)
  return mapped.startsWith('The task failed.') ? raw : translate(mapped)
}

function newId(): string {
  return crypto.randomUUID()
}

function previewKey(projectId: string, nodeId: string): string {
  return `${projectId}:${nodeId}`
}

function mediaLoadKey(
  ref: Pick<StudioMediaRef, 'kind' | 'projectId' | 'mediaId'>
): string {
  return JSON.stringify([ref.kind, ref.projectId, ref.mediaId])
}

function projectStoredMediaIds(project: StudioProject): Set<string> {
  const ids = new Set<string>()
  for (const node of project.nodes) {
    if (node.data.mediaId) ids.add(node.data.mediaId)
    for (const take of node.data.takes || []) {
      if (take.mediaId) ids.add(take.mediaId)
    }
  }
  for (const asset of project.assets || []) {
    if (asset.mediaId) ids.add(asset.mediaId)
    for (const version of asset.versions || []) {
      if (version.mediaId) ids.add(version.mediaId)
    }
  }
  for (const shot of project.shots || []) {
    if (shot.shotVoiceoverMediaId) ids.add(shot.shotVoiceoverMediaId)
  }
  if (project.assembledMediaId) ids.add(project.assembledMediaId)
  if (project.soundtrackMediaId) ids.add(project.soundtrackMediaId)
  if (project.voiceoverMediaId) ids.add(project.voiceoverMediaId)
  return ids
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('image file could not be read'))
    })
    reader.addEventListener('error', () =>
      reject(reader.error || new Error('image file could not be read'))
    )
    reader.readAsDataURL(blob)
  })
}

function resolveVideoGroup(
  savedGroup: string | undefined,
  userGroup: string,
  groups: StudioGroup[]
): string {
  if (savedGroup) {
    return groups.some((group) => group.id === savedGroup) ? savedGroup : ''
  }
  return (
    groups.find((group) => group.id === userGroup)?.id || groups[0]?.id || ''
  )
}

export function Studio(
  options: {
    workspace?: 'guided' | 'assets' | 'templates' | 'canvas' | 'storyboard'
    project?: string
    step?: import('./studio-creation').StudioCreationStep
    onNavigate?: (
      workspace: 'guided' | 'assets' | 'canvas' | 'storyboard' | 'templates',
      project?: string,
      replace?: boolean,
      step?: import('./studio-creation').StudioCreationStep
    ) => void
  } = {}
) {
  const [productionInitialTab, setProductionInitialTab] = useState<
    'workflow' | 'media' | undefined
  >()
  const productionEntry = useRef<
    (tab?: 'workflow' | 'media', nodeId?: string) => void
  >(() => {})
  const openProduction = useCallback(
    (tab?: 'workflow' | 'media', nodeId?: string) =>
      productionEntry.current(tab, nodeId),
    []
  )
  productionEntry.current = (tab?: 'workflow' | 'media', nodeId?: string) => {
    if (!project) return
    setProductionInitialTab(tab)
    const step =
      tab === 'media'
        ? 'voice'
        : studioWorkspaceEntry(project, nodeId || selectedNodeId)
    options.onNavigate?.('guided', project.id, false, step)
    setView('guided')
  }
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id ?? 0)
  const userGroup = useAuthStore((state) => state.auth.user?.group ?? '')
  const generationAccess = useQuery({
    queryKey: ['studio-cloud-capabilities', userId],
    queryFn: () =>
      studioCloudRequest<{
        render_available: boolean
        quota_per_unit: number
        available_quota: number
        generation_credit_available: boolean
        storage_available?: boolean
      }>('/capabilities'),
    enabled: userId > 0,
    refetchInterval: 30_000,
  })
  let generationBlockReason = 'Loading balance and service access'
  if (generationAccess.data) {
    generationBlockReason =
      generationAccess.data.storage_available === false
        ? 'Studio storage is unavailable. Restore free space or reconnect storage before generating.'
        : 'Insufficient generation credit. Add credit or continue with free editing.'
  }
  const [workspace, setWorkspace] = useState<WorkspaceState>({
    ownerId: 0,
    projects: [],
    activeId: '',
    ready: false,
  })
  const [unreadableProjectData, setUnreadableProjectData] = useState<{
    ownerId: number
    raw: string
    error: string
  } | null>(null)
  const [backupDownloaded, setBackupDownloaded] = useState(false)
  const [storageHealth, setStorageHealth] =
    useState<StudioStorageHealth | null>(null)
  const [videoTemplates, setVideoTemplates] = useState<StudioVideoTemplate[]>(
    []
  )
  const [videoGroups, setVideoGroups] = useState<StudioGroup[]>([])
  const [providerConfigs, setProviderConfigs] = useState<StudioProviderConfigs>(
    {}
  )
  const [providerModels, setProviderModels] = useState<
    Partial<Record<StudioProviderKind, string[]>>
  >({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [, refreshSaveStatus] = useState(0)
  const [advancedTools, setAdvancedTools] = useState(false)
  const [attemptsOpen, setAttemptsOpen] = useState(false)
  const [agentOpen, setAgentOpen] = useState(false)
  const [agentGatewayModels, setAgentGatewayModels] = useState<
    Record<string, string[]>
  >({})
  const [settingsKind, setSettingsKind] = useState<StudioProviderKind>('text')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [view, setViewState] = useState<
    'guided' | 'canvas' | 'storyboard' | 'assets' | 'templates'
  >('guided')
  const setView = (next: typeof view): void => {
    setViewState(next)
    options.onNavigate?.(next, activeProjectId.current)
  }
  const requestedWorkspace = options.workspace
  useEffect(() => {
    const requested = requestedWorkspace
    if (requested === 'templates') {
      setViewState('templates')
      return
    }
    if (
      requested === 'guided' ||
      requested === 'assets' ||
      requested === 'canvas' ||
      requested === 'storyboard'
    ) {
      setViewState(requested)
    }
  }, [requestedWorkspace])
  const nativeResults = useRef(
    new Map<string, { targetId: string; projectId: string; select: boolean }>()
  )
  const canvasHistories = useRef(new Map<string, StudioCanvasHistory>())
  const [, setCanvasHistoryEpoch] = useState(0)
  const [batchBusy, setBatchBusy] = useState(false)
  const [frameBusyShotId, setFrameBusyShotId] = useState<string | null>(null)
  const [batchLimit, setBatchLimit] = useState(5)
  const [batchCost, setBatchCost] = useState<
    { status: 'estimated'; estimatedUsd: number } | { status: 'unknown' }
  >({ status: 'unknown' })
  const [preflightData, setPreflightData] =
    useState<StudioVideoPreflightData | null>(null)
  const [preflightNonce, setPreflightNonce] = useState(0)
  const pendingPreflight = useRef<{
    data: StudioVideoPreflightData
    projectId: string
    ownerId: number
    guard: () => boolean
    resolve: (approved: boolean) => void
  } | null>(null)
  const preflightQueue = useRef<
    Array<NonNullable<typeof pendingPreflight.current>>
  >([])
  const [assemblyBusy, setAssemblyBusy] = useState(false)
  const [assemblyProgress, setAssemblyProgress] = useState(0)
  const [assemblyError, setAssemblyError] = useState<string | undefined>()
  const [message, setMessage] = useState<string | null>(null)
  const [saveFailure, setSaveFailure] = useState('')
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [requestPreviews, setRequestPreviews] = useState<
    Record<string, string>
  >({})
  const [assemblyPreviews, setAssemblyPreviews] = useState<Map<string, string>>(
    () => new Map()
  )
  const [soundtrackPreviews, setSoundtrackPreviews] = useState<
    Map<string, string>
  >(() => new Map())
  const [voiceoverPreviews, setVoiceoverPreviews] = useState<
    Map<string, string>
  >(() => new Map())
  const [assemblyPreflight, setAssemblyPreflight] = useState<{
    totalDuration: number
    estimatedOutputBytes: number
  }>()
  const [deleteTarget, setDeleteTarget] = useState<
    'node' | 'project' | 'shot' | null
  >(null)
  const [abandonSubmission, setAbandonSubmission] = useState<{
    projectId: string
    nodeId: string
  } | null>(null)
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
  const ownedUrls = useRef<string[]>([])
  const assemblyRun = useRef<{
    ownerId: number
    projectId: string
    controller: AbortController
  } | null>(null)
  const previousAssemblies = useRef<{
    ownerId: number
    ids: Map<string, string>
  }>({ ownerId: 0, ids: new Map() })
  const activeUserId = useRef(userId)
  activeUserId.current = userId
  const mediaStore = useMemo(() => {
    try {
      return studioMediaStore()
    } catch {
      return null
    }
  }, [])

  const visible = workspace.ready && workspace.ownerId === userId
  const projects = useMemo(
    () => (visible ? workspace.projects : []),
    [visible, workspace.projects]
  )
  const project = projects.find((item) => item.id === workspace.activeId)
  const cloudConflicts = mediaStore?.saveConflicts?.() || []
  const activeProjectId = useRef(project?.id)
  activeProjectId.current = project?.id
  const projectsRef = useRef(projects)
  projectsRef.current = projects
  const lastRouteProject = useRef(options.project)
  const pendingRouteProject = useRef<string | undefined>(options.project)
  if (lastRouteProject.current !== options.project) {
    lastRouteProject.current = options.project
    if (options.project) pendingRouteProject.current = options.project
  }
  useEffect(() => {
    const requested = pendingRouteProject.current
    if (!visible || !requested) return
    if (
      project?.id !== requested &&
      projects.some((entry) => entry.id === requested)
    ) {
      setWorkspace((current) => ({ ...current, activeId: requested }))
      return
    }
    pendingRouteProject.current = undefined
  }, [visible, project?.id, projects, options.project])
  useEffect(() => {
    if (!visible || !project || pendingRouteProject.current) return
    if (options.project !== project.id) {
      options.onNavigate?.(view, project.id, true)
    }
  }, [visible, project, options, view])
  const settlePreflight = useCallback((approved: boolean) => {
    const pending = pendingPreflight.current
    if (!pending) return
    pendingPreflight.current = null
    pending.resolve(
      approved &&
        activeUserId.current === pending.ownerId &&
        activeProjectId.current === pending.projectId &&
        pending.guard()
    )
    while (preflightQueue.current.length) {
      const next = preflightQueue.current.shift()
      if (!next) break
      if (
        next.ownerId === activeUserId.current &&
        next.projectId === activeProjectId.current &&
        next.guard()
      ) {
        pendingPreflight.current = next
        setPreflightData(next.data)
        setPreflightNonce((current) => current + 1)
        return
      }
      next.resolve(false)
    }
    setPreflightData(null)
  }, [])
  const requestPreflight = useCallback(
    (data: StudioVideoPreflightData, projectId: string, guard: () => boolean) =>
      new Promise<boolean>((resolve) => {
        const pending = {
          data,
          projectId,
          ownerId: activeUserId.current,
          guard,
          resolve,
        }
        if (pendingPreflight.current) {
          preflightQueue.current.push(pending)
          return
        }
        pendingPreflight.current = pending
        setPreflightData(data)
        setPreflightNonce((current) => current + 1)
      }),
    []
  )
  useEffect(() => {
    const pending = pendingPreflight.current
    if (
      pending &&
      (pending.ownerId !== userId ||
        pending.projectId !== project?.id ||
        !pending.guard())
    ) {
      settlePreflight(false)
    }
  }, [workspace.projects, project?.id, userId, settlePreflight])
  useEffect(
    () => () => {
      pendingPreflight.current?.resolve(false)
      pendingPreflight.current = null
      for (const queued of preflightQueue.current.splice(0)) {
        queued.resolve(false)
      }
    },
    []
  )
  const canvasNodes = useMemo(
    () =>
      project?.nodes.map((node) => {
        let previewUrl: string | undefined =
          previews[previewKey(project.id, node.id)]
        if (node.data.purpose === 'assembly') {
          previewUrl =
            node.data.status === 'completed' && node.data.mediaId
              ? assemblyPreviews.get(project.id)
              : undefined
        }
        return {
          ...node,
          data: {
            ...node.data,
            previewUrl,
            usedSourceHandles: project.edges
              .filter((edge) => edge.source === node.id && edge.sourceHandle)
              .map((edge) => edge.sourceHandle as string),
            usedTargetHandles: project.edges
              .filter((edge) => edge.target === node.id && edge.targetHandle)
              .map((edge) => edge.targetHandle as string),
            hasLegacyTargetHandle: project.edges.some(
              (edge) => edge.target === node.id && !edge.targetHandle
            ),
          },
        }
      }) ?? [],
    [project, previews, assemblyPreviews]
  )
  const selectedNode = project?.nodes.find((node) => node.id === selectedNodeId)
  const selectedAsset = project?.assets?.find(
    (asset) => asset.id === selectedNode?.data.linkedAssetId
  )
  const canvasHistoryKey = `${userId}:${project?.id || ''}`
  if (!canvasHistories.current.has(canvasHistoryKey)) {
    canvasHistories.current.set(canvasHistoryKey, new StudioCanvasHistory())
  }
  const canvasHistory =
    canvasHistories.current.get(canvasHistoryKey) || new StudioCanvasHistory()
  const selectedGroup =
    selectedNode?.data.kind === 'video'
      ? resolveVideoGroup(selectedNode.data.group, userGroup, videoGroups)
      : ''
  const batchPlan = useMemo(() => {
    if (!project) return { targets: [], billableNodes: [], capped: false }
    try {
      return planStudioVideoBatch(project, batchLimit)
    } catch {
      return { targets: [], billableNodes: [], capped: true }
    }
  }, [project, batchLimit])
  const batchCostInput = JSON.stringify(
    batchPlan.billableNodes.map((node) => ({
      modelId: node.data.model || '',
      group: resolveVideoGroup(node.data.group, userGroup, videoGroups),
      durationSeconds:
        studioCostDurationSeconds(
          node.data.seconds ?? 5,
          node.data.payloadPatchJson
        ) ?? 0,
      quantity: 1,
    }))
  )

  useEffect(() => {
    const inputs = JSON.parse(batchCostInput) as Parameters<
      typeof fetchStudioVideoCostPreview
    >[0][]
    if (!inputs.length) {
      setBatchCost({ status: 'unknown' })
      return
    }
    let cancelled = false
    void Promise.all(inputs.map(fetchStudioVideoCostPreview)).then(
      (previews: StudioVideoCostPreview[]) => {
        if (cancelled) return
        if (previews.every((preview) => preview.status === 'estimated')) {
          setBatchCost({
            status: 'estimated',
            estimatedUsd: previews.reduce(
              (total, preview) =>
                total +
                (preview.status === 'estimated' ? preview.estimatedUsd : 0),
              0
            ),
          })
        } else {
          setBatchCost({ status: 'unknown' })
        }
      }
    )
    return () => {
      cancelled = true
    }
  }, [batchCostInput])
  const mediaRefs: StudioMediaRef[] = useMemo(() => {
    if (!project) return []
    const refs: StudioMediaRef[] = project.nodes.flatMap((node) =>
      node.data.mediaId
        ? [
            {
              projectId: project.id,
              nodeId: node.id,
              mediaId: node.data.mediaId,
              kind: 'node' as const,
            },
          ]
        : []
    )
    if (project.assembledMediaId) {
      refs.push({
        projectId: project.id,
        nodeId: 'assembly',
        mediaId: project.assembledMediaId,
        kind: 'assembly',
      })
    }
    if (project.soundtrackMediaId) {
      refs.push({
        projectId: project.id,
        nodeId: 'soundtrack',
        mediaId: project.soundtrackMediaId,
        kind: 'soundtrack',
      })
    }
    if (project.voiceoverMediaId) {
      refs.push({
        projectId: project.id,
        nodeId: 'voiceover',
        mediaId: project.voiceoverMediaId,
        kind: 'voiceover',
      })
    }
    for (const asset of project.assets || []) {
      if (asset.mediaId) {
        refs.push({
          projectId: project.id,
          nodeId: `asset:${asset.id}`,
          mediaId: asset.mediaId,
          kind: 'asset',
        })
      }
      for (const version of asset.versions || []) {
        if (!version.mediaId) continue
        refs.push({
          projectId: project.id,
          nodeId: `asset:${asset.id}:version:${version.id}`,
          mediaId: version.mediaId,
          kind: 'asset-version',
        })
      }
    }
    for (const shot of project.shots || []) {
      if (shot.shotVoiceoverMediaId) {
        refs.push({
          projectId: project.id,
          nodeId: `shot:${shot.id}:voiceover`,
          mediaId: shot.shotVoiceoverMediaId,
          kind: 'shot-voiceover',
        })
      }
      const video = project.nodes.find((node) => node.id === shot.videoNodeId)
      for (const take of (video?.data.takes || [])
        .filter((item) => item.status === 'completed')
        .slice(-6)) {
        if (!take.mediaId) continue
        refs.push({
          projectId: project.id,
          nodeId: `${shot.videoNodeId}:${take.id}`,
          mediaId: take.mediaId,
          kind: 'take',
        })
      }
    }
    return refs
  }, [project])
  const mediaRefsKey = JSON.stringify(mediaRefs)
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    void getStudioStorageHealth(navigator.storage ?? null).then((health) => {
      if (!cancelled) setStorageHealth(health)
    })
    return () => {
      cancelled = true
    }
  }, [visible, mediaRefsKey])
  const loadedMediaIds = useRef(new Set<string>())
  const runningTargets = useRef(new Set<string>())
  const executionCoordinator = useRef(new StudioExecutionCoordinator())
  const pendingVideos = useMemo(
    () =>
      projects.flatMap((item) =>
        item.nodes.flatMap((node) => {
          if (node.data.kind !== 'video') return []
          const versions = (node.data.takes || [])
            .filter(
              (take) =>
                take.taskId &&
                (take.status === 'queued' || take.status === 'processing')
            )
            .map((take) => ({
              projectId: item.id,
              nodeId: node.id,
              taskId: take.taskId || '',
              takeId: take.id,
            }))
          if (
            node.data.taskId &&
            !node.data.takes?.some(
              (take) => take.taskId === node.data.taskId
            ) &&
            (node.data.status === 'queued' || node.data.status === 'processing')
          ) {
            versions.push({
              projectId: item.id,
              nodeId: node.id,
              taskId: node.data.taskId,
              takeId: '',
            })
          }
          return versions
        })
      ),
    [projects]
  )
  const pendingVideoKey = JSON.stringify(
    pendingVideos
      .map((entry) => [entry.projectId, entry.nodeId, entry.taskId])
      .sort()
  )
  const pendingVideosRef = useRef(pendingVideos)
  pendingVideosRef.current = pendingVideos
  const localTasks = useMemo<StudioLocalTask[]>(
    () =>
      projects
        .flatMap((entry) =>
          entry.nodes.flatMap((node) => {
            if (node.data.kind !== 'video') return []
            return (node.data.takes || [])
              .filter((take) => Boolean(take.taskId))
              .map((take) => ({
                projectId: entry.id,
                projectTitle: entry.title,
                nodeId: node.id,
                nodeTitle: node.data.title,
                taskId: take.taskId || '',
                model: take.model || node.data.model || '',
                status: take.status,
                progress: take.progress,
                createdAt: take.createdAt,
              }))
          })
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 50),
    [projects]
  )
  const taskPollSchedule = useRef(new StudioTaskPollSchedule())
  useEffect(() => {
    taskPollSchedule.current = new StudioTaskPollSchedule()
  }, [userId])
  const workspaceLabel = useEffectEvent((key: string) => t(key))
  const restoreWorkspaceView = useEffectEvent((fallback: typeof view) => {
    setViewState(
      requestedWorkspace === 'templates'
        ? 'templates'
        : (requestedWorkspace ?? fallback)
    )
  })

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setSaveFailure('')
    setUnreadableProjectData(null)
    setBackupDownloaded(false)
    setStorageHealth(null)
    setProviderConfigs({})
    setProviderModels({})
    setVideoTemplates(loadStudioVideoTemplates(localStorage, userId))
    void (async () => {
      let projects: StudioProject[] = []
      try {
        projects = mediaStore
          ? (
              await migrateLegacyStudioProjects(
                mediaStore,
                localStorage,
                userId
              )
            ).projects
          : loadStudioProjects(localStorage, userId)
      } catch (error) {
        if (cancelled) return
        setUnreadableProjectData({
          ownerId: userId,
          raw: error instanceof StudioProjectStorageError ? error.raw : '',
          error:
            error instanceof StudioProjectStorageError
              ? workspaceLabel('studio.project.invalidLocalData')
              : errorMessage(error),
        })
        setWorkspace({
          ownerId: userId,
          projects: [],
          activeId: '',
          ready: false,
        })
        return
      }
      if (cancelled) return
      if (!projects.length) {
        const fresh = createStudioProject(
          workspaceLabel('studio.project.untitled'),
          newId()
        )
        fresh.production = {
          ...studioProductionSchema.parse({}),
          guide: { step: 'story', goal: 'story' },
        }
        projects = [fresh]
      }
      setWorkspace({
        ownerId: userId,
        projects,
        activeId:
          projects.find(
            (project) =>
              project.id ===
              (pendingRouteProject.current ||
                new URLSearchParams(window.location.search).get('project'))
          )?.id || projects[0].id,
        ready: true,
      })
      setSelectedNodeId(null)
      const restoredProject =
        projects.find(
          (item) =>
            item.id ===
            (pendingRouteProject.current ||
              new URLSearchParams(window.location.search).get('project'))
        ) || projects[0]
      let restoredView: typeof view = 'canvas'
      if (restoredProject.production?.guide) restoredView = 'guided'
      else if (
        restoredProject.shots?.length ||
        restoredProject.nodes.length === 0
      ) {
        restoredView = 'storyboard'
      }
      restoreWorkspaceView(restoredView)
      setVideoGroups([])
      setSettingsOpen(false)
      setAttemptsOpen(false)
      setPreviews({})
      setRequestPreviews({})
      setAssemblyPreviews(new Map())
      setSoundtrackPreviews(new Map())
      setVoiceoverPreviews(new Map())
      loadedMediaIds.current.clear()
      ownedUrls.current.forEach((url) => URL.revokeObjectURL(url))
      ownedUrls.current = []
      void fetchStudioGroups()
        .then((groups) => {
          if (!cancelled) setVideoGroups(groups)
        })
        .catch((error) => {
          if (!cancelled) setMessage(errorMessage(error))
        })
    })()
    return () => {
      cancelled = true
      ownedUrls.current.forEach((url) => URL.revokeObjectURL(url))
      ownedUrls.current = []
    }
  }, [userId, mediaStore])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void fetchStudioProviderConfigs()
      .then(async (configs) => {
        if (cancelled) return
        setProviderConfigs(configs)
        await Promise.all(
          (['text', 'image'] as const).map(async (kind) => {
            try {
              const models = configs[kind]?.hasKey
                ? await fetchStudioProviderModels(kind)
                : classifyStudioCreationModels(
                    await fetchStudioModels(userGroup || 'default')
                  )[kind]
              if (!cancelled) {
                setProviderModels((current) => ({
                  ...current,
                  [kind]: models,
                }))
              }
            } catch (error) {
              if (!cancelled) setMessage(errorMessage(error))
            }
          })
        )
      })
      .catch((error) => {
        if (!cancelled) setMessage(errorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [userId, userGroup])

  const refreshProviderModels = useCallback(
    async (kind: StudioProviderKind) => {
      const ownerId = userId
      const configs = await fetchStudioProviderConfigs()
      const models = configs[kind]?.hasKey
        ? await fetchStudioProviderModels(kind)
        : classifyStudioCreationModels(
            await fetchStudioModels(userGroup || 'default')
          )[kind]
      if (activeUserId.current === ownerId) {
        setProviderModels((current) => ({ ...current, [kind]: models }))
      }
    },
    [userId, userGroup]
  )

  const saveProvider = useCallback(
    async (kind: StudioProviderKind, baseUrl: string, key: string) => {
      const ownerId = userId
      const config = await saveStudioProviderConfig(kind, baseUrl, key)
      if (activeUserId.current !== ownerId) return
      setProviderConfigs((current) => ({ ...current, [kind]: config }))
      setProviderModels((current) => ({ ...current, [kind]: [] }))
      await refreshProviderModels(kind)
    },
    [userId, refreshProviderModels]
  )

  const removeProvider = useCallback(
    async (kind: StudioProviderKind) => {
      const ownerId = userId
      await deleteStudioProviderConfig(kind)
      if (activeUserId.current !== ownerId) return
      setProviderConfigs((current) => ({ ...current, [kind]: undefined }))
      setProviderModels((current) => ({ ...current, [kind]: [] }))
      await refreshProviderModels(kind)
    },
    [userId, refreshProviderModels]
  )

  useEffect(() => {
    if (!visible) return
    if (mediaStore) {
      if ('saveLocalProjects' in mediaStore) {
        void mediaStore
          .saveLocalProjects(userId, workspace.projects)
          .catch((error) => setSaveFailure(errorMessage(error)))
      }
      const save = () => {
        void mediaStore
          .saveProjects(userId, workspace.projects)
          .then(() => {
            try {
              saveStudioProjects(localStorage, userId, workspace.projects)
            } catch {
              // IndexedDB is authoritative; the legacy mirror is best effort.
            }
            if (activeUserId.current === userId) {
              setSaveFailure('')
              refreshSaveStatus((epoch) => epoch + 1)
            }
          })
          .catch((error) => setSaveFailure(errorMessage(error)))
      }
      if ('saveLocalProjects' in mediaStore) {
        const timer = setTimeout(save, 700)
        return () => clearTimeout(timer)
      }
      save()
      return
    }
    try {
      saveStudioProjects(localStorage, userId, workspace.projects)
    } catch (error) {
      setMessage(`${t('studio.project.saveFailed')}: ${errorMessage(error)}`)
    }
  }, [visible, userId, workspace.projects, t, mediaStore])

  useEffect(() => {
    if (!visible || !mediaStore || !('syncProjects' in mediaStore)) return
    let disposed = false
    let pending = false
    const timer = setInterval(() => {
      if (pending || disposed) return
      pending = true
      const current = projectsRef.current
      void mediaStore
        .syncProjects(userId, current, () => projectsRef.current)
        .then((synced) => {
          if (
            disposed ||
            activeUserId.current !== userId ||
            projectsRef.current !== current
          ) {
            return
          }
          if (JSON.stringify(synced) === JSON.stringify(current)) return
          mediaStore.acceptSyncedProjects?.(userId, synced)
          projectsRef.current = synced
          setWorkspace((workspace) =>
            workspace.ownerId === userId
              ? { ...workspace, projects: synced }
              : workspace
          )
        })
        .catch((error) => {
          if (!disposed) {
            if (mediaStore.saveConflicts?.().length) {
              setSaveFailure(errorMessage(error))
            } else setMessage(errorMessage(error))
          }
        })
        .finally(() => {
          pending = false
        })
    }, 8000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [visible, userId, mediaStore])

  useEffect(() => {
    if (!visible || !mediaStore) return
    const ids = new Map<string, string>(
      projects.flatMap((item) =>
        item.assembledMediaId ? [[item.id, item.assembledMediaId] as const] : []
      )
    )
    const previous = previousAssemblies.current
    if (previous.ownerId === userId) {
      for (const [projectId, mediaId] of previous.ids) {
        if (ids.get(projectId) === mediaId) continue
        void mediaStore
          .delete(userId, mediaId)
          .catch((error) => setMessage(errorMessage(error)))
        loadedMediaIds.current.delete(
          mediaLoadKey({ kind: 'assembly', projectId, mediaId })
        )
        if (!ids.has(projectId)) {
          setAssemblyPreviews((current) => {
            const url = current.get(projectId)
            if (url?.startsWith('blob:')) {
              URL.revokeObjectURL(url)
              ownedUrls.current = ownedUrls.current.filter(
                (owned) => owned !== url
              )
            }
            const next = new Map(current)
            next.delete(projectId)
            return next
          })
        }
      }
    }
    previousAssemblies.current = { ownerId: userId, ids }
  }, [visible, userId, projects, mediaStore])

  useEffect(() => {
    setAssemblyBusy(false)
    setAssemblyProgress(0)
    setAssemblyError(undefined)
    setAssemblyPreflight(undefined)
    return () => {
      const run = assemblyRun.current
      if (run?.ownerId === userId && run.projectId === project?.id) {
        run.controller.abort()
      }
    }
  }, [userId, project?.id])

  useEffect(() => {
    if (!visible || !mediaStore) return
    let cancelled = false
    const started = new Set<string>()
    const loadedIds = loadedMediaIds.current
    const refs = JSON.parse(mediaRefsKey) as StudioMediaRef[]
    Promise.all(
      refs.map(async (ref) => {
        const { projectId, nodeId, mediaId, kind } = ref
        const key = mediaLoadKey(ref)
        if (loadedIds.has(key)) return
        loadedIds.add(key)
        started.add(key)
        try {
          const blob = await mediaStore.get(userId, mediaId)
          if (!blob || cancelled) {
            if (!cancelled) loadedIds.delete(key)
            return
          }
          const url = URL.createObjectURL(blob)
          ownedUrls.current.push(url)
          if (kind === 'assembly') {
            setAssemblyPreviews((current) =>
              new Map(current).set(projectId, url)
            )
          } else if (kind === 'soundtrack') {
            setSoundtrackPreviews((current) =>
              new Map(current).set(projectId, url)
            )
          } else if (kind === 'voiceover') {
            setVoiceoverPreviews((current) =>
              new Map(current).set(projectId, url)
            )
          } else {
            setPreviews((current) => ({
              ...current,
              [previewKey(projectId, nodeId)]: url,
            }))
          }
        } catch (error) {
          if (!cancelled) loadedIds.delete(key)
          throw error
        } finally {
          started.delete(key)
        }
      })
    ).catch((error) => {
      if (!cancelled) setMessage(errorMessage(error))
    })
    return () => {
      cancelled = true
      for (const key of started) loadedIds.delete(key)
    }
  }, [visible, userId, mediaRefsKey, mediaStore])

  const editProject = useCallback(
    (
      projectId: string,
      edit: (project: StudioProject) => StudioProject,
      capture = true
    ) => {
      if (activeUserId.current !== userId) return
      if (mediaStore && 'cloudRecord' in mediaStore) {
        const record = mediaStore.cloudRecord(projectId)
        if (record && !['owner', 'editor'].includes(record.role)) {
          setMessage(t('studio.production.readOnly'))
          return
        }
      }
      const existing = projectsRef.current.find((item) => item.id === projectId)
      if (!existing) return
      const edited = reconcileStudioAssembly(existing, edit(existing))
      if (
        capture &&
        studioCanvasDocumentFingerprint(existing) !==
          studioCanvasDocumentFingerprint(edited)
      ) {
        const key = `${userId}:${projectId}`
        let history = canvasHistories.current.get(key)
        if (!history) {
          history = new StudioCanvasHistory()
          canvasHistories.current.set(key, history)
        }
        history.capture(existing)
        setCanvasHistoryEpoch((epoch) => epoch + 1)
      }
      projectsRef.current = projectsRef.current.map((item) =>
        item.id === projectId ? edited : item
      )
      setWorkspace((current) => {
        if (current.ownerId !== userId) return current
        return {
          ...current,
          projects: current.projects.map((item) =>
            item.id === projectId ? edited : item
          ),
        }
      })
    },
    [userId, mediaStore, t]
  )

  const editNode = useCallback(
    (
      projectId: string,
      nodeId: string,
      patch: Partial<StudioCanvasNodeData>
    ) => {
      editProject(projectId, (current) =>
        updateStudioNode(current, nodeId, patch)
      )
    },
    [editProject]
  )

  const editCanvasProject = useCallback(
    (
      projectId: string,
      edit: (project: StudioProject) => StudioProject,
      capture = true
    ) => {
      const previous = projectsRef.current.find((item) => item.id === projectId)
      if (!previous || activeUserId.current !== userId) return
      try {
        const next = edit(previous)
        if (next === previous) return
        const key = `${userId}:${projectId}`
        let history = canvasHistories.current.get(key)
        if (!history) {
          history = new StudioCanvasHistory()
          canvasHistories.current.set(key, history)
        }
        if (capture) history.capture(previous)
        const changedMedia = previous.nodes.filter((node) => {
          const updated = next.nodes.find((item) => item.id === node.id)
          return (
            !updated ||
            updated.data.mediaId !== node.data.mediaId ||
            updated.data.selectedTakeId !== node.data.selectedTakeId
          )
        })
        for (const node of changedMedia) {
          if (node.data.mediaId) {
            loadedMediaIds.current.delete(
              mediaLoadKey({
                kind: 'node',
                projectId,
                mediaId: node.data.mediaId,
              })
            )
          }
          const nextId = next.nodes.find((item) => item.id === node.id)?.data
            .mediaId
          if (nextId) {
            loadedMediaIds.current.delete(
              mediaLoadKey({ kind: 'node', projectId, mediaId: nextId })
            )
          }
        }
        if (changedMedia.length) {
          setPreviews((current) => {
            const previews = { ...current }
            for (const node of changedMedia) {
              delete previews[previewKey(projectId, node.id)]
            }
            return previews
          })
        }
        editProject(projectId, () => next, false)
        setCanvasHistoryEpoch((epoch) => epoch + 1)
      } catch (error) {
        setMessage(errorMessage(error))
        throw error
      }
    },
    [userId, editProject]
  )

  const storedMediaIsReferenced = useCallback(
    (mediaId: string, excludingProjectId?: string) => {
      if (
        projectsRef.current.some(
          (item) =>
            item.id !== excludingProjectId &&
            projectStoredMediaIds(item).has(mediaId)
        )
      ) {
        return true
      }
      for (const [key, history] of canvasHistories.current) {
        if (
          !key.startsWith(`${userId}:`) ||
          key === `${userId}:${excludingProjectId}`
        ) {
          continue
        }
        if (
          history.retainedProjects.some((item) =>
            projectStoredMediaIds(item).has(mediaId)
          )
        ) {
          return true
        }
      }
      return false
    },
    [userId]
  )

  const discardNodeMedia = useCallback(
    (projectId: string, node: StudioCanvasNode) => {
      const retained = node.data.takes?.some(
        (take) => take.mediaId === node.data.mediaId
      )
      if (
        node.data.mediaId &&
        mediaStore &&
        !retained &&
        !storedMediaIsReferenced(node.data.mediaId)
      ) {
        void mediaStore
          .delete(userId, node.data.mediaId)
          .catch((error) => setMessage(errorMessage(error)))
      }
      const key = previewKey(projectId, node.id)
      const url = previews[key]
      if (url?.startsWith('blob:')) {
        URL.revokeObjectURL(url)
        ownedUrls.current = ownedUrls.current.filter((owned) => owned !== url)
      }
      setPreviews((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
    },
    [mediaStore, previews, userId, storedMediaIsReferenced]
  )

  const discardBranchMedia = useCallback(
    (source: StudioProject, nodeId: string) => {
      for (const id of studioBranchNodeIds(source, nodeId)) {
        const node = source.nodes.find((item) => item.id === id)
        if (
          node?.data.mediaId &&
          (node.data.kind !== 'image' || node.data.model)
        ) {
          discardNodeMedia(source.id, node)
        }
      }
    },
    [discardNodeMedia]
  )

  const deleteStoredMedia = (source: StudioProject, nodeIds?: string[]) => {
    if (!mediaStore) return
    const selected = nodeIds ? new Set(nodeIds) : null
    const ids = new Set<string>()
    for (const node of source.nodes) {
      if (selected && !selected.has(node.id)) continue
      if (node.data.mediaId) ids.add(node.data.mediaId)
      for (const take of node.data.takes || []) {
        if (take.mediaId) ids.add(take.mediaId)
      }
    }
    for (const shot of source.shots || []) {
      if (
        shot.shotVoiceoverMediaId &&
        (!selected ||
          [shot.textNodeId, shot.imageNodeId, shot.videoNodeId].some((id) =>
            selected.has(id)
          ))
      ) {
        ids.add(shot.shotVoiceoverMediaId)
      }
    }
    if (!selected) {
      for (const retained of canvasHistories.current.get(
        `${userId}:${source.id}`
      )?.retainedProjects || []) {
        for (const mediaId of projectStoredMediaIds(retained)) ids.add(mediaId)
      }
      for (const asset of source.assets || []) {
        if (asset.mediaId) ids.add(asset.mediaId)
        for (const version of asset.versions || []) {
          if (version.mediaId) ids.add(version.mediaId)
        }
      }
      if (source.soundtrackMediaId) ids.add(source.soundtrackMediaId)
      if (source.voiceoverMediaId) ids.add(source.voiceoverMediaId)
      if (source.assembledMediaId) ids.add(source.assembledMediaId)
    }
    for (const mediaId of ids) {
      if (storedMediaIsReferenced(mediaId, selected ? undefined : source.id)) {
        continue
      }
      void mediaStore
        .delete(userId, mediaId)
        .catch((error) => setMessage(errorMessage(error)))
    }
  }

  const saveMedia = useCallback(
    async (
      ownerId: number,
      projectId: string,
      nodeId: string,
      url: string,
      showPreview = true
    ): Promise<string> => {
      if (!mediaStore) throw new Error('browser media storage is unavailable')
      const response = await fetch(url, { credentials: 'same-origin' })
      if (!response.ok) {
        throw new Error(`media download failed (${response.status})`)
      }
      const blob = await response.blob()
      const mediaId = newId()
      await mediaStore.put(ownerId, mediaId, blob)
      if (activeUserId.current === ownerId && showPreview) {
        loadedMediaIds.current.add(
          mediaLoadKey({ kind: 'node', projectId, mediaId })
        )
        const preview = URL.createObjectURL(blob)
        ownedUrls.current.push(preview)
        setPreviews((current) => ({
          ...current,
          [previewKey(projectId, nodeId)]: preview,
        }))
      }
      return mediaId
    },
    [mediaStore]
  )

  const rememberSuccessfulTemplate = useCallback(
    (take: StudioTake | undefined, channelId?: number) => {
      if (!take?.templateSnapshot || activeUserId.current !== userId) return
      try {
        const draft = createStudioVideoTemplateDraft(
          JSON.parse(take.templateSnapshot)
        )
        saveStudioVideoTemplate(localStorage, userId, {
          ...draft,
          savedAt: new Date().toISOString(),
          channelId,
        })
        setVideoTemplates(loadStudioVideoTemplates(localStorage, userId))
      } catch {
        setMessage(t('studio.video.templateSaveFailed'))
      }
    },
    [userId, t]
  )

  const uploadImage = useCallback(
    async (node: StudioCanvasNode, source: StudioProject, file: File) => {
      if (!mediaStore) throw new Error('browser media storage is unavailable')
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        throw new Error(t('studio.image.uploadType'))
      }
      if (file.size > 20_000_000) throw new Error(t('studio.image.uploadSize'))
      const mediaId = newId()
      const latest = projectsRef.current.find((item) => item.id === source.id)
      if (!latest?.nodes.some((item) => item.id === node.id)) return
      const affected = studioBranchNodeIds(latest, node.id)
      if (
        latest.nodes.some(
          (item) => affected.has(item.id) && studioNodeBusy(item)
        )
      ) {
        throw new Error(t('studio.canvas.taskBusy'))
      }
      const take: StudioTake = {
        id: newId(),
        createdAt: new Date().toISOString(),
        prompt: node.data.prompt,
        status: 'completed',
        sourceMode: 'upload',
        mediaId,
      }
      const replace = (current: StudioProject) =>
        recordStudioTake(
          updateStudioNode(invalidateStudioBranch(current, node.id), node.id, {
            model: undefined,
          }),
          node.id,
          take
        )
      const replacement = replace(latest)
      await mediaStore.putWithProjects(
        userId,
        mediaId,
        file,
        projectsRef.current.map((item) =>
          item.id === source.id ? replacement : item
        )
      )
      if (activeUserId.current !== userId) return
      if (node.data.mediaId) discardNodeMedia(source.id, node)
      discardBranchMedia(source, node.id)
      loadedMediaIds.current.add(
        mediaLoadKey({ kind: 'node', projectId: source.id, mediaId })
      )
      const preview = URL.createObjectURL(file)
      ownedUrls.current.push(preview)
      setPreviews((current) => ({
        ...current,
        [previewKey(source.id, node.id)]: preview,
      }))
      editProject(source.id, replace)
    },
    [mediaStore, userId, discardNodeMedia, discardBranchMedia, editProject, t]
  )

  const uploadMediaNode = async (
    node: StudioCanvasNode,
    source: StudioProject,
    file: File
  ) => {
    const mediaType = node.data.kind === 'audio' ? 'audio/' : 'video/'
    if (
      !mediaStore ||
      !file.type.startsWith(mediaType) ||
      file.size > 100_000_000
    ) {
      throw new Error(t('studio.media.uploadInvalid'))
    }
    if (studioNodeBusy(node)) throw new Error(t('studio.canvas.taskBusy'))
    const mediaId = newId()
    const latest = projectsRef.current.find((item) => item.id === source.id)
    if (!latest?.nodes.some((item) => item.id === node.id)) return
    const take: StudioTake = {
      id: newId(),
      createdAt: new Date().toISOString(),
      prompt: node.data.prompt,
      status: 'completed',
      sourceMode: 'upload',
      mediaId,
    }
    const replacement = recordStudioTake(
      updateStudioNode(latest, node.id, { model: undefined }),
      node.id,
      take
    )
    await mediaStore.putWithProjects(
      userId,
      mediaId,
      file,
      projectsRef.current.map((item) =>
        item.id === source.id ? replacement : item
      )
    )
    if (activeUserId.current !== userId) return
    editProject(source.id, (current) =>
      recordStudioTake(
        updateStudioNode(current, node.id, { model: undefined }),
        node.id,
        take
      )
    )
    const preview = URL.createObjectURL(file)
    ownedUrls.current.push(preview)
    loadedMediaIds.current.add(
      mediaLoadKey({ kind: 'node', projectId: source.id, mediaId })
    )
    setPreviews((current) => ({
      ...current,
      [previewKey(source.id, node.id)]: preview,
    }))
  }

  const capturePreviousShotFrame = async (shotId: string) => {
    if (!project || !mediaStore || frameBusyShotId) return
    const shotIndex =
      project.shots?.findIndex((shot) => shot.id === shotId) ?? -1
    if (shotIndex < 1 || !project.shots) return
    const previous = project.nodes.find(
      (node) => node.id === project.shots?.[shotIndex - 1].videoNodeId
    )
    const image = project.nodes.find(
      (node) => node.id === project.shots?.[shotIndex].imageNodeId
    )
    if (!previous || !image || previous.data.status !== 'completed') {
      setMessage(t('studio.shot.previousFrameMissing'))
      return
    }
    const imageFingerprint = studioNodeInputFingerprint(project, image.id)
    const previousTakeId = previous.data.selectedTakeId
    setFrameBusyShotId(shotId)
    setMessage(null)
    try {
      let video = previous.data.mediaId
        ? await mediaStore.get(userId, previous.data.mediaId)
        : null
      if (!video) {
        const url = previous.data.taskId
          ? await getStudioVideoContentUrl(previous.data.taskId)
          : previous.data.outputUrl
        if (!url) {
          throw new Error(t('studio.shot.previousFrameMissing'))
        }
        const response = await fetch(url, { credentials: 'same-origin' })
        if (!response.ok) {
          throw new Error(`media download failed (${response.status})`)
        }
        video = await response.blob()
      }
      const frame = await captureStudioLastFrame(video)
      if (
        activeUserId.current !== userId ||
        activeProjectId.current !== project.id
      ) {
        return
      }
      const latest = projectsRef.current.find((item) => item.id === project.id)
      const latestPrevious = latest?.nodes.find(
        (node) => node.id === previous.id
      )
      const latestImage = latest?.nodes.find((node) => node.id === image.id)
      if (
        !latest ||
        !latestImage ||
        latestPrevious?.data.selectedTakeId !== previousTakeId ||
        latestPrevious?.data.mediaId !== previous.data.mediaId ||
        latestPrevious?.data.taskId !== previous.data.taskId ||
        studioNodeInputFingerprint(latest, image.id) !== imageFingerprint
      ) {
        throw new StudioInputChangedError(t('studio.shot.frameChanged'))
      }
      await uploadImage(
        latestImage,
        latest,
        new File([frame], `shot-${shotId}-first-frame.png`, {
          type: 'image/png',
        })
      )
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setFrameBusyShotId(null)
    }
  }

  const generate = useCallback(
    async (
      target: StudioCanvasNode,
      source: StudioProject,
      retryPending = false
    ) => {
      if (!userId || workspace.ownerId !== userId) return
      if (mediaStore && 'cloudRecord' in mediaStore) {
        const record = mediaStore.cloudRecord(source.id)
        if (record && !['owner', 'editor'].includes(record.role)) {
          setMessage(t('studio.production.readOnly'))
          return
        }
      }
      if (
        mediaStore &&
        'cloudRecord' in mediaStore &&
        target.data.model &&
        (target.data.kind === 'text' ||
          target.data.kind === 'image' ||
          target.data.kind === 'video' ||
          target.data.kind === 'audio') &&
        target.data.purpose !== 'assembly'
      ) {
        const configs = await fetchStudioProviderConfigs()
        const direct =
          (target.data.kind === 'text' || target.data.kind === 'image') &&
          configs[target.data.kind]?.hasKey
        if (!direct) {
          setSelectedNodeId(target.id)
          openProduction('workflow', target.id)
          setMessage(
            t(
              'Review the platform generation budget and selected nodes before starting.'
            )
          )
          return
        }
      }
      const runId = `${userId}:${source.id}:${target.id}:${studioNodeInputFingerprint(source, target.id)}`
      if (runningTargets.current.has(runId)) return
      runningTargets.current.add(runId)
      setMessage(null)
      let current = target
      let workingNodes = source.nodes
      let workingAssets = source.assets
      const fingerprint = (nodeId: string) =>
        studioNodeInputFingerprint(
          { ...source, nodes: workingNodes, assets: workingAssets },
          nodeId
        )
      const assertFresh = (nodeId: string, expected: string) => {
        const latest = projectsRef.current.find((item) => item.id === source.id)
        if (
          activeUserId.current !== userId ||
          !latest ||
          studioNodeInputFingerprint(latest, nodeId) !== expected
        ) {
          throw new StudioInputChangedError('Studio input changed')
        }
      }
      const recordTake = (nodeId: string, take: StudioTake) => {
        editProject(source.id, (project) =>
          project.nodes
            .find((item) => item.id === nodeId)
            ?.data.takes?.some((item) => item.id === take.id)
            ? project
            : recordStudioTake(project, nodeId, take)
        )
        workingNodes = workingNodes.map((item) =>
          item.id === nodeId
            ? {
                ...item,
                data: {
                  ...item.data,
                  takes: [
                    ...(item.data.takes || []).filter(
                      (old) => old.id !== take.id
                    ),
                    take,
                  ],
                  selectedTakeId: take.id,
                },
              }
            : item
        )
      }
      const completeVideo = async (
        nodeId: string,
        taskId: string,
        outputUrl: string,
        takeId?: string,
        settled?: StudioTaskState
      ) => {
        const expected = fingerprint(nodeId)
        const currentNode = projectsRef.current
          .find((item) => item.id === source.id)
          ?.nodes.find((item) => item.id === nodeId)
        if (takeId && currentNode?.data.selectedTakeId !== takeId) {
          throw new StudioInputChangedError('Studio take selection changed')
        }
        let mediaId = currentNode?.data.takes?.find(
          (take) => take.id === takeId
        )?.mediaId
        if (!mediaId) {
          try {
            mediaId = await executionCoordinator.current.run(
              `media:${userId}:${taskId}`,
              () => saveMedia(userId, source.id, nodeId, outputUrl)
            )
          } catch (error) {
            setMessage(`${t('studio.storage.failed')}: ${errorMessage(error)}`)
          }
        }
        let channelId = settled?.channelId
        const clientRequestId = currentNode?.data.takes?.find(
          (take) => take.id === takeId
        )?.clientRequestId
        if (!channelId && clientRequestId) {
          try {
            channelId = (await fetchStudioAttemptByRequest(clientRequestId))
              ?.channelId
          } catch {
            // The task remains usable even when its submission log is offline.
          }
        }
        if (takeId) {
          editProject(source.id, (project) =>
            updateStudioTake(project, nodeId, takeId, {
              status: 'completed',
              progress: 100,
              outputUrl,
              mediaId,
              chargedQuota: settled?.chargedQuota,
              channelId,
            })
          )
          rememberSuccessfulTemplate(
            currentNode?.data.takes?.find((take) => take.id === takeId),
            channelId
          )
        }
        assertFresh(nodeId, expected)
        if (
          takeId &&
          projectsRef.current
            .find((item) => item.id === source.id)
            ?.nodes.find((item) => item.id === nodeId)?.data.selectedTakeId !==
            takeId
        ) {
          throw new StudioInputChangedError('Studio take selection changed')
        }
        update(nodeId, {
          status: 'completed',
          progress: 100,
          outputUrl,
          mediaId,
        })
      }
      const update = (nodeId: string, patch: Partial<StudioCanvasNodeData>) => {
        workingNodes = workingNodes.map((item) =>
          item.id === nodeId
            ? { ...item, data: { ...item.data, ...patch } }
            : item
        )
        editNode(source.id, nodeId, patch)
      }
      const invalidateDependents = (nodeId: string) => {
        const targets = studioUnpinnedDependentTargets(source, nodeId)
        if (!targets.length) return
        for (const targetId of targets) discardBranchMedia(source, targetId)
        editProject(source.id, (project) =>
          targets.reduce(
            (current, targetId) => invalidateStudioBranch(current, targetId),
            project
          )
        )
      }
      try {
        const ordered = planStudioExecution(
          source.nodes,
          source.edges,
          target.id
        )
        if (
          ordered.some(
            (node) =>
              (node.data.model || node.data.kind === 'text') &&
              (node.data.takes?.length || 0) >= 100 &&
              (node.id === target.id || node.data.status !== 'completed') &&
              !['queued', 'processing'].includes(node.data.status || '') &&
              !node.data.pendingRequestId
          )
        ) {
          throw new Error(t('studio.take.limit'))
        }
        if (
          ordered.some(
            (node) =>
              node.data.kind === 'video' &&
              node.data.pendingRequestId &&
              !(retryPending && node.id === target.id)
          )
        ) {
          throw new StudioSubmissionUncertainError(
            t('studio.submission.uncertain')
          )
        }
        update(target.id, { status: 'submitting', error: undefined })
        for (const planned of ordered) {
          if (activeUserId.current !== userId) return
          const node = workingNodes.find((item) => item.id === planned.id)
          if (!node) throw new Error('canvas source node is missing')
          current = node
          workingAssets = projectsRef.current.find(
            (item) => item.id === source.id
          )?.assets
          const selected = node.id === target.id
          const assetContext = studioNodeAssetContext(
            { ...source, nodes: workingNodes, assets: workingAssets },
            node.id
          )
          const input = connectedGenerationInput(
            workingNodes,
            source.edges,
            node.id
          )
          const previousShotNote = source.edges
            .filter(
              (edge) =>
                edge.target === node.id &&
                (edge.targetHandle === 'extend_video' ||
                  edge.targetHandle === 'native_extend')
            )
            .map((edge) => {
              const parent = workingNodes.find(
                (item) => item.id === edge.source
              )
              return parent
                ? resolveStudioEdgeSource(parent, edge).data.prompt
                : ''
            })
            .filter(Boolean)
            .join('\n')
          const generationPrompt = compileStudioContinuityPrompt({
            prompt: [
              input.prompt,
              ...Object.entries(node.data.camera || {})
                .filter(([, value]) => value?.trim())
                .map(([key, value]) => `Camera ${key}: ${value}`),
              ...(source.shots || [])
                .filter((shot) =>
                  [
                    shot.textNodeId,
                    shot.imageNodeId,
                    shot.videoNodeId,
                  ].includes(node.id)
                )
                .flatMap((shot) => [
                  shot.shotType ? `Shot type: ${shot.shotType}` : '',
                  shot.camera ? `Camera: ${shot.camera}` : '',
                  shot.dialogue ? `Dialogue: ${shot.dialogue}` : '',
                ]),
            ]
              .filter(Boolean)
              .join('\n\n'),
            assets: assetContext.assets,
            assetIds: assetContext.assetIds,
            assetVersionIds: assetContext.assetVersionIds,
            previousShotNote,
          })

          if (node.data.kind === 'text') {
            const textOutputs = [
              node.data.outputText,
              node.data.outputImagePrompt,
              node.data.outputVideoPrompt,
            ]
            if (
              !selected &&
              node.data.status === 'completed' &&
              (node.data.selectedTakeId
                ? textOutputs.some((value) => value?.trim())
                : textOutputs.every((value) => value?.trim()))
            ) {
              continue
            }
            if (!node.data.model) {
              if (!input.prompt.trim()) {
                if (selected) throw new Error(t('studio.prompt.required'))
                continue
              }
              recordTake(node.id, {
                id: newId(),
                createdAt: new Date().toISOString(),
                prompt: generationPrompt,
                outputText: generationPrompt,
                outputImagePrompt: undefined,
                outputVideoPrompt: undefined,
                status: 'completed',
              })
              update(node.id, {
                outputText: generationPrompt,
                outputImagePrompt: undefined,
                outputVideoPrompt: undefined,
                status: 'completed',
                error: undefined,
              })
              if (selected) invalidateDependents(node.id)
              continue
            }
            const textConfig = providerConfigs.text?.hasKey
              ? providerConfigs.text
              : (await fetchStudioProviderConfigs()).text
            if (!textConfig?.hasKey) throw new Error(t('studio.model.empty'))
            const textModels =
              providerModels.text || (await fetchStudioProviderModels('text'))
            if (!textModels.includes(node.data.model)) {
              throw new Error(t('studio.model.empty'))
            }
            const textModelId = node.data.model
            if (activeUserId.current !== userId) return
            update(node.id, { status: 'submitting', error: undefined })
            const expected = fingerprint(node.id)
            const { shot, takeId } = await executionCoordinator.current.run(
              `${userId}:${source.id}:${node.id}:${expected}`,
              async () => ({
                shot: await (node.data.textMode === 'plain'
                  ? generateStudioText(textModelId, generationPrompt, 'plain')
                  : generateStudioText(textModelId, generationPrompt)),
                takeId: newId(),
              }),
              { reuseCompleted: true, force: selected }
            )
            if (activeUserId.current !== userId) return
            assertFresh(node.id, expected)
            recordTake(node.id, {
              id: takeId,
              createdAt: new Date().toISOString(),
              model: node.data.model,
              prompt: generationPrompt,
              status: 'completed',
              outputText: shot.text,
              outputImagePrompt: shot.imagePrompt,
              outputVideoPrompt: shot.videoPrompt,
            })
            update(node.id, {
              outputText: shot.text,
              outputImagePrompt: shot.imagePrompt,
              outputVideoPrompt: shot.videoPrompt,
              status: 'completed',
            })
            if (selected) invalidateDependents(node.id)
            continue
          }

          if (node.data.kind === 'audio') {
            if (
              !selected &&
              node.data.status === 'completed' &&
              node.data.mediaId
            ) {
              continue
            }
            if (!node.data.model) {
              if (!node.data.mediaId) {
                throw new Error(t('studio.audio.uploadRequired'))
              }
              update(node.id, { status: 'completed', error: undefined })
              continue
            }
            if (!mediaStore) throw new Error(t('studio.media.missing'))
            const audioGroup = resolveVideoGroup(
              node.data.group,
              userGroup,
              videoGroups
            )
            if (
              !(await fetchStudioModels(audioGroup)).includes(node.data.model)
            ) {
              throw new Error(t('studio.model.empty'))
            }
            if (activeUserId.current !== userId) return
            const audioModel = node.data.model
            const expected = fingerprint(node.id)
            update(node.id, { status: 'submitting', error: undefined })
            const blob = await executionCoordinator.current.run(
              `${userId}:${source.id}:${node.id}:${expected}`,
              () =>
                generateStudioSpeech(
                  audioModel,
                  input.prompt,
                  node.data.voice || 'alloy',
                  node.data.speed ?? 1,
                  audioGroup
                ),
              { reuseCompleted: true, force: selected }
            )
            assertFresh(node.id, expected)
            const mediaId = newId()
            await mediaStore.put(userId, mediaId, blob)
            assertFresh(node.id, expected)
            recordTake(node.id, {
              id: newId(),
              createdAt: new Date().toISOString(),
              model: node.data.model,
              prompt: input.prompt,
              status: 'completed',
              mediaId,
            })
            const preview = URL.createObjectURL(blob)
            ownedUrls.current.push(preview)
            loadedMediaIds.current.add(
              mediaLoadKey({ kind: 'node', projectId: source.id, mediaId })
            )
            setPreviews((previews) => ({
              ...previews,
              [previewKey(source.id, node.id)]: preview,
            }))
            update(node.id, { status: 'completed', mediaId })
            continue
          }

          if (node.data.kind === 'image') {
            if (!node.data.model) {
              if (!node.data.mediaId) {
                if (selected) throw new Error(t('studio.image.uploadRequired'))
                continue
              }
              update(node.id, { status: 'completed', error: undefined })
              continue
            }
            if (
              !selected &&
              node.data.status === 'completed' &&
              (node.data.outputUrl || node.data.mediaId)
            ) {
              continue
            }
            const imageConfig = providerConfigs.image?.hasKey
              ? providerConfigs.image
              : (await fetchStudioProviderConfigs()).image
            if (!imageConfig?.hasKey) throw new Error(t('studio.model.empty'))
            const imageModels =
              providerModels.image || (await fetchStudioProviderModels('image'))
            if (!imageModels.includes(node.data.model)) {
              throw new Error(t('studio.model.empty'))
            }
            const imageModelId = node.data.model
            if (activeUserId.current !== userId) return
            update(node.id, { status: 'submitting', error: undefined })
            const expected = fingerprint(node.id)
            const references = source.edges
              .filter((edge) => edge.target === node.id)
              .map((edge) => {
                const parent = workingNodes.find(
                  (item) => item.id === edge.source
                )
                return parent
                  ? resolveStudioEdgeSource(parent, edge)
                  : undefined
              })
              .filter(
                (parent): parent is StudioCanvasNode =>
                  parent?.data.kind === 'image'
              )
            const imageReferences: string[] = []
            for (const reference of references) {
              if (reference.data.mediaId && mediaStore) {
                const blob = await mediaStore.get(
                  userId,
                  reference.data.mediaId
                )
                if (!blob) throw new Error(t('studio.media.missing'))
                imageReferences.push(await blobToDataUrl(blob))
              } else if (reference.data.outputUrl?.startsWith('data:image/')) {
                imageReferences.push(reference.data.outputUrl)
              } else if (reference.data.outputUrl) {
                const response = await fetch(reference.data.outputUrl)
                if (!response.ok) throw new Error(t('studio.media.missing'))
                imageReferences.push(await blobToDataUrl(await response.blob()))
              }
              assertFresh(node.id, expected)
            }
            for (const asset of workingAssets || []) {
              if (
                !node.data.assetIds?.includes(asset.id) &&
                node.data.linkedAssetId !== asset.id
              ) {
                continue
              }
              const reference = resolveStudioAssetReference(
                asset,
                node.data.assetVersionIds?.[asset.id]
              )
              if (reference.mediaId && mediaStore) {
                const blob = await mediaStore.get(userId, reference.mediaId)
                if (!blob) throw new Error(t('studio.media.missing'))
                imageReferences.push(await blobToDataUrl(blob))
              } else if (reference.outputUrl?.startsWith('data:image/')) {
                imageReferences.push(reference.outputUrl)
              } else if (reference.outputUrl) {
                const response = await fetch(reference.outputUrl)
                if (!response.ok) throw new Error(t('studio.media.missing'))
                imageReferences.push(await blobToDataUrl(await response.blob()))
              }
              assertFresh(node.id, expected)
            }
            const imageInputs = [...new Set(imageReferences)]
            if (imageInputs.length > 8) {
              throw new Error(t('studio.image.tooManyReferences'))
            }
            const imageOptions = {
              ...(node.data.imageSize ? { size: node.data.imageSize } : {}),
              ...(node.data.imageQuality
                ? { quality: node.data.imageQuality }
                : {}),
              ...(node.data.imageCount ? { n: node.data.imageCount } : {}),
              ...(imageInputs.length === 1 ? { image: imageInputs[0] } : {}),
              ...(imageInputs.length > 1 ? { images: imageInputs } : {}),
            }
            const image = await executionCoordinator.current.run(
              `${userId}:${source.id}:${node.id}:${expected}`,
              () =>
                Object.keys(imageOptions).length
                  ? generateStudioImage(
                      imageModelId,
                      generationPrompt,
                      imageOptions
                    )
                  : generateStudioImage(imageModelId, generationPrompt),
              { reuseCompleted: true, force: selected }
            )
            if (activeUserId.current !== userId) return
            assertFresh(node.id, expected)
            const variants = image.urls?.length ? image.urls : [image.url]
            let firstMediaId: string | undefined
            for (const [index, url] of variants.entries()) {
              let mediaId: string | undefined
              try {
                mediaId = await saveMedia(
                  userId,
                  source.id,
                  node.id,
                  url,
                  index === 0
                )
              } catch (error) {
                setMessage(
                  `${t('studio.storage.failed')}: ${errorMessage(error)}`
                )
                if (!url.startsWith('https://')) throw error
              }
              assertFresh(node.id, expected)
              if (index === 0) firstMediaId = mediaId
              recordTake(node.id, {
                id: newId(),
                createdAt: new Date().toISOString(),
                model: node.data.model,
                prompt: generationPrompt,
                status: 'completed',
                mediaId,
                outputUrl: url.startsWith('https://') ? url : undefined,
              })
            }
            if (variants.length > 1) {
              const firstTake = workingNodes
                .find((item) => item.id === node.id)
                ?.data.takes?.at(-variants.length)
              if (firstTake) {
                editProject(source.id, (project) =>
                  selectStudioTake(project, node.id, firstTake.id)
                )
                workingNodes = workingNodes.map((item) =>
                  item.id === node.id
                    ? {
                        ...item,
                        data: { ...item.data, selectedTakeId: firstTake.id },
                      }
                    : item
                )
              }
            }
            update(node.id, {
              outputUrl: image.url.startsWith('https://')
                ? image.url
                : undefined,
              mediaId: firstMediaId,
              status: 'completed',
            })
            if (selected) invalidateDependents(node.id)
            if (!image.url.startsWith('https://')) {
              workingNodes = workingNodes.map((item) =>
                item.id === node.id
                  ? { ...item, data: { ...item.data, outputUrl: image.url } }
                  : item
              )
            }
            continue
          }

          if (
            !node.data.model &&
            node.data.status === 'completed' &&
            node.data.mediaId
          ) {
            continue
          }
          if (node.data.purpose === 'assembly') {
            throw new Error(t('studio.assembly.runFirst'))
          }
          if (
            !selected &&
            node.data.taskId &&
            (node.data.status === 'queued' || node.data.status === 'processing')
          ) {
            const deadline = Date.now() + 20 * 60_000
            while (Date.now() < deadline) {
              if (activeUserId.current !== userId) return
              const task = await getStudioVideoTask(node.data.taskId)
              if (task.status === 'failed') {
                executionCoordinator.current.forgetVideoTask(node.data.taskId)
                throw new Error(task.error || 'upstream video failed')
              }
              if (task.status === 'completed') {
                const url = await getStudioVideoContentUrl(node.data.taskId)
                await completeVideo(
                  node.id,
                  node.data.taskId,
                  url,
                  node.data.selectedTakeId,
                  task
                )
                break
              }
              update(node.id, { status: task.status, progress: task.progress })
              await new Promise((resolve) => window.setTimeout(resolve, 5000))
            }
            if (
              workingNodes.find((item) => item.id === node.id)?.data.status !==
              'completed'
            ) {
              throw new StudioUpstreamWaitError(
                t('studio.video.upstreamTimeout')
              )
            }
            continue
          }
          if (
            !selected &&
            node.data.status === 'completed' &&
            node.data.taskId
          ) {
            const url = await getStudioVideoContentUrl(node.data.taskId)
            update(node.id, { outputUrl: url })
            continue
          }
          if (node.data.pendingRequestId && !(retryPending && selected)) {
            throw new StudioSubmissionUncertainError(
              t('studio.submission.uncertain')
            )
          }
          if (!node.data.model) throw new Error(t('studio.model.empty'))
          const availableGroups = videoGroups.length
            ? videoGroups
            : await fetchStudioGroups()
          const group = resolveVideoGroup(
            node.data.group,
            userGroup,
            availableGroups
          )
          if (!group) throw new Error(t('studio.video.group.select'))
          const availableModels = await fetchStudioModels(group)
          if (!availableModels.includes(node.data.model)) {
            throw new Error(t('studio.model.noLongerAvailable'))
          }
          if (activeUserId.current !== userId) return
          const model = buildStudioVideoModel(node.data.model, 'generic')
          const incoming = source.edges
            .filter((edge) => edge.target === node.id)
            .flatMap((edge) => {
              const parent = workingNodes.find(
                (item) => item.id === edge.source
              )
              return parent
                ? [{ edge, parent: resolveStudioEdgeSource(parent, edge) }]
                : []
            })
          const images: string[] = []
          const videos: string[] = []
          const imageReferences: {
            url: string
            role: 'first_frame' | 'last_frame' | 'reference_image'
          }[] = []
          const videoReferences: {
            url: string
            role: 'reference_video' | 'extend_video'
          }[] = []
          const referenceFingerprint = fingerprint(node.id)
          for (const { edge, parent } of incoming) {
            if (parent.data.kind === 'image') {
              if (
                !parent.data.model &&
                !parent.data.mediaId &&
                !parent.data.outputUrl
              ) {
                continue
              }
              let imageUrl: string | undefined
              if (parent.data.mediaId && mediaStore) {
                const blob = await mediaStore.get(userId, parent.data.mediaId)
                if (blob) imageUrl = await blobToDataUrl(blob)
              }
              imageUrl ||= parent.data.outputUrl
              if (!imageUrl) throw new Error(t('studio.media.missing'))
              if (
                edge.targetHandle === 'first_frame' ||
                edge.targetHandle === 'last_frame' ||
                edge.targetHandle === 'reference_image'
              ) {
                imageReferences.push({
                  url: imageUrl,
                  role: edge.targetHandle,
                })
              } else {
                images.push(imageUrl)
              }
            }
            if (parent.data.kind === 'video') {
              if (edge.targetHandle === 'extend_video') {
                let clip =
                  parent.data.mediaId && mediaStore
                    ? await mediaStore.get(userId, parent.data.mediaId)
                    : null
                if (!clip) {
                  const url = parent.data.taskId
                    ? await getStudioVideoContentUrl(parent.data.taskId)
                    : parent.data.outputUrl
                  if (!url) throw new Error(t('studio.media.missing'))
                  const response = await fetch(url, {
                    credentials: 'same-origin',
                  })
                  if (!response.ok) {
                    throw new Error(
                      `media download failed (${response.status})`
                    )
                  }
                  clip = await response.blob()
                }
                const frame = await captureStudioLastFrame(clip)
                assertFresh(node.id, referenceFingerprint)
                const frameUrl = await blobToDataUrl(frame)
                assertFresh(node.id, referenceFingerprint)
                imageReferences.push({
                  url: frameUrl,
                  role: 'first_frame',
                })
                continue
              }
              const videoUrl = parent.data.taskId
                ? await getStudioVideoContentUrl(parent.data.taskId)
                : parent.data.outputUrl
              assertFresh(node.id, referenceFingerprint)
              if (!videoUrl) {
                throw new Error(t('studio.media.missing'))
              }
              if (
                edge.targetHandle === 'reference_video' ||
                edge.targetHandle === 'native_extend'
              ) {
                videoReferences.push({
                  url: videoUrl,
                  role:
                    edge.targetHandle === 'native_extend'
                      ? 'extend_video'
                      : 'reference_video',
                })
              } else {
                videos.push(videoUrl)
              }
            }
          }
          for (const asset of source.assets || []) {
            if (!node.data.assetIds?.includes(asset.id)) continue
            const reference = resolveStudioAssetReference(
              asset,
              node.data.assetVersionIds?.[asset.id]
            )
            if (reference.mediaId && mediaStore) {
              const blob = await mediaStore.get(userId, reference.mediaId)
              if (!blob) throw new Error(t('studio.media.missing'))
              imageReferences.push({
                url: await blobToDataUrl(blob),
                role: 'reference_image',
              })
            } else if (reference.outputUrl) {
              imageReferences.push({
                url: reference.outputUrl,
                role: 'reference_image',
              })
            }
          }
          const mediaAdapted =
            imageReferences.some(
              (reference) => reference.role === 'first_frame'
            ) &&
            (imageReferences.some(
              (reference) => reference.role === 'reference_image'
            ) ||
              videoReferences.length > 0 ||
              videos.length > 0)
          const keyframes: { url: string; time: number }[] = []
          for (const frame of node.data.videoKeyframes || []) {
            if (!mediaStore) throw new Error(t('studio.media.missing'))
            const blob = await mediaStore.get(userId, frame.mediaId)
            assertFresh(node.id, referenceFingerprint)
            if (!blob || !blob.type.startsWith('image/')) {
              throw new Error(t('studio.media.missing'))
            }
            keyframes.push({ url: await blobToDataUrl(blob), time: frame.time })
            assertFresh(node.id, referenceFingerprint)
          }
          const request = applyStudioVideoPayloadPatch(
            buildStudioVideoRequest(model, {
              prompt: generationPrompt,
              imageUrls: images,
              videoUrls: videos,
              imageReferences,
              videoReferences,
              keyframes,
              seconds: node.data.seconds ?? model.defaultSeconds,
              resolution: node.data.resolution ?? '',
              ratio: node.data.ratio ?? '16:9',
              metadata: parseStudioVideoMetadata(node.data.metadataJson || ''),
            }),
            node.data.payloadPatchJson || ''
          )
          setRequestPreviews((current) => ({
            ...current,
            [previewKey(source.id, node.id)]: JSON.stringify(
              request,
              (_key, value: unknown) =>
                typeof value === 'string' && value.startsWith('data:image/')
                  ? `[inline image: ${value.length} characters]`
                  : value,
              2
            ),
          }))
          if (activeUserId.current !== userId) return
          const preflightFingerprint = fingerprint(node.id)
          const costDuration = studioCostDurationSeconds(
            node.data.seconds ?? model.defaultSeconds,
            node.data.payloadPatchJson
          )
          const approved = await requestPreflight(
            {
              kind: 'video',
              title: node.data.title,
              group,
              request,
              costDuration,
              mediaAdapted,
              nativeExtend:
                request.mode === 'extend' &&
                videoReferences.some(
                  (reference) => reference.role === 'extend_video'
                ),
            },
            source.id,
            () => {
              const latest = projectsRef.current.find(
                (item) => item.id === source.id
              )
              return Boolean(
                latest &&
                studioNodeInputFingerprint(latest, node.id) ===
                  preflightFingerprint
              )
            }
          )
          if (!approved) throw new StudioSubmissionCancelledError()
          assertFresh(node.id, preflightFingerprint)
          const requestId = node.data.pendingRequestId || newId()
          if (
            node.data.pendingRequestId &&
            node.data.pendingRequestFingerprint !== preflightFingerprint
          ) {
            throw new StudioSubmissionUncertainError(
              t('studio.submission.inputChanged')
            )
          }
          const requestSnapshot = await safeStudioVideoRequestSnapshot(
            request,
            {
              edges: source.edges
                .filter((edge) => edge.target === node.id)
                .map((edge) => {
                  const parent = source.nodes.find(
                    (item) => item.id === edge.source
                  )
                  const takeId =
                    edge.data?.sourceTakeId || parent?.data.selectedTakeId
                  return {
                    source: edge.source,
                    takeId,
                    role: edge.targetHandle,
                    mediaId:
                      parent?.data.takes?.find((take) => take.id === takeId)
                        ?.mediaId || parent?.data.mediaId,
                  }
                }),
              assets: source.assets
                ?.filter((asset) => node.data.assetIds?.includes(asset.id))
                .map((asset) => {
                  const versionId = node.data.assetVersionIds?.[asset.id]
                  return {
                    id: asset.id,
                    versionId,
                    mediaId: resolveStudioAssetReference(asset, versionId)
                      .mediaId,
                  }
                }),
            }
          )
          assertFresh(node.id, preflightFingerprint)
          update(node.id, {
            status: 'submitting',
            error: undefined,
            progress: undefined,
            pendingRequestId: requestId,
            pendingRequestFingerprint: preflightFingerprint,
            pendingRequestPrompt: generationPrompt,
            pendingRequestGroup: group,
            pendingRequestModel: node.data.model,
            pendingRequestSnapshot: requestSnapshot,
          })
          if (mediaStore) {
            await mediaStore.saveProjects(userId, projectsRef.current)
          } else {
            saveStudioProjects(localStorage, userId, projectsRef.current)
          }
          const expected = fingerprint(node.id)
          const { taskId, takeId } = await executionCoordinator.current.run(
            `${userId}:${source.id}:${node.id}:${expected}`,
            async () => {
              let taskId: string
              try {
                taskId = await createStudioVideo(request, group, requestId)
              } catch (cause) {
                let attempt: Awaited<
                  ReturnType<typeof fetchStudioAttemptByRequest>
                > = null
                try {
                  attempt = await fetchStudioAttemptByRequest(requestId)
                } catch {
                  // A second network error leaves the original submission uncertain.
                }
                if (attempt?.taskId) {
                  taskId = attempt.taskId
                } else if (attempt?.stage === 'rejected_before_channel') {
                  throw cause
                } else {
                  const directStatus = (
                    cause as { response?: { status?: number } }
                  )?.response?.status
                  const causedStatus = (
                    cause as { cause?: { response?: { status?: number } } }
                  )?.cause?.response?.status
                  const status = directStatus ?? causedStatus
                  if (
                    !attempt &&
                    typeof status === 'number' &&
                    status >= 400 &&
                    status < 500 &&
                    status !== 409
                  ) {
                    throw cause
                  }
                  throw new StudioSubmissionUncertainError(
                    t('studio.submission.uncertain')
                  )
                }
              }
              return { taskId, takeId: newId() }
            },
            { reuseCompleted: true, force: selected }
          )
          if (activeUserId.current !== userId) return
          const submittedTake: StudioTake = {
            id: takeId,
            createdAt: new Date().toISOString(),
            model: node.data.model,
            group,
            prompt: generationPrompt,
            status: 'queued',
            progress: 0,
            taskId,
            clientRequestId: requestId,
            requestSnapshot,
            templateSnapshot: JSON.stringify(
              createStudioVideoTemplateDraft({
                model: node.data.model || '',
                group,
                seconds: Number(request.seconds),
                resolution: node.data.resolution || '',
                ratio: node.data.ratio || '16:9',
                metadataJson: node.data.metadataJson,
                payloadPatchJson: node.data.payloadPatchJson,
              })
            ),
          }
          try {
            assertFresh(node.id, expected)
          } catch (error) {
            if (error instanceof StudioInputChangedError) {
              editProject(source.id, (project) =>
                updateStudioNode(
                  retainStudioTake(project, node.id, submittedTake),
                  node.id,
                  {
                    pendingRequestId: undefined,
                    pendingRequestFingerprint: undefined,
                    pendingRequestPrompt: undefined,
                    pendingRequestGroup: undefined,
                    pendingRequestModel: undefined,
                    pendingRequestSnapshot: undefined,
                  }
                )
              )
            }
            throw error
          }
          recordTake(node.id, submittedTake)
          update(node.id, {
            taskId,
            status: 'queued',
            progress: 0,
            pendingRequestId: undefined,
            pendingRequestFingerprint: undefined,
            pendingRequestPrompt: undefined,
            pendingRequestGroup: undefined,
            pendingRequestModel: undefined,
            pendingRequestSnapshot: undefined,
          })
          if (selected) invalidateDependents(node.id)
          if (!selected) {
            const deadline = Date.now() + 20 * 60_000
            while (Date.now() < deadline) {
              if (activeUserId.current !== userId) return
              const task = await getStudioVideoTask(taskId)
              assertFresh(node.id, expected)
              if (task.status === 'failed') {
                executionCoordinator.current.forgetVideoTask(taskId)
                editProject(source.id, (project) =>
                  updateStudioTake(project, node.id, takeId, {
                    status: 'failed',
                    error: task.error || 'upstream video failed',
                  })
                )
                throw new Error(task.error || 'upstream video failed')
              }
              if (task.status === 'completed') {
                const url = await getStudioVideoContentUrl(taskId)
                assertFresh(node.id, expected)
                await completeVideo(node.id, taskId, url, takeId, task)
                break
              }
              editProject(source.id, (project) =>
                updateStudioTake(project, node.id, takeId, {
                  status: task.status,
                  progress: task.progress,
                })
              )
              update(node.id, { status: task.status, progress: task.progress })
              await new Promise((resolve) => window.setTimeout(resolve, 5000))
            }
            if (
              workingNodes.find((item) => item.id === node.id)?.data.status !==
              'completed'
            ) {
              throw new StudioUpstreamWaitError(
                t('studio.video.upstreamTimeout')
              )
            }
          }
        }
      } catch (error) {
        if (error instanceof StudioInputChangedError) return
        if (error instanceof StudioSubmissionCancelledError) {
          editNode(source.id, target.id, {
            status: target.data.status || 'idle',
            error: target.data.error,
          })
          return
        }
        if (error instanceof StudioUpstreamWaitError) {
          editProject(source.id, (project) =>
            markStudioDependentWaiting(project, target.id, error.message)
          )
          return
        }
        const displayReason = errorMessage(error)
        update(current.id, {
          status: 'failed',
          error: displayReason,
          ...(error instanceof StudioSubmissionUncertainError ||
          (retryPending && Boolean(target.data.pendingRequestId))
            ? {}
            : {
                pendingRequestId: undefined,
                pendingRequestFingerprint: undefined,
                pendingRequestPrompt: undefined,
                pendingRequestGroup: undefined,
                pendingRequestModel: undefined,
                pendingRequestSnapshot: undefined,
              }),
        })
        if (current.id !== target.id) {
          update(target.id, { status: 'failed', error: displayReason })
        }
      } finally {
        runningTargets.current.delete(runId)
      }
    },
    [
      userId,
      workspace.ownerId,
      editNode,
      editProject,
      saveMedia,
      discardBranchMedia,
      mediaStore,
      videoGroups,
      providerConfigs,
      providerModels,
      userGroup,
      t,
      requestPreflight,
      rememberSuccessfulTemplate,
      openProduction,
    ]
  )

  const reconcileVideoSubmission = async (
    target: StudioCanvasNode,
    source: StudioProject
  ) => {
    const requestId = target.data.pendingRequestId
    if (!requestId) return
    try {
      const attempt = await fetchStudioAttemptByRequest(requestId)
      if (activeUserId.current !== userId) return
      const latest = projectsRef.current.find((item) => item.id === source.id)
      const latestNode = latest?.nodes.find((item) => item.id === target.id)
      if (!latest || latestNode?.data.pendingRequestId !== requestId) return
      if (attempt?.taskId) {
        const existingTake = latestNode.data.takes?.find(
          (take) => take.taskId === attempt.taskId
        )
        if (existingTake) {
          editNode(source.id, target.id, {
            pendingRequestId: undefined,
            pendingRequestFingerprint: undefined,
            pendingRequestPrompt: undefined,
            pendingRequestGroup: undefined,
            pendingRequestModel: undefined,
            pendingRequestSnapshot: undefined,
          })
          return
        }
        const take: StudioTake = {
          id: newId(),
          createdAt: new Date().toISOString(),
          model: latestNode.data.pendingRequestModel || latestNode.data.model,
          group: latestNode.data.pendingRequestGroup,
          prompt:
            latestNode.data.pendingRequestPrompt || latestNode.data.prompt,
          requestSnapshot: latestNode.data.pendingRequestSnapshot,
          clientRequestId: requestId,
          status: 'queued',
          progress: 0,
          taskId: attempt.taskId,
          channelId: attempt.channelId || undefined,
        }
        editProject(source.id, (current) => {
          const currentNode = current.nodes.find(
            (item) => item.id === target.id
          )
          if (currentNode?.data.pendingRequestId !== requestId) return current
          const inputMatches =
            currentNode.data.pendingRequestFingerprint ===
            studioNodeInputFingerprint(current, target.id)
          let next = inputMatches
            ? recordStudioTake(current, target.id, take)
            : retainStudioTake(current, target.id, take)
          next = updateStudioNode(next, target.id, {
            ...(inputMatches
              ? { taskId: attempt.taskId, status: 'queued' as const }
              : {}),
            error: undefined,
            pendingRequestId: undefined,
            pendingRequestFingerprint: undefined,
            pendingRequestPrompt: undefined,
            pendingRequestGroup: undefined,
            pendingRequestModel: undefined,
            pendingRequestSnapshot: undefined,
          })
          return next
        })
        setMessage(t('studio.submission.recovered'))
        return
      }
      if (attempt?.stage === 'rejected_before_channel') {
        editNode(source.id, target.id, {
          status: 'failed',
          error: t('studio.submission.rejected'),
          pendingRequestId: undefined,
          pendingRequestFingerprint: undefined,
          pendingRequestPrompt: undefined,
          pendingRequestGroup: undefined,
          pendingRequestModel: undefined,
          pendingRequestSnapshot: undefined,
        })
        return
      }
      if (!attempt) {
        if (
          latestNode.data.pendingRequestFingerprint !==
          studioNodeInputFingerprint(latest, target.id)
        ) {
          setMessage(t('studio.submission.inputChanged'))
          return
        }
        await generate(latestNode, latest, true)
        return
      }
      setMessage(t('studio.submission.uncertain'))
    } catch (error) {
      setMessage(errorMessage(error))
    }
  }

  useEffect(() => {
    if (!visible || pendingVideoKey === '[]') return
    let cancelled = false
    let polling = false
    const poll = async () => {
      if (polling) return
      polling = true
      try {
        const schedule = taskPollSchedule.current
        const pending = pendingVideosRef.current
        schedule.retain(pending.map((entry) => entry.taskId))
        const due = pending.filter((entry) =>
          schedule.due(entry.taskId, Date.now())
        )
        await pollStudioTasksBounded(due, 3, async (entry) => {
          if (cancelled) return
          try {
            const task = await getStudioVideoTask(entry.taskId)
            if (cancelled) return
            if (task.status === 'completed') {
              const outputUrl = await getStudioVideoContentUrl(entry.taskId)
              if (cancelled) return
              let mediaId: string | undefined
              let storageError: string | undefined
              const latestNode = projectsRef.current
                .find((item) => item.id === entry.projectId)
                ?.nodes.find((item) => item.id === entry.nodeId)
              const selected =
                !entry.takeId ||
                latestNode?.data.selectedTakeId === entry.takeId
              let channelId = task.channelId
              const clientRequestId = latestNode?.data.takes?.find(
                (take) => take.id === entry.takeId
              )?.clientRequestId
              if (!channelId && clientRequestId) {
                try {
                  channelId = (
                    await fetchStudioAttemptByRequest(clientRequestId)
                  )?.channelId
                } catch {
                  // A missing submission log does not block completed media.
                }
              }
              try {
                mediaId = entry.takeId
                  ? latestNode?.data.takes?.find(
                      (take) => take.id === entry.takeId
                    )?.mediaId
                  : latestNode?.data.mediaId
                if (!mediaId) {
                  mediaId = await executionCoordinator.current.run(
                    `media:${userId}:${entry.taskId}`,
                    () =>
                      saveMedia(
                        userId,
                        entry.projectId,
                        entry.nodeId,
                        outputUrl,
                        selected
                      )
                  )
                }
              } catch (error) {
                storageError = `${t('studio.storage.failed')}: ${errorMessage(error)}`
              }
              if (!cancelled) {
                if (entry.takeId) {
                  editProject(entry.projectId, (project) => {
                    const node = project.nodes.find(
                      (item) => item.id === entry.nodeId
                    )
                    if (
                      !node?.data.takes?.some(
                        (take) => take.id === entry.takeId
                      )
                    ) {
                      return project
                    }
                    return updateStudioTake(
                      project,
                      entry.nodeId,
                      entry.takeId,
                      {
                        status: 'completed',
                        progress: 100,
                        outputUrl,
                        mediaId,
                        chargedQuota: task.chargedQuota,
                        channelId,
                        error: storageError,
                      }
                    )
                  })
                  rememberSuccessfulTemplate(
                    latestNode?.data.takes?.find(
                      (take) => take.id === entry.takeId
                    ),
                    channelId
                  )
                } else {
                  editNode(entry.projectId, entry.nodeId, {
                    status: 'completed',
                    progress: 100,
                    outputUrl,
                    mediaId,
                    error: storageError,
                  })
                }
              }
            } else {
              if (task.status === 'failed') {
                executionCoordinator.current.forgetVideoTask(entry.taskId)
              }
              if (entry.takeId) {
                editProject(entry.projectId, (project) => {
                  const node = project.nodes.find(
                    (item) => item.id === entry.nodeId
                  )
                  if (
                    !node?.data.takes?.some((take) => take.id === entry.takeId)
                  ) {
                    return project
                  }
                  return updateStudioTake(project, entry.nodeId, entry.takeId, {
                    status: task.status,
                    progress: task.progress,
                    error: task.error,
                  })
                })
              } else {
                editNode(entry.projectId, entry.nodeId, {
                  status: task.status,
                  progress: task.progress,
                  error: task.error,
                })
              }
            }
            schedule.recordSuccess(entry.taskId, Date.now())
          } catch (error) {
            schedule.recordFailure(entry.taskId, Date.now())
            if (!cancelled) setMessage(errorMessage(error))
          }
        })
      } finally {
        polling = false
      }
    }
    void poll()
    const timer = window.setInterval(() => {
      void poll()
    }, 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [
    visible,
    pendingVideoKey,
    userId,
    editNode,
    editProject,
    saveMedia,
    t,
    rememberSuccessfulTemplate,
  ])

  useEffect(() => {
    if (!agentOpen || !userId || !userGroup) return
    let cancelled = false
    const groups = [
      ...new Set([userGroup, ...videoGroups.map((group) => group.id)]),
    ].slice(0, 10)
    void Promise.allSettled(
      groups.map(
        async (group) => [group, await fetchStudioModels(group)] as const
      )
    ).then((results) => {
      if (!cancelled && activeUserId.current === userId) {
        setAgentGatewayModels(
          Object.fromEntries(
            results.flatMap((result) =>
              result.status === 'fulfilled' ? [result.value] : []
            )
          )
        )
      }
    })
    return () => {
      cancelled = true
    }
  }, [agentOpen, userId, userGroup, videoGroups])
  useEffect(() => {
    setAgentGatewayModels({})
  }, [userId])

  const agentBridge = useStudioAgentBridge({
    userId,
    beforeConnect: async () => {
      if (mediaStore) await mediaStore.saveProjects(userId, projectsRef.current)
    },
    projectId: project?.id,
    getSnapshot: () => {
      const current = projectsRef.current.find(
        (item) => item.id === activeProjectId.current
      )
      return current
        ? studioAgentSnapshot(current, {
            text: providerModels.text || [],
            image: providerModels.image || [],
            groups: videoGroups.map((group) => group.id),
            gatewayByGroup: agentGatewayModels,
          })
        : null
    },
    onEdit: async (operations) => {
      const current = projectsRef.current.find(
        (item) => item.id === activeProjectId.current
      )
      if (!current) throw new Error('Studio workspace is unavailable')
      const record = mediaStore?.cloudRecord(current.id)
      if (record && !['owner', 'editor'].includes(record.role)) {
        throw new Error(t('studio.production.readOnly'))
      }
      const before = new Set(current.nodes.map((node) => node.id))
      const next = applyStudioCanvasOperations(
        current,
        operations,
        undefined,
        (key) => t(key)
      )
      editCanvasProject(current.id, () => next)
      if (mediaStore) await mediaStore.saveProjects(userId, projectsRef.current)
      else saveStudioProjects(localStorage, userId, projectsRef.current)
      return {
        projectId: current.id,
        createdNodeIds: next.nodes
          .filter((node) => !before.has(node.id))
          .map((node) => node.id),
      }
    },
    onRun: async (nodeId, options) => {
      const current = projectsRef.current.find(
        (item) => item.id === activeProjectId.current
      )
      const node = current?.nodes.find((item) => item.id === nodeId)
      if (!current || !node) throw new Error('Studio node is unavailable')
      if (studioNodeBusy(node)) throw new Error(t('studio.canvas.taskBusy'))
      const kind = node.data.kind
      const configs = await fetchStudioProviderConfigs()
      const defaultModel =
        node.data.model &&
        (((kind === 'text' || kind === 'image') && !configs[kind]?.hasKey) ||
          kind === 'video' ||
          kind === 'audio') &&
        node.data.purpose !== 'assembly'
      if (defaultModel) {
        if (!options.budget || !mediaStore) {
          throw new Error(
            'Platform generation requires an explicit quota budget; supply budget to studio_run_node or use studio_start_workflow'
          )
        }
        await mediaStore.saveProjects(userId, projectsRef.current)
        const path = `/projects/${encodeURIComponent(current.id)}`
        const stored = await studioCloudRequest<StudioCloudProject>(path)
        let job = await studioCloudRequest<StudioCloudJob>(
          `${path}/jobs`,
          'POST',
          {
            request_id: options.requestId,
            kind: 'generate',
            revision: stored.revision,
            budget: options.budget,
            node_ids: [nodeId],
            confirm_generation: true,
          }
        )
        const deadline = Date.now() + 20 * 60_000
        while (
          ['queued', 'running', 'waiting'].includes(job.status) &&
          Date.now() < deadline
        ) {
          if (activeUserId.current !== userId) {
            throw new Error(
              'Studio account changed; the server workflow continues independently'
            )
          }
          await new Promise<void>((resolve) => window.setTimeout(resolve, 1000))
          job = await studioCloudRequest<StudioCloudJob>(
            `/jobs/${encodeURIComponent(job.id)}`
          )
        }
        if (job.status !== 'succeeded') {
          throw new Error(
            `${job.error || job.status}; inspect workflow ${job.id} before retrying`
          )
        }
        const restored = await mediaStore.syncProjects(
          userId,
          projectsRef.current
        )
        if (activeUserId.current !== userId) {
          throw new Error('Studio account changed')
        }
        projectsRef.current = restored
        setWorkspace((state) => ({ ...state, projects: restored }))
        return { nodeId, status: 'completed', workflowId: job.id }
      }
      if (node.data.purpose === 'assembly') {
        await assembleMp4(nodeId)
        const result = projectsRef.current
          .find((item) => item.id === current.id)
          ?.nodes.find((item) => item.id === nodeId)
        if (result?.data.status !== 'completed' || !result.data.mediaId) {
          throw new Error(
            result?.data.error || 'Studio assembly was not completed'
          )
        }
        return { nodeId, status: 'completed', hasLocalMedia: true }
      }
      await generate(node, current)
      const result = projectsRef.current
        .find((item) => item.id === current.id)
        ?.nodes.find((item) => item.id === nodeId)
      if (
        !result ||
        result.data.status === 'failed' ||
        result.data.status === 'idle'
      ) {
        throw new Error(
          result?.data.error || 'Studio generation was not submitted'
        )
      }
      return {
        nodeId,
        status: result.data.status,
        taskId: result.data.taskId,
        takeId: result.data.selectedTakeId,
      }
    },
  })

  const inspectProductionNode = (id: string) => {
    setSelectedNodeId(id)
    if (view !== 'guided') setView('canvas')
  }

  const addNode = (kind: StudioCanvasNodeData['kind']) => {
    if (!project) return
    const nodeId = newId()
    editCanvasProject(project.id, (current) =>
      applyStudioCanvasOperations(current, [
        {
          op: 'add_node',
          nodeType: kind,
          id: nodeId,
          title: `${t(`studio.kind.${kind}`)} ${current.nodes.length + 1}`,
        },
      ])
    )
    setSelectedNodeId(nodeId)
    setView('canvas')
  }

  const changeAsset = (
    assetId: string,
    patch: {
      title?: string
      prompt?: string
      mediaId?: string
      profile?: StudioAssetProfile
    }
  ) => {
    if (!project) return
    const assetProject = projectsRef.current.find(
      (item) => item.id === project.id
    )
    if (!assetProject?.assets?.some((asset) => asset.id === assetId)) {
      return false
    }
    const affected = assetProject.nodes.filter(
      (node) =>
        (node.data.linkedAssetId === assetId ||
          node.data.assetIds?.includes(assetId)) &&
        (patch.title !== undefined || !node.data.assetVersionIds?.[assetId])
    )
    const affectedIds = new Set(
      affected.flatMap((node) => [
        ...studioBranchNodeIds(assetProject, node.id),
      ])
    )
    if (
      assetProject.nodes.some(
        (node) => affectedIds.has(node.id) && studioNodeBusy(node)
      )
    ) {
      setMessage(t('studio.canvas.taskBusy'))
      return false
    }
    if (
      patch.mediaId &&
      assetProject.nodes.some(
        (node) =>
          node.data.linkedAssetId === assetId &&
          (node.data.takes?.length || 0) >= 100
      )
    ) {
      setMessage(t('studio.take.limit'))
      return false
    }
    const takeId = newId()
    affected.forEach((node) => discardBranchMedia(project, node.id))
    editCanvasProject(project.id, (current) => {
      let next: StudioProject = {
        ...current,
        assets: current.assets?.map((asset) =>
          asset.id === assetId
            ? {
                ...asset,
                ...patch,
                ...(patch.mediaId
                  ? {
                      outputUrl: undefined,
                      versions:
                        (asset.versions?.length || 0) < 30
                          ? [
                              ...(asset.versions || []),
                              {
                                id: takeId,
                                createdAt: new Date().toISOString(),
                                prompt: asset.prompt,
                                profile: asset.profile,
                                mediaId: patch.mediaId,
                              },
                            ]
                          : asset.versions,
                    }
                  : {}),
              }
            : asset
        ),
        nodes: current.nodes.map((node) =>
          node.data.linkedAssetId === assetId
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...(patch.title !== undefined ? { title: patch.title } : {}),
                  ...(patch.prompt !== undefined
                    ? { prompt: patch.prompt }
                    : {}),
                },
              }
            : node
        ),
        updatedAt: new Date().toISOString(),
      }
      for (const node of affected) next = invalidateStudioBranch(next, node.id)
      if (patch.mediaId) {
        next = {
          ...next,
          nodes: next.nodes.map((node) =>
            node.data.linkedAssetId === assetId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    model: undefined,
                    sourceMode: 'upload',
                    mediaId: patch.mediaId,
                    outputUrl: undefined,
                    status: 'completed',
                    selectedTakeId: takeId,
                    takes: [
                      ...(node.data.takes || []),
                      {
                        id: takeId,
                        createdAt: new Date().toISOString(),
                        prompt: node.data.prompt,
                        sourceMode: 'upload',
                        status: 'completed',
                        mediaId: patch.mediaId,
                      },
                    ],
                  },
                }
              : node
          ),
        }
      }
      return next
    })
    return true
  }

  const uploadAssetImage = async (assetId: string, file: File) => {
    if (!project || !mediaStore) throw new Error(t('studio.media.missing'))
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      throw new Error(t('studio.image.uploadType'))
    }
    if (file.size > 20_000_000) throw new Error(t('studio.image.uploadSize'))
    const oldMediaId = project.assets?.find(
      (asset) => asset.id === assetId
    )?.mediaId
    const mediaId = newId()
    await mediaStore.put(userId, mediaId, file)
    if (
      activeUserId.current !== userId ||
      activeProjectId.current !== project.id ||
      !changeAsset(assetId, { mediaId })
    ) {
      await mediaStore.delete(userId, mediaId)
      return
    }
    const oldVersionStillUsesMedia = project.assets
      ?.find((asset) => asset.id === assetId)
      ?.versions?.some((version) => version.mediaId === oldMediaId)
    if (
      oldMediaId &&
      !oldVersionStillUsesMedia &&
      !storedMediaIsReferenced(oldMediaId)
    ) {
      void mediaStore.delete(userId, oldMediaId)
      loadedMediaIds.current.delete(
        mediaLoadKey({
          kind: 'asset',
          projectId: project.id,
          mediaId: oldMediaId,
        })
      )
    }
    const oldUrl = previews[previewKey(project.id, `asset:${assetId}`)]
    if (oldUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(oldUrl)
      ownedUrls.current = ownedUrls.current.filter((url) => url !== oldUrl)
    }
    loadedMediaIds.current.add(
      mediaLoadKey({ kind: 'asset', projectId: project.id, mediaId })
    )
    const url = URL.createObjectURL(file)
    ownedUrls.current.push(url)
    setPreviews((current) => ({
      ...current,
      [previewKey(project.id, `asset:${assetId}`)]: url,
    }))
  }

  const addShot = () => {
    if (!project) return
    const shotId = newId()
    const ids = { text: newId(), image: newId(), video: newId() }
    editProject(project.id, (current) =>
      addStudioShot(
        current,
        shotId,
        ids,
        `${t('studio.shot.defaultName')} ${(current.shots?.length || 0) + 1}`
      )
    )
    setSelectedNodeId(ids.video)
    setView('storyboard')
  }

  const createPlannedShots = (
    drafts: StudioShotDraft[],
    sourcePrompt: string,
    model?: string
  ): boolean => {
    if (!project || drafts.length === 0) return false
    const latest = projectsRef.current.find((item) => item.id === project.id)
    if (
      !latest ||
      (latest.shots?.length || 0) + drafts.length > 166 ||
      latest.nodes.length + 3 * drafts.length > 500
    ) {
      setMessage(t('studio.planner.limit'))
      return false
    }
    const planned = drafts.map((draft) => ({
      draft,
      shotId: newId(),
      ids: { text: newId(), image: newId(), video: newId() },
      takeId: newId(),
    }))
    try {
      editProject(project.id, (current) =>
        addPlannedStudioShots(current, planned, sourcePrompt, model)
      )
    } catch (error) {
      setMessage(errorMessage(error))
      return false
    }
    setSelectedNodeId(planned[0].ids.text)
    setView('storyboard')
    return true
  }

  const createFinalVideo = () => {
    if (!project) return
    const nodeId = newId()
    editProject(project.id, (current) =>
      ensureStudioFinalVideo(current, nodeId, t('studio.final.aiTitle'))
    )
    setSelectedNodeId(nodeId)
    setView('storyboard')
  }

  const generateAllShots = async () => {
    if (!project || batchBusy || pendingPreflight.current) return
    try {
      const currentProject = projectsRef.current.find(
        (item) => item.id === project.id
      )
      if (!currentProject) return
      const plan = planStudioVideoBatch(currentProject, batchLimit)
      if (!plan.targets.length) return
      const billableFingerprints = plan.billableNodes.map((node) => [
        node.id,
        studioNodeInputFingerprint(currentProject, node.id),
      ])
      const approved = await requestPreflight(
        {
          kind: 'batch',
          items: plan.billableNodes.map((node) => ({
            id: node.id,
            title: node.data.title,
            group: resolveVideoGroup(node.data.group, userGroup, videoGroups),
            model: node.data.model || '',
            seconds: studioCostDurationSeconds(
              node.data.seconds ?? 5,
              node.data.payloadPatchJson
            ),
            prompt: node.data.prompt,
            payloadPatch: node.data.payloadPatchJson,
          })),
          cost: batchCost,
        },
        currentProject.id,
        () => {
          const latest = projectsRef.current.find(
            (item) => item.id === currentProject.id
          )
          return Boolean(
            latest &&
            billableFingerprints.every(
              ([nodeId, fingerprint]) =>
                studioNodeInputFingerprint(latest, nodeId) === fingerprint
            )
          )
        }
      )
      if (!approved) return
      setBatchBusy(true)
      let stopped = false
      for (const targetId of plan.targets) {
        if (activeUserId.current !== userId) return
        const latest = projectsRef.current.find(
          (item) => item.id === project.id
        )
        if (!latest) return
        const video = latest.nodes.find((node) => node.id === targetId)
        if (!video) continue
        await generate(video, latest)
        const submitted = projectsRef.current
          .find((item) => item.id === project.id)
          ?.nodes.find((node) => node.id === targetId)
        if (
          !submitted?.data.taskId ||
          submitted.data.taskId === video.data.taskId ||
          !['queued', 'processing', 'completed'].includes(
            submitted.data.status || ''
          )
        ) {
          stopped = true
          break
        }
      }
      if (plan.capped && !stopped) {
        setMessage(t('studio.batch.capped', { count: batchLimit }))
      }
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBatchBusy(false)
    }
  }

  const downloadAssembly = () => {
    if (!project?.assembledMediaId) return
    const url = assemblyPreviews.get(project.id)
    if (!url) return
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `studio-${project.id}.mp4`
    anchor.click()
  }

  const uploadSoundtrack = async (file: File) => {
    if (!project || !mediaStore) {
      setAssemblyError(t('studio.assembly.error.storage'))
      return
    }
    if (!file.type.startsWith('audio/') || file.size > 100_000_000) {
      setAssemblyError(t('studio.assembly.audioInvalid'))
      return
    }
    const mediaId = newId()
    try {
      await mediaStore.put(userId, mediaId, file)
      const oldId = project.soundtrackMediaId
      editProject(project.id, (current) => ({
        ...current,
        soundtrackMediaId: mediaId,
        updatedAt: new Date().toISOString(),
      }))
      if (oldId && !storedMediaIsReferenced(oldId)) {
        void mediaStore.delete(userId, oldId)
        loadedMediaIds.current.delete(
          mediaLoadKey({
            kind: 'soundtrack',
            projectId: project.id,
            mediaId: oldId,
          })
        )
      }
      const previousUrl = soundtrackPreviews.get(project.id)
      if (previousUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previousUrl)
        ownedUrls.current = ownedUrls.current.filter(
          (url) => url !== previousUrl
        )
      }
      const url = URL.createObjectURL(file)
      ownedUrls.current.push(url)
      loadedMediaIds.current.add(
        mediaLoadKey({ kind: 'soundtrack', projectId: project.id, mediaId })
      )
      setSoundtrackPreviews((current) => new Map(current).set(project.id, url))
      setAssemblyError(undefined)
    } catch (error) {
      setAssemblyError(errorMessage(error))
    }
  }

  const uploadVoiceover = async (file: File) => {
    if (!project || !mediaStore) {
      setAssemblyError(t('studio.assembly.error.storage'))
      return
    }
    if (!file.type.startsWith('audio/') || file.size > 100_000_000) {
      setAssemblyError(t('studio.assembly.audioInvalid'))
      return
    }
    const mediaId = newId()
    try {
      await mediaStore.put(userId, mediaId, file)
      const oldId = project.voiceoverMediaId
      editProject(project.id, (current) => ({
        ...current,
        voiceoverMediaId: mediaId,
        updatedAt: new Date().toISOString(),
      }))
      if (oldId && !storedMediaIsReferenced(oldId)) {
        void mediaStore.delete(userId, oldId)
        loadedMediaIds.current.delete(
          mediaLoadKey({
            kind: 'voiceover',
            projectId: project.id,
            mediaId: oldId,
          })
        )
      }
      const previousUrl = voiceoverPreviews.get(project.id)
      if (previousUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previousUrl)
        ownedUrls.current = ownedUrls.current.filter(
          (url) => url !== previousUrl
        )
      }
      const url = URL.createObjectURL(file)
      ownedUrls.current.push(url)
      loadedMediaIds.current.add(
        mediaLoadKey({ kind: 'voiceover', projectId: project.id, mediaId })
      )
      setVoiceoverPreviews((current) => new Map(current).set(project.id, url))
      setAssemblyError(undefined)
    } catch (error) {
      setAssemblyError(errorMessage(error))
    }
  }

  const uploadShotVoiceover = async (shotId: string, file: File) => {
    if (!project || !mediaStore) {
      setAssemblyError(t('studio.assembly.error.storage'))
      return
    }
    if (!file.type.startsWith('audio/') || file.size > 100_000_000) {
      setAssemblyError(t('studio.assembly.audioInvalid'))
      return
    }
    const current = projectsRef.current.find((item) => item.id === project.id)
    const shot = current?.shots?.find((item) => item.id === shotId)
    if (!current || !shot) return
    const mediaId = newId()
    const updated = {
      ...current,
      shots: current.shots?.map((item) =>
        item.id === shotId ? { ...item, shotVoiceoverMediaId: mediaId } : item
      ),
      updatedAt: new Date().toISOString(),
    }
    try {
      await mediaStore.putWithProjects(
        userId,
        mediaId,
        file,
        projectsRef.current.map((item) =>
          item.id === current.id ? updated : item
        )
      )
      if (activeUserId.current !== userId) return
      editProject(current.id, (latest) => ({
        ...latest,
        shots: latest.shots?.map((item) =>
          item.id === shotId ? { ...item, shotVoiceoverMediaId: mediaId } : item
        ),
        updatedAt: new Date().toISOString(),
      }))
      if (
        shot.shotVoiceoverMediaId &&
        !storedMediaIsReferenced(shot.shotVoiceoverMediaId)
      ) {
        void mediaStore.delete(userId, shot.shotVoiceoverMediaId)
      }
      setAssemblyError(undefined)
    } catch (error) {
      setAssemblyError(errorMessage(error))
    }
  }

  const removeShotVoiceover = async (shotId: string) => {
    if (!project || !mediaStore) return
    const current = projectsRef.current.find((item) => item.id === project.id)
    const shot = current?.shots?.find((item) => item.id === shotId)
    if (!current || !shot?.shotVoiceoverMediaId) return
    const updated = {
      ...current,
      shots: current.shots?.map((item) =>
        item.id === shotId ? { ...item, shotVoiceoverMediaId: undefined } : item
      ),
      updatedAt: new Date().toISOString(),
    }
    try {
      await mediaStore.saveProjects(
        userId,
        projectsRef.current.map((item) =>
          item.id === current.id ? updated : item
        )
      )
      if (activeUserId.current !== userId) return
      editProject(current.id, (latest) => ({
        ...latest,
        shots: latest.shots?.map((item) =>
          item.id === shotId
            ? { ...item, shotVoiceoverMediaId: undefined }
            : item
        ),
        updatedAt: new Date().toISOString(),
      }))
      setAssemblyError(undefined)
    } catch (error) {
      setAssemblyError(errorMessage(error))
    }
  }

  const assembleMp4 = async (assemblyNodeId?: string) => {
    if (!project || assemblyBusy) return
    if (
      assemblyNodeId &&
      (project.nodes.find((node) => node.id === assemblyNodeId)?.data.takes
        ?.length || 0) >= 100
    ) {
      setAssemblyError(t('studio.take.limit'))
      return
    }
    if (!mediaStore) {
      setAssemblyError(t('studio.assembly.error.storage'))
      return
    }
    const ownerId = userId
    let sourceProject = project
    const fingerprint = studioAssemblyFingerprint(project)
    const controller = new AbortController()
    assemblyRun.current = { ownerId, projectId: sourceProject.id, controller }
    const isCurrent = () =>
      activeUserId.current === ownerId &&
      activeProjectId.current === sourceProject.id &&
      assemblyRun.current?.controller === controller
    setAssemblyBusy(true)
    setAssemblyProgress(0)
    setAssemblyError(undefined)
    if (assemblyNodeId) {
      editNode(project.id, assemblyNodeId, {
        status: 'processing',
        progress: 0,
        error: undefined,
      })
    }
    try {
      if (assemblyNodeId) {
        sourceProject = studioAssemblyProjectFromCanvas(project, assemblyNodeId)
      }
      if (
        sourceProject.production?.timelineEdited ||
        sourceProject.production?.audioTracks.length ||
        sourceProject.production?.requireApproved ||
        sourceProject.production?.brandKit ||
        sourceProject.production?.audioMix ||
        sourceProject.production?.framing ||
        sourceProject.production?.motionGraphics.length ||
        sourceProject.captionsText
      ) {
        await mediaStore.saveProjects(ownerId, projectsRef.current)
        const path = `/projects/${encodeURIComponent(sourceProject.id)}`
        const stored = await studioCloudRequest<StudioCloudProject>(
          `${path}/materialize`,
          'POST'
        )
        sourceProject = assemblyNodeId
          ? studioAssemblyProjectFromCanvas(stored.document, assemblyNodeId)
          : stored.document
        const render = studioProjectRenderPlan(sourceProject)
        if (assemblyNodeId) render.node_id = assemblyNodeId
        let job = await studioCloudRequest<StudioCloudJob>(
          `${path}/jobs`,
          'POST',
          {
            request_id: newId(),
            kind: 'render',
            revision: stored.revision,
            render,
          }
        )
        while (['queued', 'running', 'waiting'].includes(job.status)) {
          if (controller.signal.aborted) {
            await studioCloudRequest(
              `/jobs/${encodeURIComponent(job.id)}/control`,
              'POST',
              { action: 'cancel' }
            )
            throw new DOMException('Aborted', 'AbortError')
          }
          await new Promise<void>((resolve) => window.setTimeout(resolve, 1000))
          job = await studioCloudRequest<StudioCloudJob>(
            `/jobs/${encodeURIComponent(job.id)}`
          )
          if (isCurrent()) setAssemblyProgress(job.progress)
        }
        if (job.status !== 'succeeded') {
          throw new Error(job.error || t('studio.assembly.error.saveFailed'))
        }
        const result = job.result as { media_id?: string }
        if (!result.media_id) {
          throw new Error(t('studio.assembly.error.saveFailed'))
        }
        const blob = await studioCloudMedia(sourceProject.id, result.media_id)
        if (!isCurrent() || controller.signal.aborted) return
        const completed = await studioCloudRequest<StudioCloudProject>(path)
        const serverTake = completed.document.nodes
          .find((node) => node.id === render.node_id)
          ?.data.takes?.find((take) => take.mediaId === result.media_id)
        const latestProject = projectsRef.current.find(
          (item) => item.id === sourceProject.id
        )
        if (
          !latestProject ||
          studioAssemblyFingerprint(latestProject) !== fingerprint
        ) {
          throw new Error(t('studio.assembly.changed'))
        }
        editProject(sourceProject.id, (current) => {
          if (studioAssemblyFingerprint(current) !== fingerprint) return current
          const alreadyStored = current.nodes
            .find((node) => node.id === render.node_id)
            ?.data.takes?.some((take) => take.id === serverTake?.id)
          const updated =
            serverTake && render.node_id && !alreadyStored
              ? recordStudioTake(current, render.node_id, serverTake)
              : current
          return { ...updated, assembledMediaId: result.media_id }
        })
        const oldUrl = assemblyPreviews.get(sourceProject.id)
        if (oldUrl?.startsWith('blob:')) URL.revokeObjectURL(oldUrl)
        const url = URL.createObjectURL(blob)
        ownedUrls.current.push(url)
        setAssemblyPreviews((current) =>
          new Map(current).set(sourceProject.id, url)
        )
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `studio-${sourceProject.id}.mp4`
        anchor.click()
        setAssemblyProgress(100)
        return
      }
      const clips = planStudioAssembly(sourceProject)
      const blobs = await loadStudioAssemblyBlobs(
        clips,
        ownerId,
        mediaStore,
        getStudioVideoContentUrl,
        fetch,
        controller.signal
      )
      if (!isCurrent() || controller.signal.aborted) return
      const inputs = blobs.map((blob, index) => ({
        blob,
        trimStart: clips[index].trimStart,
        trimEnd: clips[index].trimEnd,
        muted: clips[index].muted,
        volume: clips[index].volume,
        fadeInSeconds: clips[index].fadeInSeconds,
        fadeOutSeconds: clips[index].fadeOutSeconds,
      }))
      const soundtrack = sourceProject.soundtrackMediaId
        ? await mediaStore.get(ownerId, sourceProject.soundtrackMediaId)
        : null
      if (sourceProject.soundtrackMediaId && !soundtrack) {
        throw new Error(t('studio.assembly.audioMissing'))
      }
      const voiceover = sourceProject.voiceoverMediaId
        ? await mediaStore.get(ownerId, sourceProject.voiceoverMediaId)
        : null
      if (sourceProject.voiceoverMediaId && !voiceover) {
        throw new Error(t('studio.assembly.audioMissing'))
      }
      const shotVoiceovers = (
        await Promise.all(
          clips.map(async (clip, clipIndex) => {
            const shot = sourceProject.shots?.find(
              (item) => item.id === clip.shotId
            )
            if (!shot?.shotVoiceoverMediaId) return null
            const blob = await mediaStore.get(
              ownerId,
              shot.shotVoiceoverMediaId
            )
            if (!blob) throw new Error(t('studio.assembly.audioMissing'))
            return {
              clipIndex,
              blob,
              volume: shot.shotVoiceoverVolume ?? 1,
              offsetSeconds: shot.shotVoiceoverOffsetSeconds ?? 0,
            }
          })
        )
      ).filter((item): item is NonNullable<typeof item> => item !== null)
      const shotCaptions = clips.flatMap((clip, clipIndex) => {
        const shot = sourceProject.shots?.find(
          (item) => item.id === clip.shotId
        )
        if (!shot?.shotCaptionText?.trim()) return []
        return [
          {
            clipIndex,
            text: shot.shotCaptionText.trim(),
            offsetSeconds: shot.shotCaptionOffsetSeconds ?? 0,
            durationSeconds: shot.shotCaptionDurationSeconds,
          },
        ]
      })
      const options =
        soundtrack || voiceover || shotVoiceovers.length || shotCaptions.length
          ? {
              ...(soundtrack
                ? {
                    soundtrack: {
                      blob: soundtrack,
                      volume: sourceProject.soundtrackVolume ?? 1,
                    },
                    soundtrackOffsetSeconds:
                      sourceProject.soundtrackOffsetSeconds ?? 0,
                  }
                : {}),
              ...(voiceover
                ? {
                    voiceover: {
                      blob: voiceover,
                      volume: sourceProject.voiceoverVolume ?? 1,
                    },
                    voiceoverOffsetSeconds:
                      sourceProject.voiceoverOffsetSeconds ?? 0,
                  }
                : {}),
              ...(shotVoiceovers.length ? { shotVoiceovers } : {}),
              ...(shotCaptions.length ? { shotCaptions } : {}),
            }
          : undefined
      const { preflightStudioVideos, stitchStudioVideos } =
        await import('./studio-mp4')
      const preflight = await preflightStudioVideos(
        inputs,
        controller.signal,
        options
      )
      if (!isCurrent() || controller.signal.aborted) return
      setAssemblyPreflight({
        totalDuration: preflight.totalDuration,
        estimatedOutputBytes: preflight.estimatedOutputBytes,
      })
      const blob = await stitchStudioVideos(
        inputs,
        (progress) => {
          if (isCurrent()) {
            setAssemblyProgress(progress.percent)
            if (assemblyNodeId) {
              editNode(project.id, assemblyNodeId, {
                progress: progress.percent,
              })
            }
          }
        },
        controller.signal,
        options
      )
      const currentProject = projectsRef.current.find(
        (item) => item.id === sourceProject.id
      )
      if (!isCurrent() || controller.signal.aborted) return
      if (
        !currentProject ||
        studioAssemblyFingerprint(currentProject) !== fingerprint
      ) {
        throw new Error(t('studio.assembly.changed'))
      }
      const mediaId = newId()
      try {
        await mediaStore.put(ownerId, mediaId, blob)
      } catch {
        if (!isCurrent() || controller.signal.aborted) {
          return
        }
        const latest = projectsRef.current.find(
          (item) => item.id === sourceProject.id
        )
        if (!latest || studioAssemblyFingerprint(latest) !== fingerprint) {
          throw new Error(t('studio.assembly.changed'))
        }
        let currentAtDownload = false
        flushSync(() => {
          setWorkspace((current) => {
            if (current.ownerId !== ownerId) return current
            const existing = current.projects.find(
              (item) => item.id === sourceProject.id
            )
            currentAtDownload = Boolean(
              existing && studioAssemblyFingerprint(existing) === fingerprint
            )
            return currentAtDownload ? { ...current } : current
          })
        })
        if (!currentAtDownload) throw new Error(t('studio.assembly.changed'))
        const temporaryUrl = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = temporaryUrl
        anchor.download = `studio-${sourceProject.id}.mp4`
        anchor.click()
        window.setTimeout(() => URL.revokeObjectURL(temporaryUrl), 30_000)
        setAssemblyProgress(100)
        setAssemblyError(t('studio.assembly.error.saveFailed'))
        return
      }
      if (!isCurrent() || controller.signal.aborted) {
        await mediaStore.delete(ownerId, mediaId)
        return
      }
      const latestProject = projectsRef.current.find(
        (item) => item.id === sourceProject.id
      )
      if (
        !latestProject ||
        studioAssemblyFingerprint(latestProject) !== fingerprint
      ) {
        await mediaStore.delete(ownerId, mediaId)
        throw new Error(t('studio.assembly.changed'))
      }
      const newLoadKey = mediaLoadKey({
        kind: 'assembly',
        projectId: sourceProject.id,
        mediaId,
      })
      loadedMediaIds.current.add(newLoadKey)
      let committed = false
      flushSync(() => {
        setWorkspace((current) => {
          if (current.ownerId !== ownerId) return current
          const existing = current.projects.find(
            (item) => item.id === sourceProject.id
          )
          if (
            !existing ||
            studioAssemblyFingerprint(existing) !== fingerprint
          ) {
            return current
          }
          committed = true
          return {
            ...current,
            projects: current.projects.map((item) =>
              item.id === sourceProject.id
                ? { ...item, assembledMediaId: mediaId }
                : item
            ),
          }
        })
      })
      if (!committed) {
        loadedMediaIds.current.delete(newLoadKey)
        await mediaStore.delete(ownerId, mediaId)
        throw new Error(t('studio.assembly.changed'))
      }
      if (assemblyNodeId) {
        editProject(sourceProject.id, (current) =>
          recordStudioTake(current, assemblyNodeId, {
            id: newId(),
            createdAt: new Date().toISOString(),
            prompt: 'Local MP4 assembly',
            status: 'completed',
            mediaId,
          })
        )
      }
      const oldUrl = assemblyPreviews.get(sourceProject.id)
      if (oldUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(oldUrl)
        ownedUrls.current = ownedUrls.current.filter(
          (owned) => owned !== oldUrl
        )
      }
      const url = URL.createObjectURL(blob)
      ownedUrls.current.push(url)
      setAssemblyPreviews((current) =>
        new Map(current).set(sourceProject.id, url)
      )
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `studio-${sourceProject.id}.mp4`
      anchor.click()
      setAssemblyProgress(100)
    } catch (error) {
      if (
        isCurrent() &&
        !controller.signal.aborted &&
        !(error instanceof DOMException && error.name === 'AbortError')
      ) {
        const detail =
          error instanceof StudioAssemblyError
            ? `${t(`studio.assembly.error.${error.code}`)}${error.shotTitle ? `：${error.shotTitle}` : ''}`
            : errorMessage(error)
        setAssemblyError(detail)
        if (assemblyNodeId) {
          editNode(project.id, assemblyNodeId, {
            status: 'failed',
            error: detail,
          })
        }
      }
    } finally {
      if (
        assemblyNodeId &&
        projectsRef.current
          .find((item) => item.id === sourceProject.id)
          ?.nodes.find((item) => item.id === assemblyNodeId)?.data.status ===
          'processing'
      ) {
        editNode(sourceProject.id, assemblyNodeId, {
          status: 'idle',
          progress: undefined,
        })
      }
      if (assemblyRun.current?.controller === controller) {
        assemblyRun.current = null
      }
      if (
        activeUserId.current === ownerId &&
        activeProjectId.current === sourceProject.id &&
        assemblyRun.current === null
      ) {
        setAssemblyBusy(false)
      }
    }
  }

  const addProject = () => {
    const next = createStudioProject(t('studio.project.untitled'), newId())
    next.production = {
      ...studioProductionSchema.parse({}),
      guide: { step: 'story', goal: 'story' },
    }
    const nextProjects = [...projectsRef.current, next]
    projectsRef.current = nextProjects
    setWorkspace((current) => ({
      ...current,
      projects: nextProjects,
      activeId: next.id,
    }))
    setSelectedNodeId(null)
    setView('guided')
  }

  const applyRecipeDraft = (draft: StudioProject) => {
    const next = studioRecipeProject(draft, newId())
    const nextProjects = [...projectsRef.current, next]
    projectsRef.current = nextProjects
    setWorkspace((current) => ({
      ...current,
      projects: nextProjects,
      activeId: next.id,
    }))
    setSelectedNodeId(null)
    options.onNavigate?.('guided', next.id, false, 'shots')
    setViewState('guided')
  }

  const exportProject = async () => {
    if (!project) return
    let blob: Blob
    let extension: string
    try {
      if (mediaStore) {
        blob = await exportStudioProjectBundle(project, userId, mediaStore)
        extension = 'zip'
      } else {
        blob = new Blob([serializeStudioProjectExport(project)], {
          type: 'application/json',
        })
        extension = 'json'
      }
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === 'studio.bundle.mediaMissing'
          ? t('studio.bundle.mediaMissing')
          : errorMessage(error)
      )
      return
    }
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `studio-${project.id}.${extension}`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const retryMedia = async (node: StudioCanvasNode, source: StudioProject) => {
    try {
      let url = node.data.outputUrl || previews[previewKey(source.id, node.id)]
      if (node.data.kind === 'video' && node.data.taskId) {
        url = await getStudioVideoContentUrl(node.data.taskId)
      }
      if (!url) throw new Error(t('studio.media.missing'))
      const mediaId = await saveMedia(userId, source.id, node.id, url, false)
      editProject(source.id, (current) =>
        node.data.selectedTakeId
          ? updateStudioTake(current, node.id, node.data.selectedTakeId, {
              mediaId,
              error: undefined,
            })
          : updateStudioNode(current, node.id, {
              mediaId,
              error: undefined,
            })
      )
      setMessage(null)
    } catch (error) {
      setMessage(`${t('studio.storage.failed')}: ${errorMessage(error)}`)
    }
  }

  const importProject = async (file: File) => {
    const ownerId = userId
    try {
      const zip = file.name.toLowerCase().endsWith('.zip')
      if (zip && !mediaStore) {
        throw new Error(t('studio.assembly.error.storage'))
      }
      if (!zip && file.size > 2_000_000) {
        throw new Error(t('studio.import.tooLarge'))
      }
      let copy: StudioProject
      if (zip) {
        if (!mediaStore) throw new Error(t('studio.assembly.error.storage'))
        copy = await importStudioProjectBundle(file, userId, mediaStore)
      } else {
        copy = {
          ...parseStudioProjectImport(await file.text()),
          id: newId(),
          updatedAt: new Date().toISOString(),
        }
      }
      if (copy.production) {
        copy = {
          ...copy,
          production: {
            ...copy.production,
            milestones: [],
            assistant: copy.production.assistant
              ? {
                  ...copy.production.assistant,
                  undoDocument: undefined,
                  applied: false,
                  proposalHash: undefined,
                }
              : undefined,
          },
        }
      }
      let committed = false
      flushSync(() => {
        setWorkspace((current) => {
          if (current.ownerId !== ownerId || activeUserId.current !== ownerId) {
            return current
          }
          committed = true
          return {
            ...current,
            projects: [...current.projects, copy],
            activeId: copy.id,
          }
        })
      })
      if (!committed) {
        if (zip && mediaStore) {
          await Promise.allSettled(
            [...projectStoredMediaIds(copy)].map((mediaId) =>
              mediaStore.delete(ownerId, mediaId)
            )
          )
        }
        return
      }
      setSelectedNodeId(null)
      setMessage(zip ? null : t('studio.import.mediaHint'))
    } catch (error) {
      if (activeUserId.current === ownerId) setMessage(errorMessage(error))
    }
  }

  if (unreadableProjectData?.ownerId === userId) {
    return (
      <div className='space-y-3 p-6'>
        <h1 className='text-lg font-semibold'>
          {t('studio.project.recoveryTitle')}
        </h1>
        <p className='text-muted-foreground text-sm' role='alert'>
          {unreadableProjectData.error}
        </p>
        {unreadableProjectData.raw && (
          <div className='flex flex-wrap gap-2'>
            <Button
              variant='outline'
              onClick={() => {
                const blob = new Blob([unreadableProjectData.raw], {
                  type: 'application/json',
                })
                const url = URL.createObjectURL(blob)
                const anchor = document.createElement('a')
                anchor.href = url
                anchor.download = `studio-backup-${userId}.json`
                anchor.click()
                window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
                setBackupDownloaded(true)
              }}
            >
              {t('studio.project.downloadBackup')}
            </Button>
            <Button
              variant='outline'
              disabled={!backupDownloaded}
              onClick={() => {
                try {
                  localStorage.removeItem(studioProjectsKey(userId))
                  window.location.reload()
                } catch (error) {
                  setUnreadableProjectData((current) =>
                    current
                      ? { ...current, error: errorMessage(error) }
                      : current
                  )
                }
              }}
            >
              {t('studio.project.resetInvalid')}
            </Button>
          </div>
        )}
      </div>
    )
  }

  if (!visible || !project) {
    return (
      <div className='text-muted-foreground p-6 text-sm'>
        {t('studio.loading')}
      </div>
    )
  }

  const sectionLabel = {
    guided: t('Guided video creation'),
    canvas: t('studio.canvas'),
    assets: t('studio.asset.title'),
    templates: t('Creative recipes'),
    storyboard: t('studio.view.storyboard'),
  }[view]
  const projectReadOnly =
    !!mediaStore?.cloudRecord?.(project.id) &&
    !['owner', 'editor'].includes(
      mediaStore.cloudRecord?.(project.id)?.role || ''
    )

  let workspaceGridClass = 'grid flex-none grid-cols-1 lg:min-h-0 lg:flex-1'
  if (selectedNode && ['canvas', 'storyboard'].includes(view)) {
    workspaceGridClass =
      'grid flex-none grid-cols-1 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_360px]'
  }
  if (view === 'guided') {
    workspaceGridClass = 'grid min-h-0 flex-1 grid-cols-1 overflow-hidden'
  }

  return (
    <div
      className={
        view === 'guided'
          ? 'studio-workspace bg-background flex h-[calc(100dvh-64px)] min-h-0 max-w-full min-w-0 flex-col overflow-hidden lg:h-full lg:flex-1'
          : 'studio-workspace bg-background flex min-h-full max-w-full min-w-0 flex-none flex-col lg:h-full lg:min-h-[640px] lg:flex-1 lg:overflow-hidden'
      }
    >
      <StudioProjectToolbar
        compact={view === 'guided'}
        project={project}
        projects={projects}
        readOnly={
          !!mediaStore?.cloudRecord?.(project.id) &&
          !['owner', 'editor'].includes(
            mediaStore.cloudRecord?.(project.id)?.role || ''
          )
        }
        saved={mediaStore?.isProjectSaved?.(userId, project) === true}
        saveProblem={
          !!saveFailure ||
          cloudConflicts.some((item) => item.projectId === project.id)
        }
        onSelect={(id) => {
          setWorkspace((current) => ({ ...current, activeId: id }))
          setSelectedNodeId(null)
          setSelectedShotId(null)
        }}
        onTitle={(title) =>
          editProject(project.id, (current) => ({
            ...current,
            title,
            updatedAt: new Date().toISOString(),
          }))
        }
        onNew={addProject}
        onBackup={() => void exportProject()}
        onImport={(file) => void importProject(file)}
        onSettings={() => {
          setSettingsKind('text')
          setSettingsOpen(true)
        }}
        onTasks={() => setAttemptsOpen(true)}
        onDelete={() => setDeleteTarget('project')}
      />
      {(saveFailure ||
        cloudConflicts.some((item) => item.projectId === project.id)) && (
        <StudioSaveRecovery
          error={saveFailure}
          conflict={cloudConflicts.find(
            (item) => item.projectId === project.id
          )}
          onBackup={() => void exportProject()}
          onRetry={async () => {
            if (!mediaStore) return
            await mediaStore.saveProjects(userId, projectsRef.current)
            setSaveFailure('')
            refreshSaveStatus((value) => value + 1)
          }}
          onResolve={async (choice) => {
            if (!mediaStore) return
            const restored = await mediaStore.resolveConflict(
              userId,
              project.id,
              choice,
              projectsRef.current
            )
            if (activeUserId.current !== userId) return
            projectsRef.current = restored
            setWorkspace((current) => ({ ...current, projects: restored }))
            setSaveFailure('')
          }}
        />
      )}
      {storageHealth && !mediaStore?.cloudRecord?.(project.id) && (
        <Alert role='status' className='mx-4 mt-2 w-auto'>
          <AlertDescription className='flex flex-wrap items-center gap-2'>
            <span>{t(`studio.storage.${storageHealth.backupWarning}`)}</span>
            <Button
              size='xs'
              variant='outline'
              onClick={() => void exportProject()}
            >
              {t('studio.export')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {message && (
        <div
          role='alert'
          className='border-b bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-300'
        >
          {message}
          <Button
            size='xs'
            variant='ghost'
            className='ml-2'
            onClick={() => setMessage(null)}
          >
            {t('studio.dismiss')}
          </Button>
        </div>
      )}
      <div
        className={
          view === 'guided'
            ? 'hidden'
            : 'flex flex-wrap gap-2 border-b px-4 py-2'
        }
      >
        <Button
          variant={view === 'guided' ? 'secondary' : 'outline'}
          className={view === 'guided' && !advancedTools ? 'hidden' : undefined}
          size='sm'
          onClick={() => {
            setView('guided')
          }}
        >
          {t('Guided video creation')}
        </Button>
        <Button
          variant={view === 'storyboard' ? 'secondary' : 'outline'}
          className={view === 'guided' && !advancedTools ? 'hidden' : undefined}
          size='sm'
          onClick={() => setView('storyboard')}
        >
          {t('studio.view.storyboard')}
        </Button>
        <Button
          variant={view === 'canvas' ? 'secondary' : 'outline'}
          className={view === 'guided' && !advancedTools ? 'hidden' : undefined}
          size='sm'
          onClick={() => setView('canvas')}
        >
          {t('studio.view.canvas')}
        </Button>
        <Button
          variant={view === 'assets' ? 'secondary' : 'outline'}
          className={view === 'guided' && !advancedTools ? 'hidden' : undefined}
          size='sm'
          onClick={() => setView('assets')}
        >
          {t('studio.asset.title')}
        </Button>
        {view === 'canvas' && (
          <Button
            variant='outline'
            size='sm'
            disabled={projectReadOnly}
            onClick={addShot}
          >
            {t('studio.shot.add')}
          </Button>
        )}
        <Collapsible
          open={view !== 'guided' || advancedTools}
          onOpenChange={setAdvancedTools}
          className='flex flex-wrap gap-2'
        >
          {view === 'guided' && (
            <CollapsibleTrigger render={<Button size='sm' variant='outline' />}>
              {t('Advanced tools')}
            </CollapsibleTrigger>
          )}
          <CollapsibleContent className='flex flex-wrap gap-2'>
            <Button
              variant='secondary'
              size='sm'
              onClick={() => addNode('text')}
              disabled={projectReadOnly}
            >
              <Type />
              {t('studio.add.text')}
            </Button>
            <Button
              variant='secondary'
              size='sm'
              onClick={() => addNode('image')}
              disabled={projectReadOnly}
            >
              <ImagePlus />
              {t('studio.add.image')}
            </Button>
            <Button
              variant='secondary'
              size='sm'
              onClick={() => addNode('video')}
              disabled={projectReadOnly}
            >
              <Film />
              {t('studio.add.video')}
            </Button>
            <Button
              variant={agentBridge.session ? 'secondary' : 'outline'}
              size='sm'
              onClick={() => setAgentOpen(true)}
            >
              {t('studio.agent.title')}
            </Button>
            <Button
              variant='secondary'
              size='sm'
              onClick={() => addNode('audio')}
              disabled={projectReadOnly}
            >
              {t('studio.kind.audio')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                if (!mediaStore) return
                void mediaStore
                  .saveProjects(userId, projectsRef.current)
                  .then(() => openProduction())
                  .catch((error) => setMessage(errorMessage(error)))
              }}
            >
              {t('studio.production.title')}
            </Button>
          </CollapsibleContent>
        </Collapsible>
      </div>
      <div className={workspaceGridClass}>
        <section
          className={
            view === 'guided'
              ? 'relative h-full min-h-0 overflow-hidden'
              : 'relative h-[420px] overflow-hidden lg:h-auto lg:min-h-[400px]'
          }
          aria-label={sectionLabel}
        >
          {view === 'guided' && (
            <StudioCreationWorkspace
              key={project.id}
              initialTab={productionInitialTab}
              open
              onOpenChange={() => {}}
              project={project}
              userId={userId}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              onInspectNode={inspectProductionNode}
              onApplyRecipe={applyRecipeDraft}
              initialStep={
                options.step ||
                (requestedWorkspace === 'templates' ? 'story' : undefined)
              }
              onStepChange={(step) =>
                options.onNavigate?.('guided', project.id, false, step)
              }
              onSave={async () => {
                if (!mediaStore) throw new Error(t('studio.project.saveFailed'))
                await mediaStore.saveProjects(userId, projectsRef.current)
              }}
              onRefresh={async () => {
                if (!mediaStore) return
                const restored = await refreshStudioProjects(
                  mediaStore,
                  userId,
                  () => projectsRef.current,
                  () => activeUserId.current === userId
                )
                if (restored) {
                  projectsRef.current = restored
                  setWorkspace((current) => ({
                    ...current,
                    projects: restored,
                  }))
                }
              }}
              onUpdate={(updated) => {
                editProject(project.id, (current) =>
                  mergeStudioCloudDocument(project, updated, current, 'local')
                )
                // Only a local edit can move the guide. A restored cloud
                // document must never replace the explicitly requested URL.
                const step = updated.production?.guide?.step
                if (
                  step &&
                  step !== project.production?.guide?.step &&
                  step !== options.step
                ) {
                  options.onNavigate?.('guided', project.id, true, step)
                }
              }}
              getMedia={async (id) =>
                mediaStore ? mediaStore.get(userId, id) : null
              }
              onAssets={() => setView('assets')}
              onCanvas={() => setView('canvas')}
              onDemo={async () => {
                if (!mediaStore) throw new Error(t('studio.project.saveFailed'))
                const sourceId = project.id
                const useEmptyProject =
                  project.nodes.length === 0 && !project.shots?.length
                const next = await loadStudioEditingExample(
                  createStudioProject(
                    useEmptyProject ? project.title : t('Free editing example'),
                    useEmptyProject ? project.id : newId()
                  ),
                  (id, blob) => mediaStore.put(userId, id, blob),
                  t
                )
                if (
                  activeUserId.current !== userId ||
                  activeProjectId.current !== sourceId
                ) {
                  return
                }
                const updated = useEmptyProject
                  ? projectsRef.current.map((item) =>
                      item.id === project.id ? next : item
                    )
                  : [...projectsRef.current, next]
                await mediaStore.saveProjects(userId, updated)
                projectsRef.current = updated
                setSelectedNodeId(null)
                setWorkspace((current) => ({
                  ...current,
                  projects: updated,
                  activeId: next.id,
                }))
                setView('guided')
              }}
            />
          )}
          {view === 'canvas' && (
            <StudioCanvasEditor
              key={project.id}
              readOnly={
                !!mediaStore?.cloudRecord?.(project.id) &&
                !['owner', 'editor'].includes(
                  mediaStore.cloudRecord?.(project.id)?.role || ''
                )
              }
              project={project}
              nodes={canvasNodes}
              history={canvasHistory}
              onSelect={setSelectedNodeId}
              onEdit={(edit, capture) => {
                try {
                  editCanvasProject(project.id, edit, capture)
                } catch {
                  /* The workspace displays the validation error. */
                }
              }}
              onRun={(nodeId) => {
                const node = projectsRef.current
                  .find((item) => item.id === project.id)
                  ?.nodes.find((item) => item.id === nodeId)
                if (node?.data.purpose === 'assembly') {
                  void assembleMp4(nodeId)
                } else if (node) void generate(node, project)
              }}
              onError={setMessage}
            />
          )}
          {view === 'templates' && (
            <StudioTemplateLibrary
              project={project}
              readOnly={projectReadOnly}
              onClose={() => setView('guided')}
              onApply={applyRecipeDraft}
            />
          )}
          {view === 'assets' && (
            <div className='min-w-0 overflow-y-auto'>
              <StudioProjectMedia
                project={project}
                getMedia={async (id) =>
                  mediaStore ? mediaStore.get(userId, id) : null
                }
                readOnly={projectReadOnly}
                onUpdate={(next) => editProject(project.id, () => next)}
                onOpen={(id) => {
                  setSelectedNodeId(id)
                  setView('canvas')
                }}
                onAssets={() =>
                  document
                    .querySelector('#studio-role-library')
                    ?.scrollIntoView({ behavior: 'smooth' })
                }
              />
              <div id='studio-role-library'>
                <StudioAssetLibrary
                  assets={project.assets || []}
                  readOnly={
                    !!mediaStore?.cloudRecord?.(project.id) &&
                    !['owner', 'editor'].includes(
                      mediaStore.cloudRecord?.(project.id)?.role || ''
                    )
                  }
                  previews={previews}
                  projectId={project.id}
                  onPlaceOnCanvas={(assetId) => {
                    const asset = project.assets?.find(
                      (item) => item.id === assetId
                    )
                    if (!asset) return
                    const id = newId()
                    editCanvasProject(project.id, (current) =>
                      applyStudioCanvasOperations(current, [
                        {
                          op: 'add_node',
                          id,
                          nodeType:
                            asset.kind === 'location' ? 'scene' : asset.kind,
                          assetId,
                          title: asset.title,
                          prompt: asset.prompt,
                        },
                      ])
                    )
                    setSelectedNodeId(id)
                    setView('canvas')
                  }}
                  onAdd={(kind, title, prompt) =>
                    editProject(project.id, (current) => ({
                      ...current,
                      assets: [
                        ...(current.assets || []),
                        { id: newId(), kind, title, prompt },
                      ],
                      updatedAt: new Date().toISOString(),
                    }))
                  }
                  onUpdate={changeAsset}
                  onCreateVersion={(assetId) => {
                    const asset = project.assets?.find(
                      (item) => item.id === assetId
                    )
                    if (!asset) return
                    if (asset.outputUrl && !asset.mediaId) {
                      setMessage(t('studio.bundle.mediaMissing'))
                      return
                    }
                    if ((asset.versions?.length || 0) >= 30) {
                      setMessage(t('studio.asset.versionLimit'))
                      return
                    }
                    editProject(project.id, (current) => ({
                      ...current,
                      assets: current.assets?.map((item) =>
                        item.id === assetId
                          ? {
                              ...item,
                              versions: [
                                ...(item.versions || []),
                                {
                                  id: newId(),
                                  createdAt: new Date().toISOString(),
                                  prompt: item.prompt,
                                  profile: item.profile,
                                  mediaId: item.mediaId,
                                  outputUrl: item.outputUrl,
                                },
                              ],
                            }
                          : item
                      ),
                      updatedAt: new Date().toISOString(),
                    }))
                  }}
                  onUpload={(assetId, file) =>
                    void uploadAssetImage(assetId, file).catch((error) =>
                      setMessage(errorMessage(error))
                    )
                  }
                  onDelete={(assetId) => {
                    const affectedIds = new Set(
                      project.nodes
                        .filter(
                          (node) =>
                            node.data.linkedAssetId === assetId ||
                            node.data.assetIds?.includes(assetId)
                        )
                        .flatMap((node) => [
                          ...studioBranchNodeIds(project, node.id),
                        ])
                    )
                    if (
                      project.nodes.some(
                        (node) =>
                          affectedIds.has(node.id) && studioNodeBusy(node)
                      )
                    ) {
                      setMessage(t('studio.canvas.taskBusy'))
                      return
                    }
                    const asset = project.assets?.find(
                      (item) => item.id === assetId
                    )
                    if (asset?.mediaId && mediaStore) {
                      if (!storedMediaIsReferenced(asset.mediaId)) {
                        void mediaStore.delete(userId, asset.mediaId)
                      }
                      loadedMediaIds.current.delete(
                        mediaLoadKey({
                          kind: 'asset',
                          projectId: project.id,
                          mediaId: asset.mediaId,
                        })
                      )
                    }
                    for (const version of asset?.versions || []) {
                      if (
                        version.mediaId &&
                        version.mediaId !== asset?.mediaId &&
                        mediaStore
                      ) {
                        if (!storedMediaIsReferenced(version.mediaId)) {
                          void mediaStore.delete(userId, version.mediaId)
                        }
                      }
                    }
                    const assetKey = previewKey(project.id, `asset:${assetId}`)
                    const assetUrl = previews[assetKey]
                    if (assetUrl?.startsWith('blob:')) {
                      URL.revokeObjectURL(assetUrl)
                      ownedUrls.current = ownedUrls.current.filter(
                        (url) => url !== assetUrl
                      )
                    }
                    setPreviews((current) => {
                      const next = { ...current }
                      delete next[assetKey]
                      return next
                    })
                    const affected = project.nodes.filter(
                      (node) =>
                        node.data.linkedAssetId === assetId ||
                        node.data.assetIds?.includes(assetId)
                    )
                    affected.forEach((node) =>
                      discardBranchMedia(project, node.id)
                    )
                    editProject(project.id, (current) => {
                      let next: StudioProject = {
                        ...current,
                        assets: current.assets?.filter(
                          (item) => item.id !== assetId
                        ),
                        nodes: current.nodes.map((node) => ({
                          ...node,
                          data: {
                            ...node.data,
                            ...(node.data.linkedAssetId === assetId
                              ? { linkedAssetId: undefined, purpose: undefined }
                              : {}),
                            assetIds: node.data.assetIds?.filter(
                              (id) => id !== assetId
                            ),
                            assetVersionIds: Object.fromEntries(
                              Object.entries(
                                node.data.assetVersionIds || {}
                              ).filter(([id]) => id !== assetId)
                            ),
                          },
                        })),
                      }
                      for (const node of affected) {
                        next = invalidateStudioBranch(next, node.id)
                      }
                      return next
                    })
                  }}
                  onApplyToShots={(assetId) => {
                    try {
                      const next = applyStudioAssetToAllShots(project, assetId)
                      if (next === project) return
                      for (const shot of project.shots || []) {
                        const shotNodes = new Set([
                          shot.textNodeId,
                          shot.imageNodeId,
                          shot.videoNodeId,
                        ])
                        if (
                          project.nodes.some(
                            (node) =>
                              shotNodes.has(node.id) &&
                              !node.data.assetIds?.includes(assetId)
                          )
                        ) {
                          discardBranchMedia(project, shot.textNodeId)
                        }
                      }
                      editProject(project.id, () => next)
                    } catch (error) {
                      setMessage(errorMessage(error))
                    }
                  }}
                />
              </div>
            </div>
          )}
          {view === 'storyboard' && (
            <StudioStoryboard
              project={project}
              previews={previews}
              takePreviews={previews}
              groups={videoGroups}
              userGroup={userGroup}
              textModels={providerModels.text || []}
              imageModels={providerModels.image || []}
              onChangeDefaults={(patch) =>
                editProject(project.id, (current) => ({
                  ...current,
                  defaults: { ...current.defaults, ...patch },
                  updatedAt: new Date().toISOString(),
                }))
              }
              onPlanShots={generateStudioStoryboard}
              planningScope={`${userId}:${project.id}`}
              onCreatePlannedShots={createPlannedShots}
              onUsePreviousFrame={(shotId) =>
                void capturePreviousShotFrame(shotId)
              }
              frameBusyShotId={frameBusyShotId}
              batchBusy={batchBusy}
              batchLimit={batchLimit}
              batchCost={batchCost}
              onBatchLimitChange={setBatchLimit}
              assembly={{
                busy: assemblyBusy,
                progress: assemblyProgress,
                preflight: assemblyPreflight,
                soundtrackUrl: soundtrackPreviews.get(project.id),
                soundtrackVolume: project.soundtrackVolume ?? 1,
                soundtrackOffsetSeconds: project.soundtrackOffsetSeconds ?? 0,
                onSoundtrackOffsetChange: (soundtrackOffsetSeconds) =>
                  editProject(project.id, (current) => ({
                    ...current,
                    soundtrackOffsetSeconds,
                    updatedAt: new Date().toISOString(),
                  })),
                voiceoverUrl: voiceoverPreviews.get(project.id),
                voiceoverVolume: project.voiceoverVolume ?? 1,
                voiceoverOffsetSeconds: project.voiceoverOffsetSeconds ?? 0,
                onVoiceoverOffsetChange: (voiceoverOffsetSeconds) =>
                  editProject(project.id, (current) => ({
                    ...current,
                    voiceoverOffsetSeconds,
                    updatedAt: new Date().toISOString(),
                  })),
                onUploadVoiceover: (file) => void uploadVoiceover(file),
                onVoiceoverVolumeChange: (volume) =>
                  editProject(project.id, (current) => ({
                    ...current,
                    voiceoverVolume: volume,
                    updatedAt: new Date().toISOString(),
                  })),
                onRemoveVoiceover: () => {
                  const oldId = project.voiceoverMediaId
                  if (oldId && mediaStore) {
                    if (!storedMediaIsReferenced(oldId)) {
                      void mediaStore.delete(userId, oldId)
                    }
                    loadedMediaIds.current.delete(
                      mediaLoadKey({
                        kind: 'voiceover',
                        projectId: project.id,
                        mediaId: oldId,
                      })
                    )
                  }
                  const oldUrl = voiceoverPreviews.get(project.id)
                  if (oldUrl?.startsWith('blob:')) {
                    URL.revokeObjectURL(oldUrl)
                    ownedUrls.current = ownedUrls.current.filter(
                      (url) => url !== oldUrl
                    )
                  }
                  setVoiceoverPreviews((current) => {
                    const next = new Map(current)
                    next.delete(project.id)
                    return next
                  })
                  editProject(project.id, (current) => ({
                    ...current,
                    voiceoverMediaId: undefined,
                    updatedAt: new Date().toISOString(),
                  }))
                },
                onUploadShotVoiceover: (shotId, file) =>
                  void uploadShotVoiceover(shotId, file),
                onRemoveShotVoiceover: (shotId) =>
                  void removeShotVoiceover(shotId),
                onUpdateShotAudioCaption: (shotId, patch) =>
                  editProject(project.id, (current) => ({
                    ...current,
                    shots: current.shots?.map((shot) =>
                      shot.id === shotId ? { ...shot, ...patch } : shot
                    ),
                    updatedAt: new Date().toISOString(),
                  })),
                previewUrl: project.assembledMediaId
                  ? assemblyPreviews.get(project.id)
                  : undefined,
                error: assemblyError,
                onAssemble: () => void assembleMp4(),
                onCancel: () => assemblyRun.current?.controller.abort(),
                onDownload: downloadAssembly,
                onUploadSoundtrack: (file) => void uploadSoundtrack(file),
                onRemoveSoundtrack: () => {
                  const oldId = project.soundtrackMediaId
                  if (oldId && mediaStore) {
                    if (!storedMediaIsReferenced(oldId)) {
                      void mediaStore.delete(userId, oldId)
                    }
                    loadedMediaIds.current.delete(
                      mediaLoadKey({
                        kind: 'soundtrack',
                        projectId: project.id,
                        mediaId: oldId,
                      })
                    )
                  }
                  const oldUrl = soundtrackPreviews.get(project.id)
                  if (oldUrl?.startsWith('blob:')) {
                    URL.revokeObjectURL(oldUrl)
                    ownedUrls.current = ownedUrls.current.filter(
                      (url) => url !== oldUrl
                    )
                  }
                  setSoundtrackPreviews((current) => {
                    const next = new Map(current)
                    next.delete(project.id)
                    return next
                  })
                  editProject(project.id, (current) => ({
                    ...current,
                    soundtrackMediaId: undefined,
                    updatedAt: new Date().toISOString(),
                  }))
                },
                onSoundtrackVolumeChange: (volume) =>
                  editProject(project.id, (current) => ({
                    ...current,
                    soundtrackVolume: volume,
                    updatedAt: new Date().toISOString(),
                  })),
              }}
              onAddShot={addShot}
              onSelectNode={setSelectedNodeId}
              onGenerateNode={(nodeId) => {
                const node = project.nodes.find((item) => item.id === nodeId)
                if (node) void generate(node, project)
              }}
              onGenerateVideo={(nodeId) => {
                const node = project.nodes.find((item) => item.id === nodeId)
                if (node) void generate(node, project)
              }}
              onGenerateAll={() => void generateAllShots()}
              batchTargetCount={batchPlan.targets.length}
              onCreateFinalVideo={createFinalVideo}
              onSetFinalReference={(shotId, selected) => {
                if (project.finalVideoNodeId) {
                  discardBranchMedia(project, project.finalVideoNodeId)
                }
                editProject(project.id, (current) =>
                  setStudioFinalVideoReference(current, shotId, selected)
                )
              }}
              onMoveShot={(shotId, direction) =>
                editProject(project.id, (current) =>
                  moveStudioShot(current, shotId, direction)
                )
              }
              onRenameShot={(shotId, title) =>
                editProject(project.id, (current) =>
                  applyStudioCanvasOperations(current, [
                    { op: 'update_shot', shotId, patch: { title } },
                  ])
                )
              }
              onUpdateShotReview={(shotId, patch) =>
                editProject(project.id, (current) => ({
                  ...current,
                  shots: current.shots?.map((shot) =>
                    shot.id === shotId ? { ...shot, ...patch } : shot
                  ),
                  updatedAt: new Date().toISOString(),
                }))
              }
              onUpdateShotDetails={(shotId, patch) => {
                const shot = project.shots?.find((item) => item.id === shotId)
                if (!shot) return
                discardBranchMedia(project, shot.textNodeId)
                editProject(project.id, (current) => ({
                  ...invalidateStudioBranch(current, shot.textNodeId),
                  shots: current.shots?.map((item) =>
                    item.id === shotId
                      ? { ...item, ...patch, reviewStatus: 'unreviewed' }
                      : item
                  ),
                }))
              }}
              onSelectTake={(nodeId, takeId) => {
                const node = project.nodes.find((item) => item.id === nodeId)
                if (!node || node.data.selectedTakeId === takeId) return
                if (!node.data.takes?.some((take) => take.id === takeId)) return
                discardNodeMedia(project.id, node)
                for (const edge of project.edges) {
                  if (edge.source === nodeId) {
                    discardBranchMedia(project, edge.target)
                  }
                }
                editProject(project.id, (current) =>
                  selectStudioTake(current, nodeId, takeId)
                )
              }}
              onSetShotAssets={(shotId, assetIds) => {
                const shot = project.shots?.find((item) => item.id === shotId)
                if (!shot) return
                try {
                  const next = setStudioShotAssets(project, shotId, assetIds)
                  if (next === project) return
                  discardBranchMedia(project, shot.textNodeId)
                  editProject(project.id, (current) =>
                    setStudioShotAssets(current, shotId, assetIds)
                  )
                } catch (error) {
                  setMessage(errorMessage(error))
                }
              }}
              onPinShotAssetVersion={(shotId, assetId, versionId) => {
                const shot = project.shots?.find((item) => item.id === shotId)
                if (!shot) return
                try {
                  const next = pinStudioShotAssetVersion(
                    project,
                    shotId,
                    assetId,
                    versionId
                  )
                  if (next === project) return
                  discardBranchMedia(project, shot.textNodeId)
                  editProject(project.id, (current) =>
                    pinStudioShotAssetVersion(
                      current,
                      shotId,
                      assetId,
                      versionId
                    )
                  )
                } catch (error) {
                  setMessage(errorMessage(error))
                }
              }}
              onReusePreviousShotReferences={(shotId, sourceShotId) => {
                const shot = project.shots?.find((item) => item.id === shotId)
                if (!shot) return
                try {
                  const next = copyStudioShotReferences(
                    project,
                    sourceShotId,
                    shotId
                  )
                  if (next === project) return
                  discardBranchMedia(project, shot.textNodeId)
                  editProject(project.id, (current) =>
                    copyStudioShotReferences(current, sourceShotId, shotId)
                  )
                } catch (error) {
                  setMessage(errorMessage(error))
                }
              }}
              onUpdateShotEdit={(shotId, patch: Partial<StudioShot>) =>
                editProject(project.id, (current) => ({
                  ...current,
                  shots: current.shots?.map((shot) =>
                    shot.id === shotId ? { ...shot, ...patch } : shot
                  ),
                  updatedAt: new Date().toISOString(),
                }))
              }
              onDeleteShot={(shotId) => {
                setSelectedShotId(shotId)
                setDeleteTarget('shot')
              }}
            />
          )}
        </section>
        {selectedNode && ['canvas', 'storyboard'].includes(view) && (
          <aside className='min-h-[560px] border-t lg:min-h-0 lg:border-t-0 lg:border-l'>
            {selectedNode.data.purpose === 'assembly' ? (
              <StudioAssemblyNodeInspector
                project={project}
                readOnly={projectReadOnly}
                nodeId={selectedNode.id}
                busy={assemblyBusy}
                progress={assemblyProgress}
                error={assemblyError}
                previewUrl={
                  selectedNode.data.status === 'completed' &&
                  selectedNode.data.mediaId
                    ? assemblyPreviews.get(project.id)
                    : undefined
                }
                onEdit={(operations) =>
                  editCanvasProject(project.id, (current) =>
                    applyStudioCanvasOperations(current, operations)
                  )
                }
                onAssemble={() => void assembleMp4(selectedNode.id)}
                onCancel={() => assemblyRun.current?.controller.abort()}
                onDownload={downloadAssembly}
                onStoryboard={() => setView('storyboard')}
                onClose={() => setSelectedNodeId(null)}
                onDelete={() => setDeleteTarget('node')}
              />
            ) : (
              <StudioInspector
                node={selectedNode}
                readOnly={projectReadOnly}
                generationAvailable={
                  generationAccess.data?.storage_available !== false &&
                  (Boolean(
                    (selectedNode.data.kind === 'text' ||
                      selectedNode.data.kind === 'image') &&
                    providerConfigs[selectedNode.data.kind]?.hasKey
                  ) ||
                    generationAccess.data?.generation_credit_available === true)
                }
                generationBlockReason={generationBlockReason}
                onOpenMediaTool={() => {
                  openProduction('media')
                }}
                project={project}
                onUpdateProject={(updated) =>
                  editProject(project.id, () => updated)
                }
                getMedia={async (id) =>
                  mediaStore ? mediaStore.get(userId, id) : null
                }
                referenceSources={project.nodes
                  .filter((node) => node.data.kind === 'image')
                  .map((node) => ({ id: node.id, title: node.data.title }))}
                onChangeFrameReference={(role, sourceId) => {
                  const edges = project.edges.filter(
                    (edge) =>
                      edge.target === selectedNode.id &&
                      (edge.targetHandle === role ||
                        (role === 'first_frame' &&
                          !edge.targetHandle &&
                          project.nodes.find((node) => node.id === edge.source)
                            ?.data.kind === 'image'))
                  )
                  const operations: StudioCanvasOperation[] = []
                  if (edges.length) {
                    operations.push({
                      op: 'disconnect',
                      edgeIds: edges.map((edge) => edge.id),
                    })
                  }
                  if (sourceId) {
                    operations.push({
                      op: 'connect',
                      source: sourceId,
                      target: selectedNode.id,
                      sourceHandle: 'image',
                      targetHandle: role,
                    })
                  }
                  if (operations.length) {
                    editCanvasProject(project.id, (current) =>
                      applyStudioCanvasOperations(current, operations)
                    )
                  }
                }}
                onRemoveConnection={(id) =>
                  editCanvasProject(project.id, (current) =>
                    applyStudioCanvasOperations(current, [
                      { op: 'disconnect', edgeIds: [id] },
                    ])
                  )
                }
                mediaEditor={
                  <StudioMediaEditor
                    nodes={project.nodes}
                    key={selectedNode.id}
                    node={selectedNode}
                    projectId={project.id}
                    readOnly={Boolean(
                      mediaStore &&
                      'cloudRecord' in mediaStore &&
                      !['owner', 'editor'].includes(
                        mediaStore.cloudRecord(project.id)?.role || 'owner'
                      )
                    )}
                    getMedia={async (id) =>
                      mediaStore ? mediaStore.get(userId, id) : null
                    }
                    previewUrl={
                      previews[previewKey(project.id, selectedNode.id)] ||
                      selectedNode.data.outputUrl
                    }
                    onSource={(id) => {
                      setSelectedNodeId(id)
                      setView('canvas')
                    }}
                    onRefresh={async (job) => {
                      if (!mediaStore) return
                      const restored = await refreshStudioProjects(
                        mediaStore,
                        userId,
                        () => projectsRef.current,
                        () => activeUserId.current === userId
                      )
                      if (!restored || activeUserId.current !== userId) return
                      const result = job && nativeResults.current.get(job.id)
                      if (
                        result &&
                        result.projectId === project.id &&
                        restored
                          .find((entry) => entry.id === project.id)
                          ?.nodes.some(
                            (node) =>
                              node.id === result.targetId && node.data.mediaId
                          )
                      ) {
                        if (result.select) setSelectedNodeId(result.targetId)
                        nativeResults.current.delete(job.id)
                      }
                      projectsRef.current = restored
                      setWorkspace((current) => ({
                        ...current,
                        projects: restored,
                      }))
                    }}
                    onCreate={async (
                      action,
                      edit,
                      blob,
                      layers,
                      resultName,
                      selectResult = true
                    ) => {
                      if (activeUserId.current !== userId) {
                        throw new Error(t('studio.project.saveFailed'))
                      }
                      if (mediaStore && 'cloudRecord' in mediaStore) {
                        const role = mediaStore.cloudRecord(project.id)?.role
                        if (role && !['owner', 'editor'].includes(role)) {
                          throw new Error(t('studio.production.readOnly'))
                        }
                      }
                      if (!mediaStore || !selectedNode.data.mediaId) {
                        throw new Error(t('studio.project.saveFailed'))
                      }
                      const targetId = newId()
                      let next = createStudioEditedNode(
                        project,
                        selectedNode.id,
                        targetId,
                        action
                      )
                      if (layers) {
                        next = updateStudioNode(next, targetId, {
                          imageLayers: layers,
                          title: studioEditedMediaTitle(
                            project,
                            selectedNode.id,
                            t('Layer edit')
                          ),
                        })
                      }
                      if (resultName) {
                        next = updateStudioNode(next, targetId, {
                          title: studioEditedMediaTitle(
                            project,
                            selectedNode.id,
                            resultName
                          ),
                        })
                      }
                      if (blob) {
                        const mediaId = newId()
                        await mediaStore.put(userId, mediaId, blob)
                        next = recordStudioTake(next, targetId, {
                          id: newId(),
                          createdAt: new Date().toISOString(),
                          status: 'completed',
                          prompt: action,
                          sourceMode: 'upload',
                          mediaId,
                          imageLayers: layers,
                        })
                      }
                      if (activeUserId.current !== userId) {
                        throw new Error(t('studio.project.saveFailed'))
                      }
                      const latest = projectsRef.current.find(
                        (item) => item.id === project.id
                      )
                      const resultNode = next.nodes.find(
                        (node) => node.id === targetId
                      )
                      if (
                        !latest?.nodes.some(
                          (node) => node.id === selectedNode.id
                        ) ||
                        !resultNode
                      ) {
                        throw new Error(t('Stored source media is unavailable'))
                      }
                      next = {
                        ...latest,
                        nodes: [...latest.nodes, resultNode],
                        updatedAt: new Date().toISOString(),
                      }
                      const updated = projectsRef.current.map((item) =>
                        item.id === project.id ? next : item
                      )
                      editCanvasProject(project.id, () => next)
                      if (blob) {
                        if (selectResult) setSelectedNodeId(targetId)
                        await mediaStore.saveProjects(userId, updated)
                        return
                      }
                      const requestId = newId()
                      const created = await mediaStore.withSavedProjects(
                        userId,
                        updated,
                        async () => {
                          // Autosaves cannot advance the revision between this read and submission.
                          for (let attempt = 0; attempt < 2; attempt++) {
                            const stored =
                              await studioCloudRequest<StudioCloudProject>(
                                `/projects/${encodeURIComponent(project.id)}`
                              )
                            if (
                              !stored.document.nodes.some(
                                (node) =>
                                  node.id === selectedNode.id &&
                                  node.data.mediaId ===
                                    selectedNode.data.mediaId
                              ) ||
                              !stored.document.nodes.some(
                                (node) => node.id === targetId
                              )
                            ) {
                              throw new Error(
                                t('Stored source media is unavailable')
                              )
                            }
                            try {
                              return await studioCloudRequest<StudioCloudJob>(
                                `/projects/${encodeURIComponent(project.id)}/jobs`,
                                'POST',
                                {
                                  request_id: requestId,
                                  kind: 'transform',
                                  revision: stored.revision,
                                  budget: 0,
                                  operation: {
                                    action,
                                    node_id: targetId,
                                    media_id: selectedNode.data.mediaId,
                                    edit,
                                  },
                                }
                              )
                            } catch (error) {
                              if (
                                attempt ||
                                !isAxiosError(error) ||
                                error.response?.status !== 409
                              ) {
                                throw error
                              }
                            }
                          }
                        }
                      )
                      if (created) {
                        nativeResults.current.set(created.id, {
                          targetId,
                          projectId: project.id,
                          select: selectResult,
                        })
                      }
                      return created
                    }}
                  />
                }
                onClose={() => setSelectedNodeId(null)}
                assetEditor={
                  selectedAsset && (
                    <StudioAssetProfileEditor
                      asset={selectedAsset}
                      defaultOpen
                      disabled={studioNodeBusy(selectedNode)}
                      onChange={(profile) =>
                        changeAsset(selectedAsset.id, { profile })
                      }
                      onReference={(mode) => {
                        const instructions = {
                          portrait:
                            'Create a clean character portrait with the established appearance and costume, neutral background, soft studio lighting.',
                          turnaround:
                            'Create a character turnaround sheet with front, side and back views of the SAME character, identical clothing and proportions, neutral background.',
                          expressions:
                            'Create a facial expression sheet of the SAME character: neutral, happy, angry, sad and surprised. Keep identity, hairstyle and costume identical.',
                          locationAngles:
                            'Create a coherent location reference sheet with wide, medium and detail views. Keep architecture, time of day, lighting and materials consistent.',
                        }
                        editCanvasProject(project.id, (current) =>
                          updateStudioNode(
                            invalidateStudioBranch(current, selectedNode.id),
                            selectedNode.id,
                            { prompt: instructions[mode] }
                          )
                        )
                      }}
                    />
                  )
                }
                connections={project.edges
                  .filter((edge) => edge.target === selectedNode.id)
                  .flatMap((edge) => {
                    const source = project.nodes.find(
                      (node) => node.id === edge.source
                    )
                    if (!source) {
                      return []
                    }
                    return [
                      {
                        edgeId: edge.id,
                        sourceId: source.id,
                        role:
                          edge.targetHandle ||
                          {
                            text: 'prompt',
                            image: 'first_frame',
                            video: 'reference_video',
                            audio: 'reference',
                          }[source.data.kind],
                        sourceTitle: source.data.title,
                        pinnedTakeId: edge.data?.sourceTakeId,
                        takes: source.data.takes || [],
                      },
                    ]
                  })}
                onPinConnectionTake={(edgeId, takeId) => {
                  discardBranchMedia(project, selectedNode.id)
                  try {
                    editProject(project.id, (current) =>
                      pinStudioConnectionTake(current, edgeId, takeId)
                    )
                  } catch (error) {
                    setMessage(errorMessage(error))
                  }
                }}
                models={
                  selectedNode.data.kind === 'video' ||
                  selectedNode.data.kind === 'audio'
                    ? []
                    : providerModels[selectedNode.data.kind] || []
                }
                videoGroups={videoGroups}
                videoGroup={selectedGroup}
                videoTemplates={videoTemplates}
                onApplyVideoTemplate={(template) => {
                  discardBranchMedia(project, selectedNode.id)
                  editProject(project.id, (current) =>
                    updateStudioNode(
                      invalidateStudioBranch(current, selectedNode.id),
                      selectedNode.id,
                      {
                        seconds: template.seconds,
                        resolution: template.resolution,
                        ratio: template.ratio,
                        metadataJson: template.metadataJson || '',
                        payloadPatchJson: template.payloadPatchJson || '',
                      }
                    )
                  )
                }}
                providerConfigured={
                  selectedNode.data.kind !== 'video' &&
                  selectedNode.data.kind !== 'audio' &&
                  (Boolean(providerConfigs[selectedNode.data.kind]?.hasKey) ||
                    Boolean(providerModels[selectedNode.data.kind]?.length))
                }
                hasConnectedPrompt={Boolean(
                  connectedGenerationInput(
                    project.nodes,
                    project.edges,
                    selectedNode.id
                  ).prompt.trim()
                )}
                onConfigureProvider={() => {
                  if (
                    selectedNode.data.kind === 'video' ||
                    selectedNode.data.kind === 'audio'
                  ) {
                    return
                  }
                  setSettingsKind(selectedNode.data.kind)
                  setSettingsOpen(true)
                }}
                previewUrl={
                  previews[previewKey(project.id, selectedNode.id)] ||
                  selectedNode.data.outputUrl
                }
                requestPreview={
                  requestPreviews[previewKey(project.id, selectedNode.id)]
                }
                onChange={(patch) => {
                  const changed = studioNodeInputsChanged(
                    selectedNode.data,
                    patch
                  )
                  if (changed) {
                    setRequestPreviews((current) => {
                      const next = { ...current }
                      delete next[previewKey(project.id, selectedNode.id)]
                      return next
                    })
                    discardBranchMedia(project, selectedNode.id)
                    editProject(project.id, (current) =>
                      updateStudioNode(
                        invalidateStudioBranch(current, selectedNode.id),
                        selectedNode.id,
                        patch
                      )
                    )
                  } else {
                    editNode(project.id, selectedNode.id, patch)
                  }
                }}
                onGenerate={() => void generate(selectedNode, project)}
                onReconcileSubmission={() =>
                  void reconcileVideoSubmission(selectedNode, project)
                }
                onAbandonSubmission={() =>
                  setAbandonSubmission({
                    projectId: project.id,
                    nodeId: selectedNode.id,
                  })
                }
                onSaveTextOutput={(output) => {
                  try {
                    editProject(project.id, (current) =>
                      reviseStudioTextOutput(
                        current,
                        selectedNode.id,
                        newId(),
                        output
                      )
                    )
                    discardBranchMedia(project, selectedNode.id)
                  } catch (error) {
                    setMessage(errorMessage(error))
                  }
                }}
                onUploadImage={(file) => {
                  void uploadImage(selectedNode, project, file).catch((error) =>
                    setMessage(errorMessage(error))
                  )
                }}
                onUploadAudio={(file) => {
                  void uploadMediaNode(selectedNode, project, file).catch(
                    (error) => setMessage(errorMessage(error))
                  )
                }}
                onUploadVideo={(file) => {
                  void uploadMediaNode(selectedNode, project, file).catch(
                    (error) => setMessage(errorMessage(error))
                  )
                }}
                onUseAudio={(track) => {
                  void (async () => {
                    const blob =
                      selectedNode.data.mediaId && mediaStore
                        ? await mediaStore.get(
                            userId,
                            selectedNode.data.mediaId
                          )
                        : null
                    if (!blob) throw new Error(t('studio.media.missing'))
                    const file = new File(
                      [blob],
                      `${selectedNode.data.title}.mp3`,
                      { type: blob.type || 'audio/mpeg' }
                    )
                    if (track === 'soundtrack') await uploadSoundtrack(file)
                    else await uploadVoiceover(file)
                  })().catch((error) => setMessage(errorMessage(error)))
                }}
                onDelete={() => setDeleteTarget('node')}
                onRetryMedia={() => void retryMedia(selectedNode, project)}
                availableAssets={project.assets}
                onSelectTake={(takeId) => {
                  discardNodeMedia(project.id, selectedNode)
                  for (const edge of project.edges) {
                    if (edge.source === selectedNode.id) {
                      discardBranchMedia(project, edge.target)
                    }
                  }
                  editProject(project.id, (current) =>
                    selectStudioTake(current, selectedNode.id, takeId)
                  )
                }}
                archivableTakeIds={archivableStudioTakeIds(
                  project,
                  selectedNode.id
                )}
                onArchiveTake={(takeId) =>
                  editProject(project.id, (current) =>
                    archiveStudioTake(current, selectedNode.id, takeId)
                  )
                }
              />
            )}
          </aside>
        )}
      </div>
      {preflightData && (
        <StudioVideoPreflight
          key={preflightNonce}
          data={preflightData}
          onConfirm={() => settlePreflight(true)}
          onCancel={() => settlePreflight(false)}
        />
      )}
      <ConfirmDialog
        open={abandonSubmission !== null}
        onOpenChange={(open) => {
          if (!open) setAbandonSubmission(null)
        }}
        title={t('studio.submission.abandonTitle')}
        desc={t('studio.submission.abandonWarning')}
        confirmText={t('studio.submission.abandonConfirm')}
        destructive
        handleConfirm={() => {
          if (abandonSubmission) {
            editNode(abandonSubmission.projectId, abandonSubmission.nodeId, {
              status: 'failed',
              error: t('studio.submission.abandoned'),
              pendingRequestId: undefined,
              pendingRequestFingerprint: undefined,
              pendingRequestPrompt: undefined,
              pendingRequestGroup: undefined,
              pendingRequestModel: undefined,
              pendingRequestSnapshot: undefined,
            })
          }
          setAbandonSubmission(null)
        }}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            setSelectedShotId(null)
          }
        }}
        title={t('studio.delete.title')}
        desc={
          deleteTarget === 'shot'
            ? t('studio.shot.deleteDescription')
            : t('studio.delete.description')
        }
        confirmText={t('studio.delete.confirm')}
        destructive
        handleConfirm={() => {
          if (deleteTarget === 'shot' && selectedShotId) {
            const shot = project.shots?.find(
              (item) => item.id === selectedShotId
            )
            if (shot) {
              for (const id of [
                shot.textNodeId,
                shot.imageNodeId,
                shot.videoNodeId,
              ]) {
                const node = project.nodes.find((item) => item.id === id)
                if (node) discardNodeMedia(project.id, node)
              }
              editCanvasProject(project.id, (current) =>
                applyStudioCanvasOperations(current, [
                  {
                    op: 'remove_nodes',
                    nodeIds: [
                      shot.textNodeId,
                      shot.imageNodeId,
                      shot.videoNodeId,
                    ],
                  },
                ])
              )
              setSelectedNodeId(null)
            }
          }
          if (deleteTarget === 'node' && selectedNode) {
            editCanvasProject(project.id, (current) =>
              applyStudioCanvasOperations(current, [
                { op: 'remove_nodes', nodeIds: [selectedNode.id] },
              ])
            )
            setSelectedNodeId(null)
          }
          if (deleteTarget === 'project') {
            project.nodes.forEach((node) => discardNodeMedia(project.id, node))
            deleteStoredMedia(project)
            canvasHistories.current.delete(`${userId}:${project.id}`)
            setWorkspace((current) => {
              const remaining = current.projects.filter(
                (item) => item.id !== project.id
              )
              const next = remaining.length
                ? remaining
                : [createStudioProject(t('studio.project.untitled'), newId())]
              return { ...current, projects: next, activeId: next[0].id }
            })
            setSelectedNodeId(null)
          }
          setDeleteTarget(null)
          setSelectedShotId(null)
        }}
      />
      <StudioProviderSettings
        open={settingsOpen}
        initialKind={settingsKind}
        configs={providerConfigs}
        modelCounts={{
          text: providerModels.text?.length || 0,
          image: providerModels.image?.length || 0,
        }}
        onOpenChange={setSettingsOpen}
        onSave={saveProvider}
        onRefresh={refreshProviderModels}
        onDelete={removeProvider}
      />
      <StudioAttempts
        open={attemptsOpen}
        onOpenChange={setAttemptsOpen}
        userId={userId}
        localTasks={localTasks}
        projects={projects}
        currentProjectId={project.id}
        onOpenJob={(projectId, kind, nodeId, status) => {
          setWorkspace((current) => ({ ...current, activeId: projectId }))
          const taskProject = projects.find(
            (project) => project.id === projectId
          )
          const taskNode = taskProject?.nodes.find((node) => node.id === nodeId)
          setSelectedNodeId(taskNode?.id || null)
          setAttemptsOpen(false)
          if (['transform', 'graphics', 'previs'].includes(kind) && taskNode) {
            setSelectedNodeId(
              status === 'failed'
                ? taskNode.data.derivedFrom?.nodeId || taskNode.id
                : taskNode.id
            )
            options.onNavigate?.('canvas', projectId)
            setView('canvas')
            return
          }
          let step: import('./studio-creation').StudioCreationStep = 'edit'
          if (kind === 'render' || kind === 'quality') step = 'deliver'
          else if (kind === 'generate') step = 'visual'
          else if (kind === 'media') step = 'voice'
          options.onNavigate?.('guided', projectId, false, step)
          setView('guided')
        }}
        onOpenTask={(projectId, nodeId) => {
          setWorkspace((current) => ({ ...current, activeId: projectId }))
          setSelectedNodeId(nodeId)
          setView('canvas')
          setAttemptsOpen(false)
        }}
      />
      <StudioAgentPanel
        open={agentOpen}
        onOpenChange={setAgentOpen}
        bridge={agentBridge}
      />
    </div>
  )
}
