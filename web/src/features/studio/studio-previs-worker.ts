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
import { z } from 'zod'

import { studioMotionSVG } from './studio-motion-runtime'
import { studioMotionGraphicSchema } from './studio-motion-schema'
import { studioPrevisSchema } from './studio-previs'
import {
  captureStudioPrevisFrame,
  createStudioPrevisRuntime,
} from './studio-previs-runtime'

type WorkerInput = {
  scene: unknown
  models: Record<string, string>
  width?: number
  height?: number
}
type WorkerWindow = Window & {
  studioPrevisInput: WorkerInput
  studioGraphicsInput?: {
    items: unknown
    width: number
    height: number
    images: Record<string, string>
  }
  studioPrevisReady?: boolean
  studioPrevisError?: string
  studioPrevisCapture?: (
    seconds: number,
    mode: 'color' | 'whitebox' | 'depth'
  ) => string | Promise<string>
}
const surface = window as unknown as WorkerWindow
try {
  if (surface.studioGraphicsInput) {
    const input = surface.studioGraphicsInput
    const items = z.array(studioMotionGraphicSchema).max(50).parse(input.items)
    const canvas = document.createElement('canvas')
    canvas.width = input.width
    canvas.height = input.height
    document.body.appendChild(canvas)
    surface.studioPrevisCapture = async (seconds) => {
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Graphic canvas is unavailable')
      const image = new Image()
      const svg = studioMotionSVG(
        items,
        seconds,
        input.width,
        input.height,
        input.images
      )
      image.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
      await image.decode()
      context.clearRect(0, 0, input.width, input.height)
      context.drawImage(image, 0, 0)
      return canvas.toDataURL('image/png')
    }
    surface.studioPrevisReady = true
  } else {
    const scene = studioPrevisSchema.parse(surface.studioPrevisInput.scene)
    const stage = createStudioPrevisRuntime(
      document.body,
      scene,
      async (id) => {
        const encoded = surface.studioPrevisInput.models[id]
        if (!encoded) throw new Error('Stored 3D model is unavailable')
        const bytes = Uint8Array.from(atob(encoded), (char) =>
          char.charCodeAt(0)
        )
        return new Blob([bytes], { type: 'model/gltf-binary' })
      },
      {
        width: z
          .number()
          .int()
          .min(64)
          .max(4096)
          .parse(surface.studioPrevisInput.width || 640),
        height: z
          .number()
          .int()
          .min(64)
          .max(4096)
          .parse(surface.studioPrevisInput.height || 360),
        onError: (error) => {
          surface.studioPrevisError = error
        },
      }
    )
    surface.studioPrevisCapture = (seconds, mode) =>
      captureStudioPrevisFrame(stage, scene, seconds, mode)
    void stage.ready
      .then(() => {
        surface.studioPrevisReady = true
      })
      .catch((error) => {
        surface.studioPrevisError = String(error)
      })
  }
} catch (error) {
  surface.studioPrevisError = String(error)
}
