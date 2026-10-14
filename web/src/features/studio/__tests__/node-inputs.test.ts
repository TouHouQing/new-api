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

import {
  addStudioNode,
  createStudioProject,
  recordStudioTake,
  updateStudioNode,
} from '../workspace'

test('changing a generated image camera invalidates the selected output and keeps its Take', () => {
  let project = addStudioNode(
    createStudioProject('Film', 'project'),
    'image',
    'image'
  )
  project = updateStudioNode(project, 'image', {
    model: 'image-model',
    prompt: 'Portrait',
    camera: { movement: 'static' },
  })
  project = recordStudioTake(project, 'image', {
    id: 'take',
    createdAt: '2026-09-28T00:00:00Z',
    prompt: 'Portrait',
    model: 'image-model',
    status: 'completed',
    mediaId: 'image-media',
  })

  const edited = updateStudioNode(project, 'image', {
    camera: { movement: 'tracking' },
  })

  expect(edited.nodes[0].data.status).toBe('idle')
  expect(edited.nodes[0].data.mediaId).toBeUndefined()
  expect(edited.nodes[0].data.selectedTakeId).toBeUndefined()
  expect(edited.nodes[0].data.takes?.[0].mediaId).toBe('image-media')
})

test('changing speech voice invalidates the audio result and keeps its Take', () => {
  let project = addStudioNode(
    createStudioProject('Film', 'project'),
    'audio',
    'audio'
  )
  project = updateStudioNode(project, 'audio', {
    model: 'tts-model',
    prompt: 'Welcome',
    voice: 'alloy',
  })
  project = recordStudioTake(project, 'audio', {
    id: 'take',
    createdAt: '2026-09-28T00:00:00Z',
    prompt: 'Welcome',
    model: 'tts-model',
    status: 'completed',
    mediaId: 'audio-media',
  })

  const edited = updateStudioNode(project, 'audio', { voice: 'nova' })

  expect(edited.nodes[0].data.status).toBe('idle')
  expect(edited.nodes[0].data.mediaId).toBeUndefined()
  expect(edited.nodes[0].data.takes?.[0].mediaId).toBe('audio-media')
})
