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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'

import { studioVoiceWindows } from '../studio-creative-plan'
import {
  studioProductionSchema,
  studioProjectRenderPlan,
} from '../studio-production'
import { StudioProductionTimelineTab } from '../studio-production-timeline-tab'
import {
  studioTimelineAudio,
  studioTimelineSchedule,
} from '../studio-timeline-playback'
import {
  addStudioNode,
  createStudioProject,
  updateStudioNode,
} from '../workspace'

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  update: vi.fn(),
  error: vi.fn(),
}))
vi.mock('../studio-production-context', () => ({
  useStudioProductionContext: () => mocks.context(),
}))
vi.mock('@/lib/handle-server-error', () => ({
  handleServerError: (error: unknown) => mocks.error(error),
}))
vi.mock('@/components/ui/tabs', () => ({
  TabsContent: (props: { children: React.ReactNode }) => (
    <div>{props.children}</div>
  ),
}))
vi.mock('../studio-timeline-preview', () => ({
  StudioTimelinePreview: () => null,
}))
vi.mock('../studio-timeline-tracks', () => ({
  StudioTimelineTracks: () => null,
}))
vi.mock('../studio-caption-editor', () => ({ StudioCaptionEditor: () => null }))
vi.mock('../studio-film-finish', () => ({
  StudioFilmFinish: () => null,
  StudioDialogueTiming: () => null,
}))
vi.mock('../studio-film-layout', () => ({ StudioFilmLayout: () => null }))
vi.mock('../studio-motion-graphics', () => ({
  StudioMotionGraphics: () => null,
}))
vi.mock('../studio-render-progress', () => ({
  StudioRenderProgress: () => null,
}))
vi.mock('../studio-workspace-captions', () => ({
  StudioWorkspaceCaptions: () => null,
}))
vi.mock('../studio-transcript-editor', () => ({
  StudioTranscriptEditor: () => null,
}))
vi.mock('../studio-production-analysis', () => ({
  StudioProductionAnalysis: () => null,
}))
vi.mock('../studio-budget-summary', () => ({ StudioBudgetSummary: () => null }))

function fixture() {
  let project = updateStudioNode(
    addStudioNode(
      createStudioProject('Sound film', 'sound-film'),
      'video',
      'picture'
    ),
    'picture',
    { seconds: 10 }
  )
  project = updateStudioNode(
    addStudioNode(project, 'audio', 'sound'),
    'sound',
    { title: 'Impact', mediaId: 'effect-media', status: 'completed' }
  )
  project.production = studioProductionSchema.parse({
    timelineEdited: true,
    timeline: [
      { id: 'first', nodeId: 'picture', trimStart: 0, trimEnd: 10, speed: 2 },
      { id: 'second', nodeId: 'picture', trimStart: 0, trimEnd: 10, speed: 1 },
    ],
    audioTracks: [
      {
        id: 'effect',
        mediaId: 'effect-media',
        start: 1,
        offset: 2,
        duration: 4,
        volume: 0.8,
      },
    ],
  })
  project.nodes[0].data = {
    ...project.nodes[0].data,
    sourceMode: 'upload',
    mediaId: 'video-media',
    status: 'completed',
  }
  return project
}

