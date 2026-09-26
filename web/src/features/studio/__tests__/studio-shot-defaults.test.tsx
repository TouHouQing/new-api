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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { StudioShotDefaults } from '../studio-shot-defaults'

test('editing project defaults updates future shot settings without creating a shot', async () => {
  const onChange = vi.fn()
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StudioShotDefaults
        value={{}}
        groups={[{ id: 'default', description: 'Default' }]}
        userGroup='default'
        textModels={['writer-model']}
        imageModels={['image-model']}
        onChange={onChange}
      />
    </QueryClientProvider>
  )

  await user.click(
    screen.getByRole('button', { name: 'studio.defaults.title' })
  )
  expect(
    screen.queryByRole('combobox', { name: 'studio.video.family' })
  ).toBeNull()
  fireEvent.change(screen.getByLabelText('studio.duration'), {
    target: { value: '30' },
  })
  expect(onChange).toHaveBeenCalledWith({ seconds: 30 })
  fireEvent.change(screen.getByLabelText('studio.ratio'), {
    target: { value: '9:16' },
  })
  expect(onChange).toHaveBeenCalledWith({ ratio: '9:16' })
})
