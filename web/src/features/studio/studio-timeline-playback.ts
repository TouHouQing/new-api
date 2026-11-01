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

// Loading source metadata must not depend on computing a valid schedule first.
// Imported clips can reference source seconds beyond a node's generation setting.
export function studioTimelineMediaIds(project: StudioProject) {
  const media = new Set<string>()
  for (const clip of studioProjectTimeline(project)) {
    const node = project.nodes.find((item) => item.id === clip.nodeId)
    if (!node) throw new Error('A timeline source is unavailable')
    const take = clip.takeId
      ? node.data.takes?.find((item) => item.id === clip.takeId)
      : undefined
    if (clip.takeId && !take) throw new Error('The pinned Take is unavailable')
    const id = take?.mediaId || (!clip.takeId ? node.data.mediaId : undefined)
    if (!id) throw new Error('A timeline source is unavailable')
    media.add(id)
  }
  for (const track of project.production?.audioTracks || []) {
    media.add(track.mediaId)
  }
  for (const id of [project.soundtrackMediaId, project.voiceoverMediaId]) {
    if (id) media.add(id)
  }
  for (const shot of project.shots || []) {
    if (shot.shotVoiceoverMediaId) media.add(shot.shotVoiceoverMediaId)
  }
  for (const cue of project.production?.dialogueCues || []) {
    if (cue.audioMediaId) media.add(cue.audioMediaId)
  }
  return [...media].sort()
}

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
    const mediaId =
      take?.mediaId || (!clip.takeId ? node?.data.mediaId : undefined) || ''
    if (!mediaId) throw new Error('A timeline source is unavailable')
    if (
      durations[mediaId] !== undefined &&
      clip.trimEnd !== undefined &&
      clip.trimEnd > durations[mediaId] + 0.000001
    ) {
      throw new Error('Trim end exceeds the source duration')
    }
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
    const range = node?.data.reworkRange
    const sourceRatio = range?.replacementDuration
      ? (range.end - range.start) / range.replacementDuration
      : 1
    const sourceSpeed = clip.speed * sourceRatio
    const result = {
      clip,
      mediaId,
      start: position,
      end: position + duration,
      duration,
      sourceOffset: (range?.start || 0) + clip.trimStart * sourceRatio,
      sourceSpeed,
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
      const sourceOffset = Math.max(
        0,
        (item.shot.shotVoiceoverOffsetSeconds || 0) - trimOffset
      )
      const offset = sourceOffset / item.sourceSpeed
      const sourceStart = Math.max(
        0,
        trimOffset - (item.shot.shotVoiceoverOffsetSeconds || 0)
      )
      const duration = Math.min(
        (item.duration - offset) * item.sourceSpeed,
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
          speed: item.sourceSpeed,
        })
      }
    }
    for (const cue of production.dialogueCues.filter(
      (cue) => cue.shotId === item.shot?.id && cue.audioMediaId
    )) {
      if (!cue.audioMediaId) {
        continue
      }
      const offset = Math.max(0, cue.offset - trimOffset) / item.sourceSpeed
      const sourceStart = Math.max(0, trimOffset - cue.offset)
      const duration = Math.min(
        (cue.duration ||
          durations[cue.audioMediaId] ||
          item.duration * item.sourceSpeed) - sourceStart,
        (item.duration - offset) * item.sourceSpeed
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
        speed: item.sourceSpeed,
      })
    }
  }
  return tracks
}
