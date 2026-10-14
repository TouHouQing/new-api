/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
For commercial licensing, please contact support@quantumnous.com
*/
import { expect, test } from 'vitest'

import { studioProjectSchema } from '../local-projects'
import {
  applyStudioCanvasOperations,
  StudioCanvasHistory,
} from '../studio-canvas-commands'
import { planStudioFrameChanges } from '../studio-canvas-frames'
import { createStudioProject } from '../workspace'

function grouped() {
  return applyStudioCanvasOperations(createStudioProject('Film', 'film'), [
    { op: 'add_node', nodeType: 'text', id: 'a', position: { x: 100, y: 100 } },
    {
      op: 'add_node',
      nodeType: 'image',
      id: 'b',
      position: { x: 500, y: 100 },
    },
    { op: 'connect', source: 'a', target: 'b' },
    { op: 'group_nodes', id: 'frame', title: 'Scene one', nodeIds: ['a', 'b'] },
  ])
}
test('initial frame measurement does not enqueue a save or reset the debounce', () => {
  const p = grouped(),
    frame = p.canvas?.frames?.[0]
  if (!frame) throw new Error('Frame fixture missing')
  expect(
    planStudioFrameChanges(p, [
      {
        type: 'dimensions',
        id: frame.id,
        dimensions: { width: frame.width, height: frame.height },
      },
    ])
  ).toEqual({ nodeChanges: [], operations: [] })
})
test('drag notifications move selected members once when their frame moves', () => {
  const p = grouped(),
    frame = p.canvas?.frames?.[0]
  if (!frame) throw new Error('Frame fixture missing')
  const batch = planStudioFrameChanges(p, [
    {
      type: 'position',
      id: frame.id,
      position: { x: frame.x + 100, y: frame.y + 50 },
    },
    ...p.nodes.map((n) => ({
      type: 'position' as const,
      id: n.id,
      position: { x: n.position.x + 100, y: n.position.y + 50 },
    })),
  ])
  expect(batch.nodeChanges).toEqual([])
  const result = applyStudioCanvasOperations(p, batch.operations)
  expect(result.nodes.map((n) => n.position)).toEqual([
    { x: 200, y: 150 },
    { x: 600, y: 150 },
  ])
})
test('grouping persists membership without creating an executable node', () => {
  const p = studioProjectSchema.parse(grouped())
  expect(p.nodes).toHaveLength(2)
  expect(p.canvas?.frames?.[0]).toMatchObject({
    id: 'frame',
    title: 'Scene one',
    nodeIds: ['a', 'b'],
  })
  expect(p.edges).toHaveLength(1)
})
test('moving a frame translates members and undo restores both positions', () => {
  const p = grouped(),
    f = p.canvas?.frames?.[0],
    history = new StudioCanvasHistory()
  if (!f) throw new Error('Group fixture is unavailable')
  history.capture(p)
  const moved = applyStudioCanvasOperations(p, [
    {
      op: 'move_frame',
      frameId: f.id,
      position: { x: f.x + 120, y: f.y + 50 },
    },
  ])
  expect(moved.nodes.map((n) => n.position)).toEqual([
    { x: 220, y: 150 },
    { x: 620, y: 150 },
  ])
  const undone = history.undo(moved)
  expect(undone.canvas?.frames).toEqual(p.canvas?.frames)
  expect(undone.nodes.map((n) => n.position)).toEqual(
    p.nodes.map((n) => n.position)
  )
  expect(history.redo(undone).canvas?.frames).toEqual(moved.canvas?.frames)
})
test('copying every member duplicates its frame and internal edges', () => {
  const p = grouped()
  let i = 0
  const copy = applyStudioCanvasOperations(
    p,
    [{ op: 'duplicate', nodeIds: ['a', 'b'] }],
    () => `copy-${++i}`
  )
  expect(copy.canvas?.frames).toHaveLength(2)
  expect(copy.canvas?.frames?.[1].nodeIds).toEqual(
    copy.nodes.slice(2).map((n) => n.id)
  )
  expect(copy.edges).toHaveLength(2)
  const partial = applyStudioCanvasOperations(p, [
    { op: 'duplicate', nodeIds: ['a'] },
  ])
  expect(partial.canvas?.frames).toHaveLength(1)
})

test('duplicating creative notes and region drafts keeps their editable configuration', () => {
  const p = grouped()
  p.nodes[0].data = {
    ...p.nodes[0].data,
    purpose: 'note',
    outputText: 'Walk slowly',
    labelColor: '#112233',
    rating: 4,
  }
  p.nodes[1].data = {
    ...p.nodes[1].data,
    model: 'flux.2-klein-4b',
    visualPresetIds: ['watercolor'],
    reworkRegion: {
      sourceMediaId: 'original',
      x: 300,
      y: 70,
      width: 140,
      height: 220,
    },
  }
  const copy = applyStudioCanvasOperations(p, [
    { op: 'duplicate', nodeIds: ['a', 'b'] },
  ])
  expect(copy.nodes[2].data).toMatchObject({
    outputText: 'Walk slowly',
    labelColor: '#112233',
    rating: 4,
  })
  expect(copy.nodes[3].data.reworkRegion).toEqual(p.nodes[1].data.reworkRegion)
  expect(copy.nodes[3].data.reworkRegion).not.toBe(p.nodes[1].data.reworkRegion)
  expect(copy.nodes[3].data.visualPresetIds).toEqual(['watercolor'])
  expect(copy.nodes[3].data.takes).toBeUndefined()
})
test('regrouping removes previous membership and deleting its last member removes the frame', () => {
  const p = applyStudioCanvasOperations(grouped(), [
    {
      op: 'group_nodes',
      id: 'replacement',
      title: 'New group',
      nodeIds: ['a', 'b'],
    },
  ])
  expect(p.canvas?.frames?.map((f) => f.id)).toEqual(['replacement'])
  const removed = applyStudioCanvasOperations(p, [
    { op: 'remove_nodes', nodeIds: ['a', 'b'] },
  ])
  expect(removed.canvas?.frames).toEqual([])
})
test('ungroup keeps media nodes and edges intact and locked members block a group move', () => {
  const p = grouped()
  const ungrouped = applyStudioCanvasOperations(p, [
    { op: 'ungroup_nodes', frameIds: ['frame'] },
  ])
  expect(ungrouped.nodes).toEqual(p.nodes)
  expect(ungrouped.edges).toEqual(p.edges)
  expect(ungrouped.canvas?.frames).toEqual([])
  const locked = applyStudioCanvasOperations(p, [
    { op: 'update_node', nodeId: 'a', patch: { locked: true } },
  ])
  expect(() =>
    applyStudioCanvasOperations(locked, [
      { op: 'move_frame', frameId: 'frame', position: { x: 0, y: 0 } },
    ])
  ).toThrow('Unlock')
})
test('invalid, duplicate and missing group members fail before saving', () => {
  const p = grouped()
  for (const nodeIds of [
    ['a', 'a'],
    ['a', 'missing'],
  ]) {
    expect(() =>
      applyStudioCanvasOperations(p, [{ op: 'group_nodes', nodeIds }])
    ).toThrow()
  }
  expect(() =>
    studioProjectSchema.parse({
      ...p,
      canvas: { frames: [{ ...p.canvas?.frames?.[0], nodeIds: ['missing'] }] },
    })
  ).toThrow()
})
