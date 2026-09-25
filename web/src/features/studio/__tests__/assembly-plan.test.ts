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
import { describe, expect, test } from 'vitest'

import {
  planStudioAssembly,
  reconcileStudioAssembly,
  StudioAssemblyError,
} from '../assembly-plan'
import {
  addStudioShot,
  createStudioProject,
  moveStudioShot,
  updateStudioNode,
} from '../workspace'

describe('Studio MP4 assembly planning', () => {
  test('rejects an unfinished shot before starting a browser export', () => {
    const project = addStudioShot(
      createStudioProject('Drama', 'p1'),
      's1',
      {
        text: 't1',
        image: 'i1',
        video: 'v1',
      },
      'Opening'
    )
    expect(() => planStudioAssembly(project)).toThrowError(StudioAssemblyError)
    try {
      planStudioAssembly(project)
    } catch (error) {
      expect(error).toMatchObject({ code: 'unfinished', shotTitle: 'Opening' })
    }
  })

  test('returns finished videos in storyboard order using local media or task artifacts', () => {
    let project = createStudioProject('Drama', 'p1')
    project = addStudioShot(
      project,
      's1',
      { text: 't1', image: 'i1', video: 'v1' },
      'Opening'
    )
    project = addStudioShot(
      project,
      's2',
      { text: 't2', image: 'i2', video: 'v2' },
      'Arrival'
    )
    project = updateStudioNode(project, 'v1', {
      status: 'completed',
      mediaId: 'clip-1',
    })
    project = updateStudioNode(project, 'v2', {
      status: 'completed',
      taskId: 'task-2',
    })
    project = moveStudioShot(project, 's2', 'up')
    expect(planStudioAssembly(project)).toEqual([
      { shotId: 's2', title: 'Arrival', taskId: 'task-2', mediaId: undefined },
      { shotId: 's1', title: 'Opening', taskId: undefined, mediaId: 'clip-1' },
    ])
  })

  test('invalidates a saved MP4 when a shot changes or its order changes', () => {
    let project = createStudioProject('Drama', 'p1')
    project = addStudioShot(
      project,
      's1',
      { text: 't1', image: 'i1', video: 'v1' },
      'Opening'
    )
    project = addStudioShot(
      project,
      's2',
      { text: 't2', image: 'i2', video: 'v2' },
      'Arrival'
    )
    project = updateStudioNode(project, 'v1', {
      status: 'completed',
      mediaId: 'clip-1',
    })
    project = updateStudioNode(project, 'v2', {
      status: 'completed',
      mediaId: 'clip-2',
    })
    project = { ...project, assembledMediaId: 'assembled' }
    expect(
      reconcileStudioAssembly(project, { ...project, title: 'Renamed' })
        .assembledMediaId
    ).toBe('assembled')
    expect(
      reconcileStudioAssembly(project, moveStudioShot(project, 's2', 'up'))
        .assembledMediaId
    ).toBeUndefined()
    expect(
      reconcileStudioAssembly(
        project,
        updateStudioNode(project, 'v1', { status: 'submitting' })
      ).assembledMediaId
    ).toBeUndefined()
  })
})
