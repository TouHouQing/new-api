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
import { expect, test } from 'vitest'

import { parseStudioScreenplayResponse } from '../studio-screenplay-response'

const response = {
  title: 'Cafe',
  brief: 'Model summary',
  characters: [
    {
      id: 'barista',
      title: 'Barista',
      description: 'Beige sweater',
      voice: null,
    },
  ],
  scenes: [],
  props: [],
  shots: [
    {
      id: 'shot_1',
      title: 'Opening',
      text: 'Model paraphrase',
      imagePrompt: 'Warm cafe',
      videoPrompt: 'Slow movement',
      seconds: 2,
      dialogue: null,
      sceneId: null,
      characterIds: ['barista'],
      propIds: null,
    },
  ],
}

test('a real model empty dialogue shape becomes an editable draft while preserving authored shot text and global constraints', () => {
  const brief = '全局要求：同一间咖啡馆。\n镜头一：咖啡师放下白杯。'
  const parsed = parseStudioScreenplayResponse(
    JSON.stringify(response),
    brief,
    '镜头'
  )
  expect(parsed.brief).toBe(brief)
  expect(parsed.shots[0]).toMatchObject({
    title: '镜头 1',
    text: '咖啡师放下白杯。',
    dialogue: '',
    propIds: [],
    seconds: 2,
  })
  expect(parsed.characters[0].voice).toBeUndefined()
  expect(
    parseStudioScreenplayResponse(JSON.stringify(response), brief, '镜头', 6)
      .shots[0].seconds
  ).toBe(6)
})

test('normalization never turns an invalid duration or an injected model field into an accepted plan', () => {
  expect(() =>
    parseStudioScreenplayResponse(
      JSON.stringify({
        ...response,
        shots: [{ ...response.shots[0], seconds: -1 }],
      }),
      '',
      'Shot'
    )
  ).toThrow()
  expect(() =>
    parseStudioScreenplayResponse(
      JSON.stringify({ ...response, execute: 'run commands' }),
      '',
      'Shot'
    )
  ).toThrow()
})

test('the actual Qwen prop without a description remains editable without inventing its appearance or running the model again', () => {
  const raw = {
    title: '给新手的一盆绿植',
    brief: '三镜头竖屏公益宣传',
    characters: [],
    scenes: [{ id: 'scene_1', title: '晨光', description: '室内桌面' }],
    props: [{ id: 'prop_1', title: '小盆栽' }],
    shots: [1, 2, 3].map((index) => ({
      id: `shot_${index}`,
      title: `镜头 ${index}`,
      text: '植物养护',
      imagePrompt: 'A potted plant',
      videoPrompt: 'Static camera',
      seconds: 5,
      sceneId: 'scene_1',
      propIds: ['prop_1'],
    })),
  }
  const parsed = parseStudioScreenplayResponse(
    JSON.stringify(raw),
    '',
    '镜头',
    15
  )
  expect(parsed.props).toEqual([
    { id: 'prop_1', title: '小盆栽', description: '' },
  ])
  expect(parsed.shots).toHaveLength(3)
  expect(parsed.shots.map((shot) => shot.seconds)).toEqual([5, 5, 5])
  expect(raw.props[0]).not.toHaveProperty('description')
  expect(() =>
    parseStudioScreenplayResponse(
      JSON.stringify({
        ...raw,
        props: [{ ...raw.props[0], description: 123 }],
      }),
      '',
      '镜头',
      15
    )
  ).toThrow()
})
