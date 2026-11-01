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
  studioRemoveVisualPreset,
  studioRestoreVisualPreset,
  studioVisualPresetVersion,
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

test('removing an applied preset protects hand edits, shared fields and immutable media history', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'shot'
  )
  const push = STUDIO_VISUAL_PRESETS[0]
  const cinema = STUDIO_VISUAL_PRESETS.find(
    (item) => item.id === 'style-cinema'
  )
  if (!cinema) throw new Error('Missing cinema preset')
  const shared = { ...push, id: 'shared', camera: { lens: '50mm' } }
  const data = {
    ...project.nodes[0].data,
    prompt: `My hand edited cinema phrase: ${cinema.prompt} with softer skin.`,
    camera: {
      movement: 'my manual path',
      shotSize: 'medium shot',
      lens: '50mm',
    },
    visualPresetIds: ['camera-push@1', 'shared@1', 'style-cinema@1'],
    mediaId: 'approved-media',
    selectedTakeId: 'approved-take',
    takes: [
      {
        id: 'approved-take',
        mediaId: 'approved-media',
        prompt: 'original',
        createdAt: new Date().toISOString(),
        status: 'completed' as const,
      },
    ],
  }
  const result = studioRemoveVisualPreset(data, 'camera-push@1', [
    ...STUDIO_VISUAL_PRESETS,
    shared,
  ])
  expect(result.changes).toEqual([{ field: 'shotSize', value: 'medium shot' }])
  const updated = { ...data, ...result.patch }
  expect(updated.camera).toEqual({ movement: 'my manual path', lens: '50mm' })
  expect(updated.takes).toBe(data.takes)
  expect(updated.mediaId).toBe('approved-media')
  expect(updated.selectedTakeId).toBe('approved-take')
  expect(
    studioRemoveVisualPreset(updated, 'style-cinema@1', STUDIO_VISUAL_PRESETS)
      .patch.prompt
  ).toBe(data.prompt)
})

test('removal uses fixed historical preset definitions and clears only an exact appended prompt line', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'shot'
  )
  const base = STUDIO_VISUAL_PRESETS.find((item) => item.id === 'style-cinema')
  if (!base) throw new Error('Missing cinema preset')
  const revised = {
    ...base,
    version: 2,
    archived: true,
    prompt: 'new style',
    history: [{ ...base, version: 1 }],
  }
  const data = {
    ...project.nodes[0].data,
    prompt: `My subject\n${base.prompt}`,
    visualPresetIds: ['style-cinema@1'],
  }
  expect(studioVisualPresetVersion('style-cinema@1', [revised])?.prompt).toBe(
    base.prompt
  )
  expect(
    studioRemoveVisualPreset(data, 'style-cinema@1', [revised]).patch
  ).toMatchObject({ prompt: 'My subject', visualPresetIds: [] })
  const restored = studioRestoreVisualPreset(revised)
  expect(restored.version).toBe(3)
  expect(restored.history.map((item) => item.version)).toEqual([1, 2])
  expect(studioVisualPresetVersion('style-cinema@2', [restored])?.prompt).toBe(
    'new style'
  )
  expect(() =>
    studioRestoreVisualPreset({
      ...revised,
      history: Array.from({ length: 20 }, (_, index) => ({
        ...base,
        version: index + 1,
      })),
    })
  ).toThrow('Preset history is full')
})

test('personal preset archive and restore retain fixed definitions and applied links', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'shot'
  )
  const personal = {
    ...STUDIO_VISUAL_PRESETS[0],
    id: 'mine',
    name: 'My archived camera',
  }
  project.nodes[0].data.visualPresetIds = ['mine@1']
  let latest: StudioVisualPreset[] = []
  function Host() {
    const [presets, setPresets] = useState([personal])
    return (
      <StudioVisualPresetLibrary
        node={project.nodes[0]}
        presets={presets}
        favorites={[]}
        onApply={() => {}}
        onSave={(next) => {
          latest = next
          setPresets(next)
        }}
        demoManifest={{}}
      />
    )
  }
  render(<Host />)
  fireEvent.click(screen.getByRole('button', { name: 'Archive preset' }))
  expect(latest[0]).toMatchObject({ id: 'mine', version: 1, archived: true })
  expect(screen.queryByText('My archived camera · v1')).toBeVisible() // applied fixed version remains
  fireEvent.click(screen.getByRole('button', { name: 'Archived presets' }))
  expect(
    screen.getByRole('button', { name: 'Restore archived preset' })
  ).toBeVisible()
  fireEvent.click(
    screen.getByRole('button', { name: 'Restore archived preset' })
  )
  expect(latest[0].archived).toBe(false)
  expect(project.nodes[0].data.visualPresetIds).toEqual(['mine@1'])
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
    version: 3,
    license: 'Owned settings',
  })
  expect(
    reopened.production?.visualPresets[0].history.map((item) => item.version)
  ).toEqual([1, 2])
})
