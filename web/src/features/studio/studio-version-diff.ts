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

export function studioStableValue(value: unknown): string {
  return (
    JSON.stringify(value, (_key, item: unknown) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item
      return Object.fromEntries(
        Object.entries(item).sort(([a], [b]) => a.localeCompare(b))
      )
    }) || ''
  )
}
export function studioProjectChanges(
  before: StudioProject,
  after: StudioProject
) {
  const changes: {
    title: string
    field: string
    before: string
    after: string
  }[] = []
  const fields = [
    'title',
    'prompt',
    'mediaId',
    'selectedTakeId',
    'seconds',
    'model',
    'camera',
  ] as const
  for (const node of before.nodes) {
    const current = after.nodes.find((item) => item.id === node.id)
    if (!current) {
      changes.push({
        title: node.data.title,
        field: 'Removed',
        before: node.data.title,
        after: '',
      })
      continue
    }
    for (const field of fields) {
      if (
        studioStableValue(node.data[field]) !==
        studioStableValue(current.data[field])
      ) {
        changes.push({
          title: node.data.title,
          field,
          before:
            typeof node.data[field] === 'object'
              ? studioStableValue(node.data[field])
              : String(node.data[field] ?? ''),
          after:
            typeof current.data[field] === 'object'
              ? studioStableValue(current.data[field])
              : String(current.data[field] ?? ''),
        })
      }
    }
  }
  for (const node of after.nodes.filter(
    (node) => !before.nodes.some((old) => old.id === node.id)
  )) {
    changes.push({
      title: node.data.title,
      field: 'Added',
      before: '',
      after: node.data.title,
    })
  }
  for (const field of [
    'captionsText',
    'soundtrackMediaId',
    'voiceoverMediaId',
  ] as const) {
    if (before[field] !== after[field]) {
      changes.push({
        title: after.title,
        field,
        before: String(before[field] ?? ''),
        after: String(after[field] ?? ''),
      })
    }
  }
  for (const field of [
    'timeline',
    'audioTracks',
    'dialogueCues',
    'previs',
    'motionGraphics',
  ] as const) {
    if (
      studioStableValue(before.production?.[field]) !==
      studioStableValue(after.production?.[field])
    ) {
      changes.push({
        title: after.title,
        field,
        before: String(before.production?.[field] ? 'Configured' : 'Empty'),
        after: String(after.production?.[field] ? 'Changed' : 'Empty'),
      })
    }
  }
  if (before.title !== after.title) {
    changes.unshift({
      title: after.title,
      field: 'title',
      before: before.title,
      after: after.title,
    })
  }
  for (const shot of before.shots || []) {
    const next = after.shots?.find((item) => item.id === shot.id)
    if (!next) {
      changes.push({
        title: shot.title,
        field: 'Removed',
        before: shot.title,
        after: '',
      })
      continue
    }
    for (const [field, value] of Object.entries(shot)) {
      if (field === 'id') continue
      const current = Object.entries(next).find(([key]) => key === field)?.[1]
      if (studioStableValue(value) !== studioStableValue(current)) {
        changes.push({
          title: shot.title,
          field,
          before:
            typeof value === 'object'
              ? studioStableValue(value)
              : String(value ?? ''),
          after:
            typeof current === 'object'
              ? studioStableValue(current)
              : String(current ?? ''),
        })
      }
    }
  }
  const order = (project: StudioProject) =>
    (project.production?.timeline || [])
      .map(
        (clip) =>
          project.nodes.find((node) => node.id === clip.nodeId)?.data.title ||
          ''
      )
      .join(' → ')
  if (order(before) !== order(after)) {
    changes.push({
      title: after.title,
      field: 'Video clip order',
      before: order(before),
      after: order(after),
    })
  }
  return changes
}
