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
  serializeStudioProjectExport,
  studioProjectSchema,
} from '../local-projects'
import { applyStudioCanvasOperations } from '../studio-canvas-commands'
import {
  createStudioProject,
  recordStudioTake,
  selectStudioTake,
} from '../workspace'

test('generated GLB stays with the exact character version when another Take is selected', () => {
  let project = applyStudioCanvasOperations(
    createStudioProject('Film', 'film'),
    [
      {
        op: 'add_node',
        nodeType: 'character',
        id: 'character',
        assetId: 'hero',
        title: 'Cat',
        prompt: 'Orange tabby',
      },
    ]
  )
  for (const id of ['a', 'b']) {
    project = recordStudioTake(project, 'character', {
      id,
      createdAt: '2026-10-06T00:00:00Z',
      prompt: 'Orange tabby',
      status: 'completed',
      mediaId: `image-${id}`,
      auxiliary: [
        { role: 'mesh', mediaId: `mesh-${id}`, mimeType: 'model/gltf-binary' },
      ],
    })
  }
  expect(project.assets?.[0].modelMediaId).toBe('mesh-b')
  project = selectStudioTake(project, 'character', 'a')
  expect(project.assets?.[0].modelMediaId).toBe('mesh-a')
  expect(
    project.assets?.[0].versions?.map((version) => version.modelMediaId)
  ).toEqual(['mesh-a', 'mesh-b'])
  expect(studioProjectSchema.parse(project).assets?.[0].modelMediaId).toBe(
    'mesh-a'
  )
  const template = JSON.parse(serializeStudioProjectExport(project))
  expect(template.assets[0].modelMediaId).toBeUndefined()
  expect(
    template.assets[0].versions.every(
      (version: { modelMediaId?: string }) => !version.modelMediaId
    )
  ).toBe(true)
})
