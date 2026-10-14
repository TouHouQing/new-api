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
import { z } from 'zod'

export const studioPrevisSchema = z
  .strictObject({
    advanced: z
      .strictObject({
        exports: z
          .array(
            z.strictObject({
              modelMediaId: z.string().max(128),
              title: z.string().max(200),
              createdAt: z.string().max(40),
            })
          )
          .max(50)
          .optional(),
        models: z
          .array(
            z.strictObject({
              id: z.string().max(128),
              title: z.string().max(200),
              modelMediaId: z.string().max(128),
              x: z.number().min(-10).max(10),
              assetId: z.string().max(128).optional(),
              assetVersionId: z.string().max(128).optional(),
              y: z.number().min(-10).max(10),
              z: z.number().min(-10).max(10),
              scale: z.number().min(0.01).max(10).default(1),
              yaw: z.number().min(-180).max(180).optional(),
              pitch: z.number().min(-180).max(180).optional(),
              roll: z.number().min(-180).max(180).optional(),
              animation: z.string().max(200).default(''),
            })
          )
          .max(12)
          .default([]),
        tracks: z
          .array(
            z.strictObject({
              targetId: z.string().max(128),
              keys: z
                .array(
                  z.strictObject({
                    time: z.number().min(0).max(30),
                    x: z.number().min(-100).max(100),
                    y: z.number().min(-100).max(100),
                    z: z.number().min(-100).max(100),
                    yaw: z.number().min(-180).max(180),
                  })
                )
                .max(100),
            })
          )
          .max(45)
          .default([]),
        followId: z.string().max(128).optional(),
        lookAtId: z.string().max(128).optional(),
        showPaths: z.boolean().default(true),
      })
      .optional(),
    duration: z.number().min(1).max(30).default(5),
    camera: z
      .strictObject({
        yaw: z.number().min(-180).max(180).default(20),
        endYaw: z.number().min(-180).max(180).default(20),
        pitch: z.number().min(5).max(80).default(20),
        distance: z.number().min(3).max(30).default(10),
        fov: z.number().min(20).max(100).default(50),
      })
      .default({ yaw: 20, endYaw: 20, pitch: 20, distance: 10, fov: 50 }),
    actors: z
      .array(
        z.strictObject({
          id: z.string().min(1).max(128),
          assetId: z.string().max(128).optional(),
          title: z.string().max(200),
          x: z.number().min(-10).max(10),
          z: z.number().min(-10).max(10),
          endX: z.number().min(-10).max(10),
          endZ: z.number().min(-10).max(10),
          yaw: z.number().min(-180).max(180).default(0),
          pose: z
            .enum(['stand', 'walk', 'wave', 'point', 'sit'])
            .default('stand'),
          color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .default('#8ab4f8'),
        })
      )
      .max(12)
      .default([]),
    props: z
      .array(
        z.strictObject({
          id: z.string().min(1).max(128),
          title: z.string().max(200),
          x: z.number().min(-10).max(10),
          z: z.number().min(-10).max(10),
          width: z.number().min(0.1).max(5),
          height: z.number().min(0.1).max(5),
          depth: z.number().min(0.1).max(5),
          color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .default('#e6ad72'),
        })
      )
      .max(20)
      .default([]),
  })
  .superRefine((scene, context) => {
    const ids = new Set<string>(['__camera__'])
    for (const item of [
      ...scene.actors,
      ...scene.props,
      ...(scene.advanced?.models || []),
    ]) {
      if (!item.id || ids.has(item.id)) {
        context.addIssue({
          code: 'custom',
          message:
            'Stage objects require unique IDs; the camera ID is reserved',
        })
      }
      ids.add(item.id)
    }
    const advanced = scene.advanced
    if (!advanced) return
    for (const target of [advanced.followId, advanced.lookAtId]) {
      if (target && (!ids.has(target) || target === '__camera__')) {
        context.addIssue({
          code: 'custom',
          message: 'Camera targets must exist in the stage',
        })
      }
    }
    const targets = new Set<string>()
    for (const track of advanced.tracks) {
      if (!ids.has(track.targetId) || targets.has(track.targetId)) {
        context.addIssue({
          code: 'custom',
          message: 'Tracks need unique existing targets',
        })
      }
      targets.add(track.targetId)
      const times = new Set<number>()
      for (const key of track.keys) {
        if (times.has(key.time) || key.time > scene.duration) {
          context.addIssue({
            code: 'custom',
            message: 'Keyframe times must be unique and within the scene',
          })
        }
        times.add(key.time)
      }
    }
  })
export type StudioPrevis = z.infer<typeof studioPrevisSchema>
type Point = [number, number, number]

