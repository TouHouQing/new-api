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
import {
  allocateStudioShotDurations,
  studioScreenplaySchema,
} from './studio-screenplay'
import { planLocalStudioShots } from './studio-shot-planning'

// Only optional empty values from a model are normalized. Counts, durations,
// identifiers and unknown fields still go through the strict screenplay schema.
export function parseStudioScreenplayResponse(
  raw: string,
  brief: string,
  shotName: string,
  targetDuration?: number
) {
  const value: unknown = JSON.parse(
    raw.replaceAll(/^```(?:json)?\s*|\s*```$/g, '').trim()
  )
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return studioScreenplaySchema.parse(value)
  }
  const normalized = { ...value } as Record<string, unknown>
  if (Array.isArray(normalized.shots)) {
    normalized.shots = normalized.shots.map((value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return value
      }
      const shot = { ...value } as Record<string, unknown>
      for (const field of ['dialogue', 'camera', 'shotType']) {
        if (shot[field] === null) shot[field] = ''
      }
      for (const field of ['characterIds', 'propIds']) {
        if (shot[field] === null) shot[field] = []
      }
      if (shot.sceneId === null) delete shot.sceneId
      return shot
    })
  }
  for (const field of ['characters', 'scenes', 'props']) {
    if (normalized[field] === null) normalized[field] = []
    if (field === 'characters' && Array.isArray(normalized[field])) {
      normalized[field] = normalized[field].map((value: unknown) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return value
        }
        const character = { ...value } as Record<string, unknown>
        if (character.voice === null) delete character.voice
        return character
      })
    }
  }
  let parsed = studioScreenplaySchema.parse(normalized)
  if (targetDuration !== undefined) {
    parsed = allocateStudioShotDurations(parsed, targetDuration)
  }
  const explicit =
    /(?:镜头\s*[一二三四五六七八九十百\d]+|shot\s*\d+)\s*[:：、.)）-]/i.test(
      brief
    )
  const authored = explicit ? planLocalStudioShots(brief, 12) : []
  return {
    ...parsed,
    brief: brief || parsed.brief,
    shots: parsed.shots.map((shot, index) =>
      authored.length === parsed.shots.length
        ? {
            ...shot,
            title: `${shotName} ${index + 1}`,
            text: authored[index].text,
            imagePrompt: `${authored[index].imagePrompt}\n${shot.imagePrompt}`,
            videoPrompt: `${authored[index].videoPrompt}\n${shot.videoPrompt}`,
          }
        : shot
    ),
  }
}
