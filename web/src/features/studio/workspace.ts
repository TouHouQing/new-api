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
import type { StudioShotDraft } from './api'
import type { StudioCanvasNodeData, StudioTake } from './canvas-flow'
import type { StudioProject } from './local-projects'

export function studioBranchNodeIds(
  project: StudioProject,
  nodeId: string
): Set<string> {
  const affected = new Set<string>()
  const pending = [nodeId]
  while (pending.length) {
    const next = pending.pop()
    if (!next || affected.has(next)) continue
    affected.add(next)
    for (const edge of project.edges) {
      if (edge.source === next && !edge.data?.sourceTakeId) {
        pending.push(edge.target)
      }
    }
  }
  return affected
}

export function selectStudioTake(
  project: StudioProject,
  nodeId: string,
  takeId: string
): StudioProject {
  const node = project.nodes.find((item) => item.id === nodeId)
  const take = node?.data.takes?.find((item) => item.id === takeId)
  if (!node || !take) throw new Error('Studio take is unavailable')
  let next: StudioProject = {
    ...project,
    updatedAt: new Date().toISOString(),
    nodes: project.nodes.map((item) =>
      item.id === nodeId
        ? {
            ...item,
            data: {
              ...item.data,
              selectedTakeId: take.id,
              staleSourceTitle: undefined,
              status: take.status,
              progress: take.progress,
              outputText: take.outputText,
              outputImagePrompt: take.outputImagePrompt,
              outputVideoPrompt: take.outputVideoPrompt,
              outputUrl: take.outputUrl,
              mediaId: take.mediaId,
              taskId: take.taskId,
              error: take.error,
            },
          }
        : item
    ),
  }
  for (const edge of project.edges) {
    if (edge.source === nodeId && !edge.data?.sourceTakeId) {
      next = invalidateStudioBranch(next, edge.target)
    }
  }
  return next
}

export function pinStudioConnectionTake(
  project: StudioProject,
  edgeId: string,
  takeId?: string
): StudioProject {
  const edge = project.edges.find((item) => item.id === edgeId)
  if (!edge) throw new Error('Studio connection is unavailable')
  if (edge.data?.sourceTakeId === takeId) return project
  if (takeId) {
    const source = project.nodes.find((node) => node.id === edge.source)
    if (
      !source?.data.takes?.some(
        (take) => take.id === takeId && take.status === 'completed'
      )
    ) {
      throw new Error('Pinned source take is unavailable')
    }
  }
  const next = {
    ...project,
    edges: project.edges.map((item) =>
      item.id === edgeId
        ? { ...item, data: takeId ? { sourceTakeId: takeId } : undefined }
        : item
    ),
    updatedAt: new Date().toISOString(),
  }
  const sourceTitle = project.nodes.find((node) => node.id === edge.source)
    ?.data.title
  return invalidateStudioBranch(next, edge.target, sourceTitle)
}

export function studioUnpinnedDependentTargets(
  project: StudioProject,
  nodeId: string
): string[] {
  return [
    ...new Set(
      project.edges
        .filter((edge) => edge.source === nodeId && !edge.data?.sourceTakeId)
        .map((edge) => edge.target)
    ),
  ]
}

export function recordStudioTake(
  project: StudioProject,
  nodeId: string,
  take: StudioTake
): StudioProject {
  const node = project.nodes.find((item) => item.id === nodeId)
  if (!node) throw new Error('Studio node is unavailable')
  const takes = node.data.takes || []
  if (takes.length >= 100) throw new Error('Studio take history is full')
  if (takes.some((item) => item.id === take.id)) {
    throw new Error('Studio take already exists')
  }
  const next = {
    ...project,
    nodes: project.nodes.map((item) =>
      item.id === nodeId
        ? { ...item, data: { ...item.data, takes: [...takes, take] } }
        : item
    ),
  }
  return selectStudioTake(next, nodeId, take.id)
}

