/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import type { TFunction } from 'i18next'

import type { StudioProject } from './local-projects'
import { studioCaptionTrack } from './studio-caption-track'
import { studioCreationTemplate } from './studio-creation-templates'
import {
  studioProductionSchema,
  studioProjectTimeline,
} from './studio-production'
import { studioScreenplaySchema } from './studio-screenplay'
import {
  studioTimelineSchedule,
  studioTimelineAudio,
} from './studio-timeline-playback'
import { createStudioProject } from './workspace'

export { studioBrandGraphics } from './studio-brand-kit'

export const STUDIO_RECIPES = [
  {
    id: 'store',
    goal: 'product',
    title: 'Local business opening',
    description:
      'Show the place, a reason to visit and a clear closing invitation.',
    needs: 'Store name, address and one highlight',
    beats: [
      'Establish the place',
      'Show the signature experience',
      'Invite the viewer to visit',
    ],
  },
  {
    id: 'product',
    goal: 'product',
    title: 'Product showcase',
    description:
      'Show a real use, demonstrate one benefit and finish with the product.',
    needs: 'Product reference and one verifiable benefit',
    beats: [
      'Show the need',
      'Demonstrate the benefit',
      'Show the product and next step',
    ],
  },
  {
    id: 'story',
    goal: 'story',
    title: 'Character story',
    description:
      'A clear beginning, one meaningful action and a memorable ending.',
    needs: 'Main character, setting and the change in the story',
    beats: [
      'Introduce the character and situation',
      'One action changes the situation',
      'Show the consequence',
    ],
  },
  {
    id: 'explain',
    goal: 'explain',
    title: 'Explain an idea',
    description:
      'Ask one question, illustrate the answer and leave one takeaway.',
    needs: 'Topic, intended audience and a checked explanation',
    beats: [
      'Ask the question',
      'Demonstrate with a concrete example',
      'Summarize the takeaway',
    ],
  },
  {
    id: 'presenter',
    goal: 'presenter',
    title: 'Presenter video',
    description: 'Write and hear the script before timing the pictures.',
    needs: 'Presenter portrait, voice and approved script',
    beats: [
      'Introduce the topic',
      'Deliver one useful point',
      'State the next step',
    ],
  },
  {
    id: 'music',
    goal: 'story',
    title: 'Music mood film',
    description: 'Build a visual progression around the music and its changes.',
    needs: 'Your music and a visual theme',
    beats: [
      'Establish the visual motif',
      'Develop it on a musical change',
      'Return to a memorable closing image',
    ],
  },
] as const

export function studioRecipeDraft(
  project: StudioProject,
  id: string,
  t: TFunction
) {
  const recipe =
    STUDIO_RECIPES.find((item) => item.id === id) || STUDIO_RECIPES[0]
  const draft = studioCreationTemplate(project, recipe.goal, t)
  const info = project.production?.creativeBrief
  const subject = info?.subject || project.production?.brandKit?.name || ''
  const customShots =
    /(?:镜头\s*[一二三四五六七八九十\d]+|shot\s*\d+)\s*[:：]/i.test(
      project.production?.brief || ''
    )
  if (!customShots) {
    const total = Math.max(1, project.production?.targetDuration || 15)
    const count = Math.min(3, total)
    draft.shots = recipe.beats.slice(0, count).map((beat, i) => ({
      ...draft.shots[Math.min(i, draft.shots.length - 1)],
      id: `shot_${i + 1}`,
      title: t(beat),
      text: [
        subject,
        t(beat),
        i === 1 ? info?.benefit : '',
        project.production?.brief,
      ]
        .filter(Boolean)
        .join('\n'),
      imagePrompt: [
        subject,
        project.production?.brief,
        `${t('This shot only')}: ${t(beat)}`,
        t(
          'One clear subject and one simple action. Keep the visual style consistent. Add exact brand text as editable titles during editing.'
        ),
      ]
        .filter(Boolean)
        .join('\n'),
      videoPrompt: [
        subject,
        project.production?.brief,
        `${t('This shot only')}: ${t(beat)}`,
        t('One continuous shot with a stable camera and natural motion.'),
      ]
        .filter(Boolean)
        .join('\n'),
      dialogue: i === count - 1 ? info?.callToAction || '' : '',
      seconds: Math.floor(total / count) + (i < total % count ? 1 : 0),
      characterIds:
        recipe.goal === 'product' && i === 2
          ? []
          : draft.shots[0]?.characterIds || [],
    }))
  }
  if (customShots) {
    draft.shots = draft.shots.map((shot) => ({
      ...shot,
      characterIds: draft.characters
        .filter((character) => shot.text.includes(character.title))
        .map((character) => character.id),
    }))
  }
  return draft
}

