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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { StudioImageLayerEditor } from '../studio-image-layer-editor'
import { createStudioImageLayers } from '../studio-image-layers'
import {
  addStudioNode,
  createStudioProject,
  updateStudioNode,
} from '../workspace'

vi.mock('../studio-image-layers', async (original) => {
  const module = await original<typeof import('../studio-image-layers')>()
  return {
    ...module,
    renderStudioImageLayers: (
      document: ReturnType<typeof module.createStudioImageLayers>,
      sources: Map<string, ImageBitmap>
    ) => {
      if (
        document.layers.some(
          (layer) => layer.mediaId && !sources.has(layer.mediaId)
        )
      ) {
        throw new Error('Image layer source is unavailable')
      }
      return { toDataURL: () => 'data:image/png;base64,AAAA' }
    },
  }
})
afterEach(() => vi.unstubAllGlobals())

test('adding a stored photo waits for the new source map before previewing and preserves its aspect', async () => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 1024, height: 1024, close: vi.fn() }))
  )
  let project = addStudioNode(
    addStudioNode(createStudioProject('Layers', 'layers'), 'image', 'original'),
    'image',
    'reference'
  )
  project = updateStudioNode(project, 'original', {
    mediaId: 'original-media',
    imageLayers: createStudioImageLayers(
      'original-media',
      320,
      320,
      'Original'
    ),
  })
  project = updateStudioNode(project, 'reference', {
    title: 'Stored fox',
    mediaId: 'fox-media',
  })
  const user = userEvent.setup()
  render(
    <StudioImageLayerEditor
      node={project.nodes[0]}
      nodes={project.nodes}
      getMedia={async () => new Blob(['source'])}
      onSave={vi.fn()}
    />
  )
  await user.click(screen.getByRole('button', { name: 'Edit image layers' }))
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Export PNG' })
    ).not.toBeDisabled()
  )
  await user.click(
    screen.getByRole('combobox', { name: 'Image source for new layer' })
  )
  await user.click(screen.getByRole('option', { name: 'Stored fox' }))
  await user.click(
    screen.getByRole('button', { name: 'Add stored image layer' })
  )
  await waitFor(() =>
    expect(
      screen.getByRole('spinbutton', { name: 'Layer height' })
    ).toHaveValue(272)
  )
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Export PNG' })
    ).not.toBeDisabled()
  )
  expect(screen.getByRole('spinbutton', { name: 'Layer width' })).toHaveValue(
    272
  )
  expect(screen.queryByRole('alert')).toBeNull()
})
