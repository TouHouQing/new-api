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
export type StudioSubtitleCue = { start: number; end: number; text: string }

export function parseStudioSubtitleCues(raw: string): StudioSubtitleCue[] {
  if (raw.length > 100000) throw new Error('Subtitles exceed the project limit')
  const source = raw.trim().replaceAll(/\r\n?/g, '\n')
  if (!source) return []
  return source.split(/\n\s*\n/).map((block) => {
    const lines = block.split('\n')
    if (lines.length < 3 || !/^\d+$/.test(lines[0])) {
      throw new Error('Each subtitle needs an index, time range and text')
    }
    const match =
      /^(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})$/.exec(
        lines[1]
      )
    if (!match) throw new Error('Subtitle time must use HH:MM:SS,mmm')
    const values = match.slice(1).map(Number)
    if (values[1] > 59 || values[2] > 59 || values[5] > 59 || values[6] > 59) {
      throw new Error('Subtitle time is invalid')
    }
    const start =
      values[0] * 3600 + values[1] * 60 + values[2] + values[3] / 1000
    const end = values[4] * 3600 + values[5] * 60 + values[6] + values[7] / 1000
    const text = lines.slice(2).join('\n').trim()
    if (!text || end <= start || end > 3600) {
      throw new Error('Subtitle text and time range are invalid')
    }
    return { start, end, text }
  })
}

export function serializeStudioSubtitleCues(cues: StudioSubtitleCue[]): string {
  return cues
    .map((cue, index) => {
      const format = (seconds: number) => {
        const milliseconds = Math.round(seconds * 1000)
        return `${String(Math.floor(milliseconds / 3600000)).padStart(2, '0')}:${String(Math.floor(milliseconds / 60000) % 60).padStart(2, '0')}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')},${String(milliseconds % 1000).padStart(3, '0')}`
      }
      return `${index + 1}\n${format(cue.start)} --> ${format(cue.end)}\n${cue.text}\n`
    })
    .join('\n')
}
