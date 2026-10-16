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
import { t } from 'i18next'
import { z } from 'zod'

import type { StudioProject } from './local-projects'
import {
  studioProductionSchema,
  studioProjectTimeline,
} from './studio-production'
import {
  applyStudioScreenplay,
  studioScreenplaySchema,
} from './studio-screenplay'
import { planLocalStudioShots } from './studio-shot-planning'

export const STUDIO_CREATION_STEPS = [
  'story',
  'shots',
  'assets',
  'visual',
  'voice',
  'edit',
  'deliver',
] as const
export type StudioCreationStep = (typeof STUDIO_CREATION_STEPS)[number]
export type StudioEditableScreenplay = z.infer<typeof studioScreenplaySchema>
export const studioScreenplayDraftSchema = studioScreenplaySchema.extend({
  title: z.string().max(200),
  characters: z
    .array(
      studioScreenplaySchema.shape.characters
        .unwrap()
        .element.extend({ title: z.string().max(200) })
    )
    .max(20)
    .default([]),
  scenes: z
    .array(
      studioScreenplaySchema.shape.scenes
        .unwrap()
        .element.extend({ title: z.string().max(200) })
    )
    .max(30)
    .default([]),
  props: z
    .array(
      studioScreenplaySchema.shape.props
        .unwrap()
        .element.extend({ title: z.string().max(200) })
    )
    .max(100)
    .default([]),
  shots: z
    .array(
      studioScreenplaySchema.shape.shots.element.extend({
        title: z.string().max(200),
      })
    )
    .min(1)
    .max(100),
})

export function studioPlanStoryDraft(
  project: StudioProject,
  brief: string,
  duration: number,
  shotName = t('studio.shot.defaultName')
): StudioEditableScreenplay {
  const explicit =
    /(?:镜头\s*[一二三四五六七八九十\d]+|shot\s*\d+)\s*[:：、.)）-]/i.test(
      brief
    )
  const visualList = brief.match(
    /(?:展示|依次呈现|画面包括|show(?:ing)?)\s*[:：]?\s*([^。；;\n，,]+)/i
  )?.[1]
  let visual = brief
  if (!explicit) {
    visual = brief
      .split(/(?<=[。！？.!?])\s*|\n/)
      .filter(
        (part) =>
          !/^\s*(?:店名|品牌|受众|卖点|行动提示|地址|主要对象|目标观众|核心要点|结尾行动提示|subject|audience|benefit|brand|cta)\s*[:：]/i.test(
            part
          )
      )
      .join('\n\n')
    if (visualList) {
      visual = visualList
        .split(/、|以及|和|\band\b/i)
        .map((part) => part.trim())
        .filter(Boolean)
        .join('\n\n')
    } else if (
      /^(?:我要|请|帮我|为.+做|make\s+(?:me\s+)?a\s+video)/i.test(visual.trim())
    ) {
      visual = ''
    }
  }
  const drafts = planLocalStudioShots(visual, 12)
  const planned = drafts.length
    ? drafts
    : [{ title: `${shotName} 1`, text: '', imagePrompt: '', videoPrompt: '' }]
  const total = Math.max(1, Math.min(3600, Math.trunc(duration) || 30))
  // Keep short briefs intact when fewer than one second per shot is available.
  const shots =
    planned.length > total
      ? [
          ...planned.slice(0, total - 1),
          {
            ...planned[total - 1],
            text: planned
              .slice(total - 1)
              .map((shot) => shot.text)
              .join('\n\n'),
            imagePrompt: planned
              .slice(total - 1)
              .map((shot) => shot.imagePrompt)
              .join(' '),
            videoPrompt: planned
              .slice(total - 1)
              .map((shot) => shot.videoPrompt)
              .join(' '),
          },
        ]
      : planned
  return studioScreenplaySchema.parse({
    title: project.title || 'Film',
    brief,
    characters: [],
    scenes: [],
    props: [],
    shots: shots.map((shot, index) => ({
      ...shot,
      title: /^Shot \d+$/.test(shot.title)
        ? `${shotName} ${index + 1}`
        : shot.title,
      id: `shot_${index + 1}`,
      seconds:
        Math.floor(total / shots.length) +
        (index < total % shots.length ? 1 : 0),
    })),
  })
}

