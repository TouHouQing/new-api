/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { t } from 'i18next'
import { expect, test } from 'vitest'

import { applyStudioRecommendedModels } from '../studio-creation-models'
import {
  studioBrandGraphics,
  studioBriefSuggestions,
  studioBriefNeedsReview,
  studioConfirmBrief,
  studioDialogueTiming,
  studioFilmFindings,
  studioMusicGain,
  studioRecipeDraft,
  studioRecipeProject,
  studioVoiceWindows,
} from '../studio-creative-plan'
import {
  mapStudioMediaReferences,
  studioDocumentMediaIds,
} from '../studio-media-references'
import {
  studioProductionSchema,
  studioProjectRenderPlan,
  studioRenderMatchesProject,
  studioTimelineClipSchema,
  splitStudioTimelineClip,
} from '../studio-production'
import {
  studioScreenplaySchema,
  applyStudioScreenplay,
} from '../studio-screenplay'
import { addStudioNode, createStudioProject } from '../workspace'

test('a product recipe keeps the brief and creates an editable opening, demonstration and invitation', () => {
  const project = createStudioProject('Coffee', 'film')
  project.production = {
    ...studioProductionSchema.parse({}),
    brief: 'Coffee shop opening with a friendly barista',
    targetDuration: 12,
    creativeBrief: {
      recipeId: 'store',
      subject: 'Coffee shop',
      audience: 'Neighbors',
      benefit: 'Fresh coffee',
      callToAction: 'Visit this weekend',
    },
  }
  const draft = studioRecipeDraft(project, 'store', t)
  expect(draft.shots).toHaveLength(3)
  expect(draft.shots.reduce((sum, shot) => sum + shot.seconds, 0)).toBe(12)
  expect(draft.shots[2].dialogue).toBe('Visit this weekend')
  expect(draft.shots[0].imagePrompt).toContain('Coffee shop')
  expect(project.nodes).toHaveLength(0)
})

test('brief suggestions are explicit recommendations for duration and destination', () => {
  expect(studioBriefSuggestions('给抖音制作12秒咖啡广告')).toMatchObject({
    duration: 12,
    vertical: true,
    goal: 'product',
  })
  expect(studioBriefSuggestions('Quiet landscape')).toMatchObject({
    duration: undefined,
    vertical: false,
    goal: undefined,
  })
})

test('recorded dialogue duration overrides estimates and detects an overcrowded shot', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'video'
  )
  project.nodes[0].data.seconds = 3
  project.shots = [
    {
      id: 'shot',
      title: 'Greeting',
      textNodeId: 'text',
      imageNodeId: 'image',
      videoNodeId: 'video',
      dialogue: '你好',
    },
  ]
  project.production = {
    ...studioProductionSchema.parse({}),
    dialogueCues: [
      {
        id: 'cue',
        shotId: 'shot',
        text: '你好',
        offset: 0.5,
        audioMediaId: 'voice',
      },
    ],
  }
  expect(studioDialogueTiming(project, { voice: 4.2 })[0]).toMatchObject({
    actual: true,
    required: 4.7,
    seconds: 3,
  })
  expect(
    studioFilmFindings(project).some((item) => item.code === 'source-shot')
  ).toBe(true)
})

test('brand overlays use actual film duration and retain exact closing text', () => {
  const project = createStudioProject('Film', 'film')
  project.production = {
    ...studioProductionSchema.parse({}),
    brandKit: {
      name: '青咖啡',
      address: '花园路18号',
      callToAction: '周末来喝一杯',
      color: '#ffffff',
      logoMediaId: '',
      endSeconds: 2,
    },
  }
  expect(studioBrandGraphics(project, 6)[0]).toMatchObject({
    start: 4,
    end: 6,
    text: '青咖啡\n周末来喝一杯\n花园路18号',
  })
})

test('overlapping voices reduce music only once and the ending fades without changing voice volume', () => {
  const project = createStudioProject('Film', 'film')
  project.production = {
    ...studioProductionSchema.parse({}),
    audioMix: {
      voicePriority: true,
      musicGain: 0.2,
      fadeOut: 1,
      normalize: false,
      musicMediaIds: [],
    },
  }
  const windows = [
    { start: 1, end: 3 },
    { start: 2, end: 4 },
  ]
  expect(studioMusicGain(project, 0, windows, 6)).toBe(1)
  expect(studioMusicGain(project, 2.5, windows, 6)).toBe(0.2)
  expect(studioMusicGain(project, 5.5, windows, 6)).toBe(0.5)
})

