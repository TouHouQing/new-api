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

import {
  applyStudioCanvasOperations,
  StudioCanvasHistory,
} from '../studio-canvas-commands'
import { createStudioProject, recordStudioTake } from '../workspace'

test('undoing a move retains a task that completed after the history checkpoint', () => {
  const initial = applyStudioCanvasOperations(
    createStudioProject('Film', 'project'),
    [{ op: 'add_node', nodeType: 'video', id: 'video', model: 'video-model' }]
  )
  const history = new StudioCanvasHistory()
  history.capture(initial)
  let current = applyStudioCanvasOperations(initial, [
    {
      op: 'move_nodes',
      nodes: [{ id: 'video', position: { x: 500, y: 300 } }],
    },
  ])
  current = recordStudioTake(current, 'video', {
    id: 'settled',
    createdAt: '2026-09-28T00:00:00Z',
    prompt: '',
    status: 'completed',
    taskId: 'billed-task',
    mediaId: 'result',
    chargedQuota: 12,
  })

  const undone = history.undo(current)
  expect(undone.nodes[0].position).toEqual(initial.nodes[0].position)
  expect(undone.nodes[0].data).toMatchObject({
    status: 'completed',
    taskId: 'billed-task',
    mediaId: 'result',
    selectedTakeId: 'settled',
  })
  expect(undone.nodes[0].data.takes?.[0].chargedQuota).toBe(12)
  const redone = history.redo(undone)
  expect(redone.nodes[0].position).toEqual({ x: 500, y: 300 })
  expect(redone.nodes[0].data.taskId).toBe('billed-task')
})

test('undo cannot erase a newly created node with an active task', () => {
  const initial = createStudioProject('Film', 'project')
  const history = new StudioCanvasHistory()
  history.capture(initial)
  let current = applyStudioCanvasOperations(initial, [
    { op: 'add_node', nodeType: 'video', id: 'video' },
  ])
  current = recordStudioTake(current, 'video', {
    id: 'pending',
    createdAt: '2026-09-28T00:00:00Z',
    prompt: '',
    status: 'queued',
    taskId: 'billed-task',
  })
  expect(() => history.undo(current)).toThrow('active')
  expect(history.canUndo).toBe(true)
  expect(history.canRedo).toBe(false)
})

test('undoing deletion restores completed media references without dropping result history', () => {
  let current = applyStudioCanvasOperations(
    createStudioProject('Film', 'project'),
    [{ op: 'add_node', nodeType: 'image', id: 'image' }]
  )
  current = recordStudioTake(current, 'image', {
    id: 'uploaded',
    createdAt: '2026-09-28T00:00:00Z',
    prompt: '',
    status: 'completed',
    mediaId: 'local-image',
  })
  const history = new StudioCanvasHistory()
  history.capture(current)
  const removed = applyStudioCanvasOperations(current, [
    { op: 'remove_nodes', nodeIds: ['image'] },
  ])
  expect(removed.nodes).toHaveLength(0)
  const restored = history.undo(removed)
  expect(restored.nodes[0].data.mediaId).toBe('local-image')
  expect(restored.nodes[0].data.takes?.[0].id).toBe('uploaded')
})
