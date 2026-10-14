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
import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { studioNodeInputsChanged } from '../canvas-flow'
import { studioProjectSchema } from '../local-projects'
import { studioCanvasNodeVisible } from '../studio-canvas-filters'
import { studioImageModelPatch } from '../studio-image-parameters'
import { StudioNodeLabels } from '../studio-node-organization'
import { addStudioNode, createStudioProject } from '../workspace'

test('canvas labels, rating and display filters persist without changing generation inputs', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'shot'
  )
  const node = project.nodes[0]
  expect(
    studioNodeInputsChanged(node.data, { labelColor: '#ef4444', rating: 4 })
  ).toBe(false)
  node.data = { ...node.data, labelColor: '#ef4444', rating: 4 }
  project.canvas = {
    colorFilter: '#ef4444',
    minimumRating: 3,
    displayDensity: 'compact',
  }
  const reopened = studioProjectSchema.parse(
    JSON.parse(JSON.stringify(project))
  )
  expect(studioCanvasNodeVisible(reopened.nodes[0], reopened.canvas)).toBe(true)
  expect(
    studioCanvasNodeVisible(reopened.nodes[0], { colorFilter: '#22c55e' })
  ).toBe(false)
  expect(reopened.nodes).toHaveLength(1)
})

test('disabled node labels cannot edit a busy node', () => {
  const callback = vi.fn()
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'shot'
  )
  render(
    <StudioNodeLabels
      data={project.nodes[0].data}
      disabled
      onChange={callback}
    />
  )
  expect(screen.getByRole('combobox', { name: 'Node rating' })).toBeDisabled()
  expect(screen.getByLabelText('Node label color')).toBeDisabled()
})

test('switching image models resets unsupported settings and keeps valid local dimensions', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'image',
    'frame'
  )
  const data = {
    ...project.nodes[0].data,
    imageSize: '640x384',
    imageQuality: 'ultra',
    imageCount: 5,
  }
  expect(studioImageModelPatch(data, 'flux.2-klein-4b')).toMatchObject({
    imageSize: '640x384',
    imageQuality: undefined,
    imageCount: 1,
  })
  expect(studioImageModelPatch(data, 'unconfigured-image')).toMatchObject({
    imageSize: undefined,
    imageQuality: undefined,
    imageCount: 1,
  })
})
