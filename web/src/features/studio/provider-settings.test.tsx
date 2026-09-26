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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { StudioProviderSettings } from './provider-settings'

test('saves text credentials through the server and clears the secret input', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn(async () => undefined)
  render(
    <StudioProviderSettings
      open
      initialKind='text'
      configs={{}}
      modelCounts={{}}
      onOpenChange={vi.fn()}
      onSave={onSave}
      onRefresh={vi.fn()}
      onDelete={vi.fn()}
    />
  )

  await user.type(
    screen.getByLabelText('studio.provider.baseUrl'),
    'https://api.example.com/v1'
  )
  await user.type(
    screen.getByLabelText('studio.provider.apiKey'),
    'sk-test-secret'
  )
  await user.click(
    screen.getByRole('button', { name: 'studio.provider.saveAndFetch' })
  )

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith(
      'text',
      'https://api.example.com/v1',
      'sk-test-secret'
    )
    expect(
      (screen.getByLabelText('studio.provider.apiKey') as HTMLInputElement)
        .value
    ).toBe('')
  })
})
