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

import type { StudioProject } from '../local-projects'
import {
  studioProductionSchema,
  studioSeriesVersionSchema,
} from '../studio-production'
import {
  applyStudioSeriesTranslation,
  createStudioSeriesTranslation,
  createStudioRegionalVersion,
  studioSeriesRenderPlan,
} from '../studio-series'
import {
  parseStudioSubtitleCues,
  serializeStudioSubtitleCues,
} from '../studio-subtitle-cues'
import {
  addStudioNode,
  createStudioProject,
  updateStudioNode,
} from '../workspace'

const subtitle = '1\n00:00:00,000 --> 00:00:01,000\nA --> B\n'
function project(): StudioProject & {
  production: ReturnType<typeof studioProductionSchema.parse>
} {
  let value = addStudioNode(
    createStudioProject('Series', 'series'),
    'video',
    'video'
  )
  value = updateStudioNode(value, 'video', {
    title: 'Episode source',
    mediaId: 'video-media',
    selectedTakeId: 'pinned',
    status: 'completed',
    takes: [
      {
        id: 'pinned',
        createdAt: '2026-10-06T00:00:00Z',
        prompt: 'Video',
        status: 'completed',
        mediaId: 'video-media',
      },
    ],
  })
  const variant = studioSeriesVersionSchema.parse({
    id: 'english',
    episodeId: 'episode',
    title: 'Episode · English',
    language: 'en',
    region: 'US',
    timeline: [{ id: 'clip', nodeId: 'video', takeId: 'pinned', trimEnd: 1 }],
    subtitles: subtitle,
  })
  return {
    ...value,
    production: {
      ...studioProductionSchema.parse({}),
      episodes: [
        { id: 'episode', title: 'Episode', synopsis: '', shotIds: [] },
      ],
      regionalVersions: [variant],
    },
  }
}

test('regional delivery uses pinned Takes and its own captions and audio without changing the original production', () => {
  const source = project()
  const plan = studioSeriesRenderPlan(
    source,
    source.production.regionalVersions[0]
  )
  expect(plan).toMatchObject({
    variant_id: 'english',
    delivery_label: 'Episode · English',
    skip_dialogue: true,
    subtitles: subtitle,
    node_id: '',
  })
  expect(plan.clips[0]).toMatchObject({
    take_id: 'pinned',
    media_id: 'video-media',
  })
  expect(source.production.timeline).toEqual([])
  expect(source.nodes[0].data.selectedTakeId).toBe('pinned')
})

test('translation drafts keep arrow dialogue and exact timing; changed timing or source prevents applying a draft', () => {
  const prepared = createStudioSeriesTranslation(
    project(),
    'english',
    'qwen3.5:9b'
  )
  expect(prepared.nodeIds).toHaveLength(1)
  let complete = updateStudioNode(prepared.project, prepared.nodeIds[0], {
    status: 'completed',
    outputText: '1\n00:00:00,000 --> 00:00:01,000\n甲 --> 乙\n',
  })
  const translated = applyStudioSeriesTranslation(complete, 'english')
  expect(
    parseStudioSubtitleCues(
      translated.production?.regionalVersions[0].subtitles || ''
    )
  ).toEqual([{ start: 0, end: 1, text: '甲 --> 乙' }])
  complete = updateStudioNode(complete, prepared.nodeIds[0], {
    outputText: '1\n00:00:00,000 --> 00:00:02,000\nChanged\n',
  })
  expect(() => applyStudioSeriesTranslation(complete, 'english')).toThrow(
    'timing'
  )
})

