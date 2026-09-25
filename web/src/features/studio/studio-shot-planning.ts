/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import type { StudioShotDraft } from './api'

export function planLocalStudioShots(
  prompt: string,
  count: number
): StudioShotDraft[] {
  const requested = Math.max(1, Math.min(12, Math.trunc(count) || 1))
  const paragraphs = prompt
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
  const parts =
    paragraphs.length === 1 && requested > 1
      ? paragraphs[0]
          .split(/(?<=[。！？.!?])\s+|(?<=[。！？])(?=\S)/)
          .map((part) => part.trim())
          .filter(Boolean)
      : paragraphs
  const shotCount = Math.min(requested, parts.length)
  return Array.from({ length: shotCount }, (_, index) => {
    const start = Math.floor((index * parts.length) / shotCount)
    const end = Math.floor(((index + 1) * parts.length) / shotCount)
    return parts.slice(start, end).join('\n\n')
  }).map((text, index) => ({
    title: `Shot ${index + 1}`,
    text,
    imagePrompt: text,
    videoPrompt: text,
  }))
}
