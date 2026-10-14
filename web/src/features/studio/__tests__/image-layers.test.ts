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
import { expect, test } from 'vitest'

import { studioProjectSchema } from '../local-projects'
import {
  changeStudioImageLayer,
  createStudioImageLayers,
  fitStudioImageLayer,
  studioImageLayersSchema,
} from '../studio-image-layers'
import {
  addStudioNode,
  createStudioProject,
  recordStudioTake,
  selectStudioTake,
  updateStudioNode,
} from '../workspace'

test('stored photos retain their aspect ratio and fit within a small layer canvas', () => {
  const square = fitStudioImageLayer(
    { width: 320, height: 320 },
    { width: 1024, height: 1024 }
  )
  expect(square).toEqual({ x: 24, y: 24, width: 272, height: 272 })
  const portrait = fitStudioImageLayer(
    { width: 320, height: 180 },
    { width: 600, height: 1200 }
  )
  expect(portrait.width / portrait.height).toBe(0.5)
  expect(portrait.y).toBe(22.5)
  const tiny = fitStudioImageLayer(
    { width: 16, height: 16 },
    { width: 100, height: 100 }
  )
  expect(tiny).toEqual({ x: 2, y: 2, width: 12, height: 12 })
  expect(() =>
    fitStudioImageLayer({ width: 320, height: 180 }, { width: 0, height: 100 })
  ).toThrow('dimensions')
})

test('an editable image document survives project serialization with its source and independent layers', () => {
  const source = createStudioImageLayers(
    'stored-original',
    320,
    180,
    'Original'
  )
  const title = {
    ...source.layers[0],
    id: 'caption',
    name: 'Caption',
    kind: 'text' as const,
    mediaId: undefined,
    text: '字幕测试',
    locked: false,
    color: '#ffcc00',
  }
  const layers = { ...source, layers: [...source.layers, title] }
  const project = updateStudioNode(
    addStudioNode(createStudioProject('Layers', 'layers'), 'image', 'result'),
    'result',
    { imageLayers: layers }
  )
  const restored = studioProjectSchema.parse(
    JSON.parse(JSON.stringify(project))
  )
  expect(restored.nodes[0].data.imageLayers).toEqual(layers)
  expect(restored.nodes[0].data.imageLayers?.layers[0].mediaId).toBe(
    'stored-original'
  )
  expect(restored.nodes[0].data.imageLayers?.layers[1].text).toBe('字幕测试')
})

test('a locked layer rejects edits while allowing an explicit unlock', () => {
  const original = createStudioImageLayers('stored-image', 320, 180, 'Original')
  const id = original.layers[0].id
  const locked = changeStudioImageLayer(original, id, { locked: true })
  expect(() => changeStudioImageLayer(locked, id, { x: 20 })).toThrow('Unlock')
  const unlocked = changeStudioImageLayer(locked, id, { locked: false })
  const moved = changeStudioImageLayer(unlocked, id, { x: 20, opacity: 0.5 })
  expect(moved.layers[0]).toMatchObject({
    x: 20,
    opacity: 0.5,
    mediaId: 'stored-image',
  })
  expect(original.layers[0].x).toBe(0)
})

test('invalid dimensions and missing stored image sources are rejected before editing', () => {
  expect(() =>
    createStudioImageLayers('stored-image', 4096, 180, 'Original')
  ).toThrow()
  expect(() =>
    createStudioImageLayers('https://external/image.png', 320, 180, 'Original')
  ).toThrow()
  const document = createStudioImageLayers('stored-image', 320, 180, 'Original')
  expect(
    studioImageLayersSchema.safeParse({
      ...document,
      layers: [{ ...document.layers[0], mediaId: undefined }],
    }).success
  ).toBe(false)
})

test('duplicate layer identities are rejected instead of applying one edit to two layers', () => {
  const document = createStudioImageLayers('stored-image', 320, 180, 'Original')
  expect(
    studioImageLayersSchema.safeParse({
      ...document,
      layers: [document.layers[0], { ...document.layers[0], name: 'Another' }],
    }).success
  ).toBe(false)
})

test('switching image Takes restores the matching layer document without applying old layers to a new image', () => {
  const layers = createStudioImageLayers('source-photo', 320, 180, 'Source')
  let project = addStudioNode(
    createStudioProject('Layer versions', 'layer-versions'),
    'image',
    'picture'
  )
  project = recordStudioTake(project, 'picture', {
    id: 'layered',
    createdAt: '2026-10-06T00:00:00Z',
    status: 'completed',
    prompt: 'Layered image',
    mediaId: 'composite',
  })
  project = updateStudioNode(project, 'picture', { imageLayers: layers })
  const generated = recordStudioTake(project, 'picture', {
    id: 'generated',
    createdAt: '2026-10-06T00:01:00Z',
    status: 'completed',
    prompt: 'New image',
    mediaId: 'new-image',
  })
  expect(generated.nodes[0].data.imageLayers).toBeUndefined()
  const restored = selectStudioTake(generated, 'picture', 'layered')
  expect(restored.nodes[0].data.imageLayers).toEqual(layers)
  expect(
    selectStudioTake(restored, 'picture', 'generated').nodes[0].data.imageLayers
  ).toBeUndefined()
})
