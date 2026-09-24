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
import type { StudioCanvasNodeData } from './canvas-flow'
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
      if (edge.source === next) pending.push(edge.target)
    }
  }
  return affected
}

export function invalidateStudioBranch(
  project: StudioProject,
  nodeId: string
): StudioProject {
  const affected = studioBranchNodeIds(project, nodeId)
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
          status: 'idle',
          outputText: undefined,
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
  return syncStudioFinalVideoEdges({
    ...next,
    edges: [
      ...next.edges,
      { id: `${shotId}-ti`, source: ids.text, target: ids.image },
      { id: `${shotId}-tv`, source: ids.text, target: ids.video },
      { id: `${shotId}-iv`, source: ids.image, target: ids.video },
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

function syncStudioFinalVideoEdges(project: StudioProject): StudioProject {
  const finalId = project.finalVideoNodeId
  if (!finalId) return project
  const edges = project.edges.filter(
    (edge) => edge.target !== finalId || !edge.id.endsWith('-final')
  )
  edges.push(
    ...(project.shots || []).map((shot) => ({
      id: `${shot.id}-final`,
      source: shot.videoNodeId,
      target: finalId,
    }))
  )
  return invalidateStudioBranch({ ...project, edges }, finalId)
}

export function ensureStudioFinalVideo(
  project: StudioProject,
  nodeId: string,
  title = 'Final video'
): StudioProject {
  if (project.finalVideoNodeId) return project
  const next = addStudioNode(project, 'video', nodeId)
  return syncStudioFinalVideoEdges({
    ...next,
    finalVideoNodeId: nodeId,
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
  const removed = new Set([shot.textNodeId, shot.imageNodeId, shot.videoNodeId])
  return syncStudioFinalVideoEdges({
    ...project,
    nodes: project.nodes.filter((node) => !removed.has(node.id)),
    edges: project.edges.filter(
      (edge) => !removed.has(edge.source) && !removed.has(edge.target)
    ),
    shots: project.shots?.filter((item) => item.id !== shotId),
    updatedAt: new Date().toISOString(),
  })
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
        delete data.outputUrl
        delete data.mediaId
        delete data.taskId
        data.status = 'idle'
      }
      return { ...node, data }
    }),
  }
}
