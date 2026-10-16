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
  parseStudioSubtitleCues,
  serializeStudioSubtitleCues,
} from './studio-subtitle-cues'
import { studioTimelineSchedule } from './studio-timeline-playback'

export function studioCaptionTrack(
  project: StudioProject,
  durations: Readonly<Record<string, number>> = {}
) {
  const schedule = studioTimelineSchedule(project, durations)
  const result: {
    id: string
    source: 'clip' | 'dialogue' | 'srt'
    clipId?: string
    cueId?: string
    start: number
    end: number
    text: string
  }[] = []
  for (const item of schedule) {
    const start = item.start + item.clip.captionOffset
    const end = Math.min(
      item.end,
      item.clip.captionDuration ? start + item.clip.captionDuration : item.end
    )
    if (item.clip.caption.trim() && end > start) {
      result.push({
        id: `clip:${item.clip.id}`,
        source: 'clip',
        clipId: item.clip.id,
        start,
        end,
        text: item.clip.caption,
      })
    }
    if (!project.captionsText) {
      for (const cue of project.production?.dialogueCues || []) {
        if (cue.shotId !== item.shot?.id) continue
        const start = Math.max(
          item.start,
          item.start + cue.offset - item.sourceOffset
        )
        const end = Math.min(
          item.end,
          item.start +
            cue.offset +
            Math.min(
              cue.duration || Infinity,
              durations[cue.audioMediaId || ''] || Infinity,
              item.duration
            ) -
            item.sourceOffset
        )
        if (cue.text.trim() && end > start) {
          result.push({
            id: `dialogue:${item.clip.id}:${cue.id}`,
            source: 'dialogue',
            cueId: cue.id,
            start,
            end,
            text: cue.text,
          })
        }
      }
    }
  }
  const offset = project.captionOffsetSeconds || 0
  for (const [index, cue] of parseStudioSubtitleCues(
    project.captionsText || ''
  ).entries()) {
    result.push({
      ...cue,
      id: `srt:${index}`,
      source: 'srt',
      start: cue.start + offset,
      end: cue.end + offset,
    })
  }
  return result.sort((a, b) => a.start - b.start || a.end - b.end)
}

export function studioCaptionTrackSrt(
  project: StudioProject,
  durations: Readonly<Record<string, number>> = {}
): string {
  return serializeStudioSubtitleCues(studioCaptionTrack(project, durations))
}
