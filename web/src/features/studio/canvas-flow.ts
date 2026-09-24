/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import type { Edge, Node } from '@xyflow/react'

import type { StudioVideoFamily } from './model-profiles'

export type StudioCanvasNodeData = {
  [key: string]: unknown
  kind: 'text' | 'image' | 'video'
  title: string
  prompt: string
  model?: string
  group?: string
  videoFamily?: StudioVideoFamily
  status?:
    | 'idle'
    | 'submitting'
    | 'queued'
    | 'processing'
    | 'completed'
    | 'failed'
  outputText?: string
  outputUrl?: string
  mediaId?: string
  taskId?: string
  error?: string
  progress?: number
  seconds?: number
  resolution?: string
  ratio?: string
}

export type StudioCanvasNode = Node<StudioCanvasNodeData, 'studio'>
export type StudioCanvasEdge = Edge

// Dependency traversal follows Node Banana's node execution model:
// https://github.com/shrimbly/node-banana/blob/65746adfb0b581c91c0149f642d8b81c639ea8dc/src/store/utils/executionUtils.ts
// Copyright (c) 2026 William Falloon, MIT. See NODE_BANANA_LICENSE.txt.
export function planStudioExecution(
  nodes: StudioCanvasNode[],
  edges: StudioCanvasEdge[],
  targetId: string
): StudioCanvasNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  if (!byId.has(targetId)) throw new Error('canvas target node is missing')
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const ordered: StudioCanvasNode[] = []

  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) throw new Error('canvas connection cycle')
    if (visited.has(nodeId)) return
    const node = byId.get(nodeId)
    if (!node) throw new Error('canvas connection source is missing')
    visiting.add(nodeId)
    for (const edge of edges) {
      if (edge.target === nodeId) visit(edge.source)
    }
    visiting.delete(nodeId)
    visited.add(nodeId)
    ordered.push(node)
  }

  visit(targetId)
  return ordered
}

export function isValidStudioConnection(
  nodes: StudioCanvasNode[],
  edges: StudioCanvasEdge[],
  sourceId: string,
  targetId: string
): boolean {
  if (
    sourceId === targetId ||
    edges.some((edge) => edge.source === sourceId && edge.target === targetId)
  ) {
    return false
  }
  const source = nodes.find((node) => node.id === sourceId)
  const target = nodes.find((node) => node.id === targetId)
  if (!source || !target) return false
  const allowed = {
    text: ['text', 'image', 'video'],
    image: ['video'],
    video: ['video'],
  } as const
  if (
    !(allowed[source.data.kind] as readonly string[]).includes(target.data.kind)
  ) {
    return false
  }
  try {
    planStudioExecution(
      nodes,
      [...edges, { id: 'candidate', source: sourceId, target: targetId }],
      targetId
    )
    return true
  } catch {
    return false
  }
}

export function connectedGenerationInput(
  nodes: StudioCanvasNode[],
  edges: StudioCanvasEdge[],
  targetId: string
): { prompt: string; imageUrl?: string } {
  const target = nodes.find((node) => node.id === targetId)
  if (!target) throw new Error('canvas target node is missing')

  const incoming = edges.filter((edge) => edge.target === targetId)
  const sources = incoming
    .map((edge) => nodes.find((node) => node.id === edge.source))
    .filter((node): node is StudioCanvasNode => node !== undefined)
  const text = sources
    .filter((node) => node.data.kind === 'text')
    .map((node) => node.data.outputText?.trim() || node.data.prompt.trim())
    .filter((value): value is string => Boolean(value))
  const directPrompt = [...text, target.data.prompt.trim()]
    .filter(Boolean)
    .join('\n\n')
  let inherited: string[] = []
  if (!directPrompt) {
    try {
      inherited = planStudioExecution(nodes, edges, targetId)
        .slice(0, -1)
        .filter((node) => node.data.kind === 'text')
        .map((node) => node.data.outputText?.trim() || node.data.prompt.trim())
        .filter(Boolean)
    } catch {
      // Invalid imported graphs remain editable; execution reports the cycle.
    }
  }
  const prompt = directPrompt || [...new Set(inherited)].join('\n\n')
  const imageUrl = sources
    .filter((node) => node.data.kind === 'image')
    .map((node) => node.data.outputUrl)
    .find(
      (url): url is string =>
        typeof url === 'string' && url.startsWith('https://')
    )

  return imageUrl ? { prompt, imageUrl } : { prompt }
}
