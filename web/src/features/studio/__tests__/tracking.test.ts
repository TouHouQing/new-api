/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { describe, expect, it } from 'vitest'

import {
  studioSampleTracking,
  type StudioTrackingPoint,
} from '../studio-tracking'

describe('source-time crop sampling', () => {
  const points: StudioTrackingPoint[] = [
    {
      time: 2,
      crop: { x: 0, y: 0, width: 0.3, height: 1 },
      confidence: 0.9,
      review_required: false,
    },
    {
      time: 4,
      crop: { x: 0.6, y: 0, width: 0.3, height: 1 },
      confidence: 0.9,
      review_required: false,
    },
  ]
  it('matches the renderer at source time when a clip is trimmed or sped up', () => {
    expect(studioSampleTracking(points, 2 + 0.5 * 2)).toEqual({
      x: 0.3,
      y: 0,
      width: 0.3,
      height: 1,
    })
    expect(studioSampleTracking(points, 4)).toEqual(points[1].crop)
  })
  it('does not interpolate through a lost subject until a manual correction exists', () => {
    const lost = [
      { ...points[0] },
      { ...points[1], confidence: 0, review_required: true },
    ]
    expect(studioSampleTracking(lost, 3)).toBeUndefined()
    lost[1] = {
      ...lost[1],
      review_required: false,
      manual: true,
    } as StudioTrackingPoint
    expect(studioSampleTracking(lost, 3)?.x).toBe(0.3)
    expect(lost[1].confidence).toBe(0)
  })
})
