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
import { describe, expect, it } from 'vitest'

import { studioPrevisSchema } from '../studio-previs'
import {
  removeStudioPrevisObject,
  resizeStudioPrevisDuration,
  upsertStudioPrevisKey,
} from '../studio-previs-keyframes'

describe('stage editing preserves valid references and timing', () => {
  it('rejects ambiguous object IDs, missing camera targets and out-of-scene keys', () => {
    const actor = { id: 'hero', title: 'Hero', x: 0, z: 0, endX: 0, endZ: 0 }
    expect(
      studioPrevisSchema.safeParse({ actors: [actor, actor] }).success
    ).toBe(false)
    expect(
      studioPrevisSchema.safeParse({ actors: [{ ...actor, id: '__camera__' }] })
        .success
    ).toBe(false)
    expect(
      studioPrevisSchema.safeParse({ advanced: { followId: 'missing' } })
        .success
    ).toBe(false)
    expect(
      studioPrevisSchema.safeParse({
        advanced: { tracks: [{ targetId: 'missing', keys: [] }] },
      }).success
    ).toBe(false)
    const scene = studioPrevisSchema.parse({ actors: [actor] })
    expect(() =>
      upsertStudioPrevisKey(scene, 'hero', {
        time: 6,
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
      })
    ).toThrow()
  })
  it('removes an actor together with its track and camera references', () => {
    let scene = studioPrevisSchema.parse({
      actors: [{ id: 'hero', title: 'Hero', x: 0, z: 0, endX: 0, endZ: 0 }],
      advanced: { followId: 'hero', lookAtId: 'hero' },
    })
    scene = upsertStudioPrevisKey(scene, 'hero', {
      time: 1,
      x: 1,
      y: 0,
      z: 0,
      yaw: 0,
    })
    const next = removeStudioPrevisObject(scene, 'hero')
    expect(next.advanced?.tracks).toEqual([])
    expect(next.advanced?.followId).toBeUndefined()
    expect(studioPrevisSchema.safeParse(next).success).toBe(true)
  })
  it('shortens a scene at the interpolated position without invalid trailing keys', () => {
    let scene = studioPrevisSchema.parse({ duration: 5 })
    scene = upsertStudioPrevisKey(scene, '__camera__', {
      time: 0,
      x: 0,
      y: 0,
      z: 10,
      yaw: 0,
    })
    scene = upsertStudioPrevisKey(scene, '__camera__', {
      time: 5,
      x: 10,
      y: 0,
      z: 10,
      yaw: 0,
    })
    const next = resizeStudioPrevisDuration(scene, 2)
    expect(next.advanced?.tracks[0].keys.at(-1)).toEqual({
      time: 2,
      x: 4,
      y: 0,
      z: 10,
      yaw: 0,
    })
    expect(studioPrevisSchema.safeParse(next).success).toBe(true)
  })
})
