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
import { expect, test } from 'vitest'

import { mergeStudioCloudDocument } from '../studio-cloud-merge'
import { createStudioProject } from '../workspace'

test('choosing the cloud order resolves only conflicting edits and retains unrelated local changes', () => {
  const base = createStudioProject('Base', 'order')
  base.nodes = ['a', 'b', 'c'].map((id) => ({
    id,
    type: 'studio',
    position: { x: 0, y: 0 },
    data: { kind: 'text', title: id, prompt: '' },
  }))
  const local = structuredClone(base)
  local.title = 'My title'
  local.nodes.reverse()
  const remote = structuredClone(base)
  remote.nodes = [remote.nodes[1], remote.nodes[0], remote.nodes[2]]
  expect(() => mergeStudioCloudDocument(base, local, remote)).toThrow()
  const resolved = mergeStudioCloudDocument(base, local, remote, 'remote')
  expect(resolved.nodes.map((node) => node.id)).toEqual(['b', 'a', 'c'])
  expect(resolved.title).toBe('My title')
})

test('different browser measurements cannot block a creative edit or drop the completed task', () => {
  const base = createStudioProject('Base', 'measurement-race')
  base.nodes = [
    {
      id: 'image',
      type: 'studio',
      position: { x: 0, y: 0 },
      measured: { width: 300, height: 180 },
      data: { kind: 'image', title: 'Image', prompt: '' },
    },
  ]
  const local = structuredClone(base)
  local.title = 'Local title'
  local.nodes[0].measured = { width: 300, height: 250 }
  local.nodes[0].selected = true
  const remote = structuredClone(base)
  remote.nodes[0].measured = { width: 300, height: 240 }
  remote.nodes[0].selected = false
  remote.nodes[0].data.mediaId = 'completed-result'
  const merged = mergeStudioCloudDocument(base, local, remote)
  expect(merged.title).toBe('Local title')
  expect(merged.nodes[0].data.mediaId).toBe('completed-result')
  expect(merged.nodes[0].measured?.height).toBe(250)
})

test('two authors editing the same prompt still require conflict resolution', () => {
  const base = createStudioProject('Base', 'prompt-race')
  base.nodes = [
    {
      id: 'image',
      type: 'studio',
      position: { x: 0, y: 0 },
      data: { kind: 'image', title: 'Image', prompt: 'old' },
    },
  ]
  const local = structuredClone(base)
  local.nodes[0].data.prompt = 'ours'
  const remote = structuredClone(base)
  remote.nodes[0].data.prompt = 'theirs'
  expect(() => mergeStudioCloudDocument(base, local, remote)).toThrow(
    'Concurrent project edit'
  )
})
