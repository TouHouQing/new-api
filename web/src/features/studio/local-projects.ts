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
import { z } from 'zod'

import type {
  StudioCanvasEdge,
  StudioCanvasNode,
  StudioTake,
} from './canvas-flow'
import {
  parseStudioVideoMetadata,
  parseStudioVideoPayloadPatch,
  type StudioVideoFamily,
} from './model-profiles'

const nodeDataSchema = z.strictObject({
  kind: z.enum(['text', 'image', 'video']),
  title: z.string().max(200),
  prompt: z.string().max(30000),
  model: z.string().max(200).optional(),
  textMode: z.enum(['shot', 'plain']).optional(),
  group: z.string().max(100).optional(),
  videoFamily: z
    .enum(['generic', 'seedance-2', 'seedance-2.5', 'minimax-h3'])
    .optional(),
  status: z
    .enum(['idle', 'submitting', 'queued', 'processing', 'completed', 'failed'])
    .optional(),
  outputText: z.string().max(300000).optional(),
  outputImagePrompt: z.string().max(30000).optional(),
  outputVideoPrompt: z.string().max(30000).optional(),
  takes: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(128),
        createdAt: z.string().max(40),
        model: z.string().max(200).optional(),
        group: z.string().max(100).optional(),
        prompt: z.string().max(30000),
        status: z.enum(['queued', 'processing', 'completed', 'failed']),
        progress: z.number().min(0).max(100).optional(),
        taskId: z.string().max(191).optional(),
        mediaId: z.string().max(128).optional(),
        outputUrl: z.string().max(4096).optional(),
        outputText: z.string().max(300000).optional(),
        outputImagePrompt: z.string().max(30000).optional(),
        outputVideoPrompt: z.string().max(30000).optional(),
        clientRequestId: z.string().uuid().optional(),
        requestSnapshot: z.string().max(16_384).optional(),
        chargedQuota: z.number().int().min(0).optional(),
        channelId: z.number().int().min(0).optional(),
        error: z.string().max(2000).optional(),
      })
    )
    .max(100)
    .optional(),
  selectedTakeId: z.string().max(128).optional(),
  assetIds: z.array(z.string().max(128)).max(32).optional(),
  outputUrl: z.string().max(4096).optional(),
  mediaId: z.string().max(128).optional(),
  taskId: z.string().max(191).optional(),
  pendingRequestId: z.string().uuid().optional(),
  pendingRequestFingerprint: z.string().max(100_000).optional(),
  pendingRequestPrompt: z.string().max(30000).optional(),
  pendingRequestGroup: z.string().max(100).optional(),
  pendingRequestModel: z.string().max(200).optional(),
  pendingRequestSnapshot: z.string().max(16_384).optional(),
  error: z.string().max(2000).optional(),
  staleSourceTitle: z.string().max(200).optional(),
  progress: z.number().min(0).max(100).optional(),
  // Accept legacy invalid drafts so one bad duration does not erase a canvas.
  seconds: z.number().nullable().optional(),
  imageSize: z.string().max(40).optional(),
  imageQuality: z.string().max(40).optional(),
  imageCount: z.number().int().min(1).max(10).optional(),
  resolution: z.string().max(100).optional(),
  ratio: z.string().max(40).optional(),
  metadataJson: z
    .string()
    .max(16_384)
    .refine((raw) => {
      try {
        parseStudioVideoMetadata(raw)
        return true
      } catch {
        return false
      }
    })
    .optional(),
  payloadPatchJson: z
    .string()
    .max(16_384)
    .refine((raw) => {
      try {
        parseStudioVideoPayloadPatch(raw)
        return true
      } catch {
        return false
      }
    })
    .optional(),
})
const nodeSchema = z.strictObject({
  id: z.string().min(1).max(128),
  type: z.literal('studio'),
  position: z.strictObject({ x: z.number().finite(), y: z.number().finite() }),
  data: nodeDataSchema,
  selected: z.boolean().optional(),
  dragging: z.boolean().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  measured: z
    .object({ width: z.number().optional(), height: z.number().optional() })
    .optional(),
})
const edgeSchema = z.strictObject({
  id: z.string().min(1).max(128),
  source: z.string().min(1).max(128),
  target: z.string().min(1).max(128),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  data: z
    .strictObject({ sourceTakeId: z.string().min(1).max(128).optional() })
    .optional(),
  selected: z.boolean().optional(),
})
const projectSchema = z.strictObject({
  id: z.string().min(1).max(128),
  title: z.string().max(200),
  nodes: z.array(nodeSchema).max(500),
  edges: z.array(edgeSchema).max(1000),
  finalVideoNodeId: z.string().min(1).max(128).optional(),
  assembledMediaId: z.string().min(1).max(128).optional(),
  soundtrackMediaId: z.string().min(1).max(128).optional(),
  soundtrackVolume: z.number().min(0).max(1).optional(),
  soundtrackOffsetSeconds: z.number().min(0).max(3600).optional(),
  voiceoverMediaId: z.string().min(1).max(128).optional(),
  voiceoverVolume: z.number().min(0).max(1).optional(),
  voiceoverOffsetSeconds: z.number().min(0).max(3600).optional(),
  captionsText: z.string().max(100_000).optional(),
  captionOffsetSeconds: z.number().min(0).max(3600).optional(),
  defaults: z
    .strictObject({
      textModel: z.string().max(200).optional(),
      imageModel: z.string().max(200).optional(),
      videoGroup: z.string().max(100).optional(),
      videoModel: z.string().max(200).optional(),
      videoFamily: z
        .enum(['generic', 'seedance-2', 'seedance-2.5', 'minimax-h3'])
        .optional(),
      seconds: z.number().int().min(1).max(3600).optional(),
      resolution: z.string().max(100).optional(),
      ratio: z.string().max(40).optional(),
    })
    .optional(),
  shots: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(100),
        title: z.string().max(200),
        textNodeId: z.string().min(1).max(128),
        imageNodeId: z.string().min(1).max(128),
        videoNodeId: z.string().min(1).max(128),
        trimStart: z.number().min(0).max(3600).optional(),
        trimEnd: z.number().min(0).max(3600).optional(),
        muted: z.boolean().optional(),
        volume: z.number().min(0).max(1).optional(),
        transition: z.enum(['cut', 'fade']).optional(),
        transitionSeconds: z.number().min(0.1).max(3).optional(),
      })
    )
    .max(166)
    .optional(),
  assets: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(128),
        kind: z.enum(['character', 'location', 'style']),
        title: z.string().min(1).max(200),
        prompt: z.string().max(10000),
        mediaId: z.string().max(128).optional(),
        outputUrl: z.string().max(4096).optional(),
      })
    )
    .max(200)
    .optional(),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
})

