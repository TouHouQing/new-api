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
import i18next from 'i18next'
import { expect, test } from 'vitest'

import zh from '@/i18n/locales/zh.json'

import { isValidStudioConnection } from '../canvas-flow'
import {
  buildStudioVideoModel,
  buildStudioVideoRequest,
} from '../model-profiles'
import {
  studioProductionSchema,
  studioProjectRenderPlan,
  studioRenderMatchesProject,
} from '../studio-production'
import { applyStudioReworkRange, prepareStudioRework } from '../studio-rework'
import {
  studioTimelineAudio,
  studioTimelineSchedule,
} from '../studio-timeline-playback'
import {
  addStudioNode,
  addStudioShot,
  createStudioProject,
  recordStudioTake,
} from '../workspace'

test('a local region edit keeps the selected aspect ratio within model dimensions', () => {
  const p = addStudioNode(
    createStudioProject('Film', 'region-aspect'),
    'image',
    'source'
  )
  p.nodes[0].data = {
    ...p.nodes[0].data,
    model: 'flux.2-klein-4b',
    mediaId: 'source-image',
    imageSize: '512x320',
  }
  const next = prepareStudioRework(
    p,
    'source',
    'rework',
    'Make the lantern green',
    'region',
    { x: 300, y: 70, width: 140, height: 220, start: 0, end: 0 }
  )
  expect(next.nodes[1].data.imageSize).toBe('144x224')
  expect(next.nodes[0].data.imageSize).toBe('512x320')
  const large = prepareStudioRework(
    p,
    'source',
    'large',
    'Edit the detail',
    'region',
    { x: 0, y: 0, width: 2048, height: 4096, start: 0, end: 0 }
  )
  expect(large.nodes[1].data.imageSize).toBe('512x1024')
  expect(() =>
    prepareStudioRework(p, 'source', 'invalid', 'Edit', 'region', {
      x: 0,
      y: 0,
      width: Number.NaN,
      height: 220,
      start: 0,
      end: 0,
    })
  ).toThrow('valid image region')
})

test.each([
  ['angle', '调整相机角度', 'image'],
  ['light', '调整光线', 'image'],
  ['region', '编辑单个图像区域', 'image'],
  ['range', '重新拍摄某段视频间隔', 'video'],
] as const)(
  'a %s rework uses the visible translated purpose and retains source provenance',
  async (mode, label, kind) => {
    const language = i18next.language
    i18next.addResourceBundle('zh', 'translation', zh.translation)
    await i18next.changeLanguage('zh')
    try {
      const project = addStudioNode(
        createStudioProject('Film', 'rework-title'),
        kind,
        'source'
      )
      project.nodes[0].data = {
        ...project.nodes[0].data,
        title: '原始素材',
        mediaId: 'original',
        model: kind === 'image' ? 'flux' : 'wan',
        selectedTakeId: 'original-take',
      }
      const next = prepareStudioRework(
        project,
        'source',
        'replacement',
        '调整背景',
        mode,
        { start: 0, end: 1, x: 0, y: 0, width: 128, height: 128 }
      )
      expect(next.nodes[1].data.title).toBe(`原始素材 · ${label}`)
      expect(next.nodes[1].data.derivedFrom).toMatchObject({
        nodeId: 'source',
        mediaId: 'original',
        takeId: 'original-take',
        action: mode,
      })
      expect(next.nodes[0].data.mediaId).toBe('original')
    } finally {
      await i18next.changeLanguage(language)
    }
  }
)

test('last-frame roles stay distinct and unsupported models reject them before inference', () => {
  const settings = {
    prompt: 'A courier moves',
    seconds: 5,
    resolution: '720p',
    ratio: '16:9',
    imageReferences: [
      { url: 'https://example.org/first.png', role: 'first_frame' as const },
      { url: 'https://example.org/last.png', role: 'last_frame' as const },
    ],
  }
  const request = buildStudioVideoRequest(
    buildStudioVideoModel('seedance-2', 'seedance-2'),
    settings
  )
  expect(request.metadata.content?.map((reference) => reference.role)).toEqual([
    'first_frame',
    'last_frame',
  ])
  expect(request.images).toBeUndefined()
  expect(() =>
    buildStudioVideoRequest(
      buildStudioVideoModel('wan2.2-ti2v-5b', 'generic'),
      settings
    )
  ).toThrow(/last-frame/)
  const project = addStudioNode(
    addStudioNode(
      addStudioNode(createStudioProject('Film', 'film'), 'image', 'a'),
      'image',
      'b'
    ),
    'video',
    'video'
  )
  const edges = [
    {
      id: 'tail',
      source: 'a',
      target: 'video',
      sourceHandle: 'image',
      targetHandle: 'last_frame',
    },
  ]
  expect(
    isValidStudioConnection(
      project.nodes,
      edges,
      'b',
      'video',
      'image',
      'last_frame'
    )
  ).toBe(false)
})

