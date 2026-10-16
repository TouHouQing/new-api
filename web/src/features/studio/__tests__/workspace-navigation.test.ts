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
  studioGeneratableNodeIds,
  studioWorkspaceEntry,
  studioWorkspaceStage,
} from '../studio-workspace-navigation'
import { addStudioNode, createStudioProject } from '../workspace'

test('uploaded footage enters editing and is never submitted as a generation target', () => {
  let project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'upload'
  )
  project = addStudioNode(project, 'video', 'generated')
  project.nodes[0].data.sourceMode = 'upload'
  project.nodes[0].data.mediaId = 'owned-video'
  expect(studioWorkspaceEntry(project, 'upload')).toBe('edit')
  expect(
    studioGeneratableNodeIds(project, [
      'upload',
      'missing',
      'generated',
      'generated',
    ])
  ).toEqual(['generated'])
})

test('legacy production entries resolve into the five shared stages', () => {
  expect(
    ['plan', 'workflow', 'timeline', 'delivery', 'voice'].map(
      studioWorkspaceStage
    )
  ).toEqual(['shots', 'visual', 'edit', 'deliver', 'edit'])
})
