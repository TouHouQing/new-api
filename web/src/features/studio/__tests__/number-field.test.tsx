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
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { StudioNumberField } from '../studio-number-field'

test('invalid volume remains editable and cannot replace the valid timeline value', () => {
  const change = vi.fn()
  render(
    <StudioNumberField
      id='volume'
      label='Volume'
      value={0.5}
      min={0}
      max={1}
      onChange={change}
    />
  )
  const input = screen.getByLabelText('Volume')
  for (const text of ['', '-1', '2', 'wrong']) {
    fireEvent.change(input, { target: { value: text } })
    fireEvent.blur(input)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(change).not.toHaveBeenCalled()
  }
  fireEvent.change(input, { target: { value: '.8' } })
  fireEvent.blur(input)
  expect(change).toHaveBeenCalledWith(0.8)
})

test('clearing an optional trim endpoint restores the full source without writing zero', () => {
  const change = vi.fn()
  render(
    <StudioNumberField
      id='end'
      label='End'
      value={3}
      optional
      min={0}
      max={3600}
      onChange={change}
    />
  )
  const input = screen.getByLabelText('End')
  fireEvent.change(input, { target: { value: '' } })
  fireEvent.blur(input)
  expect(input).toHaveAttribute('aria-invalid', 'false')
  expect(change).toHaveBeenCalledWith(undefined)
})