export function studioEditableScreenplay(
  project: StudioProject
): StudioEditableScreenplay {
  if (project.production?.screenplayDraft) {
    return studioScreenplayDraftSchema.parse(
      JSON.parse(project.production.screenplayDraft)
    )
  }
  const source = project.production?.screenplay?.source
  if (source) return studioScreenplaySchema.parse(JSON.parse(source))
  if (!project.shots?.length) {
    return studioPlanStoryDraft(
      project,
      project.production?.brief || '',
      project.production?.targetDuration || 30
    )
  }
  const assets = project.assets || []
  return studioScreenplaySchema.parse({
    title: project.title || 'Film',
    brief: project.production?.brief || '',
    characters: assets
      .filter((asset) => asset.kind === 'character')
      .map((asset) => ({
        id: asset.id,
        title: asset.title,
        description: asset.prompt,
        voice: asset.profile?.voice,
      })),
    scenes: assets
      .filter((asset) => asset.kind === 'location')
      .map((asset) => ({
        id: asset.id,
        title: asset.title,
        description: asset.prompt,
      })),
    props: [],
    shots: project.shots.map((shot) => {
      const text = project.nodes.find(
        (node) => node.id === shot.textNodeId
      )?.data
      const video = project.nodes.find(
        (node) => node.id === shot.videoNodeId
      )?.data
      return {
        id: shot.id,
        title: shot.title || 'Shot',
        text: text?.outputText || text?.prompt || '',
        imagePrompt: text?.outputImagePrompt || '',
        videoPrompt: text?.outputVideoPrompt || '',
        seconds: Math.max(1, Math.min(3600, Math.trunc(video?.seconds || 5))),
        sceneId: video?.assetIds?.find((id) =>
          assets.some((asset) => asset.id === id && asset.kind === 'location')
        ),
        characterIds:
          video?.assetIds?.filter((id) =>
            assets.some(
              (asset) => asset.id === id && asset.kind === 'character'
            )
          ) || [],
        dialogue: shot.dialogue || '',
        camera: shot.camera || '',
        shotType: shot.shotType || '',
      }
    }),
  })
}

export function applyStudioEditableScreenplay(
  project: StudioProject,
  draft: StudioEditableScreenplay,
  newId: () => string = () => crypto.randomUUID()
): StudioProject {
  if (!project.production?.screenplay && project.shots?.length) {
    const production = project.production || studioProductionSchema.parse({})
    const previous = studioEditableScreenplay({
      ...project,
      production: { ...production, screenplayDraft: undefined },
    })
    const assets: Record<string, string> = {}
    for (const asset of project.assets || []) {
      if (asset.kind === 'character') assets[`character:${asset.id}`] = asset.id
      if (asset.kind === 'location') assets[`scene:${asset.id}`] = asset.id
    }
    project = {
      ...project,
      production: {
        ...production,
        screenplay: {
          source: JSON.stringify(previous),
          assets,
          shots: Object.fromEntries(
            project.shots.map((shot) => [shot.id, shot.id])
          ),
        },
      },
    }
  }
  return applyStudioScreenplay(project, draft, newId)
}

export function studioCreationProgress(
  project: StudioProject,
  delivered = false
) {
  const production = project.production || studioProductionSchema.parse({})
  const timeline = studioProjectTimeline(project)
  const videosReady =
    timeline.length > 0 &&
    timeline.every((clip) => {
      const node = project.nodes.find((node) => node.id === clip.nodeId)
      const take = node?.data.takes?.find(
        (take) => take.id === (clip.takeId || node.data.selectedTakeId)
      )
      return Boolean(
        take
          ? take.status === 'completed' && (take.mediaId || take.outputUrl)
          : node?.data.mediaId || node?.data.outputUrl
      )
    })
  const referenced = new Set(
    project.nodes.flatMap((node) => node.data.assetIds || [])
  )
  return {
    production,
    story: Boolean(production.brief?.trim() || project.shots?.length),
    shots: Boolean(project.shots?.length),
    assets:
      referenced.size > 0 &&
      (project.assets || [])
        .filter((asset) => referenced.has(asset.id))
        .every((asset) => Boolean(asset.mediaId || asset.outputUrl)),
    visual: videosReady,
    voice:
      production.dialogueCues.length > 0 &&
      production.dialogueCues.every((cue) => Boolean(cue.audioMediaId)),
    edit: videosReady,
    deliver: delivered,
  }
}
