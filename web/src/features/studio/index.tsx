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
import {
  connectedGenerationInput,
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
} from './model-profiles'
import { StudioProviderSettings } from './provider-settings'
import { StudioInspector } from './studio-inspector'
import { StudioNode } from './studio-node'
import {
  addStudioNode,
  createStudioProject,
  updateStudioNode,
} from './workspace'

type WorkspaceState = {
  ownerId: number
  projects: StudioProject[]
  activeId: string
  ready: boolean
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
  const [settingsKind, setSettingsKind] = useState<StudioProviderKind>('text')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [deleteTarget, setDeleteTarget] = useState<'node' | 'project' | null>(
    null
  )
  const uploadRef = useRef<HTMLInputElement>(null)
  const ownedUrls = useRef<string[]>([])
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
  const selectedNode = project?.nodes.find((node) => node.id === selectedNodeId)
  const selectedGroup =
    selectedNode?.data.kind === 'video'
      ? resolveVideoGroup(selectedNode.data.group, userGroup, videoGroups)
      : ''
  const mediaRefs = useMemo(
    () =>
      project?.nodes.flatMap((node) =>
        node.data.mediaId
          ? [
              {
                projectId: project.id,
                nodeId: node.id,
                mediaId: node.data.mediaId,
              },
            ]
          : []
      ) ?? [],
    [project?.id, project?.nodes]
  )
  const loadedMediaIds = useRef(new Set<string>())
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
    setVideoGroups([])
    setVideoModelsByGroup({})
    setProviderConfigs({})
    setProviderModels({})
    setSettingsOpen(false)
    setPreviews({})
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
    let cancelled = false
    Promise.all(
      mediaRefs.map(async ({ projectId, nodeId, mediaId }) => {
        const key = `${projectId}:${mediaId}`
        if (loadedMediaIds.current.has(key)) return
        loadedMediaIds.current.add(key)
        const blob = await mediaStore.get(userId, mediaId)
        if (blob && !cancelled) {
          const url = URL.createObjectURL(blob)
          ownedUrls.current.push(url)
          setPreviews((current) => ({
            ...current,
            [previewKey(projectId, nodeId)]: url,
          }))
        }
      })
    ).catch((error) => {
      if (!cancelled) setMessage(errorMessage(error))
    })
    return () => {
      cancelled = true
    }
  }, [visible, userId, mediaRefs, mediaStore])

  const editProject = useCallback(
    (projectId: string, edit: (project: StudioProject) => StudioProject) => {
      setWorkspace((current) => {
        if (current.ownerId !== userId) return current
        return {
          ...current,
          projects: current.projects.map((item) =>
            item.id === projectId ? edit(item) : item
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
        loadedMediaIds.current.add(`${projectId}:${mediaId}`)
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

  const generate = useCallback(
    async (node: StudioCanvasNode, source: StudioProject) => {
      if (!userId || workspace.ownerId !== userId) return
      const { prompt, imageUrl } = connectedGenerationInput(
        source.nodes,
        source.edges,
        node.id
      )
      if (!prompt.trim() || !node.data.model) return
      setMessage(null)
      if (node.data.mediaId) discardNodeMedia(source.id, node)
      else {
        setPreviews((current) => {
          const next = { ...current }
          delete next[previewKey(source.id, node.id)]
          return next
        })
      }
      editNode(source.id, node.id, {
        status: 'submitting',
        error: undefined,
        progress: undefined,
        outputUrl: undefined,
        outputText: undefined,
        mediaId: undefined,
        taskId: undefined,
      })
      try {
        if (node.data.kind === 'text') {
          if (
            !providerConfigs.text?.hasKey ||
            !providerModels.text?.includes(node.data.model)
          ) {
            throw new Error(t('studio.model.empty'))
          }
          const text = await generateStudioText(node.data.model, prompt)
          editNode(source.id, node.id, {
            outputText: text,
            status: 'completed',
          })
        } else if (node.data.kind === 'image') {
          if (
            !providerConfigs.image?.hasKey ||
            !providerModels.image?.includes(node.data.model)
          ) {
            throw new Error(t('studio.model.empty'))
          }
          const image = await generateStudioImage(node.data.model, prompt)
          let mediaId: string | undefined
          try {
            mediaId = await saveMedia(userId, source.id, node.id, image.url)
          } catch (error) {
            setPreviews((current) => ({
              ...current,
              [previewKey(source.id, node.id)]: image.url,
            }))
            setMessage(`${t('studio.storage.failed')}: ${errorMessage(error)}`)
          }
          editNode(source.id, node.id, {
            outputUrl: image.url.startsWith('https://') ? image.url : undefined,
            mediaId,
            status: 'completed',
          })
        } else {
          const group = resolveVideoGroup(
            node.data.group,
            userGroup,
            videoGroups
          )
          if (!group) {
            throw new Error(t('studio.video.group.select'))
          }
          if (!videoModelsByGroup[group]?.includes(node.data.model)) {
            throw new Error(t('studio.model.empty'))
          }
          const family =
            inferStudioVideoFamily(node.data.model) || node.data.videoFamily
          if (!family) throw new Error(t('studio.video.family.select'))
          const model = buildStudioVideoModel(node.data.model, family)
          const request = buildStudioVideoRequest(model, {
            prompt,
            imageUrl,
            seconds: node.data.seconds ?? model.defaultSeconds,
            resolution: node.data.resolution ?? model.resolutions[0],
            ratio: node.data.ratio ?? '16:9',
          })
          const taskId = await createStudioVideo(request, group)
          editNode(source.id, node.id, {
            taskId,
            status: 'queued',
            progress: 0,
          })
        }
      } catch (error) {
        editNode(source.id, node.id, {
          status: 'failed',
          error: errorMessage(error),
        })
      }
    },
    [
      userId,
      workspace.ownerId,
      editNode,
      saveMedia,
      discardNodeMedia,
      videoGroups,
      videoModelsByGroup,
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
          aria-label={t('studio.canvas')}
        >
          <Canvas
            nodes={project.nodes}
            edges={project.edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            onNodesChange={(changes: NodeChange<StudioCanvasNode>[]) => {
              for (const change of changes) {
                if (change.type === 'remove') {
                  const removed = project.nodes.find(
                    (node) => node.id === change.id
                  )
                  if (removed) discardNodeMedia(project.id, removed)
                }
              }
              editProject(project.id, (current) => ({
                ...current,
                nodes: applyNodeChanges(changes, current.nodes),
                edges: current.edges.filter(
                  (edge) =>
                    !changes.some(
                      (change) =>
                        change.type === 'remove' &&
                        (edge.source === change.id || edge.target === change.id)
                    )
                ),
                updatedAt: new Date().toISOString(),
              }))
            }}
            onEdgesChange={(changes: EdgeChange[]) =>
              editProject(project.id, (current) => ({
                ...current,
                edges: applyEdgeChanges(changes, current.edges),
                updatedAt: new Date().toISOString(),
              }))
            }
            onConnect={(connection: Connection) =>
              editProject(project.id, (current) => ({
                ...current,
                edges: addEdge(connection, current.edges),
                updatedAt: new Date().toISOString(),
              }))
            }
          />
          {project.nodes.length === 0 && (
            <div className='text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center text-center text-sm'>
              <p>{t('studio.canvas.empty')}</p>
            </div>
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
                if (
                  patch.prompt !== undefined &&
                  patch.prompt !== selectedNode.data.prompt &&
                  selectedNode.data.mediaId
                ) {
                  discardNodeMedia(project.id, selectedNode)
                }
                editNode(project.id, selectedNode.id, patch)
              }}
              onGenerate={() => void generate(selectedNode, project)}
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
          if (!open) setDeleteTarget(null)
        }}
        title={t('studio.delete.title')}
        desc={t('studio.delete.description')}
        confirmText={t('studio.delete.confirm')}
        destructive
        handleConfirm={() => {
          if (deleteTarget === 'node' && selectedNode) {
            discardNodeMedia(project.id, selectedNode)
            editProject(project.id, (current) => ({
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
            }))
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
    </div>
  )
}