test('a timed rework replaces only its interval, retaining narration, captions and source Take', () => {
  let project = addStudioShot(
    createStudioProject('Film', 'film'),
    'shot',
    { text: 'text', image: 'image', video: 'source' },
    'Opening'
  )
  const source = project.nodes.find((node) => node.id === 'source')
  if (!source) throw new Error('Source video node missing')
  source.data.model = 'wan2.2-ti2v-5b'
  project = recordStudioTake(project, 'source', {
    id: 'original',
    createdAt: '2026-10-05T00:00:00Z',
    prompt: '',
    model: 'wan2.2-ti2v-5b',
    mediaId: 'original-media',
    status: 'completed',
  })
  project.voiceoverMediaId = 'narration'
  project.production = {
    ...studioProductionSchema.parse({}),
    timelineEdited: true,
    timeline: [
      {
        id: 'original-clip',
        nodeId: 'source',
        trimStart: 0,
        trimEnd: 5,
        speed: 1,
        volume: 1,
        muted: false,
        caption: 'Keep this caption',
        captionOffset: 0,
        captionDuration: 5,
        fadeIn: 0,
        fadeOut: 0,
      },
    ],
    dialogueCues: [
      {
        id: 'dialogue',
        shotId: 'shot',
        text: 'Keep this line',
        audioMediaId: 'dialogue-media',
        offset: 0,
        duration: 5,
      },
    ],
  }
  project = prepareStudioRework(
    project,
    'source',
    'replacement',
    'Close-up',
    'range',
    { start: 1, end: 3, x: 0, y: 0, width: 256, height: 256 }
  )
  project = recordStudioTake(project, 'replacement', {
    id: 'new-take',
    createdAt: '2026-10-05T00:00:00Z',
    prompt: 'Close-up',
    mediaId: 'replacement-media',
    status: 'completed',
  })
  const revised = applyStudioReworkRange(project, 'replacement', 5, 2, true)
  expect(revised.production?.timeline.map((clip) => clip.nodeId)).toEqual([
    'source',
    'replacement',
    'source',
  ])
  expect(
    revised.nodes.find((node) => node.id === 'source')?.data.selectedTakeId
  ).toBe('original')
  expect(revised.voiceoverMediaId).toBe('narration')
  const schedule = studioTimelineSchedule(revised, {
    'original-media': 5,
    'replacement-media': 2,
  })
  expect(schedule.at(-1)?.end).toBe(5)
  expect(schedule[1].sourceOffset).toBe(1)
  const tracks = studioTimelineAudio(revised, {
    'original-media': 5,
    'replacement-media': 2,
    'dialogue-media': 5,
  })
  expect(
    tracks.filter((track) => track.mediaId === 'dialogue-media')
  ).toHaveLength(3)
  expect(
    revised.production?.audioTracks.some(
      (track) => track.mediaId === 'original-media'
    )
  ).toBe(false)
  expect(() =>
    applyStudioReworkRange(revised, 'replacement', 5, 2, true)
  ).toThrow(/no longer/)
})

test('the exact export preview uses final dimensions and becomes stale after a layout edit', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'video'
  )
  project.nodes[0].data.mediaId = 'stored-film'
  project.production = {
    ...studioProductionSchema.parse({}),
    width: 1080,
    height: 1920,
    fit: 'blur',
    watermark: 'Studio',
  }
  const plan = studioProjectRenderPlan(project, true)
  expect(plan.width).toBe(1080)
  expect(plan.height).toBe(1920)
  const result = { request_plan: plan, dialogue_cues: [] }
  expect(studioRenderMatchesProject(project, result)).toBe(true)
  project.production.fit = 'crop'
  expect(studioRenderMatchesProject(project, result)).toBe(false)
})

test('an API render without a clip voiceover remains current when unused voice settings are omitted', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'video'
  )
  project.nodes[0].data.mediaId = 'stored-film'
  const plan = studioProjectRenderPlan(project, true)
  const {
    voiceover_volume: _volume,
    voiceover_offset: _offset,
    ...clip
  } = plan.clips[0]
  expect(
    studioRenderMatchesProject(project, {
      request_plan: { ...plan, clips: [clip] },
    })
  ).toBe(true)
})

test('a render with a clip voiceover becomes stale when its actual audio volume changes', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'video'
  )
  project.nodes[0].data.mediaId = 'stored-film'
  project.nodes = addStudioNode(
    addStudioNode(project, 'text', 'text'),
    'image',
    'image'
  ).nodes
  project.shots = [
    {
      id: 'shot',
      title: 'Shot',
      textNodeId: 'text',
      imageNodeId: 'image',
      videoNodeId: 'video',
      shotVoiceoverMediaId: 'voice',
      shotVoiceoverVolume: 1,
    },
  ]
  const plan = studioProjectRenderPlan(project, true)
  plan.clips[0].voiceover_volume = 0
  expect(studioRenderMatchesProject(project, { request_plan: plan })).toBe(
    false
  )
})

test('a muted clip voiceover remains current when the server omits its zero volume', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'video'
  )
  project.nodes[0].data.mediaId = 'stored-film'
  project.nodes = addStudioNode(
    addStudioNode(project, 'text', 'text'),
    'image',
    'image'
  ).nodes
  project.shots = [
    {
      id: 'shot',
      title: 'Shot',
      textNodeId: 'text',
      imageNodeId: 'image',
      videoNodeId: 'video',
      shotVoiceoverMediaId: 'voice',
      shotVoiceoverVolume: 0,
    },
  ]
  const plan = studioProjectRenderPlan(project, true)
  const { voiceover_volume: _volume, ...clip } = plan.clips[0]
  expect(
    studioRenderMatchesProject(project, {
      request_plan: { ...plan, clips: [clip] },
    })
  ).toBe(true)
})