test('serialized finishing plans match their saved worker receipt and change when a mix setting changes', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'video'
  )
  project.nodes[0].data.mediaId = 'source'
  project.production = {
    ...studioProductionSchema.parse({}),
    audioMix: {
      voicePriority: true,
      musicGain: 0.2,
      fadeOut: 1,
      normalize: true,
      musicMediaIds: ['music'],
    },
  }
  const plan = studioProjectRenderPlan(project)
  expect(plan.audio_mix).toEqual({
    voicePriority: true,
    musicGain: 0.2,
    fadeOut: 1,
    normalize: true,
  })
  const result = {
    request_plan: structuredClone(plan),
    dialogue_cues: [],
  }
  expect(studioRenderMatchesProject(project, result)).toBe(true)
  project.production = studioProductionSchema.parse({
    ...project.production,
    audioMix: { ...project.production.audioMix, musicGain: 0.4 },
  })
  expect(studioRenderMatchesProject(project, result)).toBe(false)
})

test('splitting through a caption preserves the same visible phrase interval and only exterior fades', () => {
  const clip = studioTimelineClipSchema.parse({
    id: 'clip',
    nodeId: 'video',
    trimStart: 1,
    trimEnd: 9,
    speed: 2,
    caption: 'Hello',
    captionOffset: 1,
    captionDuration: 2,
    fadeIn: 0.2,
    fadeOut: 0.3,
  })
  const [left, right] = splitStudioTimelineClip(clip, 5)
  expect(left).toMatchObject({
    trimEnd: 5,
    caption: 'Hello',
    captionOffset: 1,
    captionDuration: 1,
    fadeIn: 0.2,
    fadeOut: 0,
  })
  expect(right).toMatchObject({
    trimStart: 5,
    caption: 'Hello',
    captionOffset: 0,
    captionDuration: 1,
    fadeIn: 0,
    fadeOut: 0.3,
  })
  expect(clip.trimEnd).toBe(9)
})

test('native dialogue ducks music, while sound effects and muted footage do not', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'video'
  )
  Object.assign(project.nodes[0].data, { mediaId: 'source', seconds: 4 })
  project.production = studioProductionSchema.parse({
    timelineEdited: true,
    timeline: [{ id: 'clip', nodeId: 'video' }],
  })
  expect(studioVoiceWindows(project, { source: 4 }, { source: true })).toEqual([
    { start: 0, end: 4 },
  ])
  project.production.timeline[0].muted = true
  expect(studioVoiceWindows(project, { source: 4 }, { source: true })).toEqual(
    []
  )
})

test('explicit brief labels become editable suggestions; unknown details stay empty', () => {
  expect(
    studioBriefSuggestions('店名：青咖啡；卖点：当日现烘；行动提示：周末来坐坐')
      .details
  ).toMatchObject({
    subject: '青咖啡',
    benefit: '当日现烘',
    callToAction: '周末来坐坐',
    audience: undefined,
  })
})

test('a recipe creates a valid separate project without copying old media or invalid shot fields', () => {
  const original = addStudioNode(
    createStudioProject('Original', 'original'),
    'video',
    'old-video'
  )
  original.nodes[0].data.mediaId = 'original-footage'
  const draft = studioRecipeDraft(original, 'store', t)
  original.production = studioProductionSchema.parse({
    brief: 'A store opens',
    screenplayDraft: JSON.stringify(draft),
    guide: { goal: 'product', step: 'shots' },
  })
  const copy = studioRecipeProject(original, 'copy')
  const screenplay = studioScreenplaySchema.parse(
    JSON.parse(copy.production?.screenplayDraft || '{}')
  )
  const applied = applyStudioScreenplay(copy, screenplay)
  expect(copy.id).toBe('copy')
  expect(copy.nodes).toEqual([])
  expect(applied.shots?.length).toBeGreaterThan(0)
  expect(original.nodes[0].data.mediaId).toBe('original-footage')
})

test('portable media remapping preserves music classification and exact picture approvals', () => {
  const source = {
    brandKit: { logoMediaId: 'logo' },
    audioMix: { musicMediaIds: ['music'] },
    approvedKeyImages: { shot: 'picture' },
  }
  expect([...studioDocumentMediaIds(source)].sort()).toEqual([
    'logo',
    'music',
    'picture',
  ])
  expect(mapStudioMediaReferences(source, (id) => `copy-${id}`)).toEqual({
    brandKit: { logoMediaId: 'copy-logo' },
    audioMix: { musicMediaIds: ['copy-music'] },
    approvedKeyImages: { shot: 'copy-picture' },
  })
})

test('a vertical recipe prepares portrait key images and native portrait video without changing duration', () => {
  const project = createStudioProject('Vertical', 'vertical')
  project.production = studioProductionSchema.parse({
    width: 1080,
    height: 1920,
    targetDuration: 12,
  })
  const applied = applyStudioScreenplay(
    project,
    studioRecipeDraft(project, 'store', t)
  )
  const ready = applyStudioRecommendedModels(
    applied,
    {
      text: ['qwen3.5:9b'],
      image: ['flux.2-klein-4b'],
      video: ['wan2.2-ti2v-5b'],
    },
    'default'
  )
  expect(
    ready.nodes
      .filter((node) => node.data.kind === 'video')
      .every(
        (node) =>
          node.data.ratio === '9:16' &&
          node.data.resolution === '384x640' &&
          node.data.seconds === 4
      )
  ).toBe(true)
  expect(
    ready.nodes
      .filter((node) => node.data.kind === 'image')
      .every((node) => node.data.imageSize === '576x1024')
  ).toBe(true)
})

