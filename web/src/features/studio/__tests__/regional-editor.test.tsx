/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, assert, expect, test, vi } from 'vitest'

import { studioCloudRequest } from '../studio-cloud'
import {
  studioProductionSchema,
  studioSeriesVersionSchema,
} from '../studio-production'
import { useStudioProductionContext } from '../studio-production-context'
import { StudioRegionalTimelineEditor } from '../studio-regional-timeline-editor'
import {
  createStudioProject,
  addStudioNode,
  updateStudioNode,
} from '../workspace'

vi.mock('../studio-production-context', () => ({
  useStudioProductionContext: vi.fn(),
}))
vi.mock('../studio-cloud', () => ({ studioCloudRequest: vi.fn() }))
vi.mock('../studio-timeline-preview', () => ({
  StudioTimelinePreview: (props: { onPreviewed?: () => void }) => (
    <button type='button' onClick={props.onPreviewed}>
      {props.onPreviewed ? 'Finish proposed playback' : 'Play current version'}
    </button>
  ),
}))
afterEach(() => vi.restoreAllMocks())

function mount(writable = true) {
  let project = addStudioNode(
    createStudioProject('Mother', 'film'),
    'video',
    'video'
  )
  project = updateStudioNode(project, 'video', {
    mediaId: 'new-current-source',
    selectedTakeId: 'newest',
    takes: [
      {
        id: 'pinned',
        mediaId: 'pinned-media',
        status: 'completed',
        prompt: 'old',
        createdAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'newest',
        mediaId: 'new-current-source',
        status: 'completed',
        prompt: 'new',
        createdAt: '2026-10-02T00:00:00Z',
      },
    ],
  })
  const version = studioSeriesVersionSchema.parse({
    id: 'english',
    episodeId: 'episode2',
    language: 'en',
    region: 'US',
    title: 'English region',
    timeline: [
      {
        id: 'regional-clip',
        nodeId: 'video',
        takeId: 'pinned',
        sourceMediaId: 'pinned-media',
        trimEnd: 2,
      },
    ],
    subtitles: '1\n00:00:00,000 --> 00:00:01,000\nHello\n',
  })
  project.production = studioProductionSchema.parse({
    timeline: [
      { id: 'master-clip', nodeId: 'video', takeId: 'newest', trimEnd: 4 },
    ],
    episodes: [
      { id: 'episode2', title: 'Episode2', synopsis: '', shotIds: [] },
    ],
    regionalVersions: [version],
  })
  const baseline = JSON.stringify(project)
  const onUpdate = vi.fn(),
    onRefresh = vi.fn(async () => {}),
    onSave = vi.fn(async () => {})
  const context = {
    props: { project, onUpdate, onRefresh, onSave, getMedia: async () => null },
    path: '/projects/film',
    writable,
    mutate: {
      isPending: false,
      mutate: (operation: () => Promise<unknown>) => {
        void operation()
      },
    },
    recoverSubmission: vi.fn(async () => {}),
  }
  vi.mocked(useStudioProductionContext).mockReturnValue(
    context as unknown as ReturnType<typeof useStudioProductionContext>
  )
  const next = structuredClone(project)
  assert(next.production)
  next.production.regionalVersions[0].timeline[0].speed = 0.5
  vi.mocked(studioCloudRequest).mockImplementation(async (path) => {
    if (path.endsWith('/edit-plans')) {
      return {
        id: 'plan',
        revision: 9,
        document: { next_document: next, impact: { output_seconds: 4 } },
      }
    }
    if (path.endsWith('/apply')) return { project: { document: next } }
    return { revision: 9, document: project }
  })
  render(<StudioRegionalTimelineEditor version={version} />)
  return { project, baseline, onUpdate, onRefresh, onSave, next }
}

test('prepares an exact regional edit and requires complete proposed playback before applying it', async () => {
  const h = mount()
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Playback speed' }), {
    target: { value: '.5' },
  })
  expect(h.onUpdate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Preview regional edit' }))
  await waitFor(() =>
    expect(studioCloudRequest).toHaveBeenCalledWith(
      '/projects/film/edit-plans',
      'POST',
      expect.objectContaining({
        version_id: 'english',
        clip_id: 'regional-clip',
        speed: 0.5,
        take_id: 'pinned',
        review_confirmed: true,
      })
    )
  )
  const apply = await screen.findByRole('button', {
    name: 'Apply regional edit',
  })
  expect(apply).toBeDisabled()
  fireEvent.click(
    screen.getByRole('button', { name: 'Finish proposed playback' })
  )
  expect(apply).not.toBeDisabled()
  fireEvent.click(apply)
  await waitFor(() => expect(h.onRefresh).toHaveBeenCalledTimes(1))
  expect(h.onUpdate).toHaveBeenCalledWith(h.next)
  expect(JSON.stringify(h.project)).toBe(h.baseline)
  expect(h.next.production?.timeline).toEqual(h.project.production?.timeline)
  expect(h.next.nodes).toEqual(h.project.nodes)
})

test('readonly references remain inspectable and a version with invalid trim cannot submit', () => {
  mount(false)
  expect(
    screen.getByRole('button', { name: 'Play current version' })
  ).not.toBeDisabled()
  expect(
    screen.getByRole('spinbutton', { name: 'Playback speed' })
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Preview regional edit' })
  ).toBeDisabled()
  expect(studioCloudRequest).not.toHaveBeenCalled()
})

test('an inverted source interval stays a local draft and never creates a plan', () => {
  mount()
  fireEvent.change(
    screen.getByRole('spinbutton', { name: 'Source trim start' }),
    { target: { value: '3' } }
  )
  expect(
    screen.getByRole('button', { name: 'Preview regional edit' })
  ).toBeDisabled()
  expect(studioCloudRequest).not.toHaveBeenCalled()
})
