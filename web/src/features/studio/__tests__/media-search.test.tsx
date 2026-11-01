/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'

import {
  StudioMediaSearch,
  type StudioMediaSearchHit,
} from '../studio-media-search'
import { studioProjectTimeline } from '../studio-production'
import { createStudioProject } from '../workspace'

const state = vi.hoisted(() => ({ request: vi.fn(), error: vi.fn() }))
vi.mock('../studio-cloud', () => ({
  studioCloudRequest: (...args: unknown[]) => state.request(...args),
}))
vi.mock('@/lib/handle-server-error', () => ({
  handleServerError: (error: unknown) => state.error(error),
}))
vi.mock('../studio-timeline-preview', () => ({
  StudioTimelinePreview: (props: {
    project: ReturnType<typeof createStudioProject>
  }) => {
    const clip = studioProjectTimeline(props.project)[0]
    const media = props.project.nodes.find((node) => node.id === clip.nodeId)
      ?.data.mediaId
    return (
      <div aria-label='Candidate timeline preview'>{`${media}:${clip.trimStart}-${clip.trimEnd}`}</div>
    )
  },
}))

const hit: StudioMediaSearchHit = {
  id: 'entry-1',
  index_id: 'index-1',
  source_media_id: 'actual-source',
  source_digest: 'f'.repeat(64),
  source_take_id: 'source-take',
  source_duration: 8,
  node_id: 'source',
  title: 'Rainy street',
  description: 'A rainy city street',
  start: 1,
  end: 3,
  matched: ['rainy', 'street'],
  model: 'local-vision',
  review_required: true,
}
const project = createStudioProject('Film', 'media-search-project')

beforeEach(() => {
  state.request.mockReset()
  state.error.mockReset()
  state.request.mockImplementation(
    async (path: string, method = 'GET', body?: { action?: string }) => {
      if (path.endsWith('/jobs')) {
        return [{ id: 'analysis-1', kind: 'analyze', status: 'succeeded' }]
      }
      if (method === 'POST' && body?.action === 'prepare') {
        return {
          id: 'plan-1',
          revision: 4,
          document: {
            impact: { source_start: 1, source_end: 3, replace_clip_id: '' },
          },
        }
      }
      if (path.endsWith('/apply')) return { project: { document: project } }
      if (method === 'POST') return { id: 'index-1' }
      if (path.includes('/media-index?')) {
        return {
          hits: [hit],
          total: 1,
          stale_records: 0,
          truncated: false,
          ranking: 'description_terms_with_disclosed_bilingual_dictionary',
        }
      }
      return { revision: 4, document: project }
    }
  )
})

function mount(readOnly = false) {
  const update = vi.fn()
  const save = vi.fn().mockResolvedValue(undefined)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <StudioMediaSearch
        project={project}
        getMedia={async () => null}
        readOnly={readOnly}
        onUpdate={update}
        onSave={save}
      />
    </QueryClientProvider>
  )
  return { update, save }
}

test('content search discloses its ranking and reuses a completed model receipt without generation', async () => {
  mount()
  await screen.findByText('Rainy street')
  expect(screen.getByText(/limited Chinese\/English dictionary/)).toBeVisible()
  fireEvent.change(screen.getByLabelText('Describe the footage you need'), {
    target: { value: '下雨的街道' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Search footage' }))
  await waitFor(() =>
    expect(
      state.request.mock.calls.some(([path]) =>
        String(path).includes(`query=${encodeURIComponent('下雨的街道')}`)
      )
    ).toBe(true)
  )
  const user = userEvent.setup()
  await user.click(
    screen.getByRole('combobox', { name: 'Completed visual analysis' })
  )
  await user.click(
    await screen.findByRole('option', { name: 'Visual analysis · 1' })
  )
  expect(
    screen.getByRole('combobox', { name: 'Completed visual analysis' })
  ).toHaveTextContent('Visual analysis · 1')
  expect(
    screen.getByRole('combobox', { name: 'Completed visual analysis' })
  ).not.toHaveTextContent('analysis-1')
  await user.click(screen.getByRole('button', { name: 'Index this analysis' }))
  await waitFor(() =>
    expect(state.request).toHaveBeenCalledWith(
      expect.stringContaining('/media-index'),
      'POST',
      { job_id: 'analysis-1' }
    )
  )
  expect(
    state.request.mock.calls.some(
      ([path, method]) => String(path).endsWith('/jobs') && method === 'POST'
    )
  ).toBe(false)
})

test('a candidate interval remains a preview until review and explicit edit-plan confirmation', async () => {
  const { update, save } = mount()
  fireEvent.click(
    await screen.findByRole('button', { name: 'Preview source interval' })
  )
  expect(screen.getByLabelText('Candidate timeline preview')).toHaveTextContent(
    'actual-source:1-3'
  )
  expect(
    screen.getByRole('button', { name: 'Preview B-roll edit plan' })
  ).toBeDisabled()
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'I checked this source interval and its visual content.',
    })
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Preview B-roll edit plan' })
  )
  const apply = await screen.findByRole('button', {
    name: 'Apply B-roll edit plan',
  })
  expect(save).toHaveBeenCalledOnce()
  expect(update).not.toHaveBeenCalled()
  expect(state.request).toHaveBeenCalledWith(
    expect.stringContaining('/media-index'),
    'POST',
    expect.objectContaining({
      action: 'prepare',
      index_id: 'index-1',
      entry_id: 'entry-1',
      review_confirmed: true,
      revision: 4,
    })
  )
  fireEvent.click(apply)
  await waitFor(() => expect(update).toHaveBeenCalledOnce())
  expect(state.request).toHaveBeenCalledWith(
    expect.stringContaining('/edit-plans/plan-1/apply'),
    'POST',
    { revision: 4 }
  )
})

test('read-only collaborators can preview sources but cannot index or prepare an edit', async () => {
  const { update } = mount(true)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Preview source interval' })
  )
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'I checked this source interval and its visual content.',
    })
  )
  expect(
    screen.getByRole('button', { name: 'Index this analysis' })
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Preview B-roll edit plan' })
  ).toBeDisabled()
  expect(update).not.toHaveBeenCalled()
})

test('a rejected edit plan leaves the film unchanged and surfaces the server error', async () => {
  const original = state.request.getMockImplementation()
  if (!original) throw new Error('Search fixture is unavailable')
  state.request.mockImplementation(
    (path: string, method?: string, body?: { action?: string }) =>
      body?.action === 'prepare'
        ? Promise.reject(new Error('Project revision changed'))
        : original(path, method, body)
  )
  const { update } = mount()
  fireEvent.click(
    await screen.findByRole('button', { name: 'Preview source interval' })
  )
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'I checked this source interval and its visual content.',
    })
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Preview B-roll edit plan' })
  )
  await waitFor(() =>
    expect(state.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Project revision changed' })
    )
  )
  expect(
    screen.queryByRole('button', { name: 'Apply B-roll edit plan' })
  ).not.toBeInTheDocument()
  expect(update).not.toHaveBeenCalled()
})
