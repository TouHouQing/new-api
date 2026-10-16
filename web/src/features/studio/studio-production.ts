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
import { z } from 'zod'

import { studioAssemblyProjectFromCanvas } from './assembly-plan'
import { resolveStudioEdgeSource } from './canvas-flow'
import type { StudioProject } from './local-projects'
import { studioBrandGraphics } from './studio-brand-kit'
import { studioMediaDraftSchema } from './studio-media-draft'
import { studioMotionGraphicSchema } from './studio-motion-schema'
import { studioPrevisSchema } from './studio-previs'
import { studioSkillSchema } from './studio-skill-contract'
import { studioVisualPresetSchema } from './studio-visual-presets'

export { studioMotionGraphicSchema } from './studio-motion-schema'

export const studioTimelineClipSchema = z.strictObject({
  id: z.string().min(1).max(128),
  nodeId: z.string().min(1).max(128),
  takeId: z.string().max(128).optional(),
  trimStart: z.number().min(0).max(3600).default(0),
  trimEnd: z.number().min(0).max(3600).optional(),
  speed: z.number().min(0.25).max(4).default(1),
  volume: z.number().min(0).max(1).default(1),
  muted: z.boolean().default(false),
  caption: z.string().max(30000).default(''),
  captionOffset: z.number().min(0).max(3600).default(0),
  captionDuration: z.number().min(0).max(3600).default(0),
  fadeIn: z.number().min(0).max(3).default(0),
  fadeOut: z.number().min(0).max(3).default(0),
})
export const studioSeriesVersionSchema = z.strictObject({
  id: z.string().min(1).max(128),
  episodeId: z.string().min(1).max(128),
  title: z.string().min(1).max(200),
  language: z.string().min(1).max(40),
  region: z.string().max(100),
  timeline: z
    .array(
      studioTimelineClipSchema.extend({
        sourceMediaId: z.string().min(1).max(128).optional(),
        sourceTitle: z.string().max(200).optional(),
      })
    )
    .min(1)
    .max(100),
  subtitles: z.string().max(100000).default(''),
  motionGraphics: z.array(studioMotionGraphicSchema).max(50).default([]),
  audioTracks: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(128),
        mediaId: z.string().min(1).max(128),
        start: z.number().min(0).max(3600),
        offset: z.number().min(0).max(3600),
        duration: z.number().min(0.01).max(3600).optional(),
        volume: z.number().min(0).max(1),
      })
    )
    .max(100)
    .default([]),
  width: z.number().int().min(64).max(4096).default(1920),
  height: z.number().int().min(64).max(4096).default(1080),
  fps: z.number().int().min(12).max(60).default(30),
  fit: z.enum(['letterbox', 'crop', 'blur']).default('letterbox'),
  translationSource: z.string().max(100000).optional(),
  translationNodes: z
    .array(
      z.strictObject({
        nodeId: z.string().min(1).max(128),
        source: z.string().max(12000),
        parts: z
          .array(
            z.strictObject({
              cue: z.number().int().min(0).max(4999),
              part: z.number().int().min(0).max(99),
            })
          )
          .min(1)
          .max(100),
      })
    )
    .max(100)
    .default([]),
})
export type StudioSeriesVersion = z.infer<typeof studioSeriesVersionSchema>
export const studioProductionSchema = z.strictObject({
  briefSettingsKey: z.string().max(62000).optional(),
  creativeBrief: z
    .strictObject({
      recipeId: z.string().max(80).default(''),
      subject: z.string().max(300).default(''),
      audience: z.string().max(300).default(''),
      benefit: z.string().max(1000).default(''),
      callToAction: z.string().max(500).default(''),
    })
    .optional(),
  brandKit: z
    .strictObject({
      name: z.string().max(120).default(''),
      address: z.string().max(300).default(''),
      callToAction: z.string().max(300).default(''),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .default('#ffffff'),
      logoMediaId: z.string().max(128).default(''),
      endSeconds: z.number().min(0.5).max(15).default(2),
      font: z.enum(['sans', 'serif']).optional(),
    })
    .optional(),
  audioMix: z
    .strictObject({
      voicePriority: z.boolean().default(false),
      musicGain: z.number().min(0).max(1).default(0.2),
      fadeOut: z.number().min(0).max(10).default(1),
      normalize: z.boolean().default(false),
      musicMediaIds: z.array(z.string().max(128)).max(100).default([]),
    })
    .optional(),
  approvedKeyImages: z
    .record(z.string().max(128), z.string().max(128))
    .default({}),
  generationStage: z.enum(['draft', 'final']).optional(),
  finalResolutions: z
    .record(z.string().max(128), z.string().max(100))
    .default({}),
  framing: z
    .strictObject({
      focusX: z.number().min(0).max(1).default(0.5),
      focusY: z.number().min(0).max(1).default(0.5),
      safeArea: z.boolean().default(true),
    })
    .optional(),
  exportSizeMode: z.enum(['source', 'custom']).optional(),
  directionIntents: z
    .record(
      z.string().max(128),
      z.strictObject({
        framing: z.enum(['closeup', 'wider']).optional(),
        motion: z.enum(['push']).optional(),
        keepIdentity: z.boolean().default(false),
      })
    )
    .default({}),
  captionDraft: z
    .array(
      z.strictObject({
        id: z.string().max(128),
        start: z.string().max(24),
        end: z.string().max(24),
        text: z.string().max(2000),
      })
    )
    .max(1000)
    .optional(),
  mediaDraft: studioMediaDraftSchema.optional(),
  mediaDrafts: z
    .array(
      studioMediaDraftSchema.extend({ node_id: z.string().min(1).max(128) })
    )
    .max(500)
    .default([]),
  visualPresets: z.array(studioVisualPresetSchema).max(50).default([]),
  visualPresetFavorites: z.array(z.string().max(128)).max(200).default([]),
  motionGraphics: z.array(studioMotionGraphicSchema).max(50).default([]),
  voiceLibrary: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(100),
        title: z.string().min(1).max(200),
        language: z.string().max(40).default(''),
        tags: z.array(z.string().min(1).max(40)).max(12).default([]),
        favorite: z.boolean().default(false),
      })
    )
    .max(100)
    .default([]),
  episodes: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(128),
        title: z.string().min(1).max(200),
        synopsis: z.string().max(30000).default(''),
        shotIds: z.array(z.string().min(1).max(128)).max(166),
      })
    )
    .max(100)
    .default([]),
  regionalVersions: z.array(studioSeriesVersionSchema).max(100).default([]),
  shotGroups: z
    .array(
      z.strictObject({
        id: z.string().max(128),
        title: z.string().max(200),
        shotIds: z.array(z.string().max(128)).max(166),
        collapsed: z.boolean().default(false),
      })
    )
    .max(100)
    .default([]),
  assistant: z
    .strictObject({
      messages: z
        .array(
          z.strictObject({
            id: z.string().max(128),
            role: z.enum(['user', 'assistant']),
            text: z.string().max(30000),
            createdAt: z.string().max(40),
            nodeId: z.string().max(128).optional(),
            jobId: z.string().max(128).optional(),
            snapshotHash: z.string().length(64).optional(),
          })
        )
        .max(100)
        .default([]),
      proposal: z.string().max(100000).optional(),
      proposalSource: z.string().max(128).optional(),
      proposalHash: z.string().length(64).optional(),
      undoDocument: z.string().max(1000000).optional(),
      applied: z.boolean().default(false),
      skillId: z.string().max(80).optional(),
    })
    .optional(),
  milestones: z
    .array(
      z.strictObject({
        revision: z.number().int().positive(),
        title: z.string().min(1).max(120),
        createdAt: z.string().max(40),
      })
    )
    .max(100)
    .default([]),
  skills: z.array(studioSkillSchema).max(50).default([]),
  screenplayDraft: z.string().max(1000000).optional(),
  guide: z
    .strictObject({
      step: z
        .enum([
          'story',
          'shots',
          'assets',
          'visual',
          'voice',
          'edit',
          'deliver',
        ])
        .default('story'),
      goal: z
        .enum(['story', 'product', 'explain', 'presenter'])
        .default('story'),
    })
    .optional(),
  previs: studioPrevisSchema.optional(),
  brief: z.string().max(30000).optional(),
  targetDuration: z.number().min(1).max(3600).optional(),
  screenplay: z
    .strictObject({
      source: z.string().max(1000000),
      assets: z.record(z.string(), z.string().max(128)),
      shots: z.record(z.string(), z.string().max(128)),
    })
    .optional(),
  changes: z
    .array(
      z.strictObject({
        id: z.string().max(128),
        kind: z.enum(['script', 'review']),
        message: z.string().max(2000),
        nodeIds: z.array(z.string().max(128)).max(500),
        status: z.enum(['pending', 'resolved']).default('pending'),
        createdAt: z.string().max(40),
        action: z.enum(['regenerate', 'edit', 'audio']).optional(),
        commentId: z.number().int().positive().optional(),
        seconds: z.number().min(0).max(3600).optional(),
        takeId: z.string().max(128).optional(),
      })
    )
    .max(200)
    .default([]),
  continuityStates: z
    .array(
      z.strictObject({
        shotId: z.string().max(128),
        assetId: z.string().max(128),
        versionId: z.string().max(128).optional(),
        wardrobe: z.string().max(2000).default(''),
        emotion: z.string().max(2000).default(''),
        propState: z.string().max(2000).default(''),
        note: z.string().max(2000).default(''),
        referenceMediaIds: z.array(z.string().max(128)).max(12).default([]),
      })
    )
    .max(1000)
    .default([]),
  voiceBindings: z
    .record(
      z.string().max(128),
      z.strictObject({
        voiceId: z.string().min(1).max(100),
        model: z.string().min(1).max(200),
      })
    )
    .default({}),
  dialogueCues: z
    .array(
      z.strictObject({
        id: z.string().max(128),
        shotId: z.string().max(128),
        characterId: z.string().max(128).optional(),
        text: z.string().max(30000),
        audioMediaId: z.string().max(128).optional(),
        offset: z.number().min(0).max(3600).default(0),
        duration: z.number().min(0.01).max(3600).optional(),
      })
    )
    .max(500)
    .default([]),
  deliveryPreset: z
    .enum(['custom', 'youtube', 'shorts', 'douyin', 'bilibili'])
    .default('custom'),
  fit: z.enum(['letterbox', 'crop', 'blur']).default('letterbox'),
  watermark: z.string().max(120).default(''),
  width: z.number().int().min(64).max(4096).default(1920),
  height: z.number().int().min(64).max(4096).default(1080),
  fps: z.number().int().min(12).max(60).default(30),
  requireApproved: z.boolean().default(false),
  timelineEdited: z.boolean().default(false),
  reviews: z
    .array(
      z.strictObject({
        nodeId: z.string().min(1).max(128),
        takeId: z.string().max(128),
        mediaId: z.string().min(1).max(128),
        status: z.enum(['approved', 'retake', 'unreviewed']),
        reviewerId: z.number().int().positive(),
        revision: z.number().int().positive(),
        reviewedAt: z.string().max(40),
        note: z.string().max(2000),
      })
    )
    .max(500)
    .default([]),
  timeline: z.array(studioTimelineClipSchema).max(100).default([]),
  audioTracks: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(128),
        mediaId: z.string().min(1).max(128),
        start: z.number().min(0).max(3600).default(0),
        offset: z.number().min(0).max(3600).default(0),
        duration: z.number().min(0.01).max(3600).optional(),
        volume: z.number().min(0).max(1).default(1),
      })
    )
    .max(100)
    .default([]),
  scenes: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(128),
        title: z.string().max(200),
        description: z.string().max(30000),
        shotIds: z.array(z.string().max(128)).max(166),
        assetIds: z.array(z.string().max(128)).max(200),
      })
    )
    .max(100)
    .default([]),
  props: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(128),
        title: z.string().max(200),
        description: z.string().max(30000),
        mediaIds: z.array(z.string().max(128)).max(12),
      })
    )
    .max(100)
    .default([]),
  assetBindings: z
    .record(z.string().max(128), z.array(z.string().max(128)).max(200))
    .default({}),
})
export type StudioProduction = z.infer<typeof studioProductionSchema>
export type StudioTimelineClip = z.infer<typeof studioTimelineClipSchema>