// Perspective projection of world geometry, with an orbit camera looking at
// the stage center. The same stage is rendered offline by the Go worker.
export function drawStudioPrevis(
  canvas: HTMLCanvasElement,
  scene: StudioPrevis,
  seconds: number
): void {
  const context = canvas.getContext('2d')
  if (!context) return
  const progress = Math.max(0, Math.min(1, seconds / scene.duration))
  const yaw =
    ((scene.camera.yaw + (scene.camera.endYaw - scene.camera.yaw) * progress) *
      Math.PI) /
    180
  const pitch = (scene.camera.pitch * Math.PI) / 180
  const follow = scene.actors.find(
    (actor) => actor.id === scene.advanced?.followId
  )
  const followX = follow ? follow.x + (follow.endX - follow.x) * progress : 0
  const followZ = follow ? follow.z + (follow.endZ - follow.z) * progress : 0
  const project = ([x, y, z]: Point): [number, number] | null => {
    x -= followX
    z -= followZ
    const right = x * Math.cos(yaw) - z * Math.sin(yaw)
    const forward = x * Math.sin(yaw) + z * Math.cos(yaw)
    const vertical = (y - 1) * Math.cos(pitch) - forward * Math.sin(pitch)
    const depth =
      scene.camera.distance -
      ((y - 1) * Math.sin(pitch) + forward * Math.cos(pitch))
    if (depth <= 0.2) return null
    const scale =
      canvas.height / (2 * Math.tan((scene.camera.fov * Math.PI) / 360)) / depth
    return [
      canvas.width / 2 + right * scale,
      canvas.height / 2 - vertical * scale,
    ]
  }
  const line = (a: Point, b: Point, color: string, width = 2): void => {
    const start = project(a),
      end = project(b)
    if (!start || !end) return
    context.strokeStyle = color
    context.lineWidth = width
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(...start)
    context.lineTo(...end)
    context.stroke()
  }
  context.fillStyle = '#14191f'
  context.fillRect(0, 0, canvas.width, canvas.height)
  for (let i = -10; i <= 10; i++) {
    line([i, 0, -10], [i, 0, 10], '#2e3b48', 1)
    line([-10, 0, i], [10, 0, i], '#2e3b48', 1)
  }
  line([0, 0, 0], [2, 0, 0], '#ce7070')
  line([0, 0, 0], [0, 0, 2], '#72b89c')
  for (const prop of scene.props) {
    const corners: Point[] = []
    for (const height of [0, prop.height]) {
      for (const z of [-1, 1]) {
        for (const x of [-1, 1]) {
          corners.push([
            prop.x + (x * prop.width) / 2,
            height,
            prop.z + (z * prop.depth) / 2,
          ])
        }
      }
    }
    for (const [a, b] of [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
      [4, 5],
      [4, 6],
      [5, 7],
      [6, 7],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ]) {
      line(corners[a], corners[b], prop.color, 3)
    }
  }
  for (const actor of scene.actors) {
    const x = actor.x + (actor.endX - actor.x) * progress,
      z = actor.z + (actor.endZ - actor.z) * progress
    const turn = (actor.yaw * Math.PI) / 180
    const transform = ([px, py, pz]: Point): Point => [
      x + px * Math.cos(turn) + pz * Math.sin(turn),
      py,
      z - px * Math.sin(turn) + pz * Math.cos(turn),
    ]
    const body = actor.pose === 'sit' ? 0.5 : 0
    const swing = actor.pose === 'walk' ? Math.sin(seconds * 8) * 0.35 : 0
    const points: Point[] = [
      [0, 1.7 - body, 0],
      [0, 1.4 - body, 0],
      [0, 0.85 - body, 0],
      [-0.3, 1.4 - body, 0],
      [0.3, 1.4 - body, 0],
      [-0.4, 0.85 - body, swing],
      [0.4, 0.85 - body, -swing],
      [-0.15, 0, -swing],
      [0.15, 0, swing],
    ]
    if (actor.pose === 'wave') {
      points[6] = [0.5 + Math.sin(seconds * 8) * 0.12, 1.9, 0]
    }
    if (actor.pose === 'point') points[6] = [0.9, 1.35, 0]
    if (actor.pose === 'sit') {
      points[7] = [-0.15, 0.15, 0.5]
      points[8] = [0.15, 0.15, 0.5]
    }
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [3, 4],
      [3, 5],
      [4, 6],
      [2, 7],
      [2, 8],
    ]) {
      line(transform(points[a]), transform(points[b]), actor.color, 8)
    }
    const head = project(transform(points[0]))
    if (head) {
      context.fillStyle = actor.color
      context.beginPath()
      context.arc(head[0], head[1], 10, 0, 2 * Math.PI)
      context.fill()
      context.fillStyle = '#e9eef4'
      context.font = '14px sans-serif'
      context.fillText(actor.title, head[0] + 15, head[1])
    }
  }
}