export function reviseStudioTextOutput(
  project: StudioProject,
  nodeId: string,
  takeId: string,
  output: { scene: string; imagePrompt: string; videoPrompt: string }
): StudioProject {
  const node = project.nodes.find((item) => item.id === nodeId)
  if (!node || node.data.kind !== 'text') {
    throw new Error('Studio text node is unavailable')
  }
  const scene = output.scene.trim()
  const imagePrompt = output.imagePrompt.trim()
  const videoPrompt = output.videoPrompt.trim()
  if (!scene && !imagePrompt && !videoPrompt) {
    throw new Error('At least one text result is required')
  }
  return recordStudioTake(project, nodeId, {
    id: takeId,
    createdAt: new Date().toISOString(),
    prompt: node.data.prompt,
    status: 'completed',
    outputText: scene,
    outputImagePrompt: imagePrompt,
    outputVideoPrompt: videoPrompt,
  })
}

/** A local polling deadline never changes the state of the billed upstream task. */
export function markStudioDependentWaiting(
  project: StudioProject,
  targetId: string,
  message: string
): StudioProject {
  return updateStudioNode(project, targetId, {
    status: 'idle',
    error: message,
  })
}

/** Keeps a submitted task discoverable when its inputs changed mid-request. */
export function retainStudioTake(
  project: StudioProject,
  nodeId: string,
  take: StudioTake
): StudioProject {
  const node = project.nodes.find((item) => item.id === nodeId)
  if (!node || node.data.takes?.some((item) => item.id === take.id)) {
    return project
  }
  const takes = node.data.takes || []
  if (takes.length >= 100) throw new Error('Studio take history is full')
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    nodes: project.nodes.map((item) =>
      item.id === nodeId
        ? { ...item, data: { ...item.data, takes: [...takes, take] } }
        : item
    ),
  }
}

export function updateStudioTake(
  project: StudioProject,
  nodeId: string,
  takeId: string,
  patch: Partial<StudioTake>
): StudioProject {
  const node = project.nodes.find((item) => item.id === nodeId)
  if (!node?.data.takes?.some((take) => take.id === takeId)) {
    throw new Error('Studio take is unavailable')
  }
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    nodes: project.nodes.map((item) => {
      if (item.id !== nodeId) return item
      const takes = item.data.takes?.map((take) =>
        take.id === takeId ? { ...take, ...patch } : take
      )
      if (item.data.selectedTakeId !== takeId) {
        return { ...item, data: { ...item.data, takes } }
      }
      return {
        ...item,
        data: {
          ...item.data,
          takes,
          ...(Object.hasOwn(patch, 'status') ? { status: patch.status } : {}),
          ...(Object.hasOwn(patch, 'progress')
            ? { progress: patch.progress }
            : {}),
          ...(Object.hasOwn(patch, 'taskId') ? { taskId: patch.taskId } : {}),
          ...(Object.hasOwn(patch, 'mediaId')
            ? { mediaId: patch.mediaId }
            : {}),
          ...(Object.hasOwn(patch, 'outputUrl')
            ? { outputUrl: patch.outputUrl }
            : {}),
          ...(Object.hasOwn(patch, 'outputText')
            ? { outputText: patch.outputText }
            : {}),
          ...(Object.hasOwn(patch, 'outputImagePrompt')
            ? { outputImagePrompt: patch.outputImagePrompt }
            : {}),
          ...(Object.hasOwn(patch, 'outputVideoPrompt')
            ? { outputVideoPrompt: patch.outputVideoPrompt }
            : {}),
          ...(Object.hasOwn(patch, 'error') ? { error: patch.error } : {}),
        },
      }
    }),
  }
}

export function invalidateStudioBranch(
  project: StudioProject,
  nodeId: string,
  changedSourceTitle?: string
): StudioProject {
  const affected = studioBranchNodeIds(project, nodeId)
  const sourceTitle =
    changedSourceTitle ||
    project.nodes.find((node) => node.id === nodeId)?.data.title
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    nodes: project.nodes.map((node) => {
      if (!affected.has(node.id)) return node
      if (node.data.kind === 'image' && !node.data.model) {
        return {
          ...node,
          data: {
            ...node.data,
            error: undefined,
            status: node.data.mediaId ? 'completed' : 'idle',
          },
        }
      }
      return {
        ...node,
        data: {
          ...node.data,
          staleSourceTitle:
            sourceTitle &&
            (node.data.status === 'completed' ||
              Boolean(
                node.data.mediaId || node.data.taskId || node.data.outputText
              ))
              ? sourceTitle
              : undefined,
          status: 'idle',
          selectedTakeId: undefined,
          outputText: undefined,
          outputImagePrompt: undefined,
          outputVideoPrompt: undefined,
          outputUrl: undefined,
          mediaId: undefined,
          taskId: undefined,
          progress: undefined,
          error: undefined,
        },
      }
    }),
  }
}

