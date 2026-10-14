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

import { applyStudioRecommendedModels } from '../studio-creation-models'
import { addStudioNode, createStudioProject } from '../workspace'

test('recommended services configure new nodes while preserving stored footage and explicit model choices', () => {
  let project = addStudioNode(
    createStudioProject('Film', 'services'),
    'video',
    'stored'
  )
  project = addStudioNode(project, 'image', 'new')
  project.nodes[0].data.mediaId = 'original'
  const selected = applyStudioRecommendedModels(
    project,
    {
      text: ['qwen3.5:9b'],
      image: ['flux.2-klein-4b'],
      video: ['wan2.2-ti2v-5b'],
    },
    'default'
  )
  expect(selected.nodes[0]).toEqual(project.nodes[0])
  expect(selected.nodes[1].data.model).toBe('flux.2-klein-4b')
  expect(selected.defaults?.videoModel).toBe('wan2.2-ti2v-5b')
})

test('quick preview shortens a configured unfinished video while retaining its model and completed Takes', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'quick'),
    'video',
    'video'
  )
  project.nodes[0].data.model = 'wan2.2-ti2v-5b'
  project.nodes[0].data.seconds = 5
  project.defaults = { videoModel: 'wan2.2-ti2v-5b', seconds: 5 }
  const quick = applyStudioRecommendedModels(
    project,
    { text: [], image: [], video: ['wan2.2-ti2v-5b'] },
    'default',
    true
  )
  expect(quick.nodes[0].data.seconds).toBe(3)
  expect(quick.nodes[0].data.model).toBe('wan2.2-ti2v-5b')
  expect(quick.defaults?.seconds).toBe(3)
})
