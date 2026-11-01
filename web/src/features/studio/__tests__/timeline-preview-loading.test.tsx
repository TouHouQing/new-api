/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { studioProductionSchema } from '../studio-production'
import {
  studioTimelineAudio,
  studioTimelineMediaIds,
  studioTimelineSchedule,
} from '../studio-timeline-playback'
import { StudioTimelinePreview } from '../studio-timeline-preview'
import { addStudioNode, createStudioProject } from '../workspace'

vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    async getPrimaryAudioTrack() {
      return undefined
    }
    async getPrimaryVideoTrack() {
      return { computeDuration: async () => 30 }
    }
    dispose() {}
  },
}))

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function longSource() {
  const project = addStudioNode(
    createStudioProject('Long imported source', 'long-source-preview'),
    'video',
    'source'
  )
  project.nodes[0].data = {
    ...project.nodes[0].data,
    seconds: 5,
    mediaId: 'unselected',
    selectedTakeId: 'exact-take',
    takes: [
      {
        id: 'exact-take',
        mediaId: 'exact-media',
        prompt: '',
        status: 'completed',
        createdAt: '2026-10-18',
      },
    ],
  }
  project.production = studioProductionSchema.parse({
    timelineEdited: true,
    timeline: [
      {
        id: 'first',
        nodeId: 'source',
        takeId: 'exact-take',
        trimStart: 0,
        trimEnd: 10,
      },
      {
        id: 'later',
        nodeId: 'source',
        takeId: 'exact-take',
        trimStart: 20,
        trimEnd: 30,
      },
    ],
  })
  return project
}

test('long-source split previews load exact media before the schedule can be calculated', async () => {
  const project = longSource()
  expect(() => studioTimelineSchedule(project)).toThrow(
    'Trim end must follow trim start'
  )
  expect(studioTimelineMediaIds(project)).toEqual(['exact-media'])
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:long-source')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const getMedia = vi.fn(async () => new Blob(['actual-source']))
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StudioTimelinePreview project={project} getMedia={getMedia} />
    </QueryClientProvider>
  )
  await waitFor(() => expect(getMedia).toHaveBeenCalledWith('exact-media'))
  expect(
    await screen.findByRole('button', { name: 'studio.production.playPreview' })
  ).toBeEnabled()
  expect(
    screen.getByRole('slider', { name: 'studio.production.playhead' })
  ).toHaveAttribute('max', '20')
  expect(
    document.querySelectorAll('video[src="blob:long-source"]')
  ).toHaveLength(2)
})

test('measured duration rejects an out-of-bounds later cut instead of silently shortening it', async () => {
  const project = longSource()
  if (!project.production) throw new Error('Expected production fixture')
  project.production.timeline[1].trimEnd = 40
  expect(() => studioTimelineSchedule(project, { 'exact-media': 30 })).toThrow(
    'Trim end exceeds the source duration'
  )
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:bounds-source')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StudioTimelinePreview
        project={project}
        getMedia={async () => new Blob(['source'])}
      />
    </QueryClientProvider>
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Trim end exceeds the source duration'
  )
  expect(
    screen.queryByRole('button', { name: 'studio.production.playPreview' })
  ).not.toBeInTheDocument()
})

test('exact missing Take media never loads the currently selected node fallback', () => {
  const project = longSource()
  const take = project.nodes[0].data.takes?.[0]
  if (!take) throw new Error('Expected exact Take fixture')
  take.mediaId = undefined
  expect(() => studioTimelineMediaIds(project)).toThrow(
    'A timeline source is unavailable'
  )
  expect(() => studioTimelineSchedule(project, { unselected: 30 })).toThrow(
    'A timeline source is unavailable'
  )
})

test('comparison transport seeks and plays its two previews without moving other previews or doubling sound', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:comparison')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
  const project = longSource()
  const getMedia = async () => new Blob(['source'])
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <StudioTimelinePreview
        project={project}
        getMedia={getMedia}
        syncGroup='compare'
      />
      <StudioTimelinePreview
        project={project}
        getMedia={getMedia}
        syncGroup='compare'
        muted
      />
      <StudioTimelinePreview project={project} getMedia={getMedia} />
    </QueryClientProvider>
  )
  await waitFor(() => expect(screen.getAllByRole('slider')).toHaveLength(3))
  await waitFor(() =>
    expect(screen.getAllByRole('slider')[0]).toHaveAttribute('max', '20')
  )
  act(() =>
    window.dispatchEvent(
      new CustomEvent('studio-timeline-transport', {
        detail: { group: 'compare', seconds: 7, playing: true },
      })
    )
  )
  const sliders = screen.getAllByRole('slider')
  expect(sliders.map((item) => (item as HTMLInputElement).value)).toEqual([
    '7',
    '7',
    '0',
  ])
  expect(
    screen.getAllByRole('button', { name: 'studio.production.pausePreview' })
  ).toHaveLength(2)
  const videos = [...view.container.querySelectorAll('video')]
  expect(videos.slice(0, 2).some((item) => !item.muted)).toBe(true)
  expect(videos.slice(2, 4).every((item) => item.muted)).toBe(true)
  act(() =>
    window.dispatchEvent(
      new CustomEvent('studio-timeline-transport', {
        detail: { group: 'compare', seconds: 2, playing: false },
      })
    )
  )
  expect(sliders.map((item) => (item as HTMLInputElement).value)).toEqual([
    '2',
    '2',
    '0',
  ])
  expect(
    screen.queryByRole('button', { name: 'studio.production.pausePreview' })
  ).not.toBeInTheDocument()
})

test('retimed range replacement maps original dialogue through source ratio and clip speed', () => {
  const project = longSource()
  project.nodes[0].data.reworkRange = {
    sourceNodeId: 'original',
    sourceMediaId: 'original-video',
    start: 4,
    end: 6,
    replacementDuration: 4,
  }
  project.shots = [
    {
      id: 'shot',
      title: 'Original dialogue',
      textNodeId: 'text',
      imageNodeId: 'image',
      videoNodeId: 'original',
      shotVoiceoverMediaId: 'narration',
      shotVoiceoverOffsetSeconds: 4.5,
    },
  ]
  project.production = studioProductionSchema.parse({
    ...project.production,
    timeline: [
      {
        id: 'replacement',
        nodeId: 'source',
        takeId: 'exact-take',
        trimStart: 1,
        trimEnd: 3,
        speed: 2,
      },
    ],
    dialogueCues: [
      {
        id: 'cue',
        shotId: 'shot',
        text: 'Original words',
        audioMediaId: 'dialogue',
        offset: 5,
        duration: 1,
      },
    ],
  })
  const schedule = studioTimelineSchedule(project, { 'exact-media': 4 })
  expect(schedule[0]).toMatchObject({
    sourceOffset: 4.5,
    sourceSpeed: 1,
    duration: 1,
  })
  const audio = studioTimelineAudio(project, {
    'exact-media': 4,
    dialogue: 1,
    narration: 2,
  })
  expect(audio.find((track) => track.id === 'cue-replacement')).toMatchObject({
    start: 0,
    offset: 0.5,
    duration: 0.5,
    speed: 1,
  })
  expect(audio.find((track) => track.id === 'voice-replacement')).toMatchObject(
    { start: 0, offset: 0, duration: 1, speed: 1 }
  )
  const range = project.nodes[0].data.reworkRange
  if (!range) throw new Error('Expected range fixture')
  delete range.replacementDuration
  expect(
    studioTimelineSchedule(project, { 'exact-media': 4 })[0]
  ).toMatchObject({ sourceOffset: 5, sourceSpeed: 2 })
})
