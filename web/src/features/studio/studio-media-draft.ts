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

import type { StudioCanvasNode } from './canvas-flow'
import { studioSkillTaskSchema } from './studio-skill-task'

export const STUDIO_MEDIA_MODELS = {
  music: 'studio-music',
  sound_effects: 'studio-sound-effects',
  voice_clone: 'studio-voice-clone',
  voice_speech: 'studio-voice-speech',
  lip_sync: 'studio-lip-sync',
  audio_separate: 'studio-audio-separate',
  audio_translate: 'studio-audio-translate',
  image_bg_remove: 'studio-image-bg-remove',
  image_upscale: 'studio-image-upscale',
  image_outpaint: 'studio-image-outpaint',
  image_layers: 'studio-image-layers',
  image_grid: 'studio-image-grid',
  image_to_3d: 'studio-image-to-3d',
  video_depth: 'studio-video-depth',
} as const
export type StudioMediaAction = keyof typeof STUDIO_MEDIA_MODELS
const draftSchema = z.object({
  node_id: z.string().max(128).default(''),
  action: z.enum(
    Object.keys(STUDIO_MEDIA_MODELS) as [
      StudioMediaAction,
      ...StudioMediaAction[],
    ]
  ),
  model: z.string().max(200),
  prompt: z.string().max(30000),
  seconds: z.number().min(0).max(3600),
  voice_id: z.string().max(100).default('default'),
  language: z.string().max(40).default('zh'),
  reference_media_ids: z.array(z.string().min(1).max(128)).max(12).default([]),
  options: studioSkillTaskSchema.shape.operation.unwrap().shape.options,
})
export const studioMediaDraftSchema = draftSchema.strict()
export function studioMediaTakeDraft(node: StudioCanvasNode | undefined) {
  const take = node?.data.takes?.find(
    (item) => item.id === node.data.selectedTakeId
  )
  if (!take?.requestSnapshot) return undefined
  try {
    const snapshot = JSON.parse(take.requestSnapshot)
    const result = draftSchema.safeParse({
      ...snapshot,
      // Prompt-free tools omit the empty prompt in the server receipt. Their
      // saved operation and references still form an editable media draft.
      prompt: snapshot?.prompt ?? take.prompt ?? node?.data.prompt ?? '',
    })
    return result.success && result.data.model === node?.data.model
      ? result.data
      : undefined
  } catch {
    return undefined
  }
}
export function studioMediaModelAction(model: string | undefined) {
  return (Object.keys(STUDIO_MEDIA_MODELS) as StudioMediaAction[]).find(
    (action) => STUDIO_MEDIA_MODELS[action] === model
  )
}
