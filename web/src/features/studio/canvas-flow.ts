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

export type StudioTake = {
  id: string
  createdAt: string
  model?: string
  group?: string
  prompt: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress?: number
  taskId?: string
  mediaId?: string
  outputUrl?: string
  outputText?: string
  outputImagePrompt?: string
  outputVideoPrompt?: string
  error?: string
}

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
  outputImagePrompt?: string
  outputVideoPrompt?: string
  takes?: StudioTake[]
  selectedTakeId?: string
  assetIds?: string[]
  outputUrl?: string
  mediaId?: string
  taskId?: string
  error?: string
  progress?: number
  seconds?: number
  imageSize?: string
  imageQuality?: string
  imageCount?: number
  resolution?: string
  ratio?: string
  metadataJson?: string
  payloadPatchJson?: string
  usedSourceHandles?: string[]
  usedTargetHandles?: string[]
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
  targetId: string,
  sourceHandle?: string | null,
  targetHandle?: string | null
): boolean {
  if (
    sourceId === targetId ||
    edges.some(
      (edge) =>
        edge.source === sourceId &&
        edge.target === targetId &&
        (edge.sourceHandle || null) === (sourceHandle || null) &&
        (edge.targetHandle || null) === (targetHandle || null)
    )
  ) {
    return false
  }
  const source = nodes.find((node) => node.id === sourceId)
  const target = nodes.find((node) => node.id === targetId)
  if (!source || !target) return false
  if (
    source.data.kind === 'image' &&
    target.data.kind === 'image' &&
    edges.some(
      (edge) =>
        edge.target === targetId &&
        nodes.find((node) => node.id === edge.source)?.data.kind === 'image'
    )
  ) {
    return false
  }
  if (sourceHandle || targetHandle) {
    const defaultSource = {
      text: 'scene',
      image: 'image',
      video: 'video',
    } as const
    const defaultTargets = {
      text: { text: 'brief', image: 'prompt', video: 'prompt' },
      image: { image: 'reference_image', video: 'first_frame' },
      video: { video: 'reference_video' },
    } as const
    const sourceRole = sourceHandle || defaultSource[source.data.kind]
    const targetRole =
      targetHandle ||
      (defaultTargets[source.data.kind] as Record<string, string>)[
        target.data.kind
      ]
    if (!targetRole) return false
    const typed = new Set([
      'text:scene:text:brief',
      'text:scene:image:prompt',
      'text:image_prompt:image:prompt',
      'text:scene:video:prompt',
      'text:video_prompt:video:prompt',
      'image:image:image:reference_image',
      'image:image:video:first_frame',
      'image:image:video:reference_image',
      'video:video:video:reference_video',
      'video:video:video:extend_video',
    ])
    const connection = `${source.data.kind}:${sourceRole}:${target.data.kind}:${targetRole}`
    if (!typed.has(connection)) return false
    if (
      (targetHandle === 'first_frame' || targetHandle === 'extend_video') &&
      edges.some(
        (edge) => edge.target === targetId && edge.targetHandle === targetHandle
      )
    ) {
      return false
    }
  } else {
    const allowed = {
      text: ['text', 'image', 'video'],
      image: ['image', 'video'],
      video: ['video'],
    } as const
    if (
      !(allowed[source.data.kind] as readonly string[]).includes(
        target.data.kind
      )
    ) {
      return false
    }
  }
  try {
    planStudioExecution(
      nodes,
      [
        ...edges,
        {
          id: 'candidate',
          source: sourceId,
          target: targetId,
          sourceHandle,
          targetHandle,
        },
      ],
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
  const sources = incoming.flatMap((edge) => {
    const node = nodes.find((item) => item.id === edge.source)
    return node ? [{ edge, node }] : []
  })
  const imageSources = sources.filter(
    (source) => source.node.data.kind === 'image'
  )
  const hasImageSource = imageSources.some((source) =>
    Boolean(source.node.data.outputUrl || source.node.data.mediaId)
  )
  const textForTarget = (
    node: StudioCanvasNode,
    sourceHandle?: string | null
  ): string => {
    const scene = node.data.outputText?.trim() || node.data.prompt.trim()
    if (sourceHandle === 'scene') return scene
    if (
      sourceHandle === 'image_prompt' ||
      (target.data.kind === 'image' && !sourceHandle)
    ) {
      return node.data.outputImagePrompt?.trim() || scene
    }
    const motion = node.data.outputVideoPrompt?.trim()
    if (
      (sourceHandle === 'video_prompt' ||
        (target.data.kind === 'video' && !sourceHandle)) &&
      motion
    ) {
      return hasImageSource
        ? motion
        : [scene, motion].filter(Boolean).join('\n\n')
    }
    return scene
  }
  const text = sources
    .filter((source) => source.node.data.kind === 'text')
    .map((source) => textForTarget(source.node, source.edge.sourceHandle))
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
        .map((node) => textForTarget(node))
        .filter(Boolean)
    } catch {
      // Invalid imported graphs remain editable; execution reports the cycle.
    }
  }
  const prompt = directPrompt || [...new Set(inherited)].join('\n\n')
  const imageUrl = imageSources
    .filter(
      (source) =>
        !source.edge.targetHandle ||
        source.edge.targetHandle === 'first_frame' ||
        (target.data.kind === 'image' &&
          source.edge.targetHandle === 'reference_image')
    )
    .map((source) => source.node.data.outputUrl)
    .find(
      (url): url is string =>
        typeof url === 'string' && url.startsWith('https://')
    )

  return imageUrl ? { prompt, imageUrl } : { prompt }
}
