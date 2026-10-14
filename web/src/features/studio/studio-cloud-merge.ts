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
import type { StudioProject } from './local-projects'

export class StudioCloudConflictError extends Error {
  constructor(readonly path: string) {
    super(
      `Concurrent project edit at ${path}; refresh and resolve this field before saving`
    )
    this.name = 'StudioCloudConflictError'
  }
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

// Concurrent changes to distinct fields and result Takes can be merged. Two
// edits to the same creative field require the author to resolve the conflict.
export function mergeStudioCloudDocument(
  base: StudioProject,
  local: StudioProject,
  remote: StudioProject,
  resolution?: 'local' | 'remote',
  onConflict?: (path: string) => void
): StudioProject {
  const merge = (
    before: unknown,
    ours: unknown,
    theirs: unknown,
    path: string
  ): unknown => {
    // Browser measurements and selection are local UI state, not author edits.
    if (
      /^project\.(nodes|edges)\[[^\]]+\]\.(measured|selected|dragging)$/.test(
        path
      )
    ) {
      return ours
    }
    if (same(ours, before)) return theirs
    if (same(theirs, before) || same(ours, theirs)) return ours
    if (path.endsWith('.updatedAt')) return theirs
    if (record(before) && record(ours) && record(theirs)) {
      const result: Record<string, unknown> = {}
      for (const key of new Set([
        ...Object.keys(before),
        ...Object.keys(ours),
        ...Object.keys(theirs),
      ])) {
        const value = merge(
          before[key],
          ours[key],
          theirs[key],
          `${path}.${key}`
        )
        if (value !== undefined) result[key] = value
      }
      return result
    }
    if (
      Array.isArray(ours) &&
      Array.isArray(theirs) &&
      Array.isArray(before) &&
      [...before, ...ours, ...theirs].every(
        (item) => record(item) && typeof item.id === 'string'
      )
    ) {
      const baseItems = new Map(before.map((item) => [item.id, item]))
      const ourItems = new Map(ours.map((item) => [item.id, item]))
      const theirItems = new Map(theirs.map((item) => [item.id, item]))
      const baseOrder = before
        .map((item) => item.id)
        .filter((id) => ourItems.has(id) && theirItems.has(id))
      const ourOrder = ours
        .map((item) => item.id)
        .filter((id) => baseOrder.includes(id))
      const theirOrder = theirs
        .map((item) => item.id)
        .filter((id) => baseOrder.includes(id))
      if (
        !same(ourOrder, baseOrder) &&
        !same(theirOrder, baseOrder) &&
        !same(ourOrder, theirOrder)
      ) {
        onConflict?.(path)
        if (!resolution) throw new StudioCloudConflictError(path)
      }
      const order =
        same(ourOrder, baseOrder) ||
        (resolution === 'remote' && !same(theirOrder, baseOrder))
          ? [...theirs, ...ours]
          : [...ours, ...theirs]
      const ids = new Set(order.map((item) => item.id))
      return [...ids].flatMap((id) => {
        const value = merge(
          baseItems.get(id),
          ourItems.get(id),
          theirItems.get(id),
          `${path}[${id}]`
        )
        return value === undefined ? [] : [value]
      })
    }
    onConflict?.(path)
    if (resolution === 'local') return ours
    if (resolution === 'remote') return theirs
    throw new StudioCloudConflictError(path)
  }
  return merge(base, local, remote, 'project') as StudioProject
}
