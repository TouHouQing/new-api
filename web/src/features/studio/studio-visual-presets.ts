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

import type { StudioCanvasNodeData } from './canvas-flow'

export const studioCameraSchema = z.strictObject({
  shotSize: z.string().max(200).optional(),
  angle: z.string().max(200).optional(),
  movement: z.string().max(200).optional(),
  lens: z.string().max(200).optional(),
  lighting: z.string().max(200).optional(),
})
const versionSchema = z.strictObject({
  category: z.enum(['camera', 'lighting', 'style', 'effect']).default('camera'),
  version: z.number().int().min(1).max(10000),
  name: z.string().min(1).max(100),
  description: z.string().max(1000),
  camera: studioCameraSchema,
  prompt: z.string().max(2000),
  license: z.string().min(1).max(1000),
})
export const studioVisualPresetSchema = versionSchema.extend({
  id: z.string().min(1).max(128),
  archived: z.boolean().optional(),
  category: z.enum(['camera', 'lighting', 'style', 'effect']),
  history: z.array(versionSchema).max(20).default([]),
})
export type StudioVisualPreset = z.infer<typeof studioVisualPresetSchema>

export function studioVisualPresetVersion(
  token: string,
  presets: StudioVisualPreset[]
): StudioVisualPreset | undefined {
  const separator = token.lastIndexOf('@')
  const id = token.slice(0, separator)
  const version = Number(token.slice(separator + 1))
  const current = presets.find((preset) => preset.id === id)
  if (!current || separator < 1) return undefined
  if (current.version === version) return current
  const previous = current.history.find((item) => item.version === version)
  return previous ? { ...current, ...previous } : undefined
}

/** Remove only exact preset values; independent edits and retained presets win. */
export function studioRemoveVisualPreset(
  data: StudioCanvasNodeData,
  token: string,
  presets: StudioVisualPreset[]
) {
  const selected = studioVisualPresetVersion(token, presets)
  const retained = (data.visualPresetIds || []).filter((id) => id !== token)
  const remaining = retained.map((id) => studioVisualPresetVersion(id, presets))
  const changes: { field: string; value: string }[] = []
  const camera = { ...data.camera }
  // An unresolved historical direction is protected until its definition returns.
  if (selected && remaining.every(Boolean)) {
    for (const [field, value] of Object.entries(selected.camera)) {
      const key = field as keyof typeof camera
      if (
        value &&
        camera[key] === value &&
        !remaining.some((preset) => preset?.camera[key] === value)
      ) {
        changes.push({ field, value })
        delete camera[key]
      }
    }
  }
  let prompt = data.prompt
  // Appended lines can be reviewed exactly. Never erase a substring of user prose.
  if (
    selected?.prompt &&
    remaining.every(Boolean) &&
    !remaining.some((preset) => preset?.prompt === selected.prompt)
  ) {
    const lines = prompt.split('\n')
    const index = lines.lastIndexOf(selected.prompt)
    if (index >= 0) {
      lines.splice(index, 1)
      prompt = lines.join('\n')
      changes.push({ field: 'prompt', value: selected.prompt })
    }
  }
  return {
    changes,
    patch: { camera, prompt, visualPresetIds: retained },
  }
}

