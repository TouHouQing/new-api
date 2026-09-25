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
import { expect, test } from 'vitest'

import { stitchStudioVideos } from '../studio-mp4'

test('MP4 assembly refuses an empty or invalid clip before producing an output', async () => {
  await expect(stitchStudioVideos([])).rejects.toThrow('at least one video')
  await expect(
    stitchStudioVideos([new Blob(['not a video'], { type: 'video/mp4' })])
  ).rejects.toThrow()
})

test('a canceled MP4 export stops before opening a video decoder', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(
    stitchStudioVideos([new Blob(['clip'])], undefined, controller.signal)
  ).rejects.toMatchObject({ name: 'AbortError' })
})
