/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, assert, expect, test, vi } from 'vitest'

import type { StudioProject } from '../local-projects'
import { studioProductionSchema } from '../studio-production'
import { StudioProductionAnalysis } from '../studio-production-analysis'
import { useStudioProductionContext } from '../studio-production-context'
import { addStudioNode, createStudioProject } from '../workspace'

const checks = vi.hoisted(() => ({
  queryIds: [] as unknown[],
  keys: Array.from({ length: 6 }, (_, i) => ({ time: i, x: 0.2, y: 0 })),
  audioRecord: undefined as unknown,
}))
vi.mock('../studio-production-context', () => ({
  useStudioProductionContext: vi.fn(),
}))
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: (options: { queryKey: unknown[] }) => {
    checks.queryIds.push(options.queryKey[2])
    if (options.queryKey[2] === 'beats') {
      return { isPending: false, data: checks.audioRecord }
    }
    return {
      isPending: false,
      data:
        options.queryKey[2] === 'corrected'
          ? {
              id: 'corrected',
              document: {
                source_media_id: 'source',
                analysis: {
                  kind: 'subject_track',
                  target_aspect: 9 / 16,
                  manual_correction: { keys: checks.keys },
                  points: [0, 5].map((time) => ({
                    time,
                    crop: { x: 0.2, y: 0, width: 0.3, height: 1 },
                    confidence: 1,
                    review_required: false,
                    manual: true,
                  })),
                },
              },
            }
          : undefined,
    }
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('../studio-tracking-editor', () => ({
  StudioTrackingEditor: (props: { manualKeys?: unknown }) => (
    <output data-testid='restored-manual-keys'>
      {JSON.stringify(props.manualKeys)}
    </output>
  ),
}))
vi.mock('../studio-beat-editor', () => ({ StudioBeatEditor: () => null }))

afterEach(() => vi.unstubAllGlobals())

function mount(withMedia = false, setup?: (project: StudioProject) => void) {
  const project = addStudioNode(
    createStudioProject('Tracked', 'film'),
    'video',
    'video'
  )
  project.nodes[0].data.mediaId = 'source'
  project.production = studioProductionSchema.parse({
    timeline: [{ id: 'clip', nodeId: 'video', trimStart: 0, trimEnd: 6 }],
    reframes: {
      clip: {
        analysisId: 'corrected',
        sourceMediaId: 'source',
        sourceDigest: 'a'.repeat(64),
        width: 720,
        height: 1280,
      },
    },
  })
  setup?.(project)
  vi.mocked(useStudioProductionContext).mockReturnValue({
    props: {
      project,
      getMedia: async () => (withMedia ? new Blob(['owned fixture']) : null),
    },
    path: '/projects/film',
    writable: true,
    jobs: {
      data: [
        {
          id: 'raw-job',
          kind: 'inspect',
          status: 'succeeded',
          operation_action: 'subject_track',
          result: { source_media_id: 'source', record_id: 'raw' },
        },
        {
          id: 'beat-job',
          kind: 'inspect',
          status: 'succeeded',
          operation_action: 'audio_structure',
          result: { source_media_id: 'selected-music', record_id: 'beats' },
        },
      ],
    },
  } as unknown as ReturnType<typeof useStudioProductionContext>)
  const view = render(<StudioProductionAnalysis />)
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Analyze cuts, music and subject framing',
    })
  )
  return view
}

test('a fresh analysis panel reopens the applied correction and passes all six saved keys instead of only the latest raw inspect job', () => {
  mount()
  expect(checks.queryIds.at(-1)).toBe('corrected')
  expect(
    JSON.parse(screen.getByTestId('restored-manual-keys').textContent || 'null')
  ).toEqual(checks.keys)
})

test('music analysis defaults to the active timeline track instead of an unused archived audio node', async () => {
  mount(false, (project) => {
    project.nodes.push({
      id: 'old-song',
      type: 'studio',
      position: { x: 0, y: 0 },
      data: {
        kind: 'audio',
        title: 'Unused tutorial song',
        prompt: '',
        mediaId: 'old-song-media',
      },
    })
    assert(project.production)
    project.production.audioTracks = [
      {
        id: 'actual-song',
        mediaId: 'selected-music',
        start: 0,
        offset: 0,
        volume: 1,
      },
    ]
  })
  await userEvent.click(
    screen.getByRole('combobox', { name: 'Analysis purpose' })
  )
  await userEvent.click(
    screen.getByRole('option', { name: 'Find beats and sound sections' })
  )
  expect(
    screen.getByRole('combobox', { name: 'Music or dialogue source' })
  ).toHaveTextContent('Audio track 1')
  await userEvent.click(
    screen.getByRole('combobox', { name: 'Music or dialogue source' })
  )
  expect(
    screen.getByRole('option', { name: 'Unused tutorial song' })
  ).toBeVisible()
})

test('copied full-film music remains a selectable music source and acoustic candidates do not appear as technical enum labels', async () => {
  checks.audioRecord = {
    id: 'beats',
    document: {
      source_media_id: 'selected-music',
      analysis: {
        kind: 'audio_structure',
        beat_times: [0, 1, 2, 3],
        sections: [
          { start: 0, end: 1, label: 'section_candidate' },
          { start: 1, end: 2, label: 'silence' },
          { start: 2, end: 3, label: 'My named chorus' },
        ],
      },
    },
  }
  mount(false, (project) => {
    project.soundtrackMediaId = 'selected-music'
  })
  await userEvent.click(
    screen.getByRole('combobox', { name: 'Analysis purpose' })
  )
  await userEvent.click(
    screen.getByRole('option', { name: 'Find beats and sound sections' })
  )
  expect(
    screen.getByRole('combobox', { name: 'Music or dialogue source' })
  ).toHaveTextContent('studio.timeline.soundtrack')
  expect(screen.getByText(/Acoustic section candidate/)).toBeVisible()
  expect(screen.getByText(/Quiet interval/)).toBeVisible()
  expect(screen.getByText(/My named chorus/)).toBeVisible()
  expect(screen.queryByText(/section_candidate/)).toBeNull()
  await userEvent.click(
    screen.getByRole('combobox', { name: 'Music or dialogue source' })
  )
  expect(
    screen.getByRole('option', { name: 'studio.timeline.soundtrack' })
  ).toBeVisible()
})

test('late media metadata cannot overwrite the source end or anchor explicitly entered by the user', async () => {
  const OriginalURL = URL
  vi.stubGlobal(
    'URL',
    class extends OriginalURL {
      static createObjectURL() {
        return 'blob:owned-slow-metadata'
      }
      static revokeObjectURL() {}
    }
  )
  const view = mount(true)
  await waitFor(() =>
    expect(view.container.querySelector('video')).not.toBeNull()
  )
  const end = screen.getByRole('spinbutton', {
    name: 'Source end time in seconds',
  })
  const anchor = screen.getByRole('spinbutton', {
    name: 'Subject visible at source time',
  })
  fireEvent.change(end, { target: { value: '15' } })
  fireEvent.change(anchor, { target: { value: '2' } })
  const media = view.container.querySelector('video')
  assert(media)
  Object.defineProperty(media, 'duration', { configurable: true, value: 18 })
  fireEvent.loadedMetadata(media)
  expect(end).toHaveValue(15)
  expect(anchor).toHaveValue(2)
})
