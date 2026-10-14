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
import type { StudioCanvasNodeData } from './canvas-flow'

export function studioImageParameters(model: string): {
  sizes: string[]
  qualities: string[]
  count: number
} {
  if (model === 'flux.2-klein-4b') {
    return {
      sizes: [
        '1024x1024',
        '768x768',
        '640x384',
        '384x640',
        '768x512',
        '512x768',
      ],
      qualities: [],
      count: 1,
    }
  }
  return { sizes: [], qualities: [], count: 1 }
}

export function studioImageModelPatch(
  data: StudioCanvasNodeData,
  model?: string
): Partial<StudioCanvasNodeData> {
  const parameters = studioImageParameters(model || '')
  return {
    model,
    imageSize: parameters.sizes.includes(data.imageSize || '')
      ? data.imageSize
      : undefined,
    imageQuality: parameters.qualities.includes(data.imageQuality || '')
      ? data.imageQuality
      : undefined,
    imageCount: 1,
  }
}
