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
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import {
  Download,
  Film,
  ImagePlus,
  Plus,
  Settings2,
  Type,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Canvas } from '@/components/ai-elements/canvas'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuthStore } from '@/stores/auth-store'

import {
  createStudioVideo,
  deleteStudioProviderConfig,
  fetchStudioGroups,
  fetchStudioModels,
  fetchStudioProviderConfigs,
  fetchStudioProviderModels,
  generateStudioImage,
  generateStudioText,
  getStudioVideoContentUrl,
  getStudioVideoTask,
  saveStudioProviderConfig,
  type StudioGroup,
  type StudioProviderConfigs,
  type StudioProviderKind,
} from './api'
import { loadStudioAssemblyBlobs } from './assembly-media'
import {
  planStudioAssembly,
  reconcileStudioAssembly,
  StudioAssemblyError,
  studioAssemblyFingerprint,
} from './assembly-plan'
import {
  connectedGenerationInput,
  isValidStudioConnection,
  planStudioExecution,
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
} from './local-projects'
import { studioMediaStore } from './media-store'
import {
  buildStudioVideoModel,
  buildStudioVideoRequest,
  applyStudioVideoPayloadPatch,
  inferStudioVideoFamily,
  parseStudioVideoMetadata,
} from './model-profiles'
import { StudioProviderSettings } from './provider-settings'
import { StudioAssetLibrary } from './studio-asset-library'
import { StudioAttempts } from './studio-attempts'
import {
  fetchStudioVideoCostPreview,
  studioCostDurationSeconds,
  type StudioVideoCostPreview,
} from './studio-cost'
import {
  StudioExecutionCoordinator,
  studioNodeInputFingerprint,
  studioPromptWithAssets,
  planStudioVideoBatch,
} from './studio-execution'
import { StudioInspector } from './studio-inspector'
import { StudioNode } from './studio-node'
import {
  exportStudioProjectBundle,
  importStudioProjectBundle,
} from './studio-project-bundle'
import { StudioStoryboard } from './studio-storyboard'
import {
  addStudioNode,
  addStudioShot,
  createStudioProject,
  ensureStudioFinalVideo,
  invalidateStudioBranch,
  moveStudioShot,
  pruneStudioShots,
  recordStudioTake,
  retainStudioTake,
  removeStudioShot,
  selectStudioTake,
  studioBranchNodeIds,
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
  kind: 'node' | 'assembly' | 'soundtrack' | 'asset'
}
class StudioInputChangedError extends Error {}
const nodeTypes = { studio: StudioNode }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
  }
  if (project.assembledMediaId) ids.add(project.assembledMediaId)
  if (project.soundtrackMediaId) ids.add(project.soundtrackMediaId)
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

