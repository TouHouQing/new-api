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

const id = z.string().min(1).max(128)
export const studioSkillTaskSchema = z
  .strictObject({
    id,
    title: z.string().min(1).max(200),
    kind: z.enum(['media', 'previs', 'graphics', 'render', 'quality']),
    operation: z
      .strictObject({
        action: z.enum([
          'music',
          'sound_effects',
          'voice_speech',
          'lip_sync',
          'audio_separate',
          'audio_translate',
          'image_bg_remove',
          'image_upscale',
          'image_outpaint',
          'image_layers',
          'image_grid',
          'image_to_3d',
          'video_remove',
          'video_replace',
          'video_depth',
          'previs_frame',
          'previs_animation',
          'previs_depth',
          'previs_whitebox',
          'graphics_frame',
          'graphics_animation',
        ]),
        node_id: id,
        model: z.string().max(200).default(''),
        group: z.string().max(100).default(''),
        prompt: z.string().max(30000).default(''),
        seconds: z.number().min(0).max(3600).default(1),
        language: z.string().max(40).default(''),
        voice_id: z.string().max(100).default('default'),
        reference_media_ids: z.array(id).max(12).default([]),
        options: z
          .strictObject({
            panel_prompts: z
              .array(z.string().min(1).max(3000))
              .max(16)
              .optional(),
            redo_panel: z.number().int().min(1).max(16).optional(),
            outpaint_mode: z.enum(['strict', 'natural']).optional(),
            mask_source: z.enum(['automatic', 'second_reference']).optional(),
            background_prompt: z.string().max(2000).optional(),
            repair_start: z.number().min(0).max(600).optional(),
            repair_end: z.number().min(0).max(600).optional(),
            candidate_start: z.number().min(0).max(600).optional(),
            candidate_end: z.number().min(0).max(600).optional(),
            negative: z.string().max(3000).optional(),
            width: z.number().int().min(16).max(4096).optional(),
            height: z.number().int().min(16).max(4096).optional(),
            scale: z.number().int().min(1).max(4).optional(),
            rows: z.number().int().min(1).max(4).optional(),
            columns: z.number().int().min(1).max(4).optional(),
            speed: z.number().min(0.5).max(2).optional(),
            pitch: z.number().min(-12).max(12).optional(),
            pause: z.number().min(0).max(3).optional(),
            expression: z.number().min(0).max(2).optional(),
            translation: z.string().max(3000).optional(),
            music_mode: z.enum(['instrumental', 'song']).optional(),
            lyrics: z.string().max(3000).optional(),
            bpm: z.number().int().min(30).max(240).optional(),
            seed: z.number().int().min(0).max(2147483647).optional(),
          })
          .optional(),
        edit: z
          .strictObject({
            start: z.number().min(0).max(3600),
            end: z.number().min(0).max(3600),
            x: z.number().int().min(0).max(8192),
            y: z.number().int().min(0).max(8192),
            width: z.number().int().min(2).max(8192),
            height: z.number().int().min(2).max(8192),
          })
          .optional(),
      })
      .optional(),
  })
  .refine(
    (task) =>
      task.kind !== 'media' ||
      (!!task.operation?.model.trim() && task.operation.seconds > 0),
    { message: 'Choose a media model and a positive task duration' }
  )
  .refine(
    (task) =>
      (task.kind !== 'media' &&
        task.kind !== 'previs' &&
        task.kind !== 'graphics') ||
      !!task.operation,
    { message: 'Choose a task output and operation' }
  )
  .refine(
    (task) =>
      task.kind !== 'previs' ||
      task.operation?.action === 'previs_frame' ||
      task.operation?.action === 'previs_animation' ||
      task.operation?.action === 'previs_depth' ||
      task.operation?.action === 'previs_whitebox',
    { message: 'Choose a stage export operation' }
  )
  .refine(
    (task) =>
      task.kind !== 'media' || !task.operation?.action.startsWith('previs_'),
    { message: 'Stage exports use the previs workflow' }
  )
  .refine(
    (task) =>
      task.kind !== 'graphics' ||
      task.operation?.action === 'graphics_frame' ||
      task.operation?.action === 'graphics_animation',
    { message: 'Choose a graphic export operation' }
  )
  .refine(
    (task) =>
      task.kind !== 'media' || !task.operation?.action.startsWith('graphics_'),
    { message: 'Graphic exports use the graphics workflow' }
  )
  .refine(
    (task) =>
      task.kind !== 'media' ||
      ((task.operation?.options?.width || 0) <= 2048 &&
        (task.operation?.options?.height || 0) <= 2048),
    { message: 'Image model tools require dimensions up to 2048' }
  )
