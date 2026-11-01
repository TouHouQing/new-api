/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'

import { StudioBeatEditor } from '../studio-beat-editor'
import { studioProductionSchema } from '../studio-production'
import {
  addStudioNode,
  createStudioProject,
  updateStudioNode,
} from '../workspace'

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
vi.mock('../studio-media-thumbnail', () => ({
  StudioMediaThumbnail: () => <p>Original music player</p>,
}))
vi.mock('../studio-timeline-preview', () => ({
  StudioTimelinePreview: (props: { onPreviewed?: () => void }) => (
    <button type='button' onClick={props.onPreviewed}>
      Play pacing preview
    </button>
  ),
}))

const project = updateStudioNode(
  addStudioNode(
    createStudioProject('Music film', 'beat-ui-project'),
    'video',
    'source'
  ),
  'source',
  { mediaId: 'video-source', seconds: 40, status: 'completed' }
)
const source = {
  id: 'analysis-1',
  document: {
    source_media_id: 'original-song',
    source_digest: 'f'.repeat(64),
    analysis: {
      kind: 'audio_structure',
      start: 0,
      end: 40,
      beat_times: Array.from({ length: 81 }, (_, index) => index * 0.5),
      sections: [
        { start: 0, end: 20, label: 'Opening' },
        { start: 20, end: 40, label: 'Chorus' },
      ],
    },
  },
}
const context = {
  props: {
    project,
    getMedia: async () => null,
    onSave: vi.fn().mockResolvedValue(undefined),
    onRefresh: vi.fn().mockResolvedValue(undefined),
  },
  writable: true,
  path: `/projects/${project.id}`,
  setActiveTab: vi.fn(),
}

beforeEach(() => {
  mocks.request.mockReset()
  mocks.error.mockReset()
  context.props.onSave.mockClear()
  context.props.onRefresh.mockClear()
  context.setActiveTab.mockClear()
  context.writable = true
  mocks.context.mockReturnValue(context)
  mocks.request.mockImplementation(
    async (
      path: string,
      method = 'GET',
      body?: {
        action?: string
        pace?: string
        direction?: string
        start?: number
        end?: number
      }
    ) => {
      if (path.includes('/analyses/')) return source
      if (method === 'GET' && path.endsWith('/analyses')) return []
      if (method === 'GET' && path.endsWith('/beat-plans')) return []
      if (path.endsWith('/apply')) return {}
      if (body?.action === 'correct') return { id: 'correction-1' }
      if (body?.action === 'prepare') {
        const count =
          { slow: 1, normal: 2, tight: 3 }[body.pace || 'normal'] || 1
        const timeline = Array.from({ length: count }, (_, index) => ({
          id: `clip-${index}`,
          nodeId: 'source',
          trimStart: (index * 30) / count,
          trimEnd: ((index + 1) * 30) / count,
        }))
        const next = {
          ...project,
          soundtrackMediaId: 'original-song',
          production: studioProductionSchema.parse({
            timelineEdited: true,
            timeline,
          }),
        }
        return {
          id: `plan-${body.pace}`,
          revision: 1,
          state: 'ready',
          document: {
            analysis_id: 'analysis-1',
            correction_id: 'correction-1',
            request: {
              pace: body.pace,
              direction: body.direction,
              start: body.start,
              end: body.end,
            },
            next_document: next,
            impact: {
              duration: 30,
              cuts: Array.from({ length: count - 1 }, (_, index) => ({
                time: ((index + 1) * 30) / count,
              })),
              warnings: [],
            },
          },
        }
      }
      return { revision: 1, document: project }
    }
  )
})

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <StudioBeatEditor analysisId='analysis-1' />
    </QueryClientProvider>
  )
  return { ...view, client }
}

function requestImplementation() {
  const implementation = mocks.request.getMockImplementation()
  if (!implementation) throw new Error('The request fixture is unavailable.')
  return implementation
}

test('three reviewed pacing drafts keep the original analysis and require playback before application', async () => {
  mount()
  const prepare = await screen.findByRole('button', {
    name: 'Prepare three pacing drafts',
  })
  expect(prepare).toBeDisabled()
  expect(screen.getByLabelText('Song interval end')).toHaveValue(30)
  expect(
    screen.getByRole('combobox', { name: 'Music video direction' })
  ).toHaveTextContent('Narrative: preserve story order')
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'I listened and reviewed these beat times and section names.',
    })
  )
  fireEvent.click(prepare)
  await screen.findByRole('combobox', { name: 'Pacing draft' })
  expect(
    mocks.request.mock.calls.filter(([, , body]) => body?.action === 'prepare')
  ).toHaveLength(3)
  for (const [, , body] of mocks.request.mock.calls.filter(
    ([, , body]) => body?.action === 'prepare'
  )) {
    expect(body).toMatchObject({
      analysis_id: 'analysis-1',
      correction_id: 'correction-1',
      start: 0,
      end: 30,
      review_confirmed: true,
    })
  }
  expect(context.props.onRefresh).not.toHaveBeenCalled()
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: 'Pacing draft' }))
  await user.click(
    await screen.findByRole('option', { name: /Balanced pacing/ })
  )
  expect(
    screen.getByRole('combobox', { name: 'Pacing draft' })
  ).toHaveTextContent('Balanced pacing')
  expect(
    screen.getByRole('combobox', { name: 'Pacing draft' })
  ).not.toHaveTextContent('plan-normal')
  expect(
    screen.getByRole('button', { name: 'Apply this pacing draft' })
  ).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Play pacing preview' }))
  fireEvent.click(
    screen.getByRole('button', { name: 'Apply this pacing draft' })
  )
  await waitFor(() => expect(context.props.onRefresh).toHaveBeenCalledOnce())
  expect(mocks.request).toHaveBeenCalledWith(
    expect.stringContaining('/edit-plans/plan-normal/apply'),
    'POST',
    { revision: 1 }
  )
  expect(
    mocks.request.mock.calls.some(
      ([path, method]) => String(path).endsWith('/jobs') && method === 'POST'
    )
  ).toBe(false)
})

