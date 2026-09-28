/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { StudioTextResultEditor } from '../studio-text-result-editor'
import {
  addStudioNode,
  createStudioProject,
  updateStudioNode,
} from '../workspace'

test('edited text results are saved explicitly and cancellation keeps the previous version', () => {
  let project = addStudioNode(
    createStudioProject('Text', 'p-text'),
    'text',
    'text'
  )
  project = updateStudioNode(project, 'text', {
    status: 'completed',
    outputText: 'Original scene',
    outputImagePrompt: 'Original still',
    outputVideoPrompt: 'Original motion',
  })
  const onSave = vi.fn()
  render(<StudioTextResultEditor node={project.nodes[0]} onSave={onSave} />)
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.text.editResults' })
  )
  fireEvent.change(screen.getByLabelText('studio.text.videoPrompt'), {
    target: { value: 'New motion' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.text.cancelEdit' })
  )
  expect(onSave).not.toHaveBeenCalled()
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.text.editResults' })
  )
  fireEvent.change(screen.getByLabelText('studio.text.videoPrompt'), {
    target: { value: 'New motion' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.text.saveResults' })
  )
  expect(onSave).toHaveBeenCalledWith({
    scene: 'Original scene',
    imagePrompt: 'Original still',
    videoPrompt: 'New motion',
  })
})
