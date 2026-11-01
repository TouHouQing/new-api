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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

import { StudioReferenceAnalysisPanel } from '../studio-reference-analysis-panel'
import {
  addStudioNode,
  createStudioProject,
  updateStudioNode,
} from '../workspace'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  context: vi.fn(),
  duration: vi.fn(),
  update: vi.fn(),
}))
vi.mock('../studio-cloud', () => ({
  studioCloudRequest: (...args: unknown[]) => mocks.request(...args),
}))
vi.mock('../studio-production-context', () => ({
  useStudioProductionContext: () => mocks.context(),
}))
vi.mock('../studio-creation-models', () => ({
  fetchStudioCreationModels: async () => ({ text: ['local-vision'] }),
}))
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    async getPrimaryVideoTrack() {
      return { computeDuration: () => mocks.duration() }
    }
    dispose() {}
  },
}))

function fixture() {
  return updateStudioNode(
    addStudioNode(
      createStudioProject('Exact source film', 'reference-project'),
      'video',
      'source'
    ),
    'source',
    {
      title: 'Source',
      mediaId: 'current-media',
      selectedTakeId: 'current-take',
      takes: [
        {
          id: 'old-take',
          prompt: '',
          mediaId: 'old-media',
          status: 'completed',
          createdAt: '2026-10-18T00:00:00Z',
        },
        {
          id: 'current-take',
          prompt: '',
          mediaId: 'current-media',
          status: 'completed',
          createdAt: '2026-10-18T00:00:00Z',
        },
      ],
    }
  )
}
const context = {
  props: {
    project: fixture(),
    getMedia: vi.fn().mockResolvedValue(new Blob(['video'])),
    userId: 1,
    onUpdate: mocks.update,
    onSave: vi.fn().mockResolvedValue(undefined),
  },
  writable: true,
  path: '/projects/reference-project',
  jobs: { data: [] },
  capabilities: {
    data: { generation_credit_available: true, quota_per_unit: 500000 },
  },
  mutate: { isPending: false, mutate: vi.fn() },
}
beforeEach(() => {
  mocks.request.mockReset()
  mocks.update.mockReset()
  mocks.duration.mockReset()
  context.props.getMedia.mockClear()
  context.props.project = fixture()
  mocks.duration.mockResolvedValue(180)
  mocks.context.mockReturnValue(context)
  mocks.update.mockImplementation((project) => {
    context.props.project = project
  })
  mocks.request.mockImplementation(async (path: string) =>
    path.endsWith('/jobs')
      ? {}
      : { revision: 3, document: context.props.project }
  )
  context.mutate.mutate.mockImplementation(
    (
      run: () => Promise<void>,
      options: { onError: (error: Error) => void }
    ) => {
      void run().catch(options.onError)
    }
  )
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:exact-source')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

function mount(segment: {
  mediaId: string
  takeId?: string
  start: number
  end: number
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <StudioReferenceAnalysisPanel initialSegment={segment} openInitially />
    </QueryClientProvider>
  )
}

test('a selected source interval survives metadata and an older exact Take is billed only after explicit confirmation', async () => {
  mount({ mediaId: 'old-media', takeId: 'old-take', start: 90, end: 100 })
  await waitFor(() => expect(mocks.duration).toHaveBeenCalled())
  expect(screen.getByLabelText('Start time (seconds)')).toHaveValue(90)
  expect(screen.getByLabelText('End time (seconds)')).toHaveValue(100)
  expect(context.props.getMedia).toHaveBeenCalledWith('old-media')
  expect(mocks.request).not.toHaveBeenCalled()
  expect(
    screen.getByRole('button', { name: 'Analyze this reference' })
  ).toBeDisabled()
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'Allow only reference analysis within this budget',
    })
  )
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Analyze this reference' })
    ).toBeEnabled()
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Analyze this reference' })
  )
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith(
      '/projects/reference-project/jobs',
      'POST',
      expect.objectContaining({
        kind: 'analyze',
        confirm_generation: true,
        budget: 2500000,
        operation: expect.objectContaining({
          media_id: 'old-media',
          take_id: 'old-take',
          edit: { start: 90, end: 100 },
        }),
      })
    )
  )
  expect(
    mocks.update.mock.calls[0][0].nodes.at(-1).data.derivedFrom
  ).toMatchObject({ mediaId: 'old-media', takeId: 'old-take' })
})

test('an overlong interval gives a concrete error and cannot submit even with budget confirmation', async () => {
  mount({ mediaId: 'old-media', takeId: 'old-take', start: 0, end: 61 })
  await screen.findByText(
    'Choose a source interval from 0.1 to 60 seconds, within the first hour.'
  )
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'Allow only reference analysis within this budget',
    })
  )
  expect(
    screen.getByRole('button', { name: 'Analyze this reference' })
  ).toBeDisabled()
  expect(mocks.request).not.toHaveBeenCalled()
})

test('a removed exact Take cannot silently use another version of the same node', async () => {
  mount({ mediaId: 'old-media', takeId: 'removed-take', start: 1, end: 3 })
  await screen.findByText(
    'The selected source media or exact Take is no longer available in this project.'
  )
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'Allow only reference analysis within this budget',
    })
  )
  expect(
    screen.getByRole('button', { name: 'Analyze this reference' })
  ).toBeDisabled()
  expect(context.props.getMedia).not.toHaveBeenCalled()
  expect(mocks.request).not.toHaveBeenCalled()
})