test('an invalid manual beat grid is rejected before persisting a correction or plan', async () => {
  mount()
  const field = await screen.findByLabelText(
    'Reviewed beat times in source seconds'
  )
  fireEvent.change(field, { target: { value: '1, 0.5' } })
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'I listened and reviewed these beat times and section names.',
    })
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Save reviewed music structure' })
  )
  await waitFor(() =>
    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Beats must be increasing source times inside the analyzed interval.',
      })
    )
  )
  expect(mocks.request.mock.calls.some(([, method]) => method === 'POST')).toBe(
    false
  )
  expect(context.props.onRefresh).not.toHaveBeenCalled()
})

test('performance direction opens existing tools without generating media or claiming native audio', async () => {
  mount()
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('combobox', { name: 'Music video direction' })
  )
  await user.click(
    await screen.findByRole('option', {
      name: 'Performance: edit existing performance footage',
    })
  )
  expect(
    screen.getByText(/separate confirmation; it is not native audio generation/)
  ).toBeVisible()
  fireEvent.click(
    screen.getByRole('button', { name: 'Review performance production tools' })
  )
  expect(context.setActiveTab).toHaveBeenCalledWith('media')
  expect(mocks.request.mock.calls.some(([, method]) => method === 'POST')).toBe(
    false
  )
})

test('read-only collaborators can inspect music but cannot save or prepare pacing changes', async () => {
  context.writable = false
  mount()
  await screen.findByText('Original music player')
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'I listened and reviewed these beat times and section names.',
    })
  )
  expect(
    screen.getByRole('button', { name: 'Save reviewed music structure' })
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Prepare three pacing drafts' })
  ).toBeDisabled()
})

test('saved music structure reopens from explicit history without changing original analysis or review consent', async () => {
  const original = requestImplementation()
  const measuredBefore = JSON.stringify(source)
  let history: unknown[] = []
  let correction: typeof source & {
    document: { analysis: { parent_id?: string } }
  }
  mocks.request.mockImplementation(async (path, method = 'GET', body) => {
    if (method === 'GET' && path.endsWith('/analyses')) return history
    if (method === 'GET' && path.endsWith('/analyses/correction-saved')) {
      return correction
    }
    if (body?.action === 'correct') {
      correction = {
        ...structuredClone(source),
        id: 'correction-saved',
        document: {
          ...structuredClone(source.document),
          analysis: {
            ...structuredClone(source.document.analysis),
            kind: 'beat_correction',
            parent_id: 'analysis-1',
            beat_times: body.beat_times,
            sections: body.sections,
          },
        },
      }
      history = [correction]
      return { id: correction.id }
    }
    return original(path, method, body)
  })
  const first = mount()
  fireEvent.change(
    await screen.findByLabelText('Reviewed beat times in source seconds'),
    { target: { value: '0, 1, 2' } }
  )
  fireEvent.change(
    screen.getByLabelText(
      'Song sections: source seconds and name, one per line'
    ),
    { target: { value: '0 My opening\n10 My chorus' } }
  )
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'I listened and reviewed these beat times and section names.',
    })
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Save reviewed music structure' })
  )
  await screen.findByText(
    'Reviewed structure saved. The original measurements remain available.'
  )
  await waitFor(() =>
    expect(
      mocks.request.mock.calls.filter(([path]) => path.endsWith('/analyses'))
        .length
    ).toBeGreaterThan(1)
  )
  first.unmount()
  mount()
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('combobox', { name: 'Music structure version' })
  )
  await user.click(
    await screen.findByRole('option', { name: 'Saved correction 1' })
  )
  await waitFor(() =>
    expect(
      screen.getByLabelText('Reviewed beat times in source seconds')
    ).toHaveValue('0, 1, 2')
  )
  expect(
    screen.getByLabelText(
      'Song sections: source seconds and name, one per line'
    )
  ).toHaveValue('0 My opening\n10 My chorus')
  expect(
    screen.getByRole('checkbox', {
      name: 'I listened and reviewed these beat times and section names.',
    })
  ).not.toBeChecked()
  expect(context.props.onRefresh).not.toHaveBeenCalled()
  expect(JSON.stringify(source)).toBe(measuredBefore)
  await user.click(
    screen.getByRole('combobox', { name: 'Music structure version' })
  )
  await user.click(
    await screen.findByRole('option', { name: 'Original measured structure' })
  )
  await waitFor(() =>
    expect(
      screen.getByLabelText('Reviewed beat times in source seconds')
    ).toHaveValue(source.document.analysis.beat_times.join(', '))
  )
})