/** A restored definition becomes a new revision; old tokens remain resolvable. */
export function studioRestoreVisualPreset(preset: StudioVisualPreset) {
  if (preset.history.length >= 20 || preset.version >= 10000) {
    throw new Error(
      'Preset history is full. Save these settings as a new preset.'
    )
  }
  const previous = preset.history.at(-1)
  if (!previous) return preset
  const { id, archived, history, ...current } = preset
  return {
    ...preset,
    ...previous,
    id,
    archived,
    version: preset.version + 1,
    history: [...history, current],
  }
}
export const STUDIO_VISUAL_PRESETS: StudioVisualPreset[] = [
  {
    id: 'camera-push',
    category: 'camera',
    name: 'Gentle push in',
    description: 'Move closer to emphasize a discovery or a facial reaction.',
    camera: {
      movement: 'slow dolly in',
      shotSize: 'medium shot',
      lens: '50mm',
    },
    prompt: '',
  },
  {
    id: 'camera-orbit',
    category: 'camera',
    name: 'Product orbit',
    description: 'Circle the product slowly while keeping it at the center.',
    camera: {
      movement: 'slow orbit around the subject',
      shotSize: 'medium shot',
      lens: '35mm',
    },
    prompt: '',
  },
  {
    id: 'camera-static',
    category: 'camera',
    name: 'Steady dialogue',
    description:
      'A stable frame for a speaking character or a product explanation.',
    camera: {
      movement: 'static camera',
      shotSize: 'medium close-up',
      lens: '50mm',
    },
    prompt: '',
  },
  {
    id: 'camera-follow',
    category: 'camera',
    name: 'Follow the subject',
    description: 'Move alongside the subject and retain its screen position.',
    camera: {
      movement: 'tracking shot alongside the subject',
      shotSize: 'wide shot',
      lens: '35mm',
    },
    prompt: '',
  },
  {
    id: 'lighting-soft',
    category: 'lighting',
    name: 'Soft daylight',
    description: 'Even light with soft shadows for portraits and explanations.',
    camera: { lighting: 'soft diffused daylight, gentle shadows' },
    prompt: '',
  },
  {
    id: 'lighting-rim',
    category: 'lighting',
    name: 'Dramatic rim light',
    description:
      'Separate the subject from a dark background with an edge light.',
    camera: { lighting: 'warm rim light, dark background, cinematic contrast' },
    prompt: '',
  },
  {
    id: 'lighting-product',
    category: 'lighting',
    name: 'Clean product lighting',
    description: 'Use broad studio lights to reveal shape and surface details.',
    camera: {
      lighting:
        'large softbox lighting, clean neutral background, visible surface detail',
    },
    prompt: '',
  },
  {
    id: 'style-watercolor',
    category: 'style',
    name: 'Watercolor story',
    description: 'Soft color and paper texture for a gentle illustrated story.',
    camera: {},
    prompt: 'watercolor illustration, subtle paper texture, muted warm palette',
  },
  {
    id: 'style-cinema',
    category: 'style',
    name: 'Natural cinema',
    description:
      'Natural colors and restrained contrast for a narrative scene.',
    camera: {},
    prompt: 'natural cinematic color, realistic texture, restrained contrast',
  },
  {
    id: 'effect-dust',
    category: 'effect',
    name: 'Floating light particles',
    description:
      'Subtle particles catch the light without covering the subject.',
    camera: {},
    prompt:
      'subtle floating dust particles catching sunlight, unobstructed subject',
  },
  {
    id: 'effect-rain',
    category: 'effect',
    name: 'Gentle rain',
    description:
      'Light rain and wet reflections; review visibility in the resulting Take.',
    camera: {},
    prompt:
      'gentle rain, subtle wet surface reflections, clearly visible subject',
  },
].map((preset) => ({
  ...preset,
  category: preset.category as StudioVisualPreset['category'],
  version: 1,
  license:
    'Original parameter example; no third-party media included. Review the model and source asset licenses before commercial delivery.',
  history: [],
}))

export function studioApplyVisualPreset(
  data: StudioCanvasNodeData,
  preset: StudioVisualPreset
): Partial<StudioCanvasNodeData> {
  let prompt = data.prompt
  if (preset.prompt && !prompt.includes(preset.prompt)) {
    prompt = [prompt, preset.prompt].filter(Boolean).join('\n')
  }
  if (prompt.length > 30000) {
    throw new Error('Preset would exceed the prompt length limit')
  }
  return {
    camera: { ...data.camera, ...preset.camera },
    prompt,
    visualPresetIds: [
      ...new Set([
        ...(data.visualPresetIds || []),
        `${preset.id}@${preset.version}`,
      ]),
    ].slice(-32),
  }
}
