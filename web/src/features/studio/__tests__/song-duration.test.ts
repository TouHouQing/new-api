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

import { studioSongDuration } from '../studio-song-duration'

test('lyrics estimate includes the final line and counts Chinese characters without pretending the local maximum fits everything', () => {
  expect(
    studioSongDuration(
      'Hello my friend\nWe walk together\nHere in the sunlight\nFriends forever'
    )
  ).toBe(15)
  expect(studioSongDuration('小狐狸走过森林\n蓝色灯笼照亮家园')).toBe(16)
  expect(studioSongDuration('[Verse]\nHello')).toBe(8)
  expect(
    studioSongDuration(Array(50).fill('We walk together').join('\n'))
  ).toBeGreaterThan(30)
})
