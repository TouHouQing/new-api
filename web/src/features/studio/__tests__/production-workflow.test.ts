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
import { assert, describe, expect, test } from 'vitest'

import { studioProjectSchema } from '../local-projects'
import { mergeStudioCloudDocument } from '../studio-cloud-merge'
import {
  studioProjectTimeline,
  studioProductionSchema,
  splitStudioTimelineClip,
  studioProjectRenderPlan,
  studioUnapprovedClips,
} from '../studio-production'
import {
  applyStudioScreenplay,
  allocateStudioShotDurations,
  planStudioScreenplayChange,
} from '../studio-screenplay'
import {
  studioTimelineSchedule,
  studioTimelineAudio,
} from '../studio-timeline-playback'
import {
  createStudioProject,
  addStudioNode,
  recordStudioTake,
  archiveStudioTake,
  archivableStudioTakeIds,
} from '../workspace'

test('delivery approval applies to the exact current footage and expires when its selected version changes', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'review'),
    'video',
    'video'
  )
  project.nodes[0].data.mediaId = 'first'
  project.nodes[0].data.selectedTakeId = 'take-one'
  project.production = {
    ...studioProductionSchema.parse({}),
    requireApproved: true,
    reviews: [
      {
        nodeId: 'video',
        takeId: 'take-one',
        mediaId: 'first',
        status: 'approved',
        reviewerId: 1,
        revision: 1,
        reviewedAt: new Date().toISOString(),
        note: '',
      },
    ],
  }
  expect(studioUnapprovedClips(project)).toHaveLength(0)
  project.nodes[0].data.mediaId = 'second'
  project.nodes[0].data.selectedTakeId = 'take-two'
  expect(studioUnapprovedClips(project).map((clip) => clip.nodeId)).toEqual([
    'video',
  ])
})

