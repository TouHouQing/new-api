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
  addStudioShot,
  createStudioProject,
  retainStudioTake,
  invalidateStudioBranch,
  ensureStudioFinalVideo,
  moveStudioShot,
  pruneStudioShots,
  recordStudioTake,
  removeStudioShot,
  selectStudioTake,
  updateStudioTake,
  updateStudioNode,
} from './workspace'

describe('Studio project editing', () => {
  test('new storyboard shots use the simple automatic canvas ports', () => {
    const project = addStudioShot(
      createStudioProject('Simple shot', 'simple-shot'),
      'shot-1',
      { text: 'text', image: 'image', video: 'video' },
      'Opening'
    )
    expect(project.edges).toHaveLength(3)
    expect(
      project.edges.every((edge) => !edge.sourceHandle && !edge.targetHandle)
    ).toBe(true)
  })
  test('retains a submitted video task without restoring an obsolete selection', () => {
    const project = addStudioNode(
      createStudioProject('New brief', 'p-detached'),
      'video',
      'video'
    )
    const retained = retainStudioTake(project, 'video', {
      id: 'old-task',
      createdAt: 'now',
      prompt: 'old brief',
      status: 'queued',
      taskId: 'task-123',
    })
    expect(retained.nodes[0].data.takes?.[0].taskId).toBe('task-123')
    expect(retained.nodes[0].data.selectedTakeId).toBeUndefined()
    expect(retained.nodes[0].data.status).toBe('idle')
  })
  test('keeps earlier takes and restores one without retaining downstream media', () => {
    let project = createStudioProject('Portrait', 'p-takes')
    project = addStudioNode(project, 'text', 'text')
    project = addStudioNode(project, 'image', 'image')
    project.edges = [{ id: 'ti', source: 'text', target: 'image' }]
    project = recordStudioTake(project, 'text', {
      id: 'take-one',
      createdAt: '2026-09-25T00:00:00Z',
      prompt: 'a woman',
      status: 'completed',
      outputText: 'A woman at dawn',
      outputImagePrompt: 'A still portrait at dawn',
      outputVideoPrompt: 'She turns to camera',
    })
    project = recordStudioTake(project, 'text', {
      id: 'take-two',
      createdAt: '2026-09-25T00:01:00Z',
      prompt: 'a woman',
      status: 'completed',
      outputText: 'A woman at night',
      outputImagePrompt: 'A still portrait at night',
      outputVideoPrompt: 'She walks away',
    })
    project = updateStudioNode(project, 'image', {
      model: 'image-model',
      mediaId: 'image-current',
      status: 'completed',
    })

    const selected = selectStudioTake(project, 'text', 'take-one')

    expect(selected.nodes[0].data.outputImagePrompt).toBe(
      'A still portrait at dawn'
    )
    expect(selected.nodes[0].data.takes?.map((take) => take.id)).toEqual([
      'take-one',
      'take-two',
    ])
    expect(selected.nodes[1].data.mediaId).toBeUndefined()
    expect(selected.nodes[1].data.status).toBe('idle')
  })

  test('retains a queued video take after its node inputs change', () => {
    let project = addStudioNode(
      createStudioProject('Queued', 'p-queued'),
      'video',
      'video'
    )
    project = recordStudioTake(project, 'video', {
      id: 'take-queued',
      createdAt: '2026-09-25T00:00:00Z',
      model: 'video-model',
      group: 'default',
      prompt: 'walks forward',
      status: 'queued',
      taskId: 'task-running',
    })

    const invalidated = invalidateStudioBranch(project, 'video')
    const completed = updateStudioTake(invalidated, 'video', 'take-queued', {
      status: 'completed',
      mediaId: 'media-completed',
    })

    expect(completed.nodes[0].data.taskId).toBeUndefined()
    expect(completed.nodes[0].data.selectedTakeId).toBeUndefined()
    expect(completed.nodes[0].data.takes?.[0]).toEqual(
      expect.objectContaining({
        taskId: 'task-running',
        status: 'completed',
        mediaId: 'media-completed',
      })
    )
  })
  test('connects ordered shot videos to a final New API video node', () => {
    let project = createStudioProject('Drama', 'p1')
    project = addStudioShot(
      project,
      'shot-1',
      { text: 't1', image: 'i1', video: 'v1' },
      'Opening'
    )
    project = addStudioShot(
      project,
      'shot-2',
      { text: 't2', image: 'i2', video: 'v2' },
      'Arrival'
    )
    project = ensureStudioFinalVideo(project, 'final-video')
    expect(project.finalVideoNodeId).toBe('final-video')
    expect(
      project.edges
        .filter((edge) => edge.target === 'final-video')
        .map((edge) => edge.source)
    ).toEqual(['v1', 'v2'])
    project = moveStudioShot(project, 'shot-2', 'up')
    expect(
      project.edges
        .filter((edge) => edge.target === 'final-video')
        .map((edge) => edge.source)
    ).toEqual(['v2', 'v1'])
    project = removeStudioShot(project, 'shot-2')
    expect(
      project.edges
        .filter((edge) => edge.target === 'final-video')
        .map((edge) => edge.source)
    ).toEqual(['v1'])
    project = addStudioShot(
      project,
      'shot-3',
      { text: 't3', image: 'i3', video: 'v3' },
      'Close'
    )
    expect(
      project.edges
        .filter((edge) => edge.target === 'final-video')
        .map((edge) => edge.source)
    ).toEqual(['v1', 'v3'])
    expect(ensureStudioFinalVideo(project, 'another-id')).toBe(project)
  })
  test('creates ordered shots backed by the existing text image video graph', () => {
    let project = createStudioProject('Drama', 'p1')
    project = addStudioShot(
      project,
      'shot-1',
      {
        text: 'text-1',
        image: 'image-1',
        video: 'video-1',
      },
      'Opening'
    )
    project = addStudioShot(
      project,
      'shot-2',
      {
        text: 'text-2',
        image: 'image-2',
        video: 'video-2',
      },
      'Arrival'
    )
    expect(project.shots?.map((shot) => shot.title)).toEqual([
      'Opening',
      'Arrival',
    ])
    expect(project.nodes.map((node) => node.data.kind)).toEqual([
      'text',
      'image',
      'video',
      'text',
      'image',
      'video',
    ])
    expect(
      project.edges
        .filter((edge) => edge.target === 'video-1')
        .map((edge) => edge.source)
    ).toEqual(['text-1', 'image-1'])
    const moved = moveStudioShot(project, 'shot-2', 'up')
    expect(moved.shots?.map((shot) => shot.id)).toEqual(['shot-2', 'shot-1'])
    expect(moved.edges).toEqual(project.edges)
  })

  test('removes a storyboard entry when one of its graph nodes is deleted', () => {
    const project = addStudioShot(
      createStudioProject('Drama', 'p1'),
      'shot-1',
      {
        text: 'text-1',
        image: 'image-1',
        video: 'video-1',
      },
      'Opening'
    )
    const withoutImage = {
      ...project,
      nodes: project.nodes.filter((node) => node.id !== 'image-1'),
    }
    expect(pruneStudioShots(withoutImage).shots).toEqual([])
  })

  test('deletes a shot and its generated graph without affecting other shots', () => {
    let project = addStudioShot(
      createStudioProject('Drama', 'p1'),
      'shot-1',
      {
        text: 'text-1',
        image: 'image-1',
        video: 'video-1',
      },
      'Opening'
    )
    project = addStudioShot(
      project,
      'shot-2',
      {
        text: 'text-2',
        image: 'image-2',
        video: 'video-2',
      },
      'Arrival'
    )
    const deleted = removeStudioShot(project, 'shot-1')
    expect(deleted.shots?.map((shot) => shot.id)).toEqual(['shot-2'])
    expect(deleted.nodes.map((node) => node.id)).toEqual([
      'text-2',
      'image-2',
      'video-2',
    ])
    expect(
      deleted.edges.every(
        (edge) => edge.source.endsWith('-2') && edge.target.endsWith('-2')
      )
    ).toBe(true)
  })
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

  test('clears generated text when its model changes so downstream generation refreshes it', () => {
    const project = addStudioNode(
      createStudioProject('Script', 'p1'),
      'text',
      'n1'
    )
    const configured = updateStudioNode(project, 'n1', {
      model: 'model-one',
      prompt: 'Write a scene',
    })
    const completed = updateStudioNode(configured, 'n1', {
      outputText: 'Old scene',
      outputImagePrompt: 'Old still frame',
      outputVideoPrompt: 'Old camera move',
      status: 'completed',
    })
    const changed = updateStudioNode(completed, 'n1', {
      model: 'model-two',
    })
    expect(changed.nodes[0].data.outputText).toBeUndefined()
    expect(changed.nodes[0].data.outputImagePrompt).toBeUndefined()
    expect(changed.nodes[0].data.outputVideoPrompt).toBeUndefined()
    expect(changed.nodes[0].data.status).toBe('idle')
  })

  test('invalidates downstream generated media when a source changes', () => {
    let project = createStudioProject('Sequence', 'p1')
    project = addStudioNode(project, 'text', 't')
    project = addStudioNode(project, 'image', 'i')
    project = addStudioNode(project, 'video', 'v')
    project.edges = [
      { id: 'ti', source: 't', target: 'i' },
      { id: 'iv', source: 'i', target: 'v' },
    ]
    project = updateStudioNode(project, 'i', { model: 'image-model' })
    project = updateStudioNode(project, 'i', {
      mediaId: 'image-old',
      status: 'completed',
    })
    project = updateStudioNode(project, 'v', {
      taskId: 'video-old',
      status: 'completed',
    })
    const changed = invalidateStudioBranch(project, 't')
    expect(changed.nodes[1].data.mediaId).toBeUndefined()
    expect(changed.nodes[2].data.taskId).toBeUndefined()
    expect(changed.nodes[2].data.status).toBe('idle')
  })

  test('keeps a manually uploaded image while invalidating its generated successors', () => {
    let project = createStudioProject('Sequence', 'p1')
    project = addStudioNode(project, 'image', 'i')
    project = addStudioNode(project, 'video', 'v')
    project.edges = [{ id: 'iv', source: 'i', target: 'v' }]
    project = updateStudioNode(project, 'i', {
      mediaId: 'local-image',
      status: 'completed',
    })
    project = updateStudioNode(project, 'v', {
      taskId: 'video-old',
      status: 'completed',
    })
    const changed = invalidateStudioBranch(project, 'i')
    expect(changed.nodes[0].data.mediaId).toBe('local-image')
    expect(changed.nodes[1].data.taskId).toBeUndefined()
  })
})
