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
import { describe, expect, test } from 'vitest'

import type { StudioAsset } from '../local-projects'
import {
  compileStudioContinuityPrompt,
  resolveStudioAssetReference,
} from '../studio-continuity'

const assets: StudioAsset[] = [
  { id: 'mira', kind: 'character', title: 'Mira', prompt: 'red silk scarf' },
  { id: 'set', kind: 'location', title: 'Atrium', prompt: 'rainy glass roof' },
  { id: 'look', kind: 'style', title: 'Watercolor', prompt: 'soft washes' },
]

describe('Studio continuity prompt', () => {
  test('a pinned asset reference resolves immutable prompt and media', () => {
    const asset: StudioAsset = {
      id: 'hero',
      kind: 'character',
      title: 'Hero',
      prompt: 'Blue coat',
      mediaId: 'current',
      versions: [
        {
          id: 'v1',
          createdAt: '2026-09-26T00:00:00Z',
          prompt: 'Red coat',
          mediaId: 'archived',
          outputUrl: 'https://example.test/archived.png',
        },
      ],
    }

    expect(resolveStudioAssetReference(asset, 'v1')).toEqual({
      prompt: 'Red coat',
      mediaId: 'archived',
      outputUrl: 'https://example.test/archived.png',
    })
  })
  test('keeps the manual shot prompt and appends selected assets in project order', () => {
    expect(
      compileStudioContinuityPrompt({
        prompt: 'Mira enters the atrium.\nKeep the camera low.',
        assets,
        assetIds: ['look', 'mira', 'set'],
        previousShotNote: 'She was carrying an umbrella.',
      })
    ).toBe(
      'Mira enters the atrium.\nKeep the camera low.\n\n' +
        'character: Mira — red silk scarf\n\n' +
        'location: Atrium — rainy glass roof\n\n' +
        'style: Watercolor — soft washes\n\n' +
        'Previous shot: She was carrying an umbrella.'
    )
  })

  test('does not repeat descriptions already written in the manual prompt', () => {
    const prompt = 'Mira wears a red silk scarf under the rainy glass roof.'

    expect(
      compileStudioContinuityPrompt({
        prompt,
        assets,
        assetIds: ['mira', 'set'],
        previousShotNote: 'Mira wears a red silk scarf',
      })
    ).toBe(prompt)
  })

  test('does not append context again when a compiled prompt is reused', () => {
    const input = {
      prompt: '雨夜，米拉走进门厅。',
      assets: [
        {
          id: 'mira',
          kind: 'character' as const,
          title: '米拉',
          prompt: '红色丝巾',
        },
      ],
      assetIds: ['mira', 'mira'],
      previousShotNote: '上一镜她撑着伞。',
    }
    const compiled = compileStudioContinuityPrompt(input)

    expect(compiled).toBe(
      '雨夜，米拉走进门厅。\n\ncharacter: 米拉 — 红色丝巾\n\nPrevious shot: 上一镜她撑着伞。'
    )
    expect(compileStudioContinuityPrompt({ ...input, prompt: compiled })).toBe(
      compiled
    )
  })

  test('returns the manual prompt unchanged when no usable context is selected', () => {
    const prompt = '  Keep this spacing.\n\nAnd this paragraph.  '

    expect(
      compileStudioContinuityPrompt({
        prompt,
        assets,
        assetIds: ['missing'],
        previousShotNote: '   ',
      })
    ).toBe(prompt)
  })

  test('pinned asset versions use their saved description across shots', () => {
    expect(
      compileStudioContinuityPrompt({
        prompt: 'The hero turns.',
        assets: [
          {
            id: 'hero',
            kind: 'character',
            title: 'Hero',
            prompt: 'Blue coat',
            versions: [
              {
                id: 'v1',
                createdAt: '2026-09-26T00:00:00Z',
                prompt: 'Red coat',
              },
            ],
          },
        ],
        assetIds: ['hero'],
        assetVersionIds: { hero: 'v1' },
      })
    ).toBe('The hero turns.\n\ncharacter: Hero — Red coat')
  })

  test('missing pinned asset versions fail instead of silently using the current description', () => {
    expect(() =>
      compileStudioContinuityPrompt({
        prompt: 'The hero turns.',
        assets,
        assetIds: ['mira'],
        assetVersionIds: { mira: 'deleted-version' },
      })
    ).toThrow('Pinned Studio asset version is unavailable')
  })

  test('an intentionally empty pinned description does not fall through to the editable current draft', () => {
    expect(
      compileStudioContinuityPrompt({
        prompt: 'The hero turns.',
        assets: [
          {
            id: 'hero',
            kind: 'character',
            title: 'Hero',
            prompt: 'Blue coat',
            versions: [
              { id: 'v1', createdAt: '2026-09-26T00:00:00Z', prompt: '' },
            ],
          },
        ],
        assetIds: ['hero'],
        assetVersionIds: { hero: 'v1' },
      })
    ).toBe('The hero turns.\n\ncharacter: Hero')
  })
})
