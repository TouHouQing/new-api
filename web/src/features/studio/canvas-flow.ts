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
    .map((node) => node.data.outputText?.trim())
    .filter((value): value is string => Boolean(value))
  const prompt = [...text, target.data.prompt.trim()]
    .filter(Boolean)
    .join('\n\n')
  const imageUrl = sources
    .filter((node) => node.data.kind === 'image')
    .map((node) => node.data.outputUrl)
    .find(
      (url): url is string =>
        typeof url === 'string' && url.startsWith('https://')
    )

  return imageUrl ? { prompt, imageUrl } : { prompt }
}