test.each(['parent', 'digest', 'media'])(
  'history refuses a different %s before overwriting beat edits',
  async (mismatch) => {
    const original = requestImplementation()
    const summary = {
      ...source,
      id: 'invalid-correction',
      document: { ...source.document, analysis: { kind: 'beat_correction' } },
    }
    const invalid = structuredClone(source)
    invalid.id = 'invalid-correction'
    const analysis = {
      ...invalid.document.analysis,
      kind: 'beat_correction',
      parent_id: mismatch === 'parent' ? 'another-analysis' : 'analysis-1',
    }
    const full = {
      ...invalid,
      document: {
        ...invalid.document,
        analysis,
        source_digest:
          mismatch === 'digest'
            ? '0'.repeat(64)
            : invalid.document.source_digest,
        source_media_id:
          mismatch === 'media'
            ? 'different-song'
            : invalid.document.source_media_id,
      },
    }
    mocks.request.mockImplementation(async (path, method = 'GET', body) => {
      if (method === 'GET' && path.endsWith('/analyses')) return [summary]
      if (path.endsWith('/analyses/invalid-correction')) return full
      return original(path, method, body)
    })
    mount()
    const field = await screen.findByLabelText(
      'Reviewed beat times in source seconds'
    )
    fireEvent.change(field, { target: { value: '0, 0.75, 1.5' } })
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('combobox', { name: 'Music structure version' })
    )
    await user.click(
      await screen.findByRole('option', { name: 'Saved correction 1' })
    )
    await screen.findByText(
      'This saved structure belongs to another analysis or source.'
    )
    expect(field).toHaveValue('0, 0.75, 1.5')
    expect(
      mocks.request.mock.calls.some(([, method]) => method === 'POST')
    ).toBe(false)
  }
)

test('late history loads and query refreshes preserve newly edited structure', async () => {
  const original = requestImplementation()
  let finish!: (value: unknown) => void
  const pending = new Promise((resolve) => {
    finish = resolve
  })
  const correction = {
    ...source,
    id: 'saved-correction',
    document: {
      ...source.document,
      analysis: {
        ...source.document.analysis,
        kind: 'beat_correction',
        parent_id: 'analysis-1',
      },
    },
  }
  mocks.request.mockImplementation(async (path, method = 'GET', body) => {
    if (method === 'GET' && path.endsWith('/analyses')) return [correction]
    if (path.endsWith('/analyses/saved-correction')) return pending
    return original(path, method, body)
  })
  const { client } = mount()
  const user = userEvent.setup()
  const field = await screen.findByLabelText(
    'Reviewed beat times in source seconds'
  )
  await user.click(
    screen.getByRole('combobox', { name: 'Music structure version' })
  )
  await user.click(
    await screen.findByRole('option', { name: 'Saved correction 1' })
  )
  fireEvent.change(field, { target: { value: '0, 0.75, 1.5' } })
  finish(correction)
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Music structure version' })
    ).toBeEnabled()
  )
  client.setQueryData(['studio-beat-analysis', project.id, 'analysis-1'], {
    ...source,
    document: {
      ...source.document,
      analysis: { ...source.document.analysis, diagnostics: 'refetched' },
    },
  })
  await waitFor(() => expect(field).toHaveValue('0, 0.75, 1.5'))
  expect(
    screen.getByRole('combobox', { name: 'Music structure version' })
  ).toHaveTextContent('Unsaved changes')
})

test('a delayed save refreshes history without marking newer edits as saved', async () => {
  const original = requestImplementation()
  let finish!: (value: unknown) => void
  const pending = new Promise((resolve) => {
    finish = resolve
  })
  mocks.request.mockImplementation(async (path, method = 'GET', body) => {
    if (body?.action === 'correct') return pending
    return original(path, method, body)
  })
  mount()
  const field = await screen.findByLabelText(
    'Reviewed beat times in source seconds'
  )
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'I listened and reviewed these beat times and section names.',
    })
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Save reviewed music structure' })
  )
  await waitFor(() =>
    expect(
      mocks.request.mock.calls.some(([, , body]) => body?.action === 'correct')
    ).toBe(true)
  )
  fireEvent.change(field, { target: { value: '0, 0.9, 1.8' } })
  finish({ id: 'previous-edit-saved' })
  await waitFor(() =>
    expect(
      mocks.request.mock.calls.filter(([path]) => path.endsWith('/analyses'))
        .length
    ).toBeGreaterThan(1)
  )
  expect(field).toHaveValue('0, 0.9, 1.8')
  expect(
    screen.getByRole('combobox', { name: 'Music structure version' })
  ).toHaveTextContent('Unsaved changes')
  expect(
    screen.queryByText(
      'Reviewed structure saved. The original measurements remain available.'
    )
  ).not.toBeInTheDocument()
})