export function studioProjectTimeline(
  project: StudioProject
): StudioTimelineClip[] {
  if (
    project.production &&
    (project.production.timelineEdited || project.production.timeline.length)
  ) {
    return project.production.timeline
  }
  const assembly = project.nodes.find(
    (node) => node.data.purpose === 'assembly'
  )
  const materialized = assembly
    ? studioAssemblyProjectFromCanvas(project, assembly.id)
    : project
  const videos = materialized.shots?.length
    ? materialized.shots.map((shot) => ({
        node: materialized.nodes.find((node) => node.id === shot.videoNodeId),
        shot,
      }))
    : materialized.nodes
        .filter(
          (node) =>
            node.data.kind === 'video' && node.data.purpose !== 'assembly'
        )
        .map((node) => ({ node, shot: undefined }))
  return videos.flatMap(({ node, shot }) =>
    node
      ? [
          {
            id: shot?.id || node.id,
            nodeId: node.id,
            trimStart: shot?.trimStart || 0,
            trimEnd: shot?.trimEnd,
            speed: 1,
            volume: shot?.volume ?? 1,
            muted: shot?.muted || false,
            caption: shot?.shotCaptionText || '',
            captionOffset: shot?.shotCaptionOffsetSeconds || 0,
            captionDuration: shot?.shotCaptionDurationSeconds || 0,
            fadeIn: 0,
            fadeOut:
              shot?.transition === 'fade' ? shot.transitionSeconds || 0.5 : 0,
          },
        ]
      : []
  )
}

