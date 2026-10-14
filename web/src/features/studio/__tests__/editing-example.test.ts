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
import { createInstance } from 'i18next'
import { expect, test, vi } from 'vitest'

import { loadStudioEditingExample } from '../studio-creation-demo'
import { createStudioProject } from '../workspace'

test('the free example keeps shot and clip names aligned and supplies a named reusable music source', async () => {
  const i18n = createInstance()
  await i18n.init({
    lng: 'zh',
    resources: {
      zh: {
        translation: {
          'studio.creation.demo.story': '晨光洒落城镇。\n\n夕阳照在水边。',
          'Example shot {{number}}': '示例镜头 {{number}}',
          'Example music': '示例配乐',
        },
      },
    },
  })
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (url) =>
      new Response(
        new Blob(['example media'], {
          type: String(url).endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4',
        })
      )
  )
  const stored = new Map<string, Blob>()
  try {
    const project = await loadStudioEditingExample(
      createStudioProject('Trial', 'trial'),
      async (id, media) => {
        stored.set(id, media)
      },
      i18n.getFixedT('zh')
    )
    expect(project.shots?.map((shot) => shot.title)).toEqual([
      '示例镜头 1',
      '示例镜头 2',
    ])
    for (const shot of project.shots || []) {
      expect(
        project.nodes.find((node) => node.id === shot.videoNodeId)?.data.title
      ).toBe(shot.title)
    }
    const musicId = project.production?.audioTracks[0].mediaId
    const music = project.nodes.find((node) => node.data.mediaId === musicId)
    expect(music?.data).toMatchObject({
      kind: 'audio',
      title: '示例配乐',
      status: 'completed',
      sourceMode: 'upload',
    })
    expect(musicId && stored.has(musicId)).toBe(true)
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      '/studio-example/shot-1.mp4',
      '/studio-example/shot-2.mp4',
      '/studio-example/music.mp3',
    ])
  } finally {
    fetch.mockRestore()
  }
})
