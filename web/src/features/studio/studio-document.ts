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

export const studioDocumentSchema = z
  .array(
    z.strictObject({
      id: z.string().min(1).max(128).optional(),
      kind: z.enum(['paragraph', 'heading', 'bullet', 'numbered']),
      text: z.string().max(30000),
      bold: z.boolean().default(false),
      italic: z.boolean().default(false),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .default('#64748b'),
    })
  )
  .min(1)
  .max(100)
  .refine((blocks) => {
    const ids = blocks.flatMap((block) => (block.id ? [block.id] : []))
    return new Set(ids).size === ids.length
  })
  .refine(
    (blocks) =>
      blocks.reduce((size, block) => size + block.text.length, 0) +
        blocks.length -
        1 <=
      30000
  )

export type StudioDocument = z.infer<typeof studioDocumentSchema>

export function studioDocumentText(document: StudioDocument): string {
  return document.map((block) => block.text).join('\n')
}

export function studioDocumentForText(
  text: string,
  document?: StudioDocument
): StudioDocument {
  if (document && studioDocumentText(document) === text) {
    return document.map((block, index) => ({
      ...block,
      id: block.id || `text-block-${index + 1}`,
    }))
  }
  return [
    {
      id: 'text-block-1',
      kind: 'paragraph',
      text,
      bold: false,
      italic: false,
      color: '#64748b',
    },
  ]
}
