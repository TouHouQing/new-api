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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { StudioCanvasHistory } from '../studio-canvas-commands'
import { StudioCanvasEditor, StudioFrameNode } from '../studio-canvas-editor'
import { addStudioNode, createStudioProject } from '../workspace'

vi.mock('@/components/ai-elements/canvas', () => ({ Canvas: () => <div /> }))
vi.mock('@xyflow/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@xyflow/react')>()),
  NodeResizer: () => null,
}))

test('Escape cancels a group rename and the next Enter commits the new name', async () => {
  const user = userEvent.setup(),
    rename = vi.fn()
  render(
    <StudioFrameNode
      selected={false}
      data={{
        kind: 'text',
        title: 'Scene one',
        prompt: '',
        canvasFrame: {
          id: 'frame',
          title: 'Scene one',
          nodeIds: ['a', 'b'],
          x: 0,
          y: 0,
          width: 800,
          height: 500,
        },
        renameFrame: rename,
      }}
    />
  )
  const input = screen.getByRole('textbox', { name: 'Canvas group name' })
  await user.clear(input)
  await user.type(input, 'Discarded name')
  await user.keyboard('{Escape}')
  expect(input).toHaveValue('Scene one')
  expect(rename).not.toHaveBeenCalled()
  await user.clear(input)
  await user.type(input, 'Scene two')
  await user.keyboard('{Enter}')
  expect(rename).toHaveBeenCalledWith('Scene two')
})

test('a viewer can find nodes but cannot create or lay out a shared canvas', async () => {
  const user = userEvent.setup()
  const project = addStudioNode(
    createStudioProject('Film', 'viewer'),
    'text',
    'existing'
  )
  const onEdit = vi.fn()
  render(
    <StudioCanvasEditor
      readOnly
      project={project}
      nodes={project.nodes}
      history={new StudioCanvasHistory()}
      onEdit={onEdit}
      onSelect={() => {}}
      onRun={() => {}}
      onError={() => {}}
    />
  )
  expect(
    screen.getByRole('button', { name: 'studio.canvas.layout' })
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Group selected nodes' })
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Ungroup selected nodes' })
  ).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'studio.canvas.search' }))
  const d = screen.getByRole('dialog')
  expect(
    within(d).getByRole('option', { name: /studio.catalog.text/ })
  ).toHaveAttribute('aria-disabled', 'true')
  expect(
    within(d).getByRole('option', { name: project.nodes[0].data.title })
  ).not.toHaveAttribute('aria-disabled', 'true')
  expect(onEdit).not.toHaveBeenCalled()
})
