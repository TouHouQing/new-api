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
