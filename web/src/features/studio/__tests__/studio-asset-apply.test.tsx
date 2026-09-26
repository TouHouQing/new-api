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

import { StudioAssetLibrary } from '../studio-asset-library'

test('a reusable character can be applied to every storyboard shot', () => {
  const onApplyToShots = vi.fn()
  render(
    <StudioAssetLibrary
      assets={[
        { id: 'hero', kind: 'character', title: 'Mira', prompt: 'red scarf' },
      ]}
      previews={{}}
      projectId='film'
      onAdd={vi.fn()}
      onUpdate={vi.fn()}
      onUpload={vi.fn()}
      onDelete={vi.fn()}
      onApplyToShots={onApplyToShots}
    />
  )
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Mira studio.asset.applyToShots',
    })
  )
  expect(onApplyToShots).toHaveBeenCalledWith('hero')
})