export function createStudioProject(title: string, id: string): StudioProject {
  const now = new Date().toISOString()
  return {
    id,
    title: title.trim() || 'Untitled',
    nodes: [],
    edges: [],
    shots: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function addStudioShot(
  project: StudioProject,
  shotId: string,
  ids: { text: string; image: string; video: string },
  title: string
): StudioProject {
  let next = addStudioNode(project, 'text', ids.text)
  next = addStudioNode(next, 'image', ids.image)
  next = addStudioNode(next, 'video', ids.video)
  const defaults = project.defaults
  if (defaults) {
    next = {
      ...next,
      nodes: next.nodes.map((node) => {
        if (node.id === ids.text) {
          return {
            ...node,
            data: { ...node.data, model: defaults.textModel },
          }
        }
        if (node.id === ids.image) {
          return {
            ...node,
            data: { ...node.data, model: defaults.imageModel },
          }
        }
        if (node.id === ids.video) {
          return {
            ...node,
            data: {
              ...node.data,
              model: defaults.videoModel,
              group: defaults.videoGroup,
              videoFamily: undefined,
              seconds: defaults.seconds ?? node.data.seconds,
              resolution: defaults.resolution,
              ratio: defaults.ratio,
            },
          }
        }
        return node
      }),
    }
  }
  return syncStudioFinalVideoEdges({
    ...next,
    edges: [
      ...next.edges,
      {
        id: `${shotId}-ti`,
        source: ids.text,
        target: ids.image,
      },
      {
        id: `${shotId}-tv`,
        source: ids.text,
        target: ids.video,
      },
      {
        id: `${shotId}-iv`,
        source: ids.image,
        target: ids.video,
      },
    ],
    shots: [
      ...(next.shots || []),
      {
        id: shotId,
        title: title.trim(),
        textNodeId: ids.text,
        imageNodeId: ids.image,
        videoNodeId: ids.video,
      },
    ],
  })
}

export function applyStudioAssetToAllShots(
  project: StudioProject,
  assetId: string
): StudioProject {
  if (!project.assets?.some((asset) => asset.id === assetId)) {
    throw new Error('Studio asset is unavailable')
  }
  const shotNodeIds = new Set(
    (project.shots || []).flatMap((shot) => [
      shot.textNodeId,
      shot.imageNodeId,
      shot.videoNodeId,
    ])
  )
  if (
    project.nodes.some(
      (node) =>
        shotNodeIds.has(node.id) &&
        !node.data.assetIds?.includes(assetId) &&
        (node.data.assetIds?.length || 0) >= 32
    )
  ) {
    throw new Error('A shot node has reached the 32 asset limit')
  }
  let next = project
  for (const shot of project.shots || []) {
    const ids = new Set([shot.textNodeId, shot.imageNodeId, shot.videoNodeId])
    if (
      next.nodes
        .filter((node) => ids.has(node.id))
        .every((node) => node.data.assetIds?.includes(assetId))
    ) {
      continue
    }
    next = invalidateStudioBranch(next, shot.textNodeId)
    next = {
      ...next,
      updatedAt: new Date().toISOString(),
      nodes: next.nodes.map((node) =>
        ids.has(node.id) && !node.data.assetIds?.includes(assetId)
          ? {
              ...node,
              data: {
                ...node.data,
                assetIds: [...(node.data.assetIds || []), assetId],
              },
            }
          : node
      ),
    }
  }
  return next
}

export function addPlannedStudioShots(
  project: StudioProject,
  planned: Array<{
    shotId: string
    ids: { text: string; image: string; video: string }
    takeId: string
    draft: StudioShotDraft
  }>,
  sourcePrompt: string,
  model?: string
): StudioProject {
  let next = project
  for (const { draft, shotId, ids, takeId } of planned) {
    next = addStudioShot(next, shotId, ids, draft.title)
    next = updateStudioNode(next, ids.text, { prompt: draft.text, model })
    next = recordStudioTake(next, ids.text, {
      id: takeId,
      createdAt: new Date().toISOString(),
      model,
      prompt: sourcePrompt,
      status: 'completed',
      outputText: draft.text,
      outputImagePrompt: draft.imagePrompt,
      outputVideoPrompt: draft.videoPrompt,
    })
  }
  return next
}

function syncStudioFinalVideoEdges(project: StudioProject): StudioProject {
  const finalId = project.finalVideoNodeId
  if (!finalId) return project
  const selectedShots = new Set(
    project.edges
      .filter((edge) => edge.target === finalId && edge.id.endsWith('-final'))
      .map((edge) => edge.id.slice(0, -'-final'.length))
  )
  const previous = project.edges.filter(
    (edge) => edge.target === finalId && edge.id.endsWith('-final')
  )
  const previousById = new Map(previous.map((edge) => [edge.id, edge]))
  const edges = project.edges.filter(
    (edge) => edge.target !== finalId || !edge.id.endsWith('-final')
  )
  edges.push(
    ...(project.shots || [])
      .filter((shot) => selectedShots.has(shot.id))
      .map((shot) => ({
        id: `${shot.id}-final`,
        source: shot.videoNodeId,
        target: finalId,
        sourceHandle: 'video',
        targetHandle: 'reference_video',
        ...(previousById.get(`${shot.id}-final`)?.data
          ? { data: previousById.get(`${shot.id}-final`)?.data }
          : {}),
      }))
  )
  const next = edges.filter(
    (edge) => edge.target === finalId && edge.id.endsWith('-final')
  )
  if (
    previous.length === next.length &&
    previous.every(
      (edge, index) =>
        edge.id === next[index].id && edge.source === next[index].source
    )
  ) {
    return { ...project, edges }
  }
  return invalidateStudioBranch({ ...project, edges }, finalId)
}

export function setStudioFinalVideoReference(
  project: StudioProject,
  shotId: string,
  selected: boolean
): StudioProject {
  const finalId = project.finalVideoNodeId
  const shot = project.shots?.find((item) => item.id === shotId)
  if (!finalId || !shot) return project
  const edgeId = `${shotId}-final`
  const exists = project.edges.some((edge) => edge.id === edgeId)
  if (exists === selected) return project
  const edges = selected
    ? [
        ...project.edges,
        {
          id: edgeId,
          source: shot.videoNodeId,
          target: finalId,
          sourceHandle: 'video',
          targetHandle: 'reference_video',
        },
      ]
    : project.edges.filter((edge) => edge.id !== edgeId)
  return invalidateStudioBranch(
    syncStudioFinalVideoEdges({
      ...project,
      edges,
      updatedAt: new Date().toISOString(),
    }),
    finalId
  )
}

export function ensureStudioFinalVideo(
  project: StudioProject,
  nodeId: string,
  title = 'Final video'
): StudioProject {
  if (project.finalVideoNodeId) return project
  const next = addStudioNode(project, 'video', nodeId)
  const shots = project.shots || []
  const suggested = new Set([
    0,
    Math.floor((shots.length - 1) / 2),
    shots.length - 1,
  ])
  return syncStudioFinalVideoEdges({
    ...next,
    finalVideoNodeId: nodeId,
    edges: [
      ...next.edges,
      ...shots
        .filter((_, index) => suggested.has(index))
        .map((shot) => ({
          id: `${shot.id}-final`,
          source: shot.videoNodeId,
          target: nodeId,
          sourceHandle: 'video',
          targetHandle: 'reference_video',
        })),
    ],
    nodes: next.nodes.map((node) =>
      node.id === nodeId ? { ...node, data: { ...node.data, title } } : node
    ),
  })
}

export function moveStudioShot(
  project: StudioProject,
  shotId: string,
  direction: 'up' | 'down'
): StudioProject {
  const shots = [...(project.shots || [])]
  const index = shots.findIndex((shot) => shot.id === shotId)
  const next = index + (direction === 'up' ? -1 : 1)
  if (index < 0 || next < 0 || next >= shots.length) return project
  const selected = shots[index]
  shots[index] = shots[next]
  shots[next] = selected
  return syncStudioFinalVideoEdges({
    ...project,
    shots,
    updatedAt: new Date().toISOString(),
  })
}

export function pruneStudioShots(project: StudioProject): StudioProject {
  if (
    project.finalVideoNodeId &&
    !project.nodes.some((node) => node.id === project.finalVideoNodeId)
  ) {
    project = { ...project, finalVideoNodeId: undefined }
  }
  if (!project.shots?.length) {
    return project
  }
  const nodeIds = new Set(project.nodes.map((node) => node.id))
  const shots = project.shots.filter(
    (shot) =>
      nodeIds.has(shot.textNodeId) &&
      nodeIds.has(shot.imageNodeId) &&
      nodeIds.has(shot.videoNodeId)
  )
  if (shots.length === project.shots.length) return project
  return syncStudioFinalVideoEdges({
    ...project,
    shots,
    updatedAt: new Date().toISOString(),
  })
}

export function removeStudioShot(
  project: StudioProject,
  shotId: string
): StudioProject {
  const shot = project.shots?.find((item) => item.id === shotId)
  if (!shot) return project
  const finalId = project.finalVideoNodeId
  const referenced = project.edges.some(
    (edge) => edge.target === finalId && edge.id === `${shotId}-final`
  )
  const removed = new Set([shot.textNodeId, shot.imageNodeId, shot.videoNodeId])
  const next = syncStudioFinalVideoEdges({
    ...project,
    nodes: project.nodes.filter((node) => !removed.has(node.id)),
    edges: project.edges.filter(
      (edge) => !removed.has(edge.source) && !removed.has(edge.target)
    ),
    shots: project.shots?.filter((item) => item.id !== shotId),
    updatedAt: new Date().toISOString(),
  })
  return referenced && finalId ? invalidateStudioBranch(next, finalId) : next
}

export function addStudioNode(
  project: StudioProject,
  kind: StudioCanvasNodeData['kind'],
  id: string
): StudioProject {
  const index = project.nodes.length
  const labels = { text: 'Text', image: 'Image', video: 'Video' }
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    nodes: [
      ...project.nodes,
      {
        id,
        type: 'studio',
        position: { x: (index % 3) * 340, y: Math.floor(index / 3) * 300 },
        data: {
          kind,
          title: `${labels[kind]} ${index + 1}`,
          prompt: '',
          status: 'idle',
          seconds: 5,
          ratio: '16:9',
        },
      },
    ],
  }
}

export function updateStudioNode(
  project: StudioProject,
  nodeId: string,
  patch: Partial<StudioCanvasNodeData>
): StudioProject {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    nodes: project.nodes.map((node) => {
      if (node.id !== nodeId) return node
      const data = { ...node.data, ...patch }
      if (patch.status && patch.status !== 'idle') {
        data.staleSourceTitle = undefined
      }
      const promptChanged =
        patch.prompt !== undefined && patch.prompt !== node.data.prompt
      const modelChanged =
        Object.hasOwn(patch, 'model') && patch.model !== node.data.model
      const settingsChanged = (
        [
          'group',
          'model',
          'videoFamily',
          'seconds',
          'resolution',
          'ratio',
          'metadataJson',
        ] as const
      ).some(
        (key) => Object.hasOwn(patch, key) && patch[key] !== node.data[key]
      )
      if (promptChanged || settingsChanged) {
        delete data.error
        if (data.status === 'failed') data.status = 'idle'
      }
      if (
        (promptChanged || modelChanged) &&
        !(node.data.kind === 'image' && !node.data.model && !modelChanged)
      ) {
        delete data.outputText
        delete data.outputImagePrompt
        delete data.outputVideoPrompt
        delete data.outputUrl
        delete data.mediaId
        delete data.taskId
        data.status = 'idle'
      }
      return { ...node, data }
    }),
  }
}