export function studioProjectRenderPlan(project: StudioProject, draft = false) {
  const production = project.production || studioProductionSchema.parse({})
  const assembly = project.nodes.find(
    (node) => node.data.purpose === 'assembly'
  )
  const clips = studioProjectTimeline(project).map((clip) => {
    const node = project.nodes.find((node) => node.id === clip.nodeId)
    if (!node) throw new Error('A timeline source is unavailable')
    const edge =
      assembly &&
      project.edges.find(
        (edge) => edge.source === node.id && edge.target === assembly.id
      )
    const resolved = edge ? resolveStudioEdgeSource(node, edge) : node
    const take = clip.takeId
      ? node.data.takes?.find((take) => take.id === clip.takeId)
      : undefined
    if (clip.takeId && !take) throw new Error('The pinned Take is unavailable')
    if (clip.trimEnd !== undefined && clip.trimEnd <= clip.trimStart) {
      throw new Error('Trim end must follow trim start')
    }
    const mediaId = take?.mediaId || resolved.data.mediaId
    const shot = project.shots?.find(
      (shot) =>
        shot.videoNodeId === (node.data.reworkRange?.sourceNodeId || node.id)
    )
    if (!mediaId) {
      throw new Error('A clip must finish and be stored before rendering')
    }
    return {
      node_id: node.id,
      take_id: clip.takeId || resolved.data.selectedTakeId || '',
      media_id: mediaId,
      start: clip.trimStart,
      end: clip.trimEnd,
      speed: clip.speed,
      volume: clip.volume,
      muted: clip.muted,
      caption: clip.caption,
      caption_offset: clip.captionOffset,
      caption_duration: clip.captionDuration,
      fade_in: clip.fadeIn,
      fade_out: clip.fadeOut,
      voiceover_media_id: shot?.shotVoiceoverMediaId,
      voiceover_offset: shot?.shotVoiceoverOffsetSeconds || 0,
      voiceover_volume: shot?.shotVoiceoverVolume ?? 1,
    }
  })
  const audio = production.audioTracks.map((track) => {
    let role: string | undefined
    if (production.audioMix) {
      role = 'voice'
      if (
        project.nodes.some(
          (node) =>
            node.data.mediaId === track.mediaId &&
            node.data.model === 'studio-sound-effects'
        )
      ) {
        role = 'effect'
      }
      if (production.audioMix.musicMediaIds.includes(track.mediaId)) {
        role = 'music'
      }
    }
    return {
      media_id: track.mediaId,
      start: track.start,
      offset: track.offset,
      volume: track.volume,
      duration: track.duration,
      role,
    }
  })
  if (project.soundtrackMediaId) {
    audio.push({
      media_id: project.soundtrackMediaId,
      start: 0,
      offset: project.soundtrackOffsetSeconds || 0,
      volume: project.soundtrackVolume ?? 1,
      duration: undefined,
      role: production.audioMix ? 'music' : undefined,
    })
  }
  if (project.voiceoverMediaId) {
    audio.push({
      media_id: project.voiceoverMediaId,
      start: 0,
      offset: project.voiceoverOffsetSeconds || 0,
      volume: project.voiceoverVolume ?? 1,
      duration: undefined,
      role: production.audioMix ? 'voice' : undefined,
    })
  }
  return {
    fit: production.fit,
    motion_graphics: [
      ...production.motionGraphics,
      ...studioBrandGraphics(
        project,
        clips.reduce(
          (total, clip) =>
            total +
            ((clip.end ??
              project.nodes.find((node) => node.id === clip.node_id)?.data
                .seconds ??
              5) -
              clip.start) /
              clip.speed,
          0
        )
      ),
    ],
    crop_x: production.framing?.focusX ?? 0.5,
    crop_y: production.framing?.focusY ?? 0.5,
    safe_area: production.framing?.safeArea ?? false,
    audio_mix: production.audioMix
      ? {
          voicePriority: production.audioMix.voicePriority,
          musicGain: production.audioMix.musicGain,
          fadeOut: production.audioMix.fadeOut,
          normalize: production.audioMix.normalize,
        }
      : undefined,
    watermark: production.watermark,
    node_id: draft ? '' : assembly?.id || '',
    width: production.width,
    height: production.height,
    fps: production.fps,
    clips,
    audio,
    subtitles: project.captionsText || '',
    subtitle_offset: project.captionOffsetSeconds || 0,
    require_approved: !draft && production.requireApproved,
    package: !draft,
  }
}

