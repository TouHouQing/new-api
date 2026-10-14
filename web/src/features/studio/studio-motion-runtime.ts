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
import type { StudioMotionGraphic } from './studio-motion-schema'

const iconPaths = {
  spark: 'M12 1 L15 9 L23 12 L15 15 L12 23 L9 15 L1 12 L9 9 Z',
  play: 'M5 2 L22 12 L5 22 Z',
  heart: 'M12 22 C-10 8 1-5 12 5 C23-5 34 8 12 22 Z',
  check: 'M1 12 L9 20 L23 3 L20 1 L9 15 L4 9 Z',
  arrow: 'M1 9 L15 9 L10 4 L13 1 L24 12 L13 23 L10 20 L15 15 L1 15 Z',
}

function escapeSVG(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function studioMotionSVG(
  items: StudioMotionGraphic[],
  seconds: number,
  width: number,
  height: number,
  images: Record<string, string> = {}
): string {
  const parts: string[] = []
  for (const item of items) {
    if (seconds < item.start || seconds >= item.end) continue
    const time = seconds - item.start
    const beat = ((2 * Math.PI * item.bpm) / 60) * time
    let x = item.x * width,
      y = item.y * height
    let alpha = Math.max(0, Math.min(1, time / 0.4, (item.end - seconds) / 0.4))
    let scale = 1,
      rotation = 0
    if (item.animation === 'slide') x -= width * (1 - Math.min(1, time / 0.6))
    if (item.animation === 'pulse') {
      scale = 0.85 + 0.15 * Math.sin(beat)
      alpha = 0.6 + 0.4 * Math.sin(beat)
    }
    if (item.animation === 'bounce') {
      y -= height * 0.08 * Math.abs(Math.sin(beat))
    }
    if (item.animation === 'rotate') rotation = time * item.bpm * 6
    const size = item.font_size
    let drawing = ''
    if (item.kind === 'icon') {
      drawing = `<path transform="translate(${-size / 2},${-size / 2}) scale(${size / 24})" d="${iconPaths[item.icon]}"/>`
    } else if (item.kind === 'shape') {
      let radius = item.shape === 'circle' ? size / 2 : 0
      if (item.animation === 'morph') radius = (size / 4) * (1 + Math.sin(beat))
      drawing = `<rect x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" rx="${radius}"/>`
    } else if (item.kind === 'image') {
      const url = images[item.imageMediaId || '']
      if (
        url &&
        /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url)
      ) {
        drawing = `<image x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" href="${escapeSVG(url)}" preserveAspectRatio="xMidYMid meet"/>`
      }
    } else {
      const lines = item.text.split('\n')
      drawing = `<text text-anchor="middle" dominant-baseline="middle" font-family="Arial,Microsoft YaHei,Noto Sans CJK SC,sans-serif" font-size="${size}">${lines.map((line, index) => `<tspan x="0" dy="${index === 0 ? -(lines.length - 1) * size * 0.6 : size * 1.2}">${escapeSVG(line)}</tspan>`).join('')}</text>`
    }
    parts.push(
      `<g data-studio-graphic-id="${escapeSVG(item.id)}" transform="translate(${x},${y}) rotate(${rotation}) scale(${scale})" fill="${escapeSVG(item.color)}" opacity="${alpha}">${drawing}</g>`
    )
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`
}
