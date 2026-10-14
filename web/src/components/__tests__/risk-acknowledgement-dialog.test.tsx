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
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { RiskAcknowledgementDialog } from '../risk-acknowledgement-dialog'

afterEach(() => vi.useRealTimers())

test('changing the risk text invalidates prior acknowledgement even when the checklist length stays the same', async () => {
  vi.useFakeTimers()
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Confirm action',
    description: 'Review the current risk',
    onConfirm: vi.fn(),
  }
  const view = render(
    <RiskAcknowledgementDialog {...props} checklist={['Delete draft A']} />
  )
  await act(() => vi.advanceTimersByTimeAsync(1))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Delete draft A' }))
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
  view.rerender(
    <RiskAcknowledgementDialog {...props} checklist={['Delete draft B']} />
  )
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(
    screen.getByRole('checkbox', { name: 'Delete draft B' })
  ).not.toBeChecked()
})

test('changing the target text clears the old typed confirmation before another action can be approved', async () => {
  vi.useFakeTimers()
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Confirm action',
    description: 'Review the current target',
    onConfirm: vi.fn(),
  }
  const view = render(
    <RiskAcknowledgementDialog {...props} requiredText='draft-A' />
  )
  await act(() => vi.advanceTimersByTimeAsync(1))
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'draft-A' },
  })
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
  view.rerender(<RiskAcknowledgementDialog {...props} requiredText='draft-B' />)
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(screen.getByRole('textbox')).toHaveValue('')
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
})
