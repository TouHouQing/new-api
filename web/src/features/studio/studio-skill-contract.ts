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

export const studioSkillVersionSchema = z.strictObject({
  version: z.string().min(1).max(40),
  instructions: z.string().min(1).max(16000),
  importedAt: z.string().max(40),
})
export const studioSkillSchema = z.strictObject({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  inputs: z
    .array(z.enum(['story', 'shots', 'assets', 'media', 'review']))
    .max(5),
  output: z.enum(['plan', 'screenplay', 'review']),
  allowGeneration: z.boolean().default(false),
  activeVersion: z.string().max(40),
  versions: z.array(studioSkillVersionSchema).min(1).max(20),
})
export type StudioSkill = z.infer<typeof studioSkillSchema>

export const studioSkillDraftSchema = z.strictObject({
  id: z
    .string()
    .max(52)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(1024),
  version: z.string().min(1).max(40).default('1.0'),
  instructions: z.string().min(32).max(16000),
})
export type StudioSkillDraft = z.infer<typeof studioSkillDraftSchema>