test('a numbered establishing shot does not inherit the template protagonist', () => {
  const project = createStudioProject('Coffee', 'coffee')
  project.production = studioProductionSchema.parse({
    brief: '镜头一：清晨的咖啡店外景。镜头二：咖啡杯特写。',
    targetDuration: 6,
  })
  const draft = studioRecipeDraft(project, 'store', t)
  expect(draft.shots.every((shot) => shot.characterIds.length === 0)).toBe(true)
})

test('conflicting brief settings require an explicit choice which persists and resets on edits', async () => {
  const project = createStudioProject('Untitled project', 'review')
  project.production = {
    ...studioProductionSchema.parse({}),
    brief: '制作15秒竖屏门店广告。店名：青咖啡。',
    targetDuration: 30,
    width: 1920,
    height: 1080,
  }
  expect(studioBriefNeedsReview(project)).toBe(true)
  const kept = studioConfirmBrief(project, false)
  expect(kept.production.targetDuration).toBe(30)
  const persisted = JSON.stringify(kept)
  expect(studioBriefNeedsReview(JSON.parse(persisted))).toBe(false)
  expect(
    studioBriefNeedsReview({
      ...kept,
      production: { ...kept.production, targetDuration: 20 },
    })
  ).toBe(true)
  const adopted = studioConfirmBrief(project, true)
  expect(adopted.production).toMatchObject({
    targetDuration: 15,
    width: 1080,
    height: 1920,
  })
  expect(studioBriefNeedsReview(adopted)).toBe(false)
  expect(project.production.targetDuration).toBe(30)
})

test('manual one-paragraph briefs preserve the raw idea and never create metadata shots', async () => {
  const { studioPlanStoryDraft } = await import('../studio-creation')
  const brief =
    '我要为小区咖啡店做一条15秒竖屏开业短片，温暖真实，展示门店、手冲过程和咖啡成品，结尾提示周末到店。店名：青咖啡；受众：附近居民；卖点：当日现烘；行动提示：周末来喝一杯；地址：花园路18号。'
  const project = createStudioProject('Coffee', 'manual')
  project.production = {
    ...studioProductionSchema.parse({}),
    brief,
    creativeBrief: {
      recipeId: '',
      subject: '青咖啡',
      audience: '附近居民',
      benefit: '当日现烘',
      callToAction: '周末来喝一杯',
    },
  }
  const first = studioPlanStoryDraft(project, brief, 15)
  expect(first.shots.map((shot) => shot.text)).toEqual([
    '门店',
    '手冲过程',
    '咖啡成品',
  ])
  expect(first.brief).toBe(brief)
  const saved = applyStudioScreenplay(project, first)
  const again = studioPlanStoryDraft(saved, saved.production?.brief || '', 15)
  expect(again.shots.map((shot) => shot.text)).toEqual(
    first.shots.map((shot) => shot.text)
  )
  expect(saved.production?.brief).toBe(brief)
})

test('a manual production request without visible action stays blank for editing', async () => {
  const { studioPlanStoryDraft } = await import('../studio-creation')
  const draft = studioPlanStoryDraft(
    createStudioProject('Blank', 'blank'),
    '请帮我制作一条15秒产品广告。受众：附近居民。',
    15
  )
  expect(draft.shots).toHaveLength(1)
  expect(draft.shots[0].text).toBe('')
  expect(draft.shots[0].imagePrompt).toBe('')
})

test('a legacy project uses the same thirty-second default in the brief choice and planner', () => {
  const project = createStudioProject('Legacy', 'legacy-duration')
  project.production = studioProductionSchema.parse({
    brief: 'Make a 30 second video.',
  })
  expect(studioBriefNeedsReview(project)).toBe(false)
  expect(studioConfirmBrief(project, false).production.targetDuration).toBe(30)
})

test('confirming a brief respects fields explicitly cleared by the creator', () => {
  const project = createStudioProject('Coffee', 'cleared-fields')
  project.production = studioProductionSchema.parse({
    brief: '店名：青咖啡；目标观众：附近住户；结尾：周末来喝一杯。',
    creativeBrief: {
      recipeId: '',
      subject: '',
      audience: '',
      benefit: '',
      callToAction: '',
    },
  })
  expect(studioConfirmBrief(project, false).production.creativeBrief).toEqual(
    project.production.creativeBrief
  )
})
