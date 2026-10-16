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

export const studioMotionGraphicSchema = z
  .strictObject({
    id: z.string().min(1).max(128),
    kind: z.enum(['text', 'icon', 'shape', 'image']).default('text'),
    text: z.string().min(1).max(2000),
    icon: z.enum(['spark', 'play', 'heart', 'check', 'arrow']).default('spark'),
    shape: z.enum(['square', 'circle']).default('square'),
    imageMediaId: z.string().min(1).max(128).optional(),
    start: z.number().min(0).max(3600),
    end: z.number().min(0.01).max(3600),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    font_size: z.number().int().min(12).max(300),
    font_family: z.enum(['sans', 'serif']).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    animation: z.enum(['fade', 'slide', 'pulse', 'bounce', 'rotate', 'morph']),
    bpm: z.number().int().min(30).max(240),
  })
  .refine((item) => item.end > item.start, { message: 'End must follow start' })
  .refine((item) => item.animation !== 'morph' || item.kind === 'shape', {
    message: 'Morph animation requires a shape',
  })
  .refine((item) => item.kind !== 'image' || Boolean(item.imageMediaId), {
    message: 'Image graphics require a stored image',
  })

export type StudioMotionGraphic = z.infer<typeof studioMotionGraphicSchema>
