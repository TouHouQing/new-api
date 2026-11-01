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
  pinStudioAudioAnchorClip,
  reconcileStudioAudioAnchors,
} from '../studio-audio-anchors'
import {
  studioProductionSchema,
  splitStudioTimelineClip,
} from '../studio-production'
import { addStudioNode, createStudioProject } from '../workspace'

function fixture(kind: 'source' | 'clip' = 'source') {
  const project = addStudioNode(
    createStudioProject('Sound edit', 'sound-edits'),
    'video',
    'picture'
  )
  project.nodes[0].data = {
    ...project.nodes[0].data,
    mediaId: 'video',
    status: 'completed',
    selectedTakeId: 'pinned',
    takes: [
      {
        id: 'pinned',
        mediaId: 'video',
        prompt: '',
        status: 'completed',
        createdAt: '2026-10-18T00:00:00Z',
      },
      {
        id: 'other',
        mediaId: 'other-video',
        prompt: '',
        status: 'completed',
        createdAt: '2026-10-18T00:00:00Z',
      },
    ],
  }
  project.production = studioProductionSchema.parse({
    documentVersion: 2,
    timelineEdited: true,
    timeline: [
      {
        id: 'first',
        nodeId: 'picture',
        takeId: 'pinned',
        trimStart: 0,
        trimEnd: 10,
      },
      {
        id: 'second',
        nodeId: 'picture',
        takeId: 'pinned',
        trimStart: 0,
        trimEnd: 10,
      },
    ],
    audioTracks: [
      {
        id: 'sound',
        mediaId: 'voice',
        start: 1,
        offset: 12,
        duration: 6,
        anchorKind: kind,
        anchorClipId: 'second',
        anchorSourceStart: 2,
      },
      { id: 'music', mediaId: 'song', start: 3, offset: 0.2, volume: 0.4 },
    ],
  })
  return project
}

test('splitting a repeated Take carries sound into both exact child clips and preserves its audio-source phase', () => {
  const project = fixture()
  const timeline = project.production?.timeline || []
  const split = splitStudioTimelineClip(timeline[1], 5)
  const next = reconcileStudioAudioAnchors(
    project,
    [timeline[0], ...split],
    Object.fromEntries(split.map((part) => [part.id, 'second']))
  )
  expect(next.production?.audioTracks).toHaveLength(3)
  expect(next.production?.audioTracks[0]).toMatchObject({
    id: 'sound',
    anchorClipId: 'second',
    start: 1,
    offset: 12,
    duration: 3,
    anchorSourceStart: 2,
  })
  expect(next.production?.audioTracks[1]).toMatchObject({
    anchorClipId: split[1].id,
    start: 4,
    offset: 15,
    duration: 3,
    anchorSourceStart: 5,
  })
  expect(
    next.production?.audioTracks.every(
      (track) => track.anchorClipId !== 'first'
    )
  ).toBe(true)
  expect(next.production?.audioTracks[2]).toEqual(
    project.production?.audioTracks[1]
  )
  expect(project.production?.audioTracks[0].duration).toBe(6)
})

test('a sound wholly in the second split part is preserved and never inherited by another existing copy', () => {
  const project = fixture()
  if (project.production) {
    project.production.audioTracks[0] = {
      ...project.production.audioTracks[0],
      anchorSourceStart: 6,
      offset: 16,
      duration: 2,
    }
  }
  const timeline = project.production?.timeline || []
  const split = splitStudioTimelineClip(timeline[1], 5)
  const next = reconcileStudioAudioAnchors(
    project,
    [timeline[0], ...split],
    Object.fromEntries(split.map((part) => [part.id, 'second']))
  )
  expect(next.production?.audioTracks[0]).toMatchObject({
    anchorClipId: split[1].id,
    start: 1,
    offset: 16,
    duration: 2,
    anchorSourceStart: 6,
  })
})

test('trimming both ends adjusts audio-source start and duration while keeping project music fixed', () => {
  for (const kind of ['source', 'clip'] as const) {
    const project = fixture(kind)
    const timeline = project.production?.timeline || []
    const next = reconcileStudioAudioAnchors(project, [
      timeline[0],
      { ...timeline[1], trimStart: 3, trimEnd: 7 },
    ])
    expect(next.production?.audioTracks[0]).toMatchObject({
      start: 2,
      offset: 10,
      duration: 4,
      anchorSourceStart: kind === 'source' ? 3 : 0,
    })
    expect(next.production?.audioTracks[1]).toEqual(
      project.production?.audioTracks[1]
    )
  }
})

test('speed changes stretch source-bound sound with picture but preserve clip-local audio time', () => {
  for (const kind of ['source', 'clip'] as const) {
    const project = fixture(kind)
    const timeline = project.production?.timeline || []
    const next = reconcileStudioAudioAnchors(project, [
      timeline[0],
      { ...timeline[1], speed: 2 },
    ])
    expect(next.production?.audioTracks[0]).toMatchObject(
      kind === 'source'
        ? { start: 1, offset: 11, duration: 6, speed: 2, anchorSourceStart: 2 }
        : { start: 1, offset: 12, duration: 3, speed: 1, anchorSourceStart: 2 }
    )
  }
})

