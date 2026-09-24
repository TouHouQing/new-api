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

import type { StudioCanvasEdge, StudioCanvasNode } from './canvas-flow'

const nodeDataSchema = z.strictObject({
  kind: z.enum(['text', 'image', 'video']),
  title: z.string().max(200),
  prompt: z.string().max(30000),
  model: z.string().max(200).optional(),
  group: z.string().max(100).optional(),
  videoFamily: z.enum(['seedance-2', 'minimax-h3']).optional(),
  status: z
    .enum(['idle', 'submitting', 'queued', 'processing', 'completed', 'failed'])
    .optional(),
  outputText: z.string().max(300000).optional(),
  outputUrl: z.string().max(4096).optional(),
  mediaId: z.string().max(128).optional(),
  taskId: z.string().max(191).optional(),
  error: z.string().max(2000).optional(),
  progress: z.number().min(0).max(100).optional(),
  seconds: z.number().int().min(4).max(15).optional(),
  resolution: z.string().max(20).optional(),
  ratio: z.string().max(20).optional(),
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
  selected: z.boolean().optional(),
})
const projectSchema = z.strictObject({
  id: z.string().min(1).max(128),
  title: z.string().max(200),
  nodes: z.array(nodeSchema).max(500),
  edges: z.array(edgeSchema).max(1000),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
})

const storedProjectsSchema = z.object({
  version: z.literal(1),
  projects: z.array(projectSchema),
})
export type StudioProject = {
  id: string
  title: string
  nodes: StudioCanvasNode[]
  edges: StudioCanvasEdge[]
  createdAt: string
  updatedAt: string
}

function withoutCapabilityUrls(project: StudioProject): StudioProject {
  return {
    ...project,
    nodes: project.nodes.map((node) => {
      if (node.data.kind !== 'video') return node
      const data = { ...node.data }
      delete data.outputUrl
      return { ...node, data }
    }),
  }
}

export function serializeStudioProjectExport(project: StudioProject): string {
  const safe = withoutCapabilityUrls(project)
  return JSON.stringify(
    {
      ...safe,
      nodes: safe.nodes.map((node) => {
        const data = { ...node.data }
        delete data.outputUrl
        delete data.mediaId
        return { ...node, data }
      }),
    },
    null,
    2
  )
}

export function parseStudioProjectImport(raw: string): StudioProject {
  if (raw.length > 2_000_000) throw new Error('project file is too large')
  try {
    const project = withoutCapabilityUrls(
      projectSchema.parse(JSON.parse(raw)) as StudioProject
    )
    return {
      ...project,
      nodes: project.nodes.map((node) => {
        const data = { ...node.data }
        delete data.mediaId
        return { ...node, data }
      }),
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
    return stored.success
      ? (stored.data.projects as StudioProject[]).map(withoutCapabilityUrls)
      : []
  } catch {
    return []
  }
}

export function saveStudioProjects(
  storage: Pick<Storage, 'setItem'>,
  userId: number,
  projects: StudioProject[]
): void {
  storage.setItem(
    studioProjectsKey(userId),
    JSON.stringify({
      version: 1,
      projects: projects.map(withoutCapabilityUrls),
    })
  )
}