export function Studio() {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id ?? 0)
  const userGroup = useAuthStore((state) => state.auth.user?.group ?? '')
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
  const [videoGroups, setVideoGroups] = useState<StudioGroup[]>([])
  const [providerConfigs, setProviderConfigs] = useState<StudioProviderConfigs>(
    {}
  )
  const [providerModels, setProviderModels] = useState<
    Partial<Record<StudioProviderKind, string[]>>
  >({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [attemptsOpen, setAttemptsOpen] = useState(false)
  const [settingsKind, setSettingsKind] = useState<StudioProviderKind>('text')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [view, setView] = useState<'canvas' | 'storyboard' | 'assets'>('canvas')
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchLimit, setBatchLimit] = useState(5)
  const [batchCost, setBatchCost] = useState<
    { status: 'estimated'; estimatedUsd: number } | { status: 'unknown' }
  >({ status: 'unknown' })
  const [assemblyBusy, setAssemblyBusy] = useState(false)
  const [assemblyProgress, setAssemblyProgress] = useState(0)
  const [assemblyError, setAssemblyError] = useState<string | undefined>()
  const [message, setMessage] = useState<string | null>(null)
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
  const [assemblyPreflight, setAssemblyPreflight] = useState<{
    totalDuration: number
    estimatedOutputBytes: number
  }>()
  const [deleteTarget, setDeleteTarget] = useState<
    'node' | 'project' | 'shot' | null
  >(null)
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
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
  const activeProjectId = useRef(project?.id)
  activeProjectId.current = project?.id
  const projectsRef = useRef(projects)
  projectsRef.current = projects
  const canvasNodes = useMemo(
    () =>
      project?.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          previewUrl: previews[previewKey(project.id, node.id)],
          usedSourceHandles: project.edges
            .filter((edge) => edge.source === node.id && edge.sourceHandle)
            .map((edge) => edge.sourceHandle as string),
          usedTargetHandles: project.edges
            .filter((edge) => edge.target === node.id && edge.targetHandle)
            .map((edge) => edge.targetHandle as string),
        },
      })) ?? [],
    [project, previews]
  )
  const selectedNode = project?.nodes.find((node) => node.id === selectedNodeId)
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
    for (const asset of project.assets || []) {
      if (asset.mediaId) {
        refs.push({
          projectId: project.id,
          nodeId: `asset:${asset.id}`,
          mediaId: asset.mediaId,
          kind: 'asset',
        })
      }
    }
    return refs
  }, [project])
  const mediaRefsKey = JSON.stringify(mediaRefs)
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

  useEffect(() => {
    if (!userId) return
    setUnreadableProjectData(null)
    setBackupDownloaded(false)
    let projects: StudioProject[] = []
    try {
      projects = loadStudioProjects(localStorage, userId)
    } catch (error) {
      setUnreadableProjectData({
        ownerId: userId,
        raw: error instanceof StudioProjectStorageError ? error.raw : '',
        error:
          error instanceof StudioProjectStorageError
            ? t('studio.project.invalidLocalData')
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
    if (!projects.length) {
      projects = [createStudioProject(t('studio.project.untitled'), newId())]
    }
    setWorkspace({
      ownerId: userId,
      projects,
      activeId: projects[0].id,
      ready: true,
    })
    setSelectedNodeId(null)
    setView(projects[0].shots?.length ? 'storyboard' : 'canvas')
    setVideoGroups([])
    setProviderConfigs({})
    setProviderModels({})
    setSettingsOpen(false)
    setAttemptsOpen(false)
    setPreviews({})
    setRequestPreviews({})
    setAssemblyPreviews(new Map())
    setSoundtrackPreviews(new Map())
    loadedMediaIds.current.clear()
    ownedUrls.current.forEach((url) => URL.revokeObjectURL(url))
    ownedUrls.current = []
    let cancelled = false
    void fetchStudioGroups()
      .then((groups) => {
        if (!cancelled) setVideoGroups(groups)
      })
      .catch((error) => {
        if (!cancelled) setMessage(errorMessage(error))
      })
    void fetchStudioProviderConfigs()
      .then(async (configs) => {
        if (cancelled) return
        setProviderConfigs(configs)
        await Promise.all(
          (['text', 'image'] as const).map(async (kind) => {
            if (!configs[kind]?.hasKey) return
            try {
              const models = await fetchStudioProviderModels(kind)
              if (!cancelled) {
                setProviderModels((current) => ({ ...current, [kind]: models }))
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
      ownedUrls.current.forEach((url) => URL.revokeObjectURL(url))
      ownedUrls.current = []
    }
  }, [userId, userGroup, t])

  const refreshProviderModels = useCallback(
    async (kind: StudioProviderKind) => {
      const ownerId = userId
      const models = await fetchStudioProviderModels(kind)
      if (activeUserId.current === ownerId) {
        setProviderModels((current) => ({ ...current, [kind]: models }))
      }
    },
    [userId]
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
    },
    [userId]
  )

  useEffect(() => {
    if (!visible) return
    try {
      saveStudioProjects(localStorage, userId, workspace.projects)
    } catch (error) {
      setMessage(`${t('studio.project.saveFailed')}: ${errorMessage(error)}`)
    }
  }, [visible, userId, workspace.projects, t])

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
    (projectId: string, edit: (project: StudioProject) => StudioProject) => {
      if (activeUserId.current !== userId) return
      const existing = projectsRef.current.find((item) => item.id === projectId)
      if (!existing) return
      const edited = reconcileStudioAssembly(existing, edit(existing))
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
    [userId]
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

  const discardNodeMedia = useCallback(
    (projectId: string, node: StudioCanvasNode) => {
      const retained = node.data.takes?.some(
        (take) => take.mediaId === node.data.mediaId
      )
      if (node.data.mediaId && mediaStore && !retained) {
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
    [mediaStore, previews, userId]
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
    if (!selected) {
      for (const asset of source.assets || []) {
        if (asset.mediaId) ids.add(asset.mediaId)
      }
      if (source.soundtrackMediaId) ids.add(source.soundtrackMediaId)
      if (source.assembledMediaId) ids.add(source.assembledMediaId)
    }
    for (const mediaId of ids) {
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

  const uploadImage = useCallback(
    async (node: StudioCanvasNode, source: StudioProject, file: File) => {
      if (!mediaStore) throw new Error('browser media storage is unavailable')
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        throw new Error(t('studio.image.uploadType'))
      }
      if (file.size > 20_000_000) throw new Error(t('studio.image.uploadSize'))
      if (node.data.mediaId) discardNodeMedia(source.id, node)
      discardBranchMedia(source, node.id)
      const mediaId = newId()
      await mediaStore.put(userId, mediaId, file)
      loadedMediaIds.current.add(
        mediaLoadKey({ kind: 'node', projectId: source.id, mediaId })
      )
      const preview = URL.createObjectURL(file)
      ownedUrls.current.push(preview)
      setPreviews((current) => ({
        ...current,
        [previewKey(source.id, node.id)]: preview,
      }))
      editProject(source.id, (current) =>
        updateStudioNode(invalidateStudioBranch(current, node.id), node.id, {
          model: undefined,
          mediaId,
          outputUrl: undefined,
          status: 'completed',
          error: undefined,
        })
      )
    },
    [mediaStore, userId, discardNodeMedia, discardBranchMedia, editProject, t]
  )

  const generate = useCallback(
    async (target: StudioCanvasNode, source: StudioProject) => {
      if (!userId || workspace.ownerId !== userId) return
      const runId = `${userId}:${source.id}:${target.id}:${studioNodeInputFingerprint(source, target.id)}`
      if (runningTargets.current.has(runId)) return
      runningTargets.current.add(runId)
      setMessage(null)
      let current = target
      let workingNodes = source.nodes
      const fingerprint = (nodeId: string) =>
        studioNodeInputFingerprint({ ...source, nodes: workingNodes }, nodeId)
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
        takeId?: string
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
        if (takeId) {
          editProject(source.id, (project) =>
            updateStudioTake(project, nodeId, takeId, {
              status: 'completed',
              progress: 100,
              outputUrl,
              mediaId,
            })
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
        const targets = source.edges
          .filter((edge) => edge.source === nodeId)
          .map((edge) => edge.target)
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
        update(target.id, { status: 'submitting', error: undefined })
        const ordered = planStudioExecution(
          source.nodes,
          source.edges,
          target.id
        )
        for (const planned of ordered) {
          if (activeUserId.current !== userId) return
          const node = workingNodes.find((item) => item.id === planned.id)
          if (!node) throw new Error('canvas source node is missing')
          current = node
          const selected = node.id === target.id
          const input = connectedGenerationInput(
            workingNodes,
            source.edges,
            node.id
          )
          const generationPrompt = studioPromptWithAssets(
            input.prompt,
            source,
            node.data.assetIds
          )

          if (node.data.kind === 'text') {
            if (!node.data.model) {
              if (!input.prompt.trim()) {
                if (selected) throw new Error(t('studio.prompt.required'))
                continue
              }
              update(node.id, {
                outputText: generationPrompt,
                outputImagePrompt: undefined,
                outputVideoPrompt: undefined,
                status: 'completed',
                error: undefined,
              })
              continue
            }
            if (
              !selected &&
              node.data.status === 'completed' &&
              node.data.outputText?.trim() &&
              node.data.outputImagePrompt?.trim() &&
              node.data.outputVideoPrompt?.trim()
            ) {
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
                shot: await generateStudioText(textModelId, generationPrompt),
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
            const reference = source.edges
              .filter((edge) => edge.target === node.id)
              .map((edge) =>
                workingNodes.find((item) => item.id === edge.source)
              )
              .find((parent) => parent?.data.kind === 'image')
            let imageReference: string | undefined
            if (reference?.data.mediaId && mediaStore) {
              const blob = await mediaStore.get(userId, reference.data.mediaId)
              if (!blob) throw new Error(t('studio.media.missing'))
              imageReference = await blobToDataUrl(blob)
            } else if (reference?.data.outputUrl?.startsWith('data:image/')) {
              imageReference = reference.data.outputUrl
            } else if (reference?.data.outputUrl) {
              const response = await fetch(reference.data.outputUrl)
              if (!response.ok) throw new Error(t('studio.media.missing'))
              imageReference = await blobToDataUrl(await response.blob())
            }
            if (!imageReference && mediaStore) {
              const asset = source.assets?.find(
                (item) => node.data.assetIds?.includes(item.id) && item.mediaId
              )
              if (asset?.mediaId) {
                const blob = await mediaStore.get(userId, asset.mediaId)
                if (!blob) throw new Error(t('studio.media.missing'))
                imageReference = await blobToDataUrl(blob)
              }
            }
            const imageOptions = {
              ...(node.data.imageSize ? { size: node.data.imageSize } : {}),
              ...(node.data.imageQuality
                ? { quality: node.data.imageQuality }
                : {}),
              ...(node.data.imageCount ? { n: node.data.imageCount } : {}),
              ...(imageReference ? { image: imageReference } : {}),
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
                  node.data.selectedTakeId
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
              throw new Error(t('studio.video.upstreamTimeout'))
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
            throw new Error(t('studio.model.empty'))
          }
          if (activeUserId.current !== userId) return
          const family =
            node.data.videoFamily ||
            inferStudioVideoFamily(node.data.model) ||
            'generic'
          const model = buildStudioVideoModel(node.data.model, family)
          const incoming = source.edges
            .filter((edge) => edge.target === node.id)
            .flatMap((edge) => {
              const parent = workingNodes.find(
                (item) => item.id === edge.source
              )
              return parent ? [{ edge, parent }] : []
            })
          const images: string[] = []
          const videos: string[] = []
          const imageReferences: {
            url: string
            role: 'first_frame' | 'reference_image'
          }[] = []
          const videoReferences: {
            url: string
            role: 'reference_video' | 'extend_video'
          }[] = []
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
              if (!parent.data.outputUrl) {
                throw new Error(t('studio.media.missing'))
              }
              if (
                edge.targetHandle === 'reference_video' ||
                edge.targetHandle === 'extend_video'
              ) {
                videoReferences.push({
                  url: parent.data.outputUrl,
                  role: edge.targetHandle,
                })
              } else {
                videos.push(parent.data.outputUrl)
              }
            }
          }
          for (const asset of source.assets || []) {
            if (!node.data.assetIds?.includes(asset.id)) continue
            if (asset.mediaId && mediaStore) {
              const blob = await mediaStore.get(userId, asset.mediaId)
              if (!blob) throw new Error(t('studio.media.missing'))
              imageReferences.push({
                url: await blobToDataUrl(blob),
                role: 'reference_image',
              })
            } else if (asset.outputUrl) {
              imageReferences.push({
                url: asset.outputUrl,
                role: 'reference_image',
              })
            }
          }
          const request = applyStudioVideoPayloadPatch(
            buildStudioVideoRequest(model, {
              prompt: generationPrompt,
              imageUrls: images,
              videoUrls: videos,
              imageReferences,
              videoReferences,
              seconds: node.data.seconds ?? model.defaultSeconds,
              resolution: node.data.resolution ?? model.resolutions[0],
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
          update(node.id, {
            status: 'submitting',
            error: undefined,
            progress: undefined,
          })
          const expected = fingerprint(node.id)
          const { taskId, takeId } = await executionCoordinator.current.run(
            `${userId}:${source.id}:${node.id}:${expected}`,
            async () => ({
              taskId: await createStudioVideo(request, group),
              takeId: newId(),
            }),
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
          }
          try {
            assertFresh(node.id, expected)
          } catch (error) {
            if (error instanceof StudioInputChangedError) {
              editProject(source.id, (project) =>
                retainStudioTake(project, node.id, submittedTake)
              )
            }
            throw error
          }
          recordTake(node.id, submittedTake)
          update(node.id, { taskId, status: 'queued', progress: 0 })
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
                await completeVideo(node.id, taskId, url, takeId)
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
              throw new Error(t('studio.video.upstreamTimeout'))
            }
          }
        }
      } catch (error) {
        if (error instanceof StudioInputChangedError) return
        const reason = errorMessage(error)
        const displayReason = reason.includes(
          'choose a media request format for mixed'
        )
          ? t('studio.video.mixedFormatRequired')
          : reason
        update(current.id, { status: 'failed', error: displayReason })
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
    ]
  )

  useEffect(() => {
    if (!visible || pendingVideoKey === '[]') return
    let cancelled = false
    let polling = false
    const poll = async () => {
      if (polling) return
      polling = true
      try {
        for (const entry of pendingVideosRef.current) {
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
                        error: storageError,
                      }
                    )
                  })
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
          } catch (error) {
            if (!cancelled) setMessage(errorMessage(error))
          }
        }
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
  }, [visible, pendingVideoKey, userId, editNode, editProject, saveMedia, t])

  const addNode = (kind: StudioCanvasNodeData['kind']) => {
    if (!project) return
    const nodeId = newId()
    editProject(project.id, (current) => addStudioNode(current, kind, nodeId))
    setSelectedNodeId(nodeId)
  }

  const changeAsset = (
    assetId: string,
    patch: { title?: string; prompt?: string; mediaId?: string }
  ) => {
    if (!project) return
    const affected = project.nodes.filter((node) =>
      node.data.assetIds?.includes(assetId)
    )
    affected.forEach((node) => discardBranchMedia(project, node.id))
    editProject(project.id, (current) => {
      let next: StudioProject = {
        ...current,
        assets: current.assets?.map((asset) =>
          asset.id === assetId ? { ...asset, ...patch } : asset
        ),
        updatedAt: new Date().toISOString(),
      }
      for (const node of affected) next = invalidateStudioBranch(next, node.id)
      return next
    })
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
    changeAsset(assetId, { mediaId })
    if (oldMediaId) {
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

  const createFinalVideo = () => {
    if (!project) return
    const nodeId = newId()
    editProject(project.id, (current) =>
      ensureStudioFinalVideo(current, nodeId, t('studio.shot.finalTitle'))
    )
    setSelectedNodeId(nodeId)
    setView('storyboard')
  }

  const generateAllShots = async () => {
    if (!project || batchBusy) return
    setBatchBusy(true)
    try {
      const currentProject = projectsRef.current.find(
        (item) => item.id === project.id
      )
      if (!currentProject) return
      const plan = planStudioVideoBatch(currentProject, batchLimit)
      for (const targetId of plan.targets) {
        if (activeUserId.current !== userId) return
        const latest = projectsRef.current.find(
          (item) => item.id === project.id
        )
        if (!latest) return
        const video = latest.nodes.find((node) => node.id === targetId)
        if (!video) continue
        await generate(video, latest)
      }
      if (plan.capped) {
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
      if (oldId) {
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

  const assembleMp4 = async () => {
    if (!project || assemblyBusy) return
    if (!mediaStore) {
      setAssemblyError(t('studio.assembly.error.storage'))
      return
    }
    const ownerId = userId
    const sourceProject = project
    const fingerprint = studioAssemblyFingerprint(sourceProject)
    const controller = new AbortController()
    assemblyRun.current = { ownerId, projectId: sourceProject.id, controller }
    const isCurrent = () =>
      activeUserId.current === ownerId &&
      activeProjectId.current === sourceProject.id &&
      assemblyRun.current?.controller === controller
    setAssemblyBusy(true)
    setAssemblyProgress(0)
    setAssemblyError(undefined)
    try {
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
      const options = soundtrack
        ? {
            soundtrack: {
              blob: soundtrack,
              volume: sourceProject.soundtrackVolume ?? 1,
            },
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
      }
    } finally {
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
    setWorkspace((current) => ({
      ...current,
      projects: [...current.projects, next],
      activeId: next.id,
    }))
    setSelectedNodeId(null)
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
      setMessage(errorMessage(error))
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
      const mediaId = await saveMedia(userId, source.id, node.id, url)
      editNode(source.id, node.id, { mediaId, error: undefined })
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
    canvas: t('studio.canvas'),
    assets: t('studio.asset.title'),
    storyboard: t('studio.view.storyboard'),
  }[view]

  return (
    <div className='bg-background flex min-h-full flex-none flex-col lg:h-full lg:min-h-[640px] lg:flex-1 lg:overflow-hidden'>
      <header className='flex flex-wrap items-center gap-2 border-b px-4 py-3'>
        <div className='mr-auto min-w-40'>
          <h1 className='text-lg font-semibold tracking-tight'>
            {t('studio.title')}
          </h1>
          <p className='text-muted-foreground text-xs'>
            {t('studio.subtitle')}
          </p>
        </div>
        <Select
          value={project.id}
          onValueChange={(value) => {
            if (!value) return
            setWorkspace((current) => ({ ...current, activeId: value }))
            setSelectedNodeId(null)
            setView(
              projects.find((item) => item.id === value)?.shots?.length
                ? 'storyboard'
                : 'canvas'
            )
          }}
          items={projects.map((item) => ({
            value: item.id,
            label: item.title,
          }))}
        >
          <SelectTrigger
            aria-label={t('studio.project.select')}
            className='max-w-44'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {projects.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant='outline' size='sm' onClick={addProject}>
          <Plus />
          {t('studio.project.new')}
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => void exportProject()}
        >
          <Download />
          {t('studio.export')}
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => uploadRef.current?.click()}
        >
          <Upload />
          {t('studio.import')}
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            setSettingsKind('text')
            setSettingsOpen(true)
          }}
        >
          <Settings2 />
          {t('studio.provider.settings')}
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => setAttemptsOpen(true)}
        >
          {t('studio.attempt.title')}
        </Button>
        <Input
          ref={uploadRef}
          type='file'
          accept='application/json,application/zip,.json,.zip'
          className='hidden'
          aria-label={t('studio.import')}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void importProject(file)
            event.target.value = ''
          }}
        />
        <Button
          variant='ghost'
          size='sm'
          onClick={() => setDeleteTarget('project')}
        >
          {t('studio.project.delete')}
        </Button>
      </header>
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
      <div className='flex flex-wrap gap-2 border-b px-4 py-2'>
        <Button
          variant={view === 'storyboard' ? 'secondary' : 'outline'}
          size='sm'
          onClick={() => setView('storyboard')}
        >
          {t('studio.view.storyboard')}
        </Button>
        <Button
          variant={view === 'canvas' ? 'secondary' : 'outline'}
          size='sm'
          onClick={() => setView('canvas')}
        >
          {t('studio.view.canvas')}
        </Button>
        <Button
          variant={view === 'assets' ? 'secondary' : 'outline'}
          size='sm'
          onClick={() => setView('assets')}
        >
          {t('studio.asset.title')}
        </Button>
        {view === 'canvas' && (
          <Button variant='outline' size='sm' onClick={addShot}>
            {t('studio.shot.add')}
          </Button>
        )}
        <Button variant='secondary' size='sm' onClick={() => addNode('text')}>
          <Type />
          {t('studio.add.text')}
        </Button>
        <Button variant='secondary' size='sm' onClick={() => addNode('image')}>
          <ImagePlus />
          {t('studio.add.image')}
        </Button>
        <Button variant='secondary' size='sm' onClick={() => addNode('video')}>
          <Film />
          {t('studio.add.video')}
        </Button>
        <Input
          className='ml-auto max-w-48'
          aria-label={t('studio.project.name')}
          value={project.title}
          maxLength={200}
          onChange={(event) =>
            editProject(project.id, (current) => ({
              ...current,
              title: event.target.value,
              updatedAt: new Date().toISOString(),
            }))
          }
        />
      </div>
      <div className='grid flex-none grid-cols-1 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_360px]'>
        <section
          className='relative h-[420px] overflow-hidden lg:h-auto lg:min-h-[400px]'
          aria-label={sectionLabel}
        >
          {view === 'canvas' && (
            <>
              <Canvas
                nodes={canvasNodes}
                edges={project.edges}
                nodeTypes={nodeTypes}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                onPaneClick={() => setSelectedNodeId(null)}
                onNodesChange={(changes: NodeChange<StudioCanvasNode>[]) => {
                  const removedIds = new Set(
                    changes
                      .filter((change) => change.type === 'remove')
                      .map((change) => change.id)
                  )
                  const affectedTargets = project.edges
                    .filter(
                      (edge) =>
                        removedIds.has(edge.source) &&
                        !removedIds.has(edge.target)
                    )
                    .map((edge) => edge.target)
                  for (const change of changes) {
                    if (change.type === 'remove') {
                      const removed = project.nodes.find(
                        (node) => node.id === change.id
                      )
                      if (removed) {
                        discardNodeMedia(project.id, removed)
                        deleteStoredMedia(project, [removed.id])
                      }
                    }
                  }
                  for (const targetId of affectedTargets) {
                    discardBranchMedia(project, targetId)
                  }
                  editProject(project.id, (current) => {
                    let next = {
                      ...current,
                      nodes: applyNodeChanges(changes, current.nodes),
                      edges: current.edges.filter(
                        (edge) =>
                          !removedIds.has(edge.source) &&
                          !removedIds.has(edge.target)
                      ),
                      updatedAt: new Date().toISOString(),
                    }
                    for (const targetId of affectedTargets) {
                      next = invalidateStudioBranch(next, targetId)
                    }
                    return pruneStudioShots(next)
                  })
                }}
                onEdgesChange={(changes: EdgeChange[]) => {
                  const targets = project.edges
                    .filter((edge) =>
                      changes.some(
                        (change) =>
                          change.type === 'remove' && change.id === edge.id
                      )
                    )
                    .map((edge) => edge.target)
                  for (const targetId of targets) {
                    discardBranchMedia(project, targetId)
                  }
                  editProject(project.id, (current) => {
                    let next = {
                      ...current,
                      edges: applyEdgeChanges(changes, current.edges),
                      updatedAt: new Date().toISOString(),
                    }
                    for (const targetId of targets) {
                      next = invalidateStudioBranch(next, targetId)
                    }
                    return next
                  })
                }}
                onConnect={(connection: Connection) => {
                  const sourceId = connection.source
                  const targetId = connection.target
                  if (!sourceId || !targetId) return
                  if (
                    !isValidStudioConnection(
                      project.nodes,
                      project.edges,
                      sourceId,
                      targetId,
                      connection.sourceHandle,
                      connection.targetHandle
                    )
                  ) {
                    return
                  }
                  discardBranchMedia(project, targetId)
                  editProject(project.id, (current) =>
                    isValidStudioConnection(
                      current.nodes,
                      current.edges,
                      sourceId,
                      targetId,
                      connection.sourceHandle,
                      connection.targetHandle
                    )
                      ? invalidateStudioBranch(
                          {
                            ...current,
                            edges: addEdge(connection, current.edges),
                          },
                          targetId
                        )
                      : current
                  )
                }}
              />
              {project.nodes.length > 0 && project.edges.length === 0 && (
                <p className='text-muted-foreground bg-background/85 pointer-events-none absolute top-3 left-3 max-w-72 rounded-md border px-3 py-2 text-xs shadow-sm'>
                  {t('studio.canvas.connectionHint')}
                </p>
              )}
              {project.nodes.length === 0 && (
                <div className='text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center text-center text-sm'>
                  <p>{t('studio.canvas.empty')}</p>
                </div>
              )}
            </>
          )}
          {view === 'assets' && (
            <StudioAssetLibrary
              assets={project.assets || []}
              previews={previews}
              projectId={project.id}
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
              onUpload={(assetId, file) =>
                void uploadAssetImage(assetId, file).catch((error) =>
                  setMessage(errorMessage(error))
                )
              }
              onDelete={(assetId) => {
                const asset = project.assets?.find(
                  (item) => item.id === assetId
                )
                if (asset?.mediaId && mediaStore) {
                  void mediaStore.delete(userId, asset.mediaId)
                  loadedMediaIds.current.delete(
                    mediaLoadKey({
                      kind: 'asset',
                      projectId: project.id,
                      mediaId: asset.mediaId,
                    })
                  )
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
                const affected = project.nodes.filter((node) =>
                  node.data.assetIds?.includes(assetId)
                )
                affected.forEach((node) => discardBranchMedia(project, node.id))
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
                        assetIds: node.data.assetIds?.filter(
                          (id) => id !== assetId
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
            />
          )}
          {view === 'storyboard' && (
            <StudioStoryboard
              project={project}
              previews={previews}
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
                    void mediaStore.delete(userId, oldId)
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
              onGenerateVideo={(nodeId) => {
                const node = project.nodes.find((item) => item.id === nodeId)
                if (node) void generate(node, project)
              }}
              onGenerateAll={() => void generateAllShots()}
              onCreateFinalVideo={createFinalVideo}
              onMoveShot={(shotId, direction) =>
                editProject(project.id, (current) =>
                  moveStudioShot(current, shotId, direction)
                )
              }
              onRenameShot={(shotId, title) =>
                editProject(project.id, (current) => ({
                  ...current,
                  shots: current.shots?.map((shot) =>
                    shot.id === shotId ? { ...shot, title } : shot
                  ),
                  updatedAt: new Date().toISOString(),
                }))
              }
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
        <aside className='min-h-[560px] border-t lg:min-h-0 lg:border-t-0 lg:border-l'>
          {selectedNode ? (
            <StudioInspector
              node={selectedNode}
              models={
                selectedNode.data.kind === 'video'
                  ? []
                  : providerModels[selectedNode.data.kind] || []
              }
              videoGroups={videoGroups}
              videoGroup={selectedGroup}
              providerConfigured={
                selectedNode.data.kind !== 'video' &&
                Boolean(providerConfigs[selectedNode.data.kind]?.hasKey)
              }
              hasConnectedPrompt={Boolean(
                connectedGenerationInput(
                  project.nodes,
                  project.edges,
                  selectedNode.id
                ).prompt.trim()
              )}
              onConfigureProvider={() => {
                if (selectedNode.data.kind === 'video') return
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
                const inputKeys = [
                  'prompt',
                  'model',
                  'group',
                  'videoFamily',
                  'seconds',
                  'resolution',
                  'ratio',
                  'metadataJson',
                  'payloadPatchJson',
                  'imageSize',
                  'imageQuality',
                  'imageCount',
                  'assetIds',
                ] as const
                const changed = inputKeys.some(
                  (key) =>
                    Object.hasOwn(patch, key) &&
                    patch[key] !== selectedNode.data[key]
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
              onUploadImage={(file) => {
                void uploadImage(selectedNode, project, file).catch((error) =>
                  setMessage(errorMessage(error))
                )
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
            />
          ) : (
            <div className='text-muted-foreground flex h-full items-center justify-center px-8 text-center text-sm'>
              {t('studio.inspector.empty')}
            </div>
          )}
        </aside>
      </div>
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
              deleteStoredMedia(project, [
                shot.textNodeId,
                shot.imageNodeId,
                shot.videoNodeId,
              ])
              editProject(project.id, (current) =>
                removeStudioShot(current, selectedShotId)
              )
              setSelectedNodeId(null)
            }
          }
          if (deleteTarget === 'node' && selectedNode) {
            discardNodeMedia(project.id, selectedNode)
            deleteStoredMedia(project, [selectedNode.id])
            editProject(project.id, (current) =>
              pruneStudioShots({
                ...current,
                nodes: current.nodes.filter(
                  (node) => node.id !== selectedNode.id
                ),
                edges: current.edges.filter(
                  (edge) =>
                    edge.source !== selectedNode.id &&
                    edge.target !== selectedNode.id
                ),
                updatedAt: new Date().toISOString(),
              })
            )
            setSelectedNodeId(null)
          }
          if (deleteTarget === 'project') {
            project.nodes.forEach((node) => discardNodeMedia(project.id, node))
            deleteStoredMedia(project)
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
      />
    </div>
  )
}
