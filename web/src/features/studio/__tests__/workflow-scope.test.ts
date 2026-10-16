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

import { studioWorkflowScope } from '../studio-workflow-scope'
import { addStudioNode, createStudioProject } from '../workspace'

test('generation confirmation includes unpinned character and scene generation that the server executes implicitly', () => {
  let project = addStudioNode(
    createStudioProject('Film', 'film'),
    'image',
    'character-image'
  )
  project = addStudioNode(project, 'image', 'scene-image')
  project = addStudioNode(project, 'image', 'shot-image')
  project.nodes[0].data.linkedAssetId = 'character'
  project.nodes[1].data.linkedAssetId = 'scene'
  project.nodes[2].data.assetIds = ['character', 'scene']
  expect(
    studioWorkflowScope(project, ['shot-image']).map((node) => node.id)
  ).toEqual(['character-image', 'scene-image', 'shot-image'])
  project.nodes[2].data.assetVersionIds = { character: 'saved-portrait' }
  expect(
    studioWorkflowScope(project, ['shot-image']).map((node) => node.id)
  ).toEqual(['scene-image', 'shot-image'])
})
