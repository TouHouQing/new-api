/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { act, renderHook } from '@testing-library/react'
import { assert, expect, test, vi } from 'vitest'

import { studioCloudRequest } from '../studio-cloud'
import { studioProductionSchema } from '../studio-production'
import {
  applyStudioEditWithUndo,
  studioTimelineEdit,
  studioUndoTimelineEdit,
  useStudioTimelineHistory,
} from '../studio-timeline-history'
import { addStudioNode, createStudioProject } from '../workspace'

vi.mock('../studio-cloud', () => ({ studioCloudRequest: vi.fn() }))

function fixture() {
  const before = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'video'
  )
  before.nodes[0].data.mediaId = 'source'
  before.soundtrackVolume = 1
  before.captionsText = '1\n00:00:00,000 --> 00:00:05,000\nOriginal words\n'
  before.production = studioProductionSchema.parse({
    timelineEdited: true,
    timeline: [{ id: 'clip', nodeId: 'video', trimStart: 0, trimEnd: 10 }],
    audioTracks: [
      { id: 'music', mediaId: 'music', start: 0, offset: 4, duration: 5 },
    ],
    motionGraphics: [
      {
        id: 'brand',
        text: 'Studio',
        start: 0,
        end: 10,
        x: 0.5,
        y: 0.5,
        font_size: 32,
        color: '#ffffff',
        animation: 'fade',
        bpm: 120,
      },
    ],
    reframes: {
      clip: {
        analysisId: 'track',
        sourceMediaId: 'source',
        sourceDigest: 'a'.repeat(64),
        width: 720,
        height: 1280,
      },
    },
  })
  const after = structuredClone(before)
  assert(after.production)
  after.production.timeline[0].trimStart = 1
  after.production.audioTracks[0].offset = 3
  after.production.motionGraphics[0].end = 9
  after.production.reframes = {}
  after.captionsText = '1\n00:00:00,000 --> 00:00:04,000\nOriginal words\n'
  return {
    before: { ...before, production: before.production },
    after: { ...after, production: after.production },
  }
}

test('undo restores remapped media clocks and graphics while preserving a new Take and independent title/music changes', () => {
  const { before, after } = fixture()
  const current = structuredClone(after)
  current.title = 'A later title'
  current.soundtrackVolume = 0.25
  current.nodes[0].data.mediaId = 'later-candidate'
  const originalCurrent = structuredClone(current)
  const undone = studioUndoTimelineEdit(
    current,
    studioTimelineEdit(before, after)
  )
  expect(undone.production?.timeline).toEqual(before.production?.timeline)
  expect(undone.production?.audioTracks).toEqual(before.production?.audioTracks)
  expect(undone.production?.motionGraphics).toEqual(
    before.production?.motionGraphics
  )
  expect(undone.production?.reframes).toEqual(before.production?.reframes)
  expect(undone.captionsText).toBe(before.captionsText)
  expect(undone.title).toBe('A later title')
  expect(undone.soundtrackVolume).toBe(0.25)
  expect(undone.nodes).toEqual(current.nodes)
  expect(current).toEqual(originalCurrent)
})

test('a later conflicting clip edit and a different project cannot be overwritten by undo', () => {
  const { before, after } = fixture()
  const edit = studioTimelineEdit(before, after)
  const conflicting = structuredClone(after)
  conflicting.production.timeline[0].trimEnd = 8
  expect(() => studioUndoTimelineEdit(conflicting, edit)).toThrow(
    'timeline changed'
  )
  expect(() =>
    studioUndoTimelineEdit({ ...after, id: 'other-film' }, edit)
  ).toThrow('timeline changed')
  expect(conflicting.production?.timeline[0].trimEnd).toBe(8)
})

test('history freezes snapshots and compares field values independently of JSON key order', () => {
  const { before, after } = fixture()
  const edit = studioTimelineEdit(before, after)
  const reordered = structuredClone(after)
  const clip = reordered.production.timeline[0]
  reordered.production.timeline[0] = Object.fromEntries(
    Object.entries(clip).reverse()
  ) as typeof clip
  before.production.timeline[0].trimEnd = 2
  expect(
    studioUndoTimelineEdit(reordered, edit).production?.timeline[0].trimEnd
  ).toBe(10)
})

test('the shared hook bounds history, supports sequential undo, and rejects late results after a user or project switch', () => {
  const { before, after } = fixture()
  const { result, rerender } = renderHook(
    ({ user, project }) => useStudioTimelineHistory(user, project),
    { initialProps: { user: 13, project: 'film' } }
  )
  act(() => {
    for (let i = 0; i < 25; i++) result.current.remember(before, after)
  })
  expect(result.current.edits).toHaveLength(20)
  act(() => result.current.pop())
  expect(result.current.edits).toHaveLength(19)
  const late = result.current.remember
  rerender({ user: 17, project: 'film' })
  expect(result.current.edits).toHaveLength(0)
  act(() => late(before, after))
  expect(result.current.edits).toHaveLength(0)
  act(() => result.current.remember(before, after))
  expect(result.current.edits).toHaveLength(1)
  rerender({ user: 17, project: 'another' })
  expect(result.current.edits).toHaveLength(0)
})

test('a successful server edit records the actual before/after documents and a failed commit creates no undo entry', async () => {
  const { before, after } = fixture()
  const request = vi.mocked(studioCloudRequest)
  request.mockReset()
  const history = { remember: vi.fn() }
  request
    .mockResolvedValueOnce({ document: before, revision: 5 })
    .mockResolvedValueOnce({
      project: { document: after, revision: 6 },
      applied_revision: 6,
    })
  await applyStudioEditWithUndo(
    '/projects/film',
    { id: 'plan', revision: 5 },
    history
  )
  expect(history.remember).toHaveBeenCalledWith(before, after)
  expect(request).toHaveBeenNthCalledWith(
    2,
    '/projects/film/edit-plans/plan/apply',
    'POST',
    { revision: 5 }
  )
  history.remember.mockClear()
  request
    .mockResolvedValueOnce({ document: before, revision: 6 })
    .mockRejectedValueOnce(new Error('revision conflict'))
  await expect(
    applyStudioEditWithUndo(
      '/projects/film',
      { id: 'stale', revision: 5 },
      history
    )
  ).rejects.toThrow('revision conflict')
  expect(history.remember).not.toHaveBeenCalled()
})
