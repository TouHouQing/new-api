/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
export type StudioCrop = { x: number; y: number; width: number; height: number }
export type StudioTrackingPoint = {
  time: number
  crop: StudioCrop
  confidence: number
  review_required: boolean
  manual?: boolean
}
export function studioSampleTracking(
  points: StudioTrackingPoint[],
  seconds: number
): StudioCrop | undefined {
  if (!points.length || !Number.isFinite(seconds)) return undefined
  const first = points[0]
  if (seconds <= first.time) {
    return first.review_required ? undefined : first.crop
  }
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]
    const b = points[index]
    if (seconds > b.time) continue
    if (
      a.review_required ||
      b.review_required ||
      (a.confidence < 0.45 && !a.manual) ||
      (b.confidence < 0.45 && !b.manual) ||
      b.time <= a.time
    ) {
      return undefined
    }
    const weight = (seconds - a.time) / (b.time - a.time)
    return {
      x: a.crop.x + (b.crop.x - a.crop.x) * weight,
      y: a.crop.y + (b.crop.y - a.crop.y) * weight,
      width: a.crop.width + (b.crop.width - a.crop.width) * weight,
      height: a.crop.height + (b.crop.height - a.crop.height) * weight,
    }
  }
  const last = points.at(-1)
  return last?.review_required ? undefined : last?.crop
}