test('long subtitles are segmented and rejoined without dropping any cue text', () => {
  const source = project()
  const text = 'Long dialogue '.repeat(600)
  source.production.regionalVersions[0].subtitles = serializeStudioSubtitleCues(
    [{ start: 0, end: 1, text }]
  )
  let prepared = createStudioSeriesTranslation(source, 'english', 'qwen3.5:9b')
  expect(prepared.nodeIds.length).toBeGreaterThan(1)
  for (const chunk of prepared.project.production?.regionalVersions[0]
    .translationNodes || []) {
    prepared = {
      ...prepared,
      project: updateStudioNode(prepared.project, chunk.nodeId, {
        status: 'completed',
        outputText: chunk.source,
      }),
    }
  }
  const translated = applyStudioSeriesTranslation(prepared.project, 'english')
  const result = parseStudioSubtitleCues(
    translated.production?.regionalVersions[0].subtitles || ''
  )
  expect(result).toHaveLength(1)
  expect(result[0].text.replaceAll(/\s+/g, '')).toBe(
    text.replaceAll(/\s+/g, '')
  )
  expect(result[0]).toMatchObject({ start: 0, end: 1 })
})

test('regional media snapshots survive source node removal and selected Take changes', () => {
  const source = project()
  const version = {
    ...source.production.regionalVersions[0],
    timeline: source.production.regionalVersions[0].timeline.map((clip) => ({
      ...clip,
      sourceMediaId: 'video-media',
      sourceTitle: 'Archived episode source',
    })),
  }
  const removed = { ...source, nodes: [] }
  expect(studioSeriesRenderPlan(removed, version).clips[0]).toMatchObject({
    take_id: 'pinned',
    media_id: 'video-media',
  })
  expect(removed.nodes).toEqual([])
})

test('episode creation relocates global subtitle times and freezes source media', async () => {
  let source = project()
  source = {
    ...source,
    ...updateStudioNode(
      addStudioNode(source, 'video', 'second-video'),
      'second-video',
      {
        title: 'Second',
        mediaId: 'second-media',
        status: 'completed',
        selectedTakeId: 'second-take',
        takes: [
          {
            id: 'second-take',
            createdAt: '2026-10-06T00:00:00Z',
            prompt: '',
            status: 'completed',
            mediaId: 'second-media',
          },
        ],
      }
    ),
  }
  source.shots = [
    {
      id: 'second-shot',
      title: 'Second',
      textNodeId: 'second-text',
      imageNodeId: 'second-image',
      videoNodeId: 'second-video',
    },
  ]
  source.captionsText =
    '1\n00:00:00,000 --> 00:00:01,000\nIntro\n\n2\n00:00:01,000 --> 00:00:02,000\nSecond dialogue\n'
  source.production = studioProductionSchema.parse({
    ...source.production,
    episodes: [
      { id: 'episode', title: 'Second episode', shotIds: ['second-shot'] },
    ],
    timelineEdited: true,
    motionGraphics: [
      {
        id: 'opening-title',
        text: 'Episode two',
        start: 1.25,
        end: 1.75,
        x: 0.5,
        y: 0.5,
        font_size: 32,
        color: '#ffffff',
        animation: 'fade',
        bpm: 120,
      },
    ],
    timeline: [
      { id: 'first', nodeId: 'video', takeId: 'pinned', trimEnd: 1 },
      {
        id: 'second',
        nodeId: 'second-video',
        takeId: 'second-take',
        trimEnd: 1,
      },
    ],
  })
  const version = await createStudioRegionalVersion(
    source,
    'episode',
    'en',
    'US',
    async () => ({ duration: 1, has_video: true })
  )
  expect(version.timeline[0]).toMatchObject({
    sourceMediaId: 'second-media',
    sourceTitle: 'Second',
    takeId: 'second-take',
  })
  expect(parseStudioSubtitleCues(version.subtitles)).toEqual([
    { start: 0, end: 1, text: 'Second dialogue' },
  ])
  expect(version.motionGraphics[0]).toMatchObject({
    text: 'Episode two',
    start: 0.25,
    end: 0.75,
  })
  const stored = {
    ...source,
    production: { ...source.production, regionalVersions: [version] },
  }
  expect(studioSeriesRenderPlan(stored, version).motion_graphics).toEqual(
    version.motionGraphics
  )
  stored.production.motionGraphics = []
  expect(studioSeriesRenderPlan(stored, version).motion_graphics).toEqual(
    version.motionGraphics
  )
})
