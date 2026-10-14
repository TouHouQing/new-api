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
import { useState } from 'react'
import { expect, test } from 'vitest'

import { studioProjectSchema } from '../local-projects'
import { studioProductionSchema } from '../studio-production'
import { StudioVisualPresetLibrary } from '../studio-visual-preset-library'
import {
  STUDIO_VISUAL_PRESETS,
  studioApplyVisualPreset,
  type StudioVisualPreset,
} from '../studio-visual-presets'
import { addStudioNode, createStudioProject } from '../workspace'

test('visual preset edits inputs while retaining source media and approved Takes', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'shot'
  )
  const data = {
    ...project.nodes[0].data,
    prompt: 'My actor',
    mediaId: 'source',
    selectedTakeId: 'approved',
    camera: { angle: 'low angle' },
  }
  const patch = studioApplyVisualPreset(data, STUDIO_VISUAL_PRESETS[0])
  expect({ ...data, ...patch }).toMatchObject({
    mediaId: 'source',
    selectedTakeId: 'approved',
    camera: { angle: 'low angle', movement: 'slow dolly in' },
  })
  const style = STUDIO_VISUAL_PRESETS.find(
    (preset) => preset.id === 'style-cinema'
  )
  expect(style).toBeDefined()
  if (!style) {
    throw new Error('Missing cinema preset')
  }
  const first = { ...data, ...studioApplyVisualPreset(data, style) }
  expect(studioApplyVisualPreset(first, style).prompt).toBe(first.prompt)
})

test('personal preset can be saved, revised, rolled back and reopened with its license', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'shot'
  )
  function Host() {
    const [presets, setPresets] = useState<StudioVisualPreset[]>([])
    const [favorites, setFavorites] = useState<string[]>([])
    return (
      <StudioVisualPresetLibrary
        node={project.nodes[0]}
        presets={presets}
        favorites={favorites}
        onApply={() => {}}
        onSave={(next, saved) => {
          setPresets(next)
          setFavorites(saved)
          project.production = studioProductionSchema.parse({
            visualPresets: next,
            visualPresetFavorites: saved,
          })
        }}
      />
    )
  }
  render(<Host />)
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Personal preset name' }),
    { target: { value: 'My camera' } }
  )
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Preset commercial use note' }),
    { target: { value: 'Owned settings' } }
  )
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Save current settings as preset',
    })
  )
  expect(screen.getByText('My camera · v1')).toBeVisible()
  fireEvent.click(
    screen.getByRole('button', { name: 'Update from current settings' })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Save preset revision' }))
  expect(screen.getByText('My camera · v2')).toBeVisible()
  fireEvent.click(
    screen.getByRole('button', { name: 'Restore previous preset version' })
  )
  const reopened = studioProjectSchema.parse(
    JSON.parse(JSON.stringify(project))
  )
  expect(reopened.production?.visualPresets[0]).toMatchObject({
    name: 'My camera',
    version: 1,
    license: 'Owned settings',
  })
})
