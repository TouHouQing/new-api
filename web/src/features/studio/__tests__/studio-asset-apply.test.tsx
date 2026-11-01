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

test('locking the current reference version is explicit and shows saved versions', () => {
  const onCreateVersion = vi.fn()
  const onUpdate = vi.fn()
  render(
    <StudioAssetLibrary
      assets={[
        {
          id: 'hero',
          kind: 'character',
          title: 'Mira',
          prompt: 'Blue coat',
          versions: [
            {
              id: 'v1',
              createdAt: '2026-09-26T00:00:00Z',
              prompt: 'Red scarf',
            },
          ],
        },
      ]}
      previews={{}}
      projectId='film'
      onAdd={vi.fn()}
      onUpdate={onUpdate}
      onUpload={vi.fn()}
      onDelete={vi.fn()}
      onCreateVersion={onCreateVersion}
    />
  )

  expect(screen.getByText('Red scarf')).toBeTruthy()
  expect(onCreateVersion).not.toHaveBeenCalled()
  fireEvent.click(
    screen.getByRole('button', { name: 'Mira studio.asset.lockVersion' })
  )
  expect(onCreateVersion).toHaveBeenCalledWith('hero')
  expect(onUpdate).not.toHaveBeenCalled()
})

test('a viewer can inspect reference details while every mutation remains disabled', () => {
  const writes = {
    onAdd: vi.fn(),
    onUpdate: vi.fn(),
    onUpload: vi.fn(),
    onDelete: vi.fn(),
    onApplyToShots: vi.fn(),
    onCreateVersion: vi.fn(),
    onPlaceOnCanvas: vi.fn(),
  }
  render(
    <StudioAssetLibrary
      {...writes}
      readOnly
      compact
      assets={[
        {
          id: 'hero',
          kind: 'character',
          title: 'Mira',
          prompt: 'Blue coat',
          profile: { appearance: 'Round glasses' },
          versions: [
            {
              id: 'v1',
              createdAt: '2026-09-26T00:00:00Z',
              prompt: 'Red scarf',
            },
          ],
        },
      ]}
      previews={{}}
      projectId='film'
    />
  )
  const details = screen.getByRole('button', {
    name: 'Reference description and details',
  })
  expect(details).not.toBeDisabled()
  fireEvent.click(details)
  const profile = screen.getByRole('button', {
    name: /^studio\.asset\.profile$/,
  })
  expect(profile).not.toBeDisabled()
  fireEvent.click(profile)
  expect(screen.getByDisplayValue('Round glasses')).toBeDisabled()
  expect(screen.getByDisplayValue('Blue coat')).toBeDisabled()
  expect(
    screen.getByRole('textbox', { name: 'Mira studio.asset.name' })
  ).toBeDisabled()
  expect(screen.getByLabelText('Mira studio.asset.reference')).toBeDisabled()
  for (const name of [
    'studio.asset.placeOnCanvas',
    'Mira studio.asset.lockVersion',
    'Mira studio.asset.applyToShots',
    'studio.asset.delete',
  ]) {
    const button = screen.getByRole('button', { name })
    expect(button).toBeDisabled()
    fireEvent.click(button)
  }
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Find a character or scene' }),
    { target: { value: 'Mira' } }
  )
  expect(screen.getByText('Red scarf')).toBeVisible()
  Object.values(writes).forEach((callback) =>
    expect(callback).not.toHaveBeenCalled()
  )
})

test('an object reference keeps its persisted kind and displays its actual subject type', () => {
  render(
    <StudioAssetLibrary
      assets={[
        {
          id: 'cup',
          kind: 'character',
          title: 'Cup',
          prompt: 'blue cup',
          profile: { subjectType: 'object' },
        },
      ]}
      previews={{}}
      projectId='film'
      onAdd={vi.fn()}
      onUpdate={vi.fn()}
      onUpload={vi.fn()}
      onDelete={vi.fn()}
    />
  )
  expect(screen.getByText('Object or product')).toBeVisible()
  // The add-card selector still uses the persisted character kind.
  expect(screen.getAllByText('studio.asset.character')).toHaveLength(1)
})
