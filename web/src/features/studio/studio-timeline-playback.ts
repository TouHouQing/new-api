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
import type { StudioProject } from './local-projects'
import {
  studioProjectTimeline,
  studioProductionSchema,
} from './studio-production'

export function studioTimelineSchedule(
  project: StudioProject,
  durations: Readonly<Record<string, number>> = {}
) {
  let position = 0
  let sourcePosition = 0
  const fps = project.production?.fps || 30
  return studioProjectTimeline(project).map((clip) => {
    const node = project.nodes.find((node) => node.id === clip.nodeId)
    const take = clip.takeId
      ? node?.data.takes?.find((take) => take.id === clip.takeId)
      : undefined
    if (clip.takeId && !take) throw new Error('The pinned Take is unavailable')
    const mediaId = take?.mediaId || node?.data.mediaId || ''
    const available = durations[mediaId] || node?.data.seconds || 5
    const end = Math.min(clip.trimEnd ?? available, available)
    if (end <= clip.trimStart) {
      throw new Error('Trim end must follow trim start')
    }
    const sourceDuration = (end - clip.trimStart) / clip.speed
    const frames =
      Math.round((sourcePosition + sourceDuration) * fps) -
      Math.round(sourcePosition * fps)
    sourcePosition += sourceDuration
    if (frames < 1) throw new Error('Clip is shorter than one output frame')
    const duration = frames / fps
    const shot = project.shots?.find(
      (shot) =>
        shot.videoNodeId ===
        (node?.data.reworkRange?.sourceNodeId || clip.nodeId)
    )
    const replacesAudio = Boolean(
      project.production?.dialogueCues.some(
        (cue) => cue.shotId === shot?.id && cue.audioMediaId
      )
    )
    const result = {
      clip,
      mediaId,
      start: position,
      end: position + duration,
      duration,
      sourceOffset:
        (node?.data.reworkRange?.start || 0) + clip.trimStart / clip.speed,
      shot,
      replacesAudio,
    }
    position += duration
    return result
  })
}

export function studioTimelineAudio(
  project: StudioProject,
  durations: Readonly<Record<string, number>> = {}
) {
  const production = project.production || studioProductionSchema.parse({})
  const tracks = [...production.audioTracks]
  if (project.soundtrackMediaId) {
    tracks.push({
      id: 'soundtrack',
      mediaId: project.soundtrackMediaId,
      start: 0,
      offset: project.soundtrackOffsetSeconds || 0,
      volume: project.soundtrackVolume ?? 1,
    })
  }
  if (project.voiceoverMediaId) {
    tracks.push({
      id: 'voiceover',
      mediaId: project.voiceoverMediaId,
      start: 0,
      offset: project.voiceoverOffsetSeconds || 0,
      volume: project.voiceoverVolume ?? 1,
    })
  }
  for (const item of studioTimelineSchedule(project, durations)) {
    const trimOffset = item.sourceOffset
    if (item.shot?.shotVoiceoverMediaId) {
      const offset = Math.max(
        0,
        (item.shot.shotVoiceoverOffsetSeconds || 0) - trimOffset
      )
      const sourceStart = Math.max(
        0,
        trimOffset - (item.shot.shotVoiceoverOffsetSeconds || 0)
      )
      const duration = Math.min(
        item.duration - offset,
        (durations[item.shot.shotVoiceoverMediaId] || Infinity) - sourceStart
      )
      if (duration > 0) {
        tracks.push({
          id: `voice-${item.clip.id}`,
          mediaId: item.shot.shotVoiceoverMediaId,
          start: sourceStart,
          offset: item.start + offset,
          duration,
          volume: item.shot.shotVoiceoverVolume ?? 1,
        })
      }
    }
    for (const cue of production.dialogueCues.filter(
      (cue) => cue.shotId === item.shot?.id && cue.audioMediaId
    )) {
      if (!cue.audioMediaId) {
        continue
      }
      const offset = Math.max(0, cue.offset - trimOffset)
      const sourceStart = Math.max(0, trimOffset - cue.offset)
      const duration = Math.min(
        (cue.duration || durations[cue.audioMediaId] || item.duration) -
          sourceStart,
        item.duration - offset
      )
      if (duration <= 0) {
        continue
      }
      tracks.push({
        id: `${cue.id}-${item.clip.id}`,
        mediaId: cue.audioMediaId,
        start: sourceStart,
        offset: item.start + offset,
        duration,
        volume: 1,
      })
    }
  }
  return tracks
}
