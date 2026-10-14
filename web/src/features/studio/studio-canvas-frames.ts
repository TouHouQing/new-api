/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
For commercial licensing, please contact support@quantumnous.com
*/
import type { NodeChange } from '@xyflow/react'
import { z } from 'zod'

import type { StudioCanvasNode } from './canvas-flow'
import type { StudioProject } from './local-projects'
import type { StudioCanvasOperation } from './studio-canvas-commands'

export const studioCanvasFrameSchema = z.strictObject({
  id: z.string().min(1).max(128),
  title: z.string().trim().min(1).max(200),
  nodeIds: z.array(z.string().min(1).max(128)).min(1).max(500),
  x: z.number().finite().min(-1_000_000).max(1_000_000),
  y: z.number().finite().min(-1_000_000).max(1_000_000),
  width: z.number().finite().min(160).max(2_000_000),
  height: z.number().finite().min(100).max(2_000_000),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
})
export type StudioCanvasFrame = z.infer<typeof studioCanvasFrameSchema>

/** React Flow reports selected members alongside their frame during a drag. */
export function planStudioFrameChanges(
  project: StudioProject,
  changes: NodeChange<StudioCanvasNode>[]
) {
  const frames = project.canvas?.frames || [],
    frameIds = new Set(frames.map((f) => f.id))
  const operations: StudioCanvasOperation[] = []
  const movedMembers = new Set<string>()
  for (const frame of frames) {
    const updates = changes.filter((c) => 'id' in c && c.id === frame.id)
    const size = updates.find(
      (c) => c.type === 'dimensions' && c.resizing !== undefined
    )
    const move = updates.find((c) => c.type === 'position')
    const position = move?.type === 'position' ? move.position : undefined
    const moved = position && (position.x !== frame.x || position.y !== frame.y)
    if (size?.type === 'dimensions' && size.dimensions) {
      if (
        moved ||
        size.dimensions.width !== frame.width ||
        size.dimensions.height !== frame.height
      ) {
        operations.push({
          op: 'update_frame',
          frameId: frame.id,
          patch: {
            width: size.dimensions.width,
            height: size.dimensions.height,
            ...(moved ? position : {}),
          },
        })
      }
    } else if (moved) {
      operations.push({ op: 'move_frame', frameId: frame.id, position })
      frame.nodeIds.forEach((id) => movedMembers.add(id))
    }
  }
  const nodeChanges = changes.filter(
    (c) =>
      c.type !== 'remove' &&
      (!('id' in c) || !frameIds.has(c.id)) &&
      (c.type !== 'position' || !movedMembers.has(c.id))
  )
  return { nodeChanges, operations }
}

export function frameBounds(nodes: StudioCanvasNode[]) {
  const x = Math.min(...nodes.map((n) => n.position.x)) - 24
  const y = Math.min(...nodes.map((n) => n.position.y)) - 48
  return {
    x,
    y,
    width: Math.max(
      160,
      Math.max(
        ...nodes.map(
          (n) => n.position.x + (n.measured?.width || n.width || 326)
        )
      ) +
        24 -
        x
    ),
    height: Math.max(
      100,
      Math.max(
        ...nodes.map(
          (n) => n.position.y + (n.measured?.height || n.height || 340)
        )
      ) +
        24 -
        y
    ),
  }
}

/** Drop empty frames and expand around members that were moved or resized. */
export function reconcileStudioFrames(project: StudioProject): StudioProject {
  if (!project.canvas?.frames) return project
  const nodes = new Map(project.nodes.map((n) => [n.id, n]))
  const frames = project.canvas.frames.flatMap((frame) => {
    const members = frame.nodeIds.flatMap((id) => {
      const member = nodes.get(id)
      return member ? [member] : []
    })
    if (!members.length) return []
    const bounds = frameBounds(members),
      x = Math.min(frame.x, bounds.x),
      y = Math.min(frame.y, bounds.y)
    return [
      {
        ...frame,
        nodeIds: members.map((n) => n.id),
        x,
        y,
        width: Math.max(frame.x + frame.width, bounds.x + bounds.width) - x,
        height: Math.max(frame.y + frame.height, bounds.y + bounds.height) - y,
      },
    ]
  })
  return { ...project, canvas: { ...project.canvas, frames } }
}

export function moveStudioFrame(
  project: StudioProject,
  id: string,
  position: { x: number; y: number }
): StudioProject {
  const frame = project.canvas?.frames?.find((f) => f.id === id)
  if (!frame) throw new Error('Canvas group is unavailable')
  if (
    project.nodes.some((n) => frame.nodeIds.includes(n.id) && n.data.locked)
  ) {
    throw new Error('Unlock the group members before moving them')
  }
  const dx = position.x - frame.x,
    dy = position.y - frame.y
  return {
    ...project,
    nodes: project.nodes.map((n) =>
      frame.nodeIds.includes(n.id)
        ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
        : n
    ),
    canvas: {
      ...project.canvas,
      frames: (project.canvas?.frames || []).map((f) =>
        f.id === id ? { ...f, ...position } : f
      ),
    },
  }
}
