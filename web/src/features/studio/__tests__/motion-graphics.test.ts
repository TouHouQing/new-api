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
import { describe, expect, it } from 'vitest'

import { studioMotionSVG } from '../studio-motion-runtime'
import { studioMotionGraphicSchema } from '../studio-motion-schema'

const graphic = studioMotionGraphicSchema.parse({
  id: 'graphic',
  text: 'Title',
  start: 0,
  end: 2,
  x: 0.5,
  y: 0.5,
  font_size: 100,
  color: '#ffffff',
  animation: 'fade',
  bpm: 120,
})

describe('shared motion graphics rendering', () => {
  it('rejects an image element without its required stored source before rendering', () => {
    expect(() =>
      studioMotionGraphicSchema.parse({ ...graphic, kind: 'image' })
    ).toThrow(/stored image/)
    expect(
      studioMotionGraphicSchema.parse({
        ...graphic,
        kind: 'image',
        imageMediaId: 'owned',
      }).imageMediaId
    ).toBe('owned')
  })
  it('escapes project text and excludes out-of-range frames', () => {
    const item = { ...graphic, text: '<script>alert("secret")</script>&' }
    expect(studioMotionSVG([item], 0.5, 640, 360)).toContain('&lt;script&gt;')
    expect(studioMotionSVG([item], 0.5, 640, 360)).not.toContain('<script>')
    expect(studioMotionSVG([item], 2, 640, 360)).not.toContain('<text')
  })
  it('morphs shape corners at the selected beat and preserves icon type', () => {
    const shape = studioMotionGraphicSchema.parse({
      ...graphic,
      kind: 'shape',
      animation: 'morph',
    })
    expect(studioMotionSVG([shape], 0.125, 640, 360)).toContain('rx="50"')
    expect(studioMotionSVG([shape], 0.375, 640, 360)).toContain('rx="0"')
    const icon = studioMotionGraphicSchema.parse({
      ...graphic,
      kind: 'icon',
      icon: 'play',
      animation: 'rotate',
    })
    expect(studioMotionSVG([icon], 0.5, 640, 360)).toContain('rotate(360)')
    expect(studioMotionSVG([icon], 0.5, 640, 360)).toContain(
      'M5 2 L22 12 L5 22 Z'
    )
  })
  it('rejects URLs that could execute code or fetch another service', () => {
    const image = studioMotionGraphicSchema.parse({
      ...graphic,
      kind: 'image',
      imageMediaId: 'owned',
    })
    for (const url of [
      'javascript:alert(1)',
      'https://other.test/private.png',
      'data:image/svg+xml;base64,YQ==',
    ]) {
      expect(
        studioMotionSVG([image], 0.5, 640, 360, { owned: url })
      ).not.toContain('<image')
    }
    expect(
      studioMotionSVG([image], 0.5, 640, 360, {
        owned: 'data:image/png;base64,YQ==',
      })
    ).toContain('<image')
  })
})
