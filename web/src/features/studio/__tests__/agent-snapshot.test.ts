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

import { studioAgentSnapshot } from '../studio-agent-bridge'
import { applyStudioCanvasOperations } from '../studio-canvas-commands'
import {
  createStudioProject,
  addStudioNode,
  updateStudioNode,
  recordStudioTake,
} from '../workspace'

test('Agent snapshots include saved group IDs and exact membership for later edits', () => {
  const p = applyStudioCanvasOperations(createStudioProject('Film', 'groups'), [
    { op: 'add_node', nodeType: 'text', id: 'a' },
    { op: 'add_node', nodeType: 'image', id: 'b' },
    { op: 'group_nodes', id: 'scene', title: 'Scene one', nodeIds: ['a', 'b'] },
  ])
  expect(
    studioAgentSnapshot(p, { text: [], image: [], groups: [] })
  ).toMatchObject({
    project: { canvas: { frames: [{ id: 'scene', nodeIds: ['a', 'b'] }] } },
  })
})

test('Agent snapshots expose bounded results and precise ports while excluding local blob URLs and request snapshots', () => {
  let project = addStudioNode(
    createStudioProject('Film', 'project'),
    'video',
    'video'
  )
  project = updateStudioNode(project, 'video', {
    pendingRequestSnapshot: 'private-request',
    outputUrl: 'blob:local-only',
    outputText: 'x'.repeat(5000),
  })
  project = recordStudioTake(project, 'video', {
    id: 'take',
    createdAt: '2026-09-28T00:00:00Z',
    prompt: 'private-take-prompt',
    status: 'completed',
    mediaId: 'local-media-key',
    requestSnapshot: 'private-request',
    outputUrl: 'blob:local-only',
    outputText: 'x'.repeat(5000),
  })
  const snapshot = studioAgentSnapshot(project, {
    text: ['text-model'],
    image: ['image-model'],
    groups: ['default'],
  })
  const encoded = JSON.stringify(snapshot)
  expect(encoded).not.toContain('private-request')
  expect(encoded).not.toContain('private-take-prompt')
  expect(encoded).not.toContain('blob:local-only')
  expect(encoded).not.toContain('local-media-key')
  expect(encoded).toContain('hasLocalMedia')
  expect(encoded).toContain('voiceover')
  expect(encoded).not.toContain('x'.repeat(4001))
})