export function studioUnapprovedClips(project: StudioProject) {
  const reviews = project.production?.reviews || []
  const timeline = studioProjectTimeline(project)
  let resolved: ReturnType<typeof studioProjectRenderPlan>['clips']
  try {
    resolved = studioProjectRenderPlan(project).clips
  } catch {
    return timeline
  }
  return timeline.flatMap((timelineClip, index) => {
    const clip = resolved[index]
    const latest = [...reviews]
      .reverse()
      .find(
        (review) =>
          review.nodeId === clip.node_id &&
          review.takeId === clip.take_id &&
          review.mediaId === clip.media_id
      )
    return latest?.status !== 'approved'
      ? [{ ...timelineClip, takeId: clip.take_id || undefined }]
      : []
  })
}

export function studioRenderMatchesProject(
  project: StudioProject,
  result: unknown
): boolean {
  if (!result || typeof result !== 'object') return false
  const record = result as {
    request_plan?: Record<string, unknown>
    dialogue_cues?: unknown
  }
  if (!record.request_plan) return false
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize)
    if (value && typeof value === 'object') {
      const fields = { ...(value as Record<string, unknown>) }
      if (fields.voiceover_media_id) {
        // The renderer defaults omitted per-clip audio scalars to zero.
        fields.voiceover_volume ??= 0
        fields.voiceover_offset ??= 0
      } else {
        // Settings without an audio source cannot change the rendered clip.
        delete fields.voiceover_media_id
        delete fields.voiceover_volume
        delete fields.voiceover_offset
      }
      return Object.fromEntries(
        Object.entries(fields)
          .filter(([, value]) => value !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => [key, normalize(value)])
      )
    }
    return value
  }
  try {
    const current: Record<string, unknown> = {
      ...studioProjectRenderPlan(project, true),
    }
    const saved = { ...record.request_plan }
    for (const key of ['node_id', 'package', 'require_approved']) {
      delete current[key]
      delete saved[key]
    }
    // Older workers omitted the optional empty watermark and default frame fit.
    saved.fit ||= 'letterbox'
    saved.motion_graphics ||= []
    saved.watermark ||= ''
    saved.crop_x ??= 0.5
    saved.crop_y ??= 0.5
    saved.safe_area ??= false
    return (
      JSON.stringify(normalize(current)) === JSON.stringify(normalize(saved)) &&
      JSON.stringify(normalize(project.production?.dialogueCues || [])) ===
        JSON.stringify(normalize(record.dialogue_cues || []))
    )
  } catch {
    return false
  }
}

