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
import type { Layer } from 'ag-psd'
import { z } from 'zod'

const layerSchema = z.strictObject({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  kind: z.enum(['image', 'text', 'rectangle', 'ellipse']),
  mediaId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,128}$/)
    .optional(),
  text: z.string().max(3000).default(''),
  x: z.number().min(-4096).max(4096),
  y: z.number().min(-4096).max(4096),
  width: z.number().min(1).max(4096),
  height: z.number().min(1).max(4096),
  rotation: z.number().min(-360).max(360).default(0),
  opacity: z.number().min(0).max(1).default(1),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#ffffff'),
  fontSize: z.number().min(8).max(400).default(48),
  bold: z.boolean().default(false),
})
export const studioImageLayersSchema = z
  .strictObject({
    version: z.literal(1),
    width: z.number().int().min(16).max(2048),
    height: z.number().int().min(16).max(2048),
    layers: z.array(layerSchema).min(1).max(50),
  })
  .superRefine((document, context) => {
    if (
      document.width * document.height * document.layers.length >
      32_000_000
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Layer document exceeds the editor memory budget',
      })
    }
    const seen = new Set<string>()
    document.layers.forEach((layer, index) => {
      if (seen.has(layer.id)) {
        context.addIssue({
          code: 'custom',
          path: ['layers', index, 'id'],
          message: 'Duplicate layer identity',
        })
      }
      seen.add(layer.id)
      if (layer.kind === 'image' && !layer.mediaId) {
        context.addIssue({
          code: 'custom',
          path: ['layers', index, 'mediaId'],
          message: 'Image layer needs stored source media',
        })
      }
    })
  })
export type StudioImageLayers = z.infer<typeof studioImageLayersSchema>
export type StudioImageLayer = StudioImageLayers['layers'][number]

export function fitStudioImageLayer(
  canvas: { width: number; height: number },
  source: { width: number; height: number }
): Pick<StudioImageLayer, 'x' | 'y' | 'width' | 'height'> {
  if (
    ![canvas.width, canvas.height, source.width, source.height].every(
      (value) => Number.isFinite(value) && value > 0
    )
  ) {
    throw new Error('Image layer dimensions are unavailable')
  }
  const margin = Math.min(24, canvas.width / 8, canvas.height / 8)
  const scale = Math.min(
    1,
    (canvas.width - margin * 2) / source.width,
    (canvas.height - margin * 2) / source.height
  )
  const width = source.width * scale
  const height = source.height * scale
  return {
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height,
  }
}

export function createStudioImageLayers(
  mediaId: string,
  width: number,
  height: number,
  name: string
): StudioImageLayers {
  return studioImageLayersSchema.parse({
    version: 1,
    width,
    height,
    layers: [
      {
        id: crypto.randomUUID(),
        name,
        kind: 'image',
        mediaId,
        x: 0,
        y: 0,
        width,
        height,
      },
    ],
  })
}

export function changeStudioImageLayer(
  document: StudioImageLayers,
  id: string,
  patch: Partial<StudioImageLayer>
): StudioImageLayers {
  const layer = document.layers.find((layer) => layer.id === id)
  if (!layer) throw new Error('Image layer is unavailable')
  if (layer.locked && Object.keys(patch).some((key) => key !== 'locked')) {
    throw new Error('Unlock the layer before editing it')
  }
  if (
    (patch.id && patch.id !== id) ||
    (patch.kind && patch.kind !== layer.kind)
  ) {
    throw new Error('Layer identity cannot change')
  }
  return studioImageLayersSchema.parse({
    ...document,
    layers: document.layers.map((layer) =>
      layer.id === id ? { ...layer, ...patch } : layer
    ),
  })
}

export function renderStudioImageLayers(
  document: StudioImageLayers,
  sources: ReadonlyMap<string, CanvasImageSource>,
  onlyLayer?: string
): HTMLCanvasElement {
  const validated = studioImageLayersSchema.parse(document)
  const canvas = window.document.createElement('canvas')
  canvas.width = validated.width
  canvas.height = validated.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Image editor canvas is unavailable')
  for (const layer of validated.layers) {
    if (!layer.visible || (onlyLayer && layer.id !== onlyLayer)) continue
    context.save()
    context.globalAlpha = layer.opacity
    context.translate(layer.x + layer.width / 2, layer.y + layer.height / 2)
    context.rotate((layer.rotation * Math.PI) / 180)
    context.translate(-layer.width / 2, -layer.height / 2)
    context.fillStyle = layer.color
    if (layer.kind === 'image') {
      const image = sources.get(layer.mediaId || '')
      if (!image) throw new Error('Image layer source is unavailable')
      context.drawImage(image, 0, 0, layer.width, layer.height)
    } else if (layer.kind === 'text') {
      context.font = `${layer.bold ? 'bold' : 'normal'} ${layer.fontSize}px sans-serif`
      context.textBaseline = 'top'
      layer.text
        .split('\n')
        .forEach((line, index) =>
          context.fillText(line, 0, index * layer.fontSize * 1.25, layer.width)
        )
    } else if (layer.kind === 'ellipse') {
      context.beginPath()
      context.ellipse(
        layer.width / 2,
        layer.height / 2,
        layer.width / 2,
        layer.height / 2,
        0,
        0,
        Math.PI * 2
      )
      context.fill()
    } else {
      context.fillRect(0, 0, layer.width, layer.height)
    }
    context.restore()
  }
  return canvas
}

export async function exportStudioImageLayers(
  document: StudioImageLayers,
  sources: ReadonlyMap<string, CanvasImageSource>,
  format: 'png' | 'jpg' | 'psd'
): Promise<Blob> {
  const canvas = renderStudioImageLayers(document, sources)
  if (format === 'psd') {
    const { writePsd } = await import('ag-psd')
    const children: Layer[] = [...document.layers].reverse().map((layer) => {
      const result: Layer = {
        name: layer.name,
        hidden: !layer.visible,
        protected: {
          transparency: layer.locked,
          composite: layer.locked,
          position: layer.locked,
        },
        canvas: renderStudioImageLayers(
          { ...document, layers: [{ ...layer, visible: true, opacity: 1 }] },
          sources
        ),
        opacity: layer.opacity,
      }
      if (layer.kind === 'text') {
        const angle = (layer.rotation * Math.PI) / 180
        const cos = Math.cos(angle),
          sin = Math.sin(angle)
        result.text = {
          text: layer.text,
          transform: [
            cos,
            sin,
            -sin,
            cos,
            layer.x +
              layer.width / 2 -
              (cos * layer.width) / 2 +
              (sin * layer.height) / 2,
            layer.y +
              layer.height / 2 -
              (sin * layer.width) / 2 -
              (cos * layer.height) / 2 +
              layer.fontSize,
          ],
          style: {
            font: { name: 'MicrosoftYaHei' },
            fontSize: layer.fontSize,
            fauxBold: layer.bold,
            fillColor: {
              r: Number.parseInt(layer.color.slice(1, 3), 16),
              g: Number.parseInt(layer.color.slice(3, 5), 16),
              b: Number.parseInt(layer.color.slice(5, 7), 16),
            },
          },
        }
      }
      return result
    })
    return new Blob(
      [
        writePsd({
          width: document.width,
          height: document.height,
          canvas,
          children,
        }),
      ],
      { type: 'image/vnd.adobe.photoshop' }
    )
  }
  if (format === 'jpg') {
    const context = canvas.getContext('2d')
    if (context) {
      context.globalCompositeOperation = 'destination-over'
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Image export failed')),
      format === 'jpg' ? 'image/jpeg' : 'image/png',
      0.95
    )
  )
}