test('reordering and deletion move only the specified instance and remove its attached sound with it', () => {
  const project = fixture()
  const timeline = project.production?.timeline || []
  const reordered = reconcileStudioAudioAnchors(project, [
    timeline[1],
    timeline[0],
  ])
  expect(reordered.production?.audioTracks[0]).toMatchObject({
    offset: 2,
    anchorClipId: 'second',
    start: 1,
  })
  const deleted = reconcileStudioAudioAnchors(project, [timeline[0]])
  expect(deleted.production?.audioTracks).toEqual([
    project.production?.audioTracks[1],
  ])
})

test('missing origin, changed source, missing actual duration, locked attachments and excess fragments fail without mutation', () => {
  const project = fixture()
  const timeline = project.production?.timeline || []
  const before = JSON.stringify(project)
  expect(() =>
    reconcileStudioAudioAnchors(project, [
      timeline[0],
      { ...timeline[1], id: 'unknown' },
    ])
  ).toThrow('exact edit origin')
  expect(() =>
    reconcileStudioAudioAnchors(project, [
      timeline[0],
      { ...timeline[1], takeId: 'other' },
    ])
  ).toThrow('detaching')
  const unbounded = { ...timeline[1], trimEnd: undefined }
  expect(() =>
    reconcileStudioAudioAnchors(project, [timeline[0], unbounded])
  ).toThrow('actual media duration')
  expect(
    reconcileStudioAudioAnchors(
      project,
      [timeline[0], unbounded],
      {},
      { video: 10 }
    ).production?.audioTracks[0]
  ).toMatchObject({ offset: 12 })
  expect(JSON.stringify(project)).toBe(before)
  project.nodes[0].data.locked = true
  expect(() =>
    reconcileStudioAudioAnchors(project, [timeline[1], timeline[0]])
  ).toThrow('Unlock')
  project.nodes[0].data.locked = false
  if (project.production) {
    project.production.audioTracks.push(
      ...Array.from({ length: 98 }, (_, index) => ({
        id: `bed-${index}`,
        mediaId: 'song',
        start: 0,
        offset: 0,
        volume: 1,
      }))
    )
  }
  const split = splitStudioTimelineClip(timeline[1], 5)
  expect(() =>
    reconcileStudioAudioAnchors(
      project,
      [timeline[0], ...split],
      Object.fromEntries(split.map((part) => [part.id, 'second']))
    )
  ).toThrow('one hundred')
})

test('binding pins the current immutable media reference without changing the chosen node version or copying media', () => {
  const project = fixture()
  const node = project.nodes[0]
  node.data.takes = []
  node.data.selectedTakeId = undefined
  if (project.production) project.production.timeline[1].takeId = undefined
  const pinned = pinStudioAudioAnchorClip(project, 'second')
  expect(pinned.nodes[0].data.selectedTakeId).toBeUndefined()
  expect(pinned.nodes[0].data.takes).toHaveLength(1)
  expect(pinned.nodes[0].data.takes?.[0]).toMatchObject({
    mediaId: 'video',
    status: 'completed',
    sourceMode: 'upload',
  })
  expect(pinned.production?.timeline[1].takeId).toBe(
    pinned.nodes[0].data.takes?.[0].id
  )
  expect(project.nodes[0].data.takes).toHaveLength(0)
})

test('manual split copies reviewed reframe to its second exact child and removes deleted references', () => {
  const project = fixture()
  if (!project.production) throw new Error('fixture production missing')
  const ref = {
    analysisId: 'reviewed-track',
    sourceMediaId: 'video',
    sourceDigest: 'f'.repeat(64),
    width: 720,
    height: 1280,
  }
  project.production.reframes = { second: ref }
  const timeline = project.production.timeline
  const split = splitStudioTimelineClip(timeline[1], 5)
  const next = reconcileStudioAudioAnchors(
    project,
    [timeline[0], ...split],
    Object.fromEntries(split.map((part) => [part.id, 'second']))
  )
  expect(next.production?.reframes).toEqual({ second: ref, [split[1].id]: ref })
  expect(project.production.reframes).toEqual({ second: ref })
  const removed = reconcileStudioAudioAnchors(project, [timeline[0]])
  expect(removed.production?.reframes).toEqual({})
})

test('changing Take or source never inherits a previously reviewed reframe even for the same bytes', () => {
  const project = fixture()
  if (!project.production) throw new Error('fixture production missing')
  project.production.audioTracks = []
  project.production.reframes = {
    second: {
      analysisId: 'reviewed-track',
      sourceMediaId: 'video',
      sourceDigest: 'f'.repeat(64),
      width: 720,
      height: 1280,
    },
  }
  project.nodes[0].data.takes?.push({
    id: 'same-bytes-other-take',
    mediaId: 'video',
    status: 'completed',
    prompt: '',
    createdAt: '2026-10-18T00:00:00Z',
  })
  const timeline = project.production.timeline
  for (const takeId of ['other', 'same-bytes-other-take']) {
    const next = reconcileStudioAudioAnchors(project, [
      timeline[0],
      { ...timeline[1], takeId },
    ])
    expect(next.production?.reframes).toEqual({})
  }
})
