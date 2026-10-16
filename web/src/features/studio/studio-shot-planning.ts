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
  // Explicit shot boundaries take precedence over sentence punctuation. The
  // brief remains stored separately, so global constraints never become shots.
  const markers = [
    ...prompt.matchAll(
      /(?:^|\n|(?<=[。；;.!?]))\s*(?:镜头\s*[一二三四五六七八九十百\d]+|第\s*[一二三四五六七八九十百\d]+\s*镜|shot\s*\d+)\s*[:：、.)）-]\s*/gi
    ),
  ]
  if (markers.length) {
    const last = markers.at(-1) || markers[0]
    const tail = prompt.slice((last.index || 0) + last[0].length)
    const shared = [
      prompt.slice(0, markers[0].index).trim(),
      tail.match(
        /(?:^|[\n。；;.!?])\s*((?:全局要求|统一要求|整体要求|global requirements)\s*[:：][\s\S]*)$/i
      )?.[1] || '',
    ]
      .filter(Boolean)
      .join('\n')
    return markers.slice(0, requested).map((marker, index) => {
      const text = prompt
        .slice(
          (marker.index || 0) + marker[0].length,
          markers[index + 1]?.index
        )
        .split(
          /(?:^|(?<=[\n。；;.!?]))\s*(?:全局要求|统一要求|整体要求|global requirements)\s*[:：]/i
        )[0]
        .trim()
      const requirements = shared
        .split(/(?<=[。；;.!?])\s*|\n/)
        .filter((part) => {
          if (
            /结尾|片尾|最后[一1]镜|closing|last shot|final shot/i.test(part)
          ) {
            return index === Math.min(requested, markers.length) - 1
          }
          if (/第一镜|首镜|开头|opening|first shot/i.test(part)) {
            return index === 0
          }
          return true
        })
        .join('\n')
      return {
        title: `Shot ${index + 1}`,
        text,
        imagePrompt: [requirements, text].filter(Boolean).join('\n'),
        videoPrompt: [requirements, text].filter(Boolean).join('\n'),
      }
    })
  }
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
