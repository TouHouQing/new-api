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

  test('editing caption cues invalidates an assembled MP4', () => {
    const project = {
      ...createStudioProject('Captions', 'p-captions'),
      assembledMediaId: 'assembled',
      captionsText: '1\n00:00:00,000 --> 00:00:01,000\nHello',
    }
    expect(
      reconcileStudioAssembly(project, {
        ...project,
        captionsText: '1\n00:00:00,000 --> 00:00:01,000\nHi',
      }).assembledMediaId
    ).toBeUndefined()
  })
  test('moving audio or captions invalidates a previously assembled MP4', () => {
    const project = {
      ...createStudioProject('Offsets', 'p-offsets'),
      assembledMediaId: 'assembled',
      soundtrackOffsetSeconds: 0,
      voiceoverOffsetSeconds: 0,
      captionOffsetSeconds: 0,
    }
    for (const field of [
      'soundtrackOffsetSeconds',
      'voiceoverOffsetSeconds',
      'captionOffsetSeconds',
    ] as const) {
      expect(
        reconcileStudioAssembly(project, { ...project, [field]: 2 })
          .assembledMediaId
      ).toBeUndefined()
    }
  })

  test('changing voiceover audio invalidates an assembled MP4', () => {
    const project = {
      ...createStudioProject('Voice', 'p-voice'),
      assembledMediaId: 'assembled',
      voiceoverMediaId: 'narration-one',
      voiceoverVolume: 0.8,
    }
    expect(
      reconcileStudioAssembly(project, {
        ...project,
        voiceoverMediaId: 'narration-two',
      }).assembledMediaId
    ).toBeUndefined()
  })

  test('propagates optional shot trims and invalidates an export when a trim changes', () => {
    let project = addStudioShot(
      createStudioProject('Drama', 'p1'),
      's1',
      { text: 't1', image: 'i1', video: 'v1' },
      'Opening'
    )
    project = updateStudioNode(project, 'v1', {
      status: 'completed',
      mediaId: 'clip-1',
    })
    const trimmed = {
      ...project,
      assembledMediaId: 'assembled',
      shots: project.shots?.map((shot) => ({
        ...shot,
        trimStart: 0.5,
        trimEnd: 2.5,
      })),
    }

    expect(planStudioAssembly(trimmed)[0]).toMatchObject({
      trimStart: 0.5,
      trimEnd: 2.5,
    })
    expect(
      reconcileStudioAssembly(trimmed, project).assembledMediaId
    ).toBeUndefined()
  })

  test('propagates shot audio controls and invalidates an export when they change', () => {
    let project = addStudioShot(
      createStudioProject('Drama', 'p1'),
      's1',
      { text: 't1', image: 'i1', video: 'v1' },
      'Opening'
    )
    project = updateStudioNode(project, 'v1', {
      status: 'completed',
      mediaId: 'clip-1',
    })
    const mixed = {
      ...project,
      assembledMediaId: 'assembled',
      shots: project.shots?.map((shot) => ({
        ...shot,
        muted: true,
        volume: 0.4,
      })),
    }

    expect(planStudioAssembly(mixed)[0]).toMatchObject({
      muted: true,
      volume: 0.4,
    })
    expect(
      reconcileStudioAssembly(mixed, project).assembledMediaId
    ).toBeUndefined()
  })

  test('a fade after a shot applies matching outgoing and incoming windows', () => {
    let project = createStudioProject('Drama', 'p1')
    for (const [index, title] of ['Opening', 'Arrival', 'End'].entries()) {
      const suffix = String(index + 1)
      project = addStudioShot(
        project,
        `s${suffix}`,
        {
          text: `t${suffix}`,
          image: `i${suffix}`,
          video: `v${suffix}`,
        },
        title
      )
      project = updateStudioNode(project, `v${suffix}`, {
        status: 'completed',
        mediaId: `clip-${suffix}`,
      })
    }
    const fading = {
      ...project,
      assembledMediaId: 'assembled',
      shots: project.shots?.map((shot, index) => ({
        ...shot,
        ...(index === 0
          ? { transition: 'fade' as const, transitionSeconds: 0.4 }
          : {}),
        ...(index === 2 ? { transition: 'fade' as const } : {}),
      })),
    }

    expect(planStudioAssembly(fading)).toEqual([
      {
        shotId: 's1',
        title: 'Opening',
        taskId: undefined,
        mediaId: 'clip-1',
        fadeOutSeconds: 0.4,
      },
      {
        shotId: 's2',
        title: 'Arrival',
        taskId: undefined,
        mediaId: 'clip-2',
        fadeInSeconds: 0.4,
      },
      {
        shotId: 's3',
        title: 'End',
        taskId: undefined,
        mediaId: 'clip-3',
      },
    ])
    expect(
      reconcileStudioAssembly(fading, project).assembledMediaId
    ).toBeUndefined()
  })

  test('a fade without a duration uses a half-second boundary', () => {
    let project = createStudioProject('Drama', 'p1')
    for (const suffix of ['1', '2']) {
      project = addStudioShot(
        project,
        `s${suffix}`,
        { text: `t${suffix}`, image: `i${suffix}`, video: `v${suffix}` },
        `Shot ${suffix}`
      )
      project = updateStudioNode(project, `v${suffix}`, {
        status: 'completed',
        mediaId: `clip-${suffix}`,
      })
    }
    const fading = {
      ...project,
      shots: project.shots?.map((shot, index) =>
        index === 0 ? { ...shot, transition: 'fade' as const } : shot
      ),
    }

    expect(
      planStudioAssembly(fading).map((shot) => [
        shot.fadeInSeconds,
        shot.fadeOutSeconds,
      ])
    ).toEqual([
      [undefined, 0.5],
      [0.5, undefined],
    ])
  })
})
