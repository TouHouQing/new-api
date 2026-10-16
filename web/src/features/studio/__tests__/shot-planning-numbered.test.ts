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

import { planLocalStudioShots } from '../studio-shot-planning'

test('explicit Chinese shot labels retain sentences within three shots and exclude global requirements', () => {
  const result = planLocalStudioShots(
    '咖啡馆短片。统一要求：暖色，女主穿白衣。\n镜头一：女主推门。停下看窗外。\n镜头二：咖啡特写。蒸汽缓缓升起。\n镜头三：女主微笑。\n全局要求：不要字幕。',
    12
  )
  expect(result).toHaveLength(3)
  expect(result[0].text).toBe('女主推门。停下看窗外。')
  expect(result[1].text).toBe('咖啡特写。蒸汽缓缓升起。')
  expect(result[2].text).toBe('女主微笑。')
  expect(result[0].imagePrompt).toContain('暖色，女主穿白衣')
  expect(result[0].imagePrompt).not.toContain('咖啡特写')
})

test('English numbered shot labels retain multi-line directions', () => {
  const result = planLocalStudioShots(
    'Shot 1: Open the door.\nCamera follows her.\nShot 2: Coffee close-up. Steam rises.',
    12
  )
  expect(result.map((shot) => shot.text)).toEqual([
    'Open the door.\nCamera follows her.',
    'Coffee close-up. Steam rises.',
  ])
})

test('inline global requirements are shared without becoming the final shot action', () => {
  const shots = planLocalStudioShots(
    '为咖啡店制作12秒开业短片。镜头一：店门打开。镜头二：咖啡师递出杯子。镜头三：顾客微笑。整体要求：温暖真实，女咖啡师穿米色毛衣。',
    12
  )
  expect(shots.map((shot) => shot.text)).toEqual([
    '店门打开。',
    '咖啡师递出杯子。',
    '顾客微笑。',
  ])
  expect(shots.every((shot) => shot.imagePrompt?.includes('米色毛衣'))).toBe(
    true
  )
  expect(shots[0].text).not.toContain('整体要求')
})

test('English inline shots preserve punctuation and scope closing requirements to the final shot', () => {
  const shots = planLocalStudioShots(
    'Shot 1: A garden. Shot 2: A cup. Global requirements: Warm daylight; closing: show the invitation.',
    2
  )
  expect(shots.map((shot) => shot.text)).toEqual(['A garden.', 'A cup.'])
  expect(shots[0].videoPrompt).toContain('Warm daylight')
  expect(shots[0].videoPrompt).not.toContain('show the invitation')
  expect(shots[1].videoPrompt).toContain('show the invitation')
})
