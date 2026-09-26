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
export type StudioCaptionCue = {
  start: number
  end: number
  text: string
}

function parseCaptionTime(value: string): number {
  const match = /^(?:(\d+):)?([0-5]\d):([0-5]\d)[,.](\d{3})$/.exec(value)
  if (!match) return Number.NaN
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const milliseconds = Number(match[4])
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
}

/** Parses plain-text SRT and WebVTT cues on the assembled video timeline. */
export function parseStudioCaptions(source: string): StudioCaptionCue[] {
  const normalized = source
    .replace(/^\uFEFF/, '')
    .replaceAll(/\r\n?/g, '\n')
    .trim()
  if (!normalized) return []

  const blocks = normalized.split(/\n[ \t]*\n+/)
  const cues: StudioCaptionCue[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    if (lines[0].startsWith('WEBVTT')) continue
    if (/^(NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0])) continue

    const cueNumber = cues.length + 1
    const timingIndex = lines[0].includes('-->') ? 0 : 1
    const timing = lines[timingIndex]
    const match = timing && /^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(timing)
    const start = match ? parseCaptionTime(match[1]) : Number.NaN
    const end = match ? parseCaptionTime(match[2]) : Number.NaN
    const text = lines
      .slice(timingIndex + 1)
      .join('\n')
      .trim()
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      !text
    ) {
      throw new Error(`Invalid caption cue ${cueNumber}`)
    }
    cues.push({ start, end, text })
  }
  return cues.sort((left, right) => left.start - right.start)
}
