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
import { expect, test, vi } from 'vitest'

import { loadStudioAssemblyBlobs } from '../assembly-media'

test('assembly loads clips in shot order and refetches an artifact when local media is missing', async () => {
  const local = new Blob(['first'], { type: 'video/mp4' })
  const remote = new Blob(['second'], { type: 'video/mp4' })
  const get = vi.fn(async (_userId: number, mediaId: string) =>
    mediaId === 'clip-1' ? local : null
  )
  const contentUrl = vi.fn(
    async () => '/v1/tasks/task-2/artifacts/video/content?access=capability'
  )
  const fetchContent = vi.fn(async () => ({
    ok: true,
    blob: async () => remote,
  }))
  const clips = await loadStudioAssemblyBlobs(
    [
      { shotId: 's1', title: 'Opening', mediaId: 'clip-1', taskId: undefined },
      { shotId: 's2', title: 'Arrival', mediaId: 'missing', taskId: 'task-2' },
    ],
    12,
    { get },
    contentUrl,
    fetchContent
  )
  expect(clips).toEqual([local, remote])
  expect(contentUrl).toHaveBeenCalledWith('task-2')
  expect(fetchContent).toHaveBeenCalledWith(
    '/v1/tasks/task-2/artifacts/video/content?access=capability',
    { credentials: 'same-origin' }
  )
})

test('assembly reports the affected shot when its task artifact download fails', async () => {
  const clips = [{ shotId: 's1', title: 'Opening', taskId: 'task-1' }]
  await expect(
    loadStudioAssemblyBlobs(
      clips,
      12,
      { get: async () => null },
      async () => '/v1/tasks/task-1/artifacts/video/content',
      async () => ({ ok: false, status: 403, blob: async () => new Blob() })
    )
  ).rejects.toMatchObject({ code: 'download_failed', shotTitle: 'Opening' })
})
