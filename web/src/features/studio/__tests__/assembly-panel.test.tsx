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

import { StudioAssemblyPanel } from '../studio-assembly-panel'

test('assembly panel starts and cancels a browser MP4 export with visible progress', () => {
  const onAssemble = vi.fn()
  const onCancel = vi.fn()
  const props = { onAssemble, onCancel, onDownload: vi.fn() }
  const { rerender } = render(
    <StudioAssemblyPanel {...props} busy={false} progress={0} />
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.assembly.create' })
  )
  expect(onAssemble).toHaveBeenCalledOnce()
  rerender(<StudioAssemblyPanel {...props} busy progress={42} />)
  expect(
    screen
      .getByRole('progressbar', { name: 'studio.assembly.progress' })
      .getAttribute('value')
  ).toBe('42')
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.assembly.cancel' })
  )
  expect(onCancel).toHaveBeenCalledOnce()
})

test('assembly panel offers a saved MP4 for preview and download', () => {
  const onDownload = vi.fn()
  render(
    <StudioAssemblyPanel
      busy={false}
      progress={100}
      previewUrl='blob:assembled'
      onAssemble={vi.fn()}
      onCancel={vi.fn()}
      onDownload={onDownload}
    />
  )
  expect(screen.getByLabelText('studio.assembly.preview')).toHaveAttribute(
    'src',
    'blob:assembled'
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.assembly.download' })
  )
  expect(onDownload).toHaveBeenCalledOnce()
})
