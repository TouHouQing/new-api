/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'

import { studioProductionSchema } from '../studio-production'
import { StudioTranscriptEditor } from '../studio-transcript-editor'
import { addStudioNode, createStudioProject } from '../workspace'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  context: vi.fn(),
  error: vi.fn(),
}))
vi.mock('../studio-cloud', () => ({
  studioCloudRequest: (...args: unknown[]) => mocks.request(...args),
}))
vi.mock('../studio-production-context', () => ({
  useStudioProductionContext: () => mocks.context(),
}))
vi.mock('@/lib/handle-server-error', () => ({
  handleServerError: (error: unknown) => mocks.error(error),
}))
vi.mock('../studio-timeline-preview', () => ({
  StudioTimelinePreview: () => <p>Editable media preview</p>,
}))

const project = addStudioNode(
  createStudioProject('Speech', 'speech-film'),
  'video',
  'video'
)
project.nodes[0].data.mediaId = 'source'
project.production = studioProductionSchema.parse({
  timelineEdited: true,
  timeline: [
    { id: 'clip', nodeId: 'video', trimStart: 2, trimEnd: 6, speed: 2 },
  ],
})
const analysis = {
  id: 'asr',
  revision: 7,
  document: {
    kind: 'transcript',
    source_media_id: 'source',
    source_digest: 'a'.repeat(64),
    analysis: {
      kind: 'transcript',
      precision: 'segment',
      segments: [
        { id: 'outside', start: 0, end: 1, text: 'Outside clip' },
        { id: 'partial', start: 1, end: 3, text: 'Crosses trim boundary' },
        { id: 'sentence', start: 3, end: 5, text: 'Keep original speech' },
      ],
    },
  },
}
const context = {
  props: {
    open: true,
    project,
    onSave: vi.fn().mockResolvedValue(undefined),
    onRefresh: vi.fn().mockResolvedValue(undefined),
    getMedia: async () => null,
  },
  path: '/projects/speech-film',
  writable: true,
  jobs: {
    data: [] as unknown[],
    refetch: vi.fn().mockResolvedValue(undefined),
  },
  budget: '1',
  confirm: false,
  transcriptionModel: 'whisper-local',
  capabilities: {
    data: { quota_per_unit: 500000, generation_credit_available: true },
  },
  setConfirm: vi.fn(),
  setBudget: vi.fn(),
  setTranscriptionModel: vi.fn(),
}
beforeEach(() => {
  mocks.request.mockReset()
  mocks.error.mockReset()
  context.props.onRefresh.mockClear()
  context.writable = true
  context.jobs.data = []
  mocks.context.mockReturnValue(context)
  mocks.request.mockImplementation(
    async (path: string, method = 'GET', body?: { action?: string }) => {
      if (path.endsWith('/analyses')) return [analysis]
      if (path.endsWith('/analyses/asr')) return analysis
      if (path.endsWith('/apply')) return { revision: 8 }
      if (method === 'POST' && path.endsWith('/edit-plans')) {
        return {
          id: 'plan',
          revision: 7,
          document: {
            next_document: project,
            request: { action: body?.action },
            impact: { output_seconds: 2, ranges: [] },
          },
        }
      }
      return { revision: 7, document: project }
    }
  )
})
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <StudioTranscriptEditor />
    </QueryClientProvider>
  )
}
test('subtitles prepare a separate preview without changing speech or applying the edit automatically', async () => {
  mount()
  await userEvent.click(
    await screen.findByRole('button', {
      name: 'Preview using this transcript as subtitles',
    })
  )
  await screen.findByText('Editable media preview')
  expect(mocks.request).toHaveBeenCalledWith(
    '/projects/speech-film/edit-plans',
    'POST',
    expect.objectContaining({
      revision: 7,
      action: 'transcript_captions',
      clip_id: 'clip',
      transcript_id: 'asr',
    })
  )
  expect(
    mocks.request.mock.calls.some(
      ([path]) =>
        String(path).includes('/jobs') || String(path).endsWith('/apply')
    )
  ).toBe(false)
  await userEvent.click(screen.getByRole('button', { name: 'Apply this edit' }))
  await waitFor(() => expect(context.props.onRefresh).toHaveBeenCalledOnce())
  expect(mocks.request).toHaveBeenCalledWith(
    '/projects/speech-film/edit-plans/plan/apply',
    'POST',
    { revision: 7 }
  )
})
test('media removal requires a complete selected sentence and explicit speech review', async () => {
  mount()
  const selected = await screen.findByRole('checkbox', {
    name: 'Select sentence: Keep original speech',
  })
  expect(screen.queryByText('Outside clip')).not.toBeInTheDocument()
  expect(
    screen.getByRole('checkbox', {
      name: 'Select sentence: Crosses trim boundary',
    })
  ).toHaveAttribute('aria-disabled', 'true')
  const prepare = screen.getByRole('button', {
    name: 'Preview removing selected sentences',
  })
  fireEvent.click(selected)
  expect(prepare).toBeDisabled()
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'I reviewed the selected speech and overlapping voices.',
    })
  )
  await userEvent.click(prepare)
  await screen.findByText('Editable media preview')
  expect(mocks.request).toHaveBeenCalledWith(
    '/projects/speech-film/edit-plans',
    'POST',
    expect.objectContaining({
      action: 'delete_transcript',
      utterance_ids: ['sentence'],
      review_confirmed: true,
      clip_id: 'clip',
    })
  )
})
test('read-only users can read but cannot correct subtitles, cut footage or start recognition', async () => {
  context.writable = false
  mount()
  await screen.findByText('Keep original speech')
  expect(
    screen.getByRole('button', {
      name: 'Preview using this transcript as subtitles',
    })
  ).toBeDisabled()
  for (const button of screen.getAllByRole('button', {
    name: 'Correct text or speaker',
  })) {
    expect(button).toBeDisabled()
  }
  expect(
    screen.getByRole('checkbox', {
      name: 'Select sentence: Keep original speech',
    })
  ).toHaveAttribute('aria-disabled', 'true')
  expect(
    mocks.request.mock.calls.every(([, method]) => !method || method === 'GET')
  ).toBe(true)
})