export function studioBriefSuggestions(brief: string) {
  const seconds = brief.match(/(\d{1,3})\s*(?:秒|s\b|seconds?)/i)
  let goal: 'product' | 'explain' | 'presenter' | undefined
  if (/广告|开业|产品|卖点|门店|营销/.test(brief)) goal = 'product'
  else if (/讲解|科普|知识/.test(brief)) goal = 'explain'
  else if (/口播|主持人|数字人/.test(brief)) goal = 'presenter'
  return {
    details: {
      subject: brief
        .match(
          /(?:店名|品牌|产品|主角|主题|subject|brand)\s*[:：]\s*([^\n。；;，,]+)/i
        )?.[1]
        ?.trim(),
      audience: brief
        .match(/(?:受众|面向|audience)\s*[:：]\s*([^\n。；;，,]+)/i)?.[1]
        ?.trim(),
      benefit: brief
        .match(/(?:卖点|核心观点|变化|benefit)\s*[:：]\s*([^\n。；;]+)/i)?.[1]
        ?.trim(),
      callToAction: brief
        .match(
          /(?:行动提示|结尾邀请|call to action|cta)\s*[:：]\s*([^\n。；;]+)/i
        )?.[1]
        ?.trim(),
    },
    duration: seconds
      ? Math.max(1, Math.min(3600, Number(seconds[1])))
      : undefined,
    vertical: /抖音|快手|shorts|reels|竖[屏版]|9\s*:\s*16/i.test(brief),
    goal,
  } as const
}

export function studioCreativeBriefText(project: StudioProject, t: TFunction) {
  const details = project.production?.creativeBrief
  return [
    project.production?.brief || '',
    details?.subject && `${t('Main subject')}: ${details.subject}`,
    details?.audience && `${t('Audience')}: ${details.audience}`,
    details?.benefit && `${t('Key idea')}: ${details.benefit}`,
    details?.callToAction &&
      `${t('Closing invitation')}: ${details.callToAction}`,
  ]
    .filter(Boolean)
    .join('\n')
}

export function studioDialogueTiming(
  project: StudioProject,
  durations: Readonly<Record<string, number>> = {}
) {
  return (project.shots || []).flatMap((shot) => {
    const cues =
      project.production?.dialogueCues.filter(
        (cue) => cue.shotId === shot.id
      ) || []
    const text = cues.map((cue) => cue.text).join(' ') || shot.dialogue || ''
    if (!text.trim()) return []
    const estimated = Math.max(
      1,
      (text.match(/[\u3400-\u9fff]/g)?.length || 0) / 4 +
        (text.match(/[A-Za-z]+/g)?.length || 0) / 2.5 +
        (text.match(/[，。！？,;.!?]/g)?.length || 0) * 0.15
    )
    const actual = cues.reduce(
      (end, cue) =>
        Math.max(
          end,
          cue.offset +
            (cue.audioMediaId
              ? durations[cue.audioMediaId] || cue.duration || 0
              : 0)
        ),
      0
    )
    const seconds =
      project.nodes.find((node) => node.id === shot.videoNodeId)?.data
        .seconds || 5
    return [
      {
        shotId: shot.id,
        nodeId: shot.videoNodeId,
        title: shot.title,
        text,
        seconds,
        required: Math.ceil((actual || estimated) * 10) / 10,
        actual: actual > 0,
      },
    ]
  })
}

