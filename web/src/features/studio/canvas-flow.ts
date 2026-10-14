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
import type { StudioDocument } from './studio-document'
import type { StudioImageLayers } from './studio-image-layers'
import { STUDIO_TYPED_CONNECTIONS } from './studio-node-ports'

export type StudioTake = {
  voice?: string
  id: string
  createdAt: string
  model?: string
  textMode?: 'shot' | 'plain'
  sourceMode?: 'upload'
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
  clientRequestId?: string
  requestSnapshot?: string
  auxiliary?: { role: string; mediaId: string; mimeType: string }[]
  imageLayers?: StudioImageLayers
  templateSnapshot?: string
  chargedQuota?: number
  channelId?: number
  error?: string
}

export type StudioCanvasNodeData = {
  textDocument?: StudioDocument
  labelColor?: string
  rating?: number
  visualPresetIds?: string[]
  [key: string]: unknown
  kind: 'text' | 'image' | 'video' | 'audio'
  imageLayers?: StudioImageLayers
  videoKeyframes?: { mediaId: string; time: number }[]
  assistantPlan?: boolean
  assistantSkillId?: string
  assistantScopeNodeIds?: string[]
  referenceControl?: 'depth' | 'edges'
  purpose?: 'note' | 'script' | 'character' | 'scene' | 'style' | 'assembly'
  linkedAssetId?: string
  reworkRegion?: {
    sourceMediaId: string
    x: number
    y: number
    width: number
    height: number
  }
  reworkRange?: {
    sourceNodeId: string
    sourceMediaId: string
    start: number
    end: number
  }
  locked?: boolean
  sourceMode?: 'upload'
  derivedFrom?: {
    nodeId: string
    takeId?: string
    mediaId: string
    action: string
  }
  voice?: string
  textMode?: 'shot' | 'plain'
  speed?: number
  camera?: {
    shotSize?: string
    angle?: string
    movement?: string
    lens?: string
    lighting?: string
  }
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
  assetVersionIds?: Record<string, string>
  outputUrl?: string
  mediaId?: string
  taskId?: string
  pendingRequestId?: string
  pendingRequestFingerprint?: string
  pendingRequestPrompt?: string
  pendingRequestGroup?: string
  pendingRequestModel?: string
  pendingRequestSnapshot?: string
  error?: string
  staleSourceTitle?: string
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
  hasLegacyTargetHandle?: boolean
}

export type StudioCanvasNode = Node<StudioCanvasNodeData, 'studio'>
export type StudioCanvasEdge = Edge<{ sourceTakeId?: string }>

export function studioNodeInputsChanged(
  data: StudioCanvasNodeData,
  patch: Partial<StudioCanvasNodeData>
): boolean {
  return (
    [
      'prompt',
      'model',
      'textMode',
      'assistantPlan',
      'assistantSkillId',
      'assistantScopeNodeIds',
      'group',
      'videoFamily',
      'seconds',
      'resolution',
      'ratio',
      'metadataJson',
      'referenceControl',
      'payloadPatchJson',
      'imageSize',
      'imageQuality',
      'imageCount',
      'assetIds',
      'assetVersionIds',
      'camera',
      'voice',
      'speed',
      'reworkRegion',
      'reworkRange',
    ] as const
  ).some(
    (key) =>
      Object.hasOwn(patch, key) &&
      JSON.stringify(patch[key]) !== JSON.stringify(data[key])
  )
}