describe('persistent production edits', () => {
  test('a shot-only script revision preserves manual character design and literal dialogue identifiers', () => {
    const source = {
      title: 'Film',
      brief: '',
      characters: [{ id: 'hero', title: 'Hero', description: 'Blue jacket' }],
      shots: [
        {
          id: 'one',
          title: 'Shot',
          text: 'stable-5',
          imagePrompt: '',
          videoPrompt: '',
          camera: 'Wide',
          characterIds: ['hero'],
        },
      ],
    }
    let index = 0
    const project = applyStudioScreenplay(
      createStudioProject('Film', 'film'),
      source,
      () => `stable-${++index}`
    )
    assert(project.assets)
    assert(project.shots)
    const textNode = project.nodes.find(
      (node) => node.id === project.shots?.[0].textNodeId
    )
    assert(textNode)
    project.assets[0].profile = {
      appearance: 'Custom makeup',
      wardrobe: 'Green cape',
    }
    project.assets[0].prompt = 'Manual character design'
    project.shots[0].dialogue = 'Manual dialogue'
    textNode.data.outputVideoPrompt = 'Manual video direction'
    project.assets.push({
      ...project.assets[0],
      id: 'manual-anchor',
      title: 'Manual reference',
    })
    textNode.data.assetIds = [project.assets[0].id, 'manual-anchor']
    const revised = applyStudioScreenplay(
      project,
      { ...source, shots: [{ ...source.shots[0], camera: 'Close-up' }] },
      () => `stable-${++index}`
    )
    expect(revised.assets?.[0].profile).toEqual(project.assets[0].profile)
    expect(revised.assets?.[0].prompt).toBe('Manual character design')
    expect(revised.shots?.[0].dialogue).toBe('Manual dialogue')
    expect(
      revised.nodes.find((node) => node.id === revised.shots?.[0].textNodeId)
        ?.data.outputVideoPrompt
    ).toBe('Manual video direction')
    expect(
      revised.nodes.find((node) => node.id === textNode.id)?.data.assetIds
    ).toEqual(textNode.data.assetIds)
    expect(
      revised.nodes.find((node) => node.id === revised.shots?.[0].textNodeId)
        ?.data.outputText
    ).toBe('stable-5')
  })
  test('duration planning exactly fits the target while preserving at least one second per shot', () => {
    const source = {
      title: 'Film',
      brief: '',
      shots: [1, 2, 3].map((seconds) => ({
        id: `shot-${seconds}`,
        title: 'Shot',
        text: '',
        imagePrompt: '',
        videoPrompt: '',
        seconds,
      })),
    }
    const result = allocateStudioShotDurations(source, 10)
    expect(result.shots.map((shot) => shot.seconds)).toEqual([2, 3, 5])
    expect(() => allocateStudioShotDurations(source, 2)).toThrow('one second')
  })
  test('only the shot using a changed recurring asset is included in a revision plan', () => {
    const source = {
      title: 'Film',
      brief: '',
      characters: [{ id: 'hero', title: 'Hero', description: 'Blue jacket' }],
      shots: [1, 2].map((index) => ({
        id: `shot-${index}`,
        title: 'Shot',
        text: '',
        imagePrompt: '',
        videoPrompt: '',
        characterIds: index === 1 ? ['hero'] : [],
      })),
    }
    let id = 0
    const project = applyStudioScreenplay(
      createStudioProject('Film', 'film'),
      source,
      () => `id-${++id}`
    )
    expect(
      planStudioScreenplayChange(project, {
        ...source,
        characters: [{ ...source.characters[0], description: 'Red jacket' }],
      }).shotIds
    ).toEqual(['shot-1'])
  })
  test('live playback uses actual media duration, trim and speed and places narration on the same clock', () => {
    const project = addStudioNode(
      createStudioProject('Film', 'film'),
      'video',
      'clip-source'
    )
    project.nodes[0].data.mediaId = 'video'
    project.production = studioProductionSchema.parse({
      timelineEdited: true,
      timeline: [
        {
          id: 'clip',
          nodeId: 'clip-source',
          trimStart: 1,
          trimEnd: 5,
          speed: 2,
        },
      ],
      audioTracks: [{ id: 'voice', mediaId: 'voice', offset: 0.5, start: 1 }],
    })
    expect(studioTimelineSchedule(project, { video: 3 })[0]).toMatchObject({
      start: 0,
      end: 1,
      duration: 1,
    })
    expect(studioTimelineAudio(project)[0]).toMatchObject({
      offset: 0.5,
      start: 1,
    })
  })
  test('revising an imported script retains shot identity, selected media, narration and edited timeline', () => {
    const screenplay = {
      title: 'Film',
      brief: 'Arrival',
      shots: [
        {
          id: 'arrival',
          title: 'Arrival',
          text: 'Walk',
          imagePrompt: 'Wide shot',
          videoPrompt: 'Walking',
          seconds: 5,
        },
      ],
    }
    let id = 0
    const original = applyStudioScreenplay(
      createStudioProject('Film', 'film'),
      screenplay,
      () => `stable-${++id}`
    )
    assert(original.shots)
    assert(original.production)
    const shot = original.shots[0]
    const videoNode = original.nodes.find(
      (node) => node.id === shot.videoNodeId
    )
    assert(videoNode)
    shot.shotVoiceoverMediaId = 'narration'
    videoNode.data.mediaId = 'old-video'
    original.production.timelineEdited = true
    original.production.timeline = [
      {
        id: 'clip',
        nodeId: shot.videoNodeId,
        trimStart: 1,
        speed: 1,
        volume: 1,
        muted: false,
        caption: '',
        captionOffset: 0,
        captionDuration: 0,
        fadeIn: 0,
        fadeOut: 0,
      },
    ]
    const revised = applyStudioScreenplay(
      original,
      {
        ...screenplay,
        shots: [{ ...screenplay.shots[0], imagePrompt: 'Close-up' }],
      },
      () => `stable-${++id}`
    )
    expect(revised.shots).toHaveLength(1)
    expect(revised.shots?.[0].id).toBe(shot.id)
    expect(revised.shots?.[0].shotVoiceoverMediaId).toBe('narration')
    expect(
      revised.nodes.find((node) => node.id === shot.videoNodeId)?.data.mediaId
    ).toBe('old-video')
    expect(revised.production?.timeline).toEqual(original.production.timeline)
    expect(revised.production?.changes[0].nodeIds).toContain(shot.videoNodeId)
  })
  test('archiving reclaims an unused Take while preserving selected and pinned results', () => {
    let project = addStudioNode(
      createStudioProject('Film', 'film'),
      'video',
      'video'
    )
    for (const id of ['unused', 'pinned', 'selected']) {
      project = recordStudioTake(project, 'video', {
        id,
        prompt: '',
        status: 'completed',
        createdAt: '2026-10-04T00:00:00Z',
        mediaId: id,
      })
    }
    project.production = studioProductionSchema.parse({
      timeline: [{ id: 'clip', nodeId: 'video', takeId: 'pinned' }],
    })
    expect(archivableStudioTakeIds(project, 'video')).toEqual(['unused'])
    expect(() => archiveStudioTake(project, 'video', 'pinned')).toThrow(
      'pinned'
    )
    const archived = archiveStudioTake(project, 'video', 'unused')
    expect(archived.nodes[0].data.takes?.map((take) => take.id)).toEqual([
      'pinned',
      'selected',
    ])
    expect(archived.nodes[0].data.mediaId).toBe('selected')
  })
  test('merges human prompt edits with a completed background Take without losing either', () => {
    const base = addStudioNode(
      createStudioProject('Film', 'film'),
      'video',
      'clip'
    )
    const local = {
      ...base,
      nodes: base.nodes.map((node) => ({
        ...node,
        data: { ...node.data, prompt: 'A revised scene' },
      })),
    }
    const remote = recordStudioTake(base, 'clip', {
      id: 'completed',
      createdAt: '2026-10-03T00:00:00Z',
      prompt: '',
      status: 'completed',
      mediaId: 'durable-result',
    })
    const merged = mergeStudioCloudDocument(base, local, remote)
    expect(merged.nodes[0].data.prompt).toBe('A revised scene')
    expect(merged.nodes[0].data.mediaId).toBe('durable-result')
    expect(merged.nodes[0].data.takes?.[0].id).toBe('completed')
  })
  test('rejects concurrent edits to the same creative field', () => {
    const base = createStudioProject('Film', 'film')
    expect(() =>
      mergeStudioCloudDocument(
        base,
        { ...base, title: 'Our title' },
        { ...base, title: 'Their title' }
      )
    ).toThrow('Concurrent project edit')
  })
  test('an intentionally empty timeline remains empty after removing the last clip', () => {
    const project = addStudioNode(
      createStudioProject('Film', 'film'),
      'video',
      'clip'
    )
    expect(studioProjectTimeline(project)).toHaveLength(1)
    expect(
      studioProjectTimeline({
        ...project,
        production: studioProductionSchema.parse({
          timelineEdited: true,
          timeline: [],
        }),
      })
    ).toEqual([])
  })
  test('split clips share their exact Take and retain adjacent source ranges', () => {
    const project = addStudioNode(
      createStudioProject('Film', 'film'),
      'video',
      'clip'
    )
    const clip = {
      ...studioProjectTimeline(project)[0],
      takeId: 'pinned',
      trimStart: 1,
      trimEnd: 4,
    }
    const [first, second] = splitStudioTimelineClip(clip, 2)
    expect([
      first.trimStart,
      first.trimEnd,
      second.trimStart,
      second.trimEnd,
    ]).toEqual([1, 2, 2, 4])
    expect(second.takeId).toBe('pinned')
    expect(() => splitStudioTimelineClip(clip, 4)).toThrow()
    expect(() =>
      studioProjectRenderPlan({
        ...project,
        production: studioProductionSchema.parse({ timeline: [clip] }),
      })
    ).toThrow('pinned Take')
  })
  test('imports connected shots, recurring character identity, scenes and prop bindings atomically', () => {
    const input = {
      title: 'Courier',
      brief: 'Delivery at sunrise',
      characters: [
        {
          id: 'hero',
          title: 'Courier',
          description: 'Blue jacket',
          voice: 'Calm',
        },
      ],
      scenes: [{ id: 'street', title: 'Street', description: 'Sunrise' }],
      props: [{ id: 'box', title: 'Red box', description: 'Small' }],
      shots: [
        {
          id: 'arrival',
          title: 'Arrival',
          sceneId: 'street',
          characterIds: ['hero'],
          propIds: ['box'],
          text: 'Arrives',
          imagePrompt: 'First frame',
          videoPrompt: 'Walking',
          seconds: 2,
        },
      ],
    }
    let index = 0
    const initial = createStudioProject('Film', 'film')
    const imported = applyStudioScreenplay(
      initial,
      input,
      () => `item-${++index}`
    )
    expect(studioProjectSchema.safeParse(imported).success).toBe(true)
    expect(imported.shots).toHaveLength(1)
    expect(imported.nodes).toHaveLength(5)
    expect(
      imported.assets?.find((asset) => asset.kind === 'character')?.profile
        ?.voice
    ).toBe('Calm')
    expect(imported.production?.scenes[0].shotIds).toEqual([
      imported.shots?.[0].id,
    ])
    expect(
      imported.production?.assetBindings[imported.shots?.[0].id || '']
    ).toEqual([imported.production?.props[0].id])
    expect(initial.nodes).toHaveLength(0)
    expect(() =>
      applyStudioScreenplay(initial, {
        ...input,
        shots: [{ ...input.shots[0], sceneId: 'missing' }],
      })
    ).toThrow('unknown')
  })
})