test('source clocks and audio tempo agree with the render contract and voice ducking windows', () => {
  const project = fixture()
  project.shots = [
    {
      id: 'shot',
      title: 'One action',
      textNodeId: 'text',
      imageNodeId: 'image',
      videoNodeId: 'picture',
    },
  ]
  project.production = studioProductionSchema.parse({
    ...project.production,
    timeline: [
      { id: 'trimmed', nodeId: 'picture', trimStart: 1, trimEnd: 5, speed: 2 },
    ],
    dialogueCues: [
      {
        id: 'cue',
        shotId: 'shot',
        text: 'Own words',
        audioMediaId: 'voice',
        offset: 2,
        duration: 2,
      },
    ],
    audioTracks: [
      {
        id: 'effect',
        mediaId: 'effect-media',
        start: 1,
        offset: 0.5,
        duration: 2,
        speed: 2,
        volume: 1,
      },
    ],
  })
  const schedule = studioTimelineSchedule(project, { 'video-media': 10 })
  expect(schedule[0].sourceOffset).toBe(1)
  expect(schedule[0].duration).toBe(2)
  const audio = studioTimelineAudio(project, { voice: 2 })
  expect(audio.find((track) => track.id === 'cue-trimmed')).toMatchObject({
    start: 0,
    offset: 0.5,
    duration: 2,
    speed: 2,
  })
  expect(studioVoiceWindows(project, { voice: 2 })).toContainEqual({
    start: 0.5,
    end: 1.5,
  })
  const plan = studioProjectRenderPlan(project)
  expect(plan.audio[0]).toMatchObject({
    start: 1,
    offset: 0.5,
    duration: 2,
    speed: 2,
  })
  expect(
    studioProductionSchema.safeParse({
      audioTracks: [{ id: 'bad', mediaId: 'sound', speed: 0 }],
    }).success
  ).toBe(false)
})

test('legacy audio remains on the film clock and uses normal speed', () => {
  const project = fixture()
  const before = JSON.stringify(project.production?.audioTracks)
  expect(studioTimelineAudio(project)[0]).toMatchObject({
    start: 1,
    offset: 2,
    duration: 4,
  })
  expect(studioProjectRenderPlan(project).audio[0].speed).toBe(1)
  expect(JSON.stringify(project.production?.audioTracks)).toBe(before)
})

beforeEach(() => {
  mocks.context.mockReset()
  mocks.update.mockReset()
  mocks.error.mockReset()
})

function mount(project = fixture()) {
  const context = {
    props: { project, getMedia: async () => null, onUpdate: mocks.update },
    mediaPreviewUrls: {},
    timeline: project.production?.timeline || [],
    selectedClip: 'second',
    timelineInspector: 'audio',
    selectedAudioTrack: 'effect',
    writable: true,
    mutate: { isPending: false },
    capabilities: { data: {} },
  }
  mocks.context.mockReturnValue(context)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <StudioProductionTimelineTab compact />
    </QueryClientProvider>
  )
  return context
}

test('audio binding control chooses the exact repeated clip without generating or touching other tracks', async () => {
  mount()
  const user = userEvent.setup()
  await user.click(
    screen.getByRole('button', { name: 'Precise audio timing and volume' })
  )
  await user.click(
    screen.getByRole('combobox', { name: 'Impact Audio follows' })
  )
  await user.click(
    await screen.findByRole('option', {
      name: 'This source action: follow cuts',
    })
  )
  await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce())
  expect(mocks.update.mock.calls[0][0].production.audioTracks[0]).toMatchObject(
    {
      id: 'effect',
      anchorKind: 'source',
      anchorClipId: 'second',
      anchorSourceStart: 0,
      start: 1,
      offset: 5,
      duration: 4,
      volume: 0.8,
    }
  )
})

test('a locked attachment disables rebinding, tempo changes and removal', async () => {
  const project = fixture()
  project.nodes[0].data.locked = true
  if (project.production) {
    project.production.audioTracks[0] = {
      ...project.production.audioTracks[0],
      anchorKind: 'source',
      anchorClipId: 'second',
      anchorSourceStart: 0,
    }
  }
  mount(project)
  await userEvent.click(
    screen.getByRole('button', { name: 'Precise audio timing and volume' })
  )
  expect(
    screen.getByRole('combobox', { name: 'Impact Audio follows' })
  ).toBeDisabled()
  expect(screen.getByLabelText('Audio playback speed')).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'studio.production.removeAudio' })
  ).toBeDisabled()
  expect(mocks.update).not.toHaveBeenCalled()
})