test('an active recognition task prevents duplicate submission while its result is collected', async () => {
  context.jobs.data = [
    {
      id: 'active',
      kind: 'transcribe',
      source_media_id: 'source',
      status: 'running',
      progress: 20,
    },
  ]
  context.confirm = true
  mocks.request.mockImplementation(async (path: string) =>
    path.endsWith('/analyses') ? [] : { revision: 7, document: project }
  )
  mount()
  expect(
    await screen.findByRole('button', { name: 'Recognize this clip' })
  ).toBeDisabled()
  expect(screen.getByText(/Recognition status/)).toHaveTextContent('20%')
  expect(
    mocks.request.mock.calls.every(([, method]) => !method || method === 'GET')
  ).toBe(true)
})

test('a saved recognition response is recovered with the original job identity without a new model task', async () => {
  context.jobs.data = [
    {
      id: 'saved',
      kind: 'transcribe',
      source_media_id: 'source',
      status: 'failed',
      progress: 20,
      error: 'transcription returned invalid text or timestamps',
      result: { response_media_id: 'response' },
    },
  ]
  mocks.request.mockImplementation(async (path: string) =>
    path.endsWith('/analyses') ? [] : { revision: 7, document: project }
  )
  mount()
  await userEvent.click(
    await screen.findByRole('button', {
      name: 'Recover saved recognition result',
    })
  )
  await waitFor(() => expect(context.jobs.refetch).toHaveBeenCalled())
  expect(mocks.request).toHaveBeenCalledWith('/jobs/saved/control', 'POST', {
    action: 'resume',
    confirm_generation: true,
  })
  expect(
    mocks.request.mock.calls.filter(
      ([path, method]) => method === 'POST' && String(path).endsWith('/jobs')
    )
  ).toHaveLength(0)
})
