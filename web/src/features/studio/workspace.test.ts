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
import { describe, expect, test } from 'vitest'

import {
  addStudioNode,
  createStudioProject,
  updateStudioNode,
} from './workspace'

describe('Studio project editing', () => {
  test('creates a project and adds typed nodes with distinct positions', () => {
    const project = createStudioProject('Film one', 'p1')
    const first = addStudioNode(project, 'text', 'n1')
    const second = addStudioNode(first, 'video', 'n2')
    expect(second.nodes.map((node) => node.data.kind)).toEqual([
      'text',
      'video',
    ])
    expect(second.nodes[0].position).not.toEqual(second.nodes[1].position)
    expect(second.title).toBe('Film one')
  })

  test('updates only the requested node and clears stale results when its prompt changes', () => {
    const project = addStudioNode(
      addStudioNode(createStudioProject('Film', 'p1'), 'text', 'n1'),
      'video',
      'n2'
    )
    const result = updateStudioNode(project, 'n2', {
      prompt: 'new prompt',
      outputUrl: 'https://x.test/old.mp4',
      status: 'completed',
    })
    const changed = updateStudioNode(result, 'n2', { prompt: 'another prompt' })
    expect(changed.nodes[0]).toEqual(project.nodes[0])
    expect(changed.nodes[1].data.prompt).toBe('another prompt')
    expect(changed.nodes[1].data.outputUrl).toBeUndefined()
    expect(changed.nodes[1].data.status).toBe('idle')
  })

  test('clears a stale group error when the video group changes', () => {
    const project = addStudioNode(
      createStudioProject('Film', 'p1'),
      'video',
      'n1'
    )
    const failed = updateStudioNode(project, 'n1', {
      group: 'old-group',
      status: 'failed',
      error: 'Studio group is unavailable to this account',
    })
    const changed = updateStudioNode(failed, 'n1', {
      group: '特价sd',
      model: undefined,
    })
    expect(changed.nodes[0].data.group).toBe('特价sd')
    expect(changed.nodes[0].data.status).toBe('idle')
    expect(changed.nodes[0].data.error).toBeUndefined()
  })
})