export function splitStudioTimelineClip(
  clip: StudioTimelineClip,
  seconds: number
): StudioTimelineClip[] {
  if (
    !Number.isFinite(seconds) ||
    seconds <= clip.trimStart ||
    (clip.trimEnd !== undefined && seconds >= clip.trimEnd)
  ) {
    throw new Error('Split must be inside the clip trim range')
  }
  return [
    {
      ...clip,
      trimEnd: seconds,
      fadeOut: 0,
      caption:
        clip.captionOffset < (seconds - clip.trimStart) / clip.speed
          ? clip.caption
          : '',
      captionDuration: Math.max(
        0,
        Math.min(
          clip.captionDuration || Infinity,
          (seconds - clip.trimStart) / clip.speed - clip.captionOffset
        )
      ),
    },
    {
      ...clip,
      id: crypto.randomUUID(),
      trimStart: seconds,
      fadeIn: 0,
      caption:
        clip.captionDuration &&
        clip.captionOffset + clip.captionDuration <=
          (seconds - clip.trimStart) / clip.speed
          ? ''
          : clip.caption,
      captionOffset: Math.max(
        0,
        clip.captionOffset - (seconds - clip.trimStart) / clip.speed
      ),
      captionDuration: clip.captionDuration
        ? Math.max(
            0,
            clip.captionOffset +
              clip.captionDuration -
              Math.max(
                clip.captionOffset,
                (seconds - clip.trimStart) / clip.speed
              )
          )
        : 0,
    },
  ]
}