export function studioFilmFindings(project: StudioProject) {
  const findings: {
    code: string
    message: string
    step: 'story' | 'shots' | 'visual' | 'edit' | 'deliver'
    blocking: boolean
    nodeId?: string
  }[] = []
  const timeline = studioProjectTimeline(project)
  for (const clip of timeline) {
    const node = project.nodes.find((node) => node.id === clip.nodeId)
    const take = clip.takeId
      ? node?.data.takes?.find((take) => take.id === clip.takeId)
      : undefined
    if (!(take?.mediaId || node?.data.mediaId)) {
      findings.push({
        code: `source-${clip.id}`,
        message:
          'A timeline clip has no available media. Choose a version or upload footage.',
        step: 'visual',
        blocking: true,
        nodeId: clip.nodeId,
      })
    }
    if (clip.trimEnd !== undefined && clip.trimEnd <= clip.trimStart) {
      findings.push({
        code: `trim-${clip.id}`,
        message: 'A clip ends before it starts. Adjust its trim range.',
        step: 'edit',
        blocking: true,
        nodeId: clip.nodeId,
      })
    }
  }
  for (const item of studioDialogueTiming(project)) {
    if (item.required > item.seconds + 0.1) {
      findings.push({
        code: `voice-${item.shotId}`,
        message:
          'Dialogue needs more time. Shorten the script, extend the shot or split the scene.',
        step: 'edit',
        blocking: false,
        nodeId: item.nodeId,
      })
    }
  }
  try {
    for (const cue of studioCaptionTrack(project)) {
      if (
        cue.text.split('\n').some((line) => line.length > 28) ||
        cue.text.split('\n').length > 3
      ) {
        findings.push({
          code: `caption-${cue.id}`,
          message:
            'A caption is dense. Split it into shorter phrases and preview the safe area.',
          step: 'edit',
          blocking: false,
        })
      }
    }
  } catch {
    findings.push({
      code: 'caption-invalid',
      message:
        'Subtitle timing is invalid. Fix the subtitle cues before export.',
      step: 'edit',
      blocking: true,
    })
  }
  if (
    project.production?.guide?.goal === 'product' &&
    !project.production.brandKit?.callToAction &&
    !project.production.creativeBrief?.callToAction
  ) {
    findings.push({
      code: 'closing',
      message:
        'Add a clear closing invitation and check the brand information.',
      step: 'edit',
      blocking: false,
    })
  }
  if (
    project.soundtrackMediaId &&
    project.voiceoverMediaId &&
    !project.production?.audioMix?.voicePriority
  ) {
    findings.push({
      code: 'mix',
      message:
        'Music may cover the voice. Preview the mix or enable voice priority.',
      step: 'edit',
      blocking: false,
    })
  }
  return findings
}

export function studioVoiceWindows(
  project: StudioProject,
  durations: Readonly<Record<string, number>> = {},
  audibleMedia: Readonly<Record<string, boolean>> = {}
) {
  const schedule = studioTimelineSchedule(project, durations)
  const music = new Set([
    project.soundtrackMediaId,
    ...(project.production?.audioMix?.musicMediaIds || []),
  ])
  const external = studioTimelineAudio(project, durations)
    .filter(
      (track) =>
        !music.has(track.mediaId) &&
        track.volume > 0 &&
        !project.nodes.some(
          (node) =>
            node.data.mediaId === track.mediaId &&
            node.data.model === 'studio-sound-effects'
        )
    )
    .map((track) => ({
      start: track.offset,
      end:
        track.offset +
        (track.duration ||
          durations[track.mediaId] ||
          schedule.at(-1)?.end ||
          0) -
        (track.duration ? 0 : track.start),
    }))

  return [
    ...external,
    ...schedule
      .filter(
        (item) =>
          audibleMedia[item.mediaId] &&
          !item.clip.muted &&
          item.clip.volume > 0 &&
          !item.replacesAudio
      )
      .map((item) => ({ start: item.start, end: item.end })),
  ]
}

export function studioMusicGain(
  project: StudioProject,
  time: number,
  windows: { start: number; end: number }[],
  total: number
) {
  const mix = project.production?.audioMix
  if (!mix) return 1
  let gain =
    mix.voicePriority &&
    windows.some((range) => time >= range.start && time < range.end)
      ? mix.musicGain
      : 1
  if (mix.fadeOut > 0) {
    gain *= Math.max(0, Math.min(1, (total - time) / mix.fadeOut))
  }
  return gain
}

export function studioSetCreativeBrief(
  project: StudioProject,
  fields: NonNullable<StudioProject['production']>['creativeBrief']
) {
  const production = project.production || studioProductionSchema.parse({})
  return { ...project, production: { ...production, creativeBrief: fields } }
}

export function studioRecipeProject(
  draft: StudioProject,
  id: string
): StudioProject {
  const next = createStudioProject(draft.title, id)
  const source = draft.production || studioProductionSchema.parse({})
  const screenplay = source.screenplayDraft
    ? studioScreenplaySchema.parse(JSON.parse(source.screenplayDraft))
    : undefined
  let brandKit = source.brandKit
    ? { ...source.brandKit, logoMediaId: '' }
    : undefined
  if (!brandKit && source.guide?.goal === 'product') {
    brandKit = {
      name: source.creativeBrief?.subject || '',
      callToAction: source.creativeBrief?.callToAction || '',
      address: '',
      color: '#ffffff',
      logoMediaId: '',
      endSeconds: 2,
    }
  }
  next.production = studioProductionSchema.parse({
    brief: source.brief,
    targetDuration: source.targetDuration,
    width: source.width,
    height: source.height,
    creativeBrief: source.creativeBrief,
    guide: { goal: source.guide?.goal || 'story', step: 'shots' },
    screenplayDraft: screenplay ? JSON.stringify(screenplay) : undefined,
    brandKit,
  })
  return next
}