const storedProjectsSchema = z.object({
  version: z.literal(1),
  projects: z.array(projectSchema),
})
export class StudioProjectStorageError extends Error {
  constructor(readonly raw: string) {
    super(
      'Saved Studio projects could not be read. Download a backup before resetting them.'
    )
    this.name = 'StudioProjectStorageError'
  }
}
export type StudioProject = {
  id: string
  title: string
  nodes: StudioCanvasNode[]
  edges: StudioCanvasEdge[]
  shots?: StudioShot[]
  assets?: StudioAsset[]
  finalVideoNodeId?: string
  assembledMediaId?: string
  soundtrackMediaId?: string
  soundtrackVolume?: number
  soundtrackOffsetSeconds?: number
  voiceoverMediaId?: string
  voiceoverVolume?: number
  voiceoverOffsetSeconds?: number
  captionsText?: string
  captionOffsetSeconds?: number
  defaults?: StudioProjectDefaults
  createdAt: string
  updatedAt: string
}

export type StudioProjectDefaults = {
  textModel?: string
  imageModel?: string
  videoGroup?: string
  videoModel?: string
  videoFamily?: StudioVideoFamily
  seconds?: number
  resolution?: string
  ratio?: string
}

export type StudioShot = {
  id: string
  title: string
  textNodeId: string
  imageNodeId: string
  videoNodeId: string
  trimStart?: number
  trimEnd?: number
  muted?: boolean
  volume?: number
  transition?: 'cut' | 'fade'
  transitionSeconds?: number
}

