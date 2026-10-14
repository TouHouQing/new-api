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
import { mkdir, writeFile } from 'node:fs/promises'

import { z } from 'zod'

import { studioProjectSchema } from '../src/features/studio/local-projects'
import { studioAssistantPlanSchema } from '../src/features/studio/studio-assistant'
import { studioCanvasOperationSchema } from '../src/features/studio/studio-canvas-commands'
import { studioSkillTaskSchema } from '../src/features/studio/studio-skill-task'

await mkdir(new URL('../../integrations/studio-agent/schema/',import.meta.url), {recursive:true})
const schema = z.toJSONSchema(studioProjectSchema, {
  io: 'input',
  unrepresentable: 'any',
})
await writeFile(
  new URL(
    '../../integrations/studio-agent/schema/project.json',
    import.meta.url
  ),
  `${JSON.stringify(schema, null, 2)}\n`
)
const allowed = new Set([
  'update_node',
  'update_shot',
  'add_shot',
  'move_shot',
  'bind_assets',
  'select_take',
  'set_previs',
  'set_motion_graphics',
  'connect',
])
const operation = studioSkillTaskSchema.shape.operation.unwrap()
const task = z.discriminatedUnion('kind', [
  z.strictObject({
    id: studioSkillTaskSchema.shape.id,
    title: studioSkillTaskSchema.shape.title,
    kind: z.literal('media'),
    operation: operation.extend({
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
      ]),
      model: z.string().min(1).max(200),
      seconds: z.number().min(0.001).max(3600).default(1),
    }),
  }),
  z.strictObject({
    id: studioSkillTaskSchema.shape.id,
    title: studioSkillTaskSchema.shape.title,
    kind: z.literal('previs'),
    operation: operation.extend({
      action: z.enum([
        'previs_frame',
        'previs_animation',
        'previs_depth',
        'previs_whitebox',
      ]),
    }),
  }),
  z.strictObject({
    id: studioSkillTaskSchema.shape.id,
    title: studioSkillTaskSchema.shape.title,
    kind: z.literal('graphics'),
    operation: operation.extend({
      action: z.enum(['graphics_frame', 'graphics_animation']),
    }),
  }),
  z.strictObject({
    id: studioSkillTaskSchema.shape.id,
    title: studioSkillTaskSchema.shape.title,
    kind: z.literal('render'),
  }),
  z.strictObject({
    id: studioSkillTaskSchema.shape.id,
    title: studioSkillTaskSchema.shape.title,
    kind: z.literal('quality'),
  }),
])
const planner = studioAssistantPlanSchema.extend({
  operations: z
    .array(
      z.union(
        studioCanvasOperationSchema.options.filter((item) =>
          allowed.has(item.shape.op.value)
        )
      )
    )
    .max(50),
  workflowActions: z.array(task).max(10),
})
await writeFile(
  new URL(
    '../../integrations/studio-agent/schema/assistant-plan.json',
    import.meta.url
  ),
  `${JSON.stringify(z.toJSONSchema(planner, { io: 'input', unrepresentable: 'any' }), null, 2)}\n`
)
