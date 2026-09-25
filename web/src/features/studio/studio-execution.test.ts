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
import { describe, expect, test, vi } from 'vitest'

import {
  StudioExecutionCoordinator,
  planStudioVideoBatch,
  studioPromptWithAssets,
} from './studio-execution'
import {
  addStudioNode,
  addStudioShot,
  createStudioProject,
  updateStudioNode,
} from './workspace'

describe('Studio shared execution', () => {
  test('batch cap counts dependent video tasks, not only shot cards', () => {
    let project = addStudioShot(
      createStudioProject('Two tasks', 'two'),
      'shot',
      { text: 'text', image: 'image', video: 'final' },
      'Shot'
    )
    project = addStudioNode(project, 'video', 'source')
    project.edges.push({
      id: 'source-final',
      source: 'source',
      target: 'final',
    })
    project = updateStudioNode(project, 'source', {
      model: 'site-video',
      prompt: 'source clip',
    })
    project = updateStudioNode(project, 'final', {
      model: 'site-video',
      prompt: 'continuation',
    })
    expect(planStudioVideoBatch(project, 1)).toMatchObject({
      targets: [],
      capped: true,
    })
    expect(
      planStudioVideoBatch(project, 2).billableNodes.map((node) => node.id)
    ).toEqual(['source', 'final'])
  })
  test('injects selected continuity assets into generation prompts', () => {
    const project = createStudioProject('Short film', 'project-1')
    project.assets = [
      { id: 'actor', kind: 'character', title: 'Mira', prompt: 'red scarf' },
      { id: 'set', kind: 'location', title: 'Studio', prompt: 'warm lamps' },
    ]
    expect(studioPromptWithAssets('walks in', project, ['actor'])).toBe(
      'walks in\n\ncharacter: Mira — red scarf'
    )
  })
  test('a shared upstream node submits once across concurrent branches', async () => {
    const coordinator = new StudioExecutionCoordinator()
    let finish!: (value: string) => void
    const request = vi.fn(
      () => new Promise<string>((resolve) => (finish = resolve))
    )
    const first = coordinator.run('project:text:input-v1', request)
    const second = coordinator.run('project:text:input-v1', request)
    expect(request).toHaveBeenCalledTimes(1)
    finish('shot')
    expect(await Promise.all([first, second])).toEqual(['shot', 'shot'])
    const third = coordinator.run('project:text:input-v1', request)
    expect(request).toHaveBeenCalledTimes(2)
    finish('new shot')
    expect(await third).toBe('new shot')
  })
  test('reuses a settled billed task for a stale dependent branch snapshot', async () => {
    const coordinator = new StudioExecutionCoordinator()
    const submit = vi.fn().mockResolvedValue('task-once')
    expect(
      await coordinator.run('video:source:input-1', submit, {
        reuseCompleted: true,
        force: true,
      })
    ).toBe('task-once')
    expect(
      await coordinator.run('video:source:input-1', submit, {
        reuseCompleted: true,
      })
    ).toBe('task-once')
    expect(submit).toHaveBeenCalledOnce()
  })
  test('does not reuse a video submission after its task fails', async () => {
    const coordinator = new StudioExecutionCoordinator()
    const submit = vi
      .fn()
      .mockResolvedValueOnce({ taskId: 'failed-task' })
      .mockResolvedValueOnce({ taskId: 'retry-task' })
    expect(
      await coordinator.run('video:source:input-1', submit, {
        reuseCompleted: true,
      })
    ).toEqual({ taskId: 'failed-task' })
    coordinator.forgetVideoTask('failed-task')
    expect(
      await coordinator.run('video:source:input-1', submit, {
        reuseCompleted: true,
      })
    ).toEqual({ taskId: 'retry-task' })
    expect(submit).toHaveBeenCalledTimes(2)
  })
})
