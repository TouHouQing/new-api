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

export function createStudioProject(title: string, id: string): StudioProject {
  const now = new Date().toISOString()
  return {
    id,
    title: title.trim() || 'Untitled',
    nodes: [],
    edges: [],
    createdAt: now,
    updatedAt: now,
  }
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
        ] as const
      ).some(
        (key) => Object.hasOwn(patch, key) && patch[key] !== node.data[key]
      )
      if (promptChanged || settingsChanged) {
        delete data.error
        if (data.status === 'failed') data.status = 'idle'
      }
      if (promptChanged || modelChanged) {
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
