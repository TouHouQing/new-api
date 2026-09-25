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
} from './canvas-flow'
import {
  loadStudioProjects,
  parseStudioProjectImport,
  saveStudioProjects,
  serializeStudioProjectExport,
  type StudioProject,
} from './local-projects'
import { studioMediaStore } from './media-store'
import {
  buildStudioVideoModel,
  buildStudioVideoRequest,
  inferStudioVideoFamily,
  parseStudioVideoMetadata,
} from './model-profiles'
import { StudioProviderSettings } from './provider-settings'
import { StudioAttempts } from './studio-attempts'
import { StudioInspector } from './studio-inspector'
import { StudioNode } from './studio-node'
import { StudioStoryboard } from './studio-storyboard'
import {
  addStudioNode,
  addStudioShot,
  createStudioProject,
  ensureStudioFinalVideo,
  invalidateStudioBranch,
  moveStudioShot,
  pruneStudioShots,
  removeStudioShot,
  studioBranchNodeIds,
  updateStudioNode,
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
  kind: 'node' | 'assembly'
}
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
  const [videoGroups, setVideoGroups] = useState<StudioGroup[]>([])
  const [videoModelsByGroup, setVideoModelsByGroup] = useState<
    Record<string, string[]>
  >({})
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
  const [view, setView] = useState<'canvas' | 'storyboard'>('canvas')
  const [batchBusy, setBatchBusy] = useState(false)
  const [assemblyBusy, setAssemblyBusy] = useState(false)
  const [assemblyProgress, setAssemblyProgress] = useState(0)
  const [assemblyError, setAssemblyError] = useState<string | undefined>()
  const [message, setMessage] = useState<string | null>(null)
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [assemblyPreviews, setAssemblyPreviews] = useState<Map<string, string>>(
    () => new Map()
  )
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
        },
      })) ?? [],
    [project, previews]
  )
  const selectedNode = project?.nodes.find((node) => node.id === selectedNodeId)
  const selectedGroup =
    selectedNode?.data.kind === 'video'
      ? resolveVideoGroup(selectedNode.data.group, userGroup, videoGroups)
      : ''
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
    return refs
  }, [project])
  const mediaRefsKey = JSON.stringify(mediaRefs)
  const loadedMediaIds = useRef(new Set<string>())
  const runningTargets = useRef(new Set<string>())
  const pendingVideos = useMemo(
    () =>
      projects.flatMap((item) =>
        item.nodes
          .filter(
            (node) =>
              node.data.kind === 'video' &&
              node.data.taskId &&
              (node.data.status === 'queued' ||
                node.data.status === 'processing')
          )
          .map((node) => ({ projectId: item.id, node }))
      ),
    [projects]
  )
  const pendingVideoKey = JSON.stringify(
    pendingVideos
      .map((entry) => [entry.projectId, entry.node.id, entry.node.data.taskId])
      .sort()
  )
  const pendingVideosRef = useRef(pendingVideos)
  pendingVideosRef.current = pendingVideos

  useEffect(() => {
    if (!userId) return
    let projects: StudioProject[] = []
    try {
      projects = loadStudioProjects(localStorage, userId)
    } catch (error) {
      setMessage(errorMessage(error))
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
    setVideoModelsByGroup({})
    setProviderConfigs({})
    setProviderModels({})
    setSettingsOpen(false)
    setAttemptsOpen(false)
    setPreviews({})
    setAssemblyPreviews(new Map())
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

  useEffect(() => {
    if (!visible || !selectedGroup || videoModelsByGroup[selectedGroup]) return
    let cancelled = false
    void fetchStudioModels(selectedGroup)
      .then((models) => {
        if (!cancelled) {
          setVideoModelsByGroup((current) => ({
            ...current,
            [selectedGroup]: models,
          }))
        }
      })
      .catch((error) => {
        if (!cancelled) setMessage(errorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [visible, selectedGroup, videoModelsByGroup])

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
      setWorkspace((current) => {
        if (current.ownerId !== userId) return current
        return {
          ...current,
          projects: current.projects.map((item) =>
            item.id === projectId
              ? reconcileStudioAssembly(item, edit(item))
              : item
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
      if (node.data.mediaId && mediaStore) {
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

  const saveMedia = useCallback(
    async (
      ownerId: number,
      projectId: string,
      nodeId: string,
      url: string
    ): Promise<string> => {
      if (!mediaStore) throw new Error('browser media storage is unavailable')
      const response = await fetch(url, { credentials: 'same-origin' })
      if (!response.ok) {
        throw new Error(`media download failed (${response.status})`)
      }
      const blob = await response.blob()
      const mediaId = newId()
      await mediaStore.put(ownerId, mediaId, blob)
      if (activeUserId.current === ownerId) {
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
      const runId = `${userId}:${source.id}:${target.id}`
      if (runningTargets.current.has(runId)) return
      runningTargets.current.add(runId)
      setMessage(null)
      let current = target
      let workingNodes = source.nodes
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

          if (node.data.kind === 'text') {
            if (!node.data.model) {
              if (!input.prompt.trim()) {
                if (selected) throw new Error(t('studio.prompt.required'))
                continue
              }
              update(node.id, {
                outputText: input.prompt,
                status: 'completed',
                error: undefined,
              })
              continue
            }
            if (
              !selected &&
              node.data.status === 'completed' &&
              node.data.outputText?.trim()
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
            if (activeUserId.current !== userId) return
            update(node.id, { status: 'submitting', error: undefined })
            const outputText = await generateStudioText(
              node.data.model,
              input.prompt
            )
            if (activeUserId.current !== userId) return
            update(node.id, { outputText, status: 'completed' })
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
            if (activeUserId.current !== userId) return
            update(node.id, { status: 'submitting', error: undefined })
            const image = await generateStudioImage(
              node.data.model,
              input.prompt
            )
            if (activeUserId.current !== userId) return
            if (node.data.mediaId) discardNodeMedia(source.id, node)
            let mediaId: string | undefined
            try {
              mediaId = await saveMedia(userId, source.id, node.id, image.url)
            } catch (error) {
              setPreviews((current) => ({
                ...current,
                [previewKey(source.id, node.id)]: image.url,
              }))
              setMessage(
                `${t('studio.storage.failed')}: ${errorMessage(error)}`
              )
              if (!image.url.startsWith('https://')) throw error
            }
            update(node.id, {
              outputUrl: image.url.startsWith('https://')
                ? image.url
                : undefined,
              mediaId,
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
                throw new Error(task.error || 'upstream video failed')
              }
              if (task.status === 'completed') {
                const url = await getStudioVideoContentUrl(node.data.taskId)
                update(node.id, {
                  status: 'completed',
                  progress: 100,
                  outputUrl: url,
                })
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
            .map((edge) => workingNodes.find((item) => item.id === edge.source))
            .filter((item): item is StudioCanvasNode => Boolean(item))
          const images: string[] = []
          const videos: string[] = []
          for (const parent of incoming) {
            if (parent.data.kind === 'image') {
              if (
                !parent.data.model &&
                !parent.data.mediaId &&
                !parent.data.outputUrl
              ) {
                continue
              }
              if (
                parent.data.outputUrl?.startsWith('https://') ||
                parent.data.outputUrl?.startsWith('data:image/')
              ) {
                images.push(parent.data.outputUrl)
              } else if (parent.data.mediaId && mediaStore) {
                const blob = await mediaStore.get(userId, parent.data.mediaId)
                if (!blob) throw new Error(t('studio.media.missing'))
                images.push(await blobToDataUrl(blob))
              } else {
                throw new Error(t('studio.media.missing'))
              }
            }
            if (parent.data.kind === 'video') {
              if (!parent.data.outputUrl) {
                throw new Error(t('studio.media.missing'))
              }
              videos.push(parent.data.outputUrl)
            }
          }
          const request = buildStudioVideoRequest(model, {
            prompt: input.prompt,
            imageUrls: images,
            videoUrls: videos,
            seconds: node.data.seconds ?? model.defaultSeconds,
            resolution: node.data.resolution ?? model.resolutions[0],
            ratio: node.data.ratio ?? '16:9',
            metadata: parseStudioVideoMetadata(node.data.metadataJson || ''),
          })
          if (activeUserId.current !== userId) return
          update(node.id, {
            status: 'submitting',
            error: undefined,
            progress: undefined,
          })
          const taskId = await createStudioVideo(request, group)
          if (activeUserId.current !== userId) return
          update(node.id, { taskId, status: 'queued', progress: 0 })
          if (selected) invalidateDependents(node.id)
          if (!selected) {
            const deadline = Date.now() + 20 * 60_000
            while (Date.now() < deadline) {
              if (activeUserId.current !== userId) return
              const task = await getStudioVideoTask(taskId)
              if (task.status === 'failed') {
                throw new Error(task.error || 'upstream video failed')
              }
              if (task.status === 'completed') {
                const url = await getStudioVideoContentUrl(taskId)
                update(node.id, {
                  status: 'completed',
                  progress: 100,
                  outputUrl: url,
                })
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
          }
        }
      } catch (error) {
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
      discardNodeMedia,
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
            const taskId = entry.node.data.taskId
            if (!taskId) continue
            const task = await getStudioVideoTask(taskId)
            if (cancelled) return
            if (task.status === 'completed') {
              const outputUrl = await getStudioVideoContentUrl(taskId)
              if (cancelled) return
              let mediaId: string | undefined
              let storageError: string | undefined
              try {
                mediaId = await saveMedia(
                  userId,
                  entry.projectId,
                  entry.node.id,
                  outputUrl
                )
              } catch (error) {
                storageError = `${t('studio.storage.failed')}: ${errorMessage(error)}`
              }
              if (!cancelled) {
                editNode(entry.projectId, entry.node.id, {
                  status: 'completed',
                  progress: 100,
                  mediaId,
                  error: storageError,
                })
              }
            } else {
              editNode(entry.projectId, entry.node.id, {
                status: task.status,
                progress: task.progress,
                error: task.error,
              })
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
  }, [visible, pendingVideoKey, userId, editNode, saveMedia, t])

  const addNode = (kind: StudioCanvasNodeData['kind']) => {
    if (!project) return
    const nodeId = newId()
    editProject(project.id, (current) => addStudioNode(current, kind, nodeId))
    setSelectedNodeId(nodeId)
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
      for (const shot of project.shots || []) {
        if (activeUserId.current !== userId) return
        const video = project.nodes.find((node) => node.id === shot.videoNodeId)
        if (
          !video?.data.model ||
          video.data.status === 'completed' ||
          video.data.status === 'submitting' ||
          video.data.status === 'queued' ||
          video.data.status === 'processing'
        ) {
          continue
        }
        await generate(video, project)
      }
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
      const { stitchStudioVideos } = await import('./studio-mp4')
      const blob = await stitchStudioVideos(
        blobs,
        (progress) => {
          if (isCurrent()) {
            setAssemblyProgress(progress.percent)
          }
        },
        controller.signal
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

  const exportProject = () => {
    if (!project) return
    const blob = new Blob([serializeStudioProjectExport(project)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `studio-${project.id}.json`
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
    try {
      if (file.size > 2_000_000) throw new Error(t('studio.import.tooLarge'))
      const imported = parseStudioProjectImport(await file.text())
      const copy = {
        ...imported,
        id: newId(),
        title: imported.title,
        updatedAt: new Date().toISOString(),
      }
      setWorkspace((current) => ({
        ...current,
        projects: [...current.projects, copy],
        activeId: copy.id,
      }))
      setSelectedNodeId(null)
      setMessage(t('studio.import.mediaHint'))
    } catch (error) {
      setMessage(errorMessage(error))
    }
  }

  if (!visible || !project) {
    return (
      <div className='text-muted-foreground p-6 text-sm'>
        {t('studio.loading')}
      </div>
    )
  }

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
        <Button variant='outline' size='sm' onClick={exportProject}>
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
          accept='application/json,.json'
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
          aria-label={
            view === 'canvas' ? t('studio.canvas') : t('studio.view.storyboard')
          }
        >
          {view === 'canvas' ? (
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
                      if (removed) discardNodeMedia(project.id, removed)
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
                      targetId
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
                      targetId
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
              {project.nodes.length === 0 && (
                <div className='text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center text-center text-sm'>
                  <p>{t('studio.canvas.empty')}</p>
                </div>
              )}
            </>
          ) : (
            <StudioStoryboard
              project={project}
              previews={previews}
              batchBusy={batchBusy}
              assembly={{
                busy: assemblyBusy,
                progress: assemblyProgress,
                previewUrl: project.assembledMediaId
                  ? assemblyPreviews.get(project.id)
                  : undefined,
                error: assemblyError,
                onAssemble: () => void assembleMp4(),
                onCancel: () => assemblyRun.current?.controller.abort(),
                onDownload: downloadAssembly,
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
                  ? videoModelsByGroup[selectedGroup] || []
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
                ] as const
                const changed = inputKeys.some(
                  (key) =>
                    Object.hasOwn(patch, key) &&
                    patch[key] !== selectedNode.data[key]
                )
                if (changed) {
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
              editProject(project.id, (current) =>
                removeStudioShot(current, selectedShotId)
              )
              setSelectedNodeId(null)
            }
          }
          if (deleteTarget === 'node' && selectedNode) {
            discardNodeMedia(project.id, selectedNode)
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
