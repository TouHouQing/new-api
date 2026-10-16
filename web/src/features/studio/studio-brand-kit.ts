/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import type { StudioProject } from './local-projects'
import { studioMotionGraphicSchema } from './studio-motion-schema'

export function studioBrandGraphics(
  project: StudioProject,
  actualDuration: number
) {
  const kit = project.production?.brandKit
  if (
    !kit ||
    !(kit.name || kit.callToAction || kit.address || kit.logoMediaId)
  ) {
    return []
  }
  const total = actualDuration
  const start = Math.max(0, total - kit.endSeconds)
  const width = project.production?.width || 1920
  const height = project.production?.height || 1080
  let fontSize = Math.max(
    12,
    Math.min(72, Math.round(Math.min(width, height) / 20))
  )
  const wrap = (value: string) => {
    const lines: string[] = []
    let line = '',
      units = 0
    const limit = (width * 0.78) / fontSize
    for (const char of value) {
      const size = /[\u2e80-\uffef]/u.test(char) ? 1 : 0.6
      if (char === '\n' || (line && units + size > limit)) {
        lines.push(line)
        line = ''
        units = 0
      }
      if (char !== '\n') {
        line += char
        units += size
      }
    }
    if (line) lines.push(line)
    return lines
  }
  const lines = [kit.name, kit.callToAction, kit.address]
    .filter(Boolean)
    .flatMap(wrap)
  fontSize = Math.max(
    12,
    Math.min(
      fontSize,
      Math.floor((height * 0.32) / Math.max(1, lines.length) / 1.2)
    )
  )
  const text = lines.join('\n')
  const items = text
    ? [
        {
          id: 'studio-brand-title',
          kind: 'text' as const,
          text,
          start,
          end: total,
          x: 0.5,
          y: 0.55,
          font_size: fontSize,
          font_family: kit.font || 'sans',
          color: kit.color,
          animation: 'fade' as const,
          bpm: 90,
        },
      ]
    : []
  if (!kit.logoMediaId) {
    return items.map((item) => studioMotionGraphicSchema.parse(item))
  }
  return [
    ...items,
    {
      id: 'studio-brand-logo',
      kind: 'image' as const,
      imageMediaId: kit.logoMediaId,
      text: kit.name || 'Logo',
      start,
      end: total,
      x: 0.5,
      y: 0.35,
      font_size: Math.max(
        12,
        Math.min(160, Math.round(Math.min(width, height) / 4))
      ),
      color: kit.color,
      animation: 'fade' as const,
      bpm: 90,
    },
  ].map((item) => studioMotionGraphicSchema.parse(item))
}