export type StudioAsset = {
  id: string
  kind: 'character' | 'location' | 'style'
  title: string
  prompt: string
  mediaId?: string
  outputUrl?: string
}

function normalizeStudioProject(project: StudioProject): StudioProject {
  return {
    ...project,
    nodes: project.nodes.map((node) => {
      if (node.data.kind !== 'video') return node
      const data = { ...node.data }
      delete data.outputUrl
      const seconds = data.seconds
      if (
        typeof seconds !== 'number' ||
        !Number.isInteger(seconds) ||
        seconds < 1 ||
        seconds > 3600
      ) {
        data.seconds = 5
      }
      if (
        data.taskId &&
        !data.takes?.some((take) => take.taskId === data.taskId)
      ) {
        const status =
          data.status === 'completed' ||
          data.status === 'failed' ||
          data.status === 'processing'
            ? data.status
            : 'queued'
        const legacyTake: StudioTake = {
          id: `legacy-${node.id.slice(0, 40)}-${data.taskId.slice(0, 70)}`,
          createdAt: project.updatedAt,
          model: data.model,
          group: data.group,
          prompt: data.prompt,
          status,
          taskId: data.taskId,
          mediaId: data.mediaId,
          outputUrl: data.outputUrl,
          error: data.error,
        }
        data.takes = [...(data.takes || []), legacyTake].slice(-100)
        data.selectedTakeId ||= legacyTake.id
      }
      return { ...node, data }
    }),
  }
}

export function serializeStudioProjectExport(project: StudioProject): string {
  const safe = normalizeStudioProject(project)
  const {
    assembledMediaId: _assembledMediaId,
    soundtrackMediaId: _soundtrackMediaId,
    voiceoverMediaId: _voiceoverMediaId,
    ...portable
  } = safe
  return JSON.stringify(
    {
      ...portable,
      nodes: safe.nodes.map((node) => {
        const data = { ...node.data }
        delete data.outputUrl
        delete data.mediaId
        data.takes = data.takes?.map((take) => ({
          ...take,
          mediaId: undefined,
          outputUrl: undefined,
        }))
        return { ...node, data }
      }),
      assets: safe.assets?.map((asset) => ({
        ...asset,
        mediaId: undefined,
        outputUrl: undefined,
      })),
    },
    null,
    2
  )
}

export function parseStudioProjectImport(raw: string): StudioProject {
  if (raw.length > 2_000_000) throw new Error('project file is too large')
  try {
    const project = normalizeStudioProject(
      projectSchema.parse(JSON.parse(raw)) as StudioProject
    )
    return {
      ...project,
      assembledMediaId: undefined,
      soundtrackMediaId: undefined,
      voiceoverMediaId: undefined,
      nodes: project.nodes.map((node) => {
        const data = { ...node.data }
        delete data.mediaId
        delete data.outputUrl
        data.takes = data.takes?.map((take) => ({
          ...take,
          mediaId: undefined,
          outputUrl: undefined,
        }))
        return { ...node, data }
      }),
      assets: project.assets?.map((asset) => ({
        ...asset,
        mediaId: undefined,
        outputUrl: undefined,
      })),
    }
  } catch {
    throw new Error('project file is invalid')
  }
}

export function studioProjectsKey(userId: number): string {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error('a valid user ID is required')
  }
  return `newapi:studio:projects:v1:user:${userId}`
}

export function loadStudioProjects(
  storage: Pick<Storage, 'getItem'>,
  userId: number
): StudioProject[] {
  const raw = storage.getItem(studioProjectsKey(userId))
  if (!raw) return []
  try {
    const stored = storedProjectsSchema.safeParse(JSON.parse(raw))
    if (!stored.success) throw new StudioProjectStorageError(raw)
    return (stored.data.projects as StudioProject[]).map(normalizeStudioProject)
  } catch {
    throw new StudioProjectStorageError(raw)
  }
}

export function saveStudioProjects(
  storage: Pick<Storage, 'setItem'>,
  userId: number,
  projects: StudioProject[]
): void {
  const document = storedProjectsSchema.parse({
    version: 1,
    projects: projects.map(normalizeStudioProject),
  })
  storage.setItem(studioProjectsKey(userId), JSON.stringify(document))
}