/** Resolve a connection against its pinned result, if it has one. */
export function resolveStudioEdgeSource(
  source: StudioCanvasNode,
  edge: StudioCanvasEdge
): StudioCanvasNode {
  const takeId = edge.data?.sourceTakeId
  if (!takeId) return source
  const take = source.data.takes?.find((item) => item.id === takeId)
  if (!take || take.status !== 'completed') {
    throw new Error('Pinned source take is unavailable')
  }
  return {
    ...source,
    data: {
      ...source.data,
      selectedTakeId: take.id,
      voice: take.voice || source.data.voice,
      model: take.model,
      prompt: take.prompt,
      status: take.status,
      outputText: take.outputText,
      outputImagePrompt: take.outputImagePrompt,
      outputVideoPrompt: take.outputVideoPrompt,
      outputUrl: take.outputUrl,
      mediaId: take.mediaId,
      taskId: take.taskId,
    },
  }
}

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
      if (edge.target !== nodeId) continue
      if (edge.data?.sourceTakeId) {
        const source = byId.get(edge.source)
        if (!source) throw new Error('canvas connection source is missing')
        resolveStudioEdgeSource(source, edge)
        continue
      }
      visit(edge.source)
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
  if (sourceId === targetId) return false
  const source = nodes.find((node) => node.id === sourceId)
  const target = nodes.find((node) => node.id === targetId)
  if (!source || !target) return false
  const defaultSource = {
    text: 'scene',
    image: 'image',
    video: 'video',
    audio: 'audio',
  } as const
  const defaultTargets = {
    text: { text: 'brief', image: 'prompt', video: 'prompt', audio: 'text' },
    image: { image: 'reference_image', video: 'first_frame' },
    video: { video: 'reference_video' },
    audio: {},
  } as const
  const automaticTarget = (
    defaultTargets[source.data.kind] as Record<string, string>
  )[target.data.kind]
  const sourceRole = sourceHandle || defaultSource[source.data.kind]
  let targetRole = targetHandle || automaticTarget
  if (target.data.purpose === 'assembly') {
    if (source.data.kind === 'video') targetRole = targetHandle || 'clip'
    else if (source.data.kind === 'audio') {
      targetRole = targetHandle || 'soundtrack'
    } else return false
    if (source.data.purpose === 'assembly') return false
  }
  let legacyTargetRole = automaticTarget
  if (target.data.purpose === 'assembly') {
    legacyTargetRole = source.data.kind === 'audio' ? 'soundtrack' : 'clip'
  }
  if (
    edges.some(
      (edge) =>
        edge.source === sourceId &&
        edge.target === targetId &&
        (edge.sourceHandle || defaultSource[source.data.kind]) === sourceRole &&
        (edge.targetHandle || legacyTargetRole) === targetRole
    )
  ) {
    return false
  }
  if (
    source.data.kind === 'image' &&
    target.data.kind === 'image' &&
    edges.filter(
      (edge) =>
        edge.target === targetId &&
        nodes.find((node) => node.id === edge.source)?.data.kind === 'image'
    ).length >= 8
  ) {
    return false
  }
  if (sourceHandle || targetHandle || target.data.purpose === 'assembly') {
    if (!targetRole) return false
    const typed = new Set<string>(STUDIO_TYPED_CONNECTIONS)
    const connection = `${source.data.kind}:${sourceRole}:${target.data.kind}:${targetRole}`
    if (!typed.has(connection)) return false
    if (
      target.data.purpose !== 'assembly' &&
      ['clip', 'soundtrack', 'voiceover'].includes(targetRole)
    ) {
      return false
    }
    if (
      target.data.purpose === 'assembly' &&
      !['clip', 'soundtrack', 'voiceover'].includes(targetRole)
    ) {
      return false
    }
    if (
      (targetHandle === 'first_frame' ||
        targetHandle === 'last_frame' ||
        targetHandle === 'extend_video' ||
        targetHandle === 'native_extend' ||
        targetRole === 'soundtrack' ||
        targetRole === 'voiceover') &&
      edges.some((edge) => {
        if (edge.target !== targetId) return false
        if (edge.targetHandle) return edge.targetHandle === targetRole
        const parent = nodes.find((node) => node.id === edge.source)
        if (!parent) return false
        if (target.data.purpose === 'assembly') {
          return (
            (parent.data.kind === 'audio' ? 'soundtrack' : 'clip') ===
            targetRole
          )
        }
        return (
          (defaultTargets[parent.data.kind] as Record<string, string>)[
            target.data.kind
          ] === targetRole
        )
      })
    ) {
      return false
    }
  } else {
    const allowed = {
      text: ['text', 'image', 'video', 'audio'],
      image: ['image', 'video'],
      video: ['video'],
      audio: [],
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
    return node ? [{ edge, node: resolveStudioEdgeSource(node, edge) }] : []
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
    const scene =
      node.data.outputText?.trim() ||
      node.data.outputImagePrompt?.trim() ||
      node.data.outputVideoPrompt?.trim() ||
      node.data.prompt.trim()
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
      if (hasImageSource || motion === scene) {
        return motion
      }
      return [scene, motion].filter(Boolean).join('\n\n')
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
