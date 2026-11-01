/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { StudioPublishing } from '../studio-publishing'
import { createStudioProject } from '../workspace'

beforeEach(() => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'owner', role: 1 })
})
afterEach(() => {
  useAuthStore.getState().auth.setUser(null)
  vi.restoreAllMocks()
})
const publication = () => ({
  id: 'release',
  project_revision: 7,
  render_revision: 6,
  render_job_id: 'rendered',
  media_id: 'finished',
  source_digest: 'a'.repeat(64),
  platform: 'youtube',
  connector_id: '',
  account_id: '',
  account_label: '',
  title: 'Finished film',
  description: 'A video',
  tags: [],
  visibility: 'private',
  schedule_at: 0,
  cover_at: 0,
  caption_language: 'en',
  made_for_kids: false as boolean | null,
  synthetic_media: true as boolean | null,
  fingerprint: 'b'.repeat(64),
  state: 'draft',
  verification: 'verification_blocked',
  packages: {} as Record<string, string>,
  jobs: {} as Record<string, string>,
})
const snapshot = () => ({
  publications: [] as ReturnType<typeof publication>[],
  project_revision: 7,
  role: 'owner',
  accounts: [] as {
    id: string
    label: string
    account_id: string
    state: string
    expires_at: number
  }[],
  renders: [
    {
      id: 'rendered',
      revision: 6,
      created_at: '2026-10-18',
      media_id: 'finished',
      duration: 8,
    },
  ],
  jobs: [],
})
function mockRequests(current: ReturnType<typeof snapshot>) {
  return vi.spyOn(api, 'request').mockImplementation(async (config) => {
    if (config.method === 'GET') {
      return { data: { success: true, data: current } }
    }
    if (
      config.url === '/api/studio/cloud/projects/film/publications' &&
      config.method === 'POST'
    ) {
      const value = { ...publication(), id: (config.data as { id: string }).id }
      current.publications = [value]
      return { data: { success: true, data: value } }
    }
    if (config.url?.endsWith('/confirm')) {
      return {
        data: {
          success: true,
          data: {
            ...publication(),
            confirmed_fingerprint: publication().fingerprint,
          },
        },
      }
    }
    if (config.url?.endsWith('/jobs')) {
      return {
        data: {
          success: true,
          data: { id: 'job', status: 'queued', budget: 0 },
        },
      }
    }
    throw new Error(`Unexpected request ${config.url}`)
  })
}
function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <StudioPublishing project={createStudioProject('Film', 'film')} />
    </QueryClientProvider>
  )
}
async function selectRelease() {
  await userEvent.click(
    await screen.findByRole('combobox', { name: 'Prepared publishing version' })
  )
  await userEvent.click(
    await screen.findByRole('option', { name: /Finished film/ })
  )
}

test('without a completed render the publishing panel does not fabricate a draft or an output', async () => {
  const current = snapshot()
  current.renders = []
  const request = mockRequests(current)
  renderPanel()
  await screen.findByText('Export a finished video first')
  expect(
    screen.queryByRole('button', { name: 'Prepare publishing version' })
  ).not.toBeInTheDocument()
  expect(request.mock.calls.some(([config]) => config.method === 'POST')).toBe(
    false
  )
})

test('preparing a release pins the completed render and only creates a reviewable draft', async () => {
  const current = snapshot()
  const request = mockRequests(current)
  renderPanel()
  await screen.findByRole('button', { name: 'Prepare publishing version' })
  await userEvent.click(
    screen.getByRole('button', { name: 'Prepare publishing version' })
  )
  await screen.findByRole('status')
  const writes = request.mock.calls.filter(
    ([config]) => config.method === 'POST'
  )
  expect(writes).toHaveLength(1)
  expect(writes[0][0].data).toMatchObject({
    project_revision: 7,
    render_job_id: 'rendered',
    title: 'Film',
    visibility: 'private',
    made_for_kids: null,
    synthetic_media: null,
  })
  expect(writes[0][0].headers).toMatchObject({
    'X-Studio-Document-Version': '2',
  })
  expect(
    screen.queryByRole('button', { name: /Review and confirm YouTube upload/ })
  ).not.toBeInTheDocument()
})

test('a package action uses the durable queue and does not claim packages exist before the result arrives', async () => {
  const current = snapshot()
  current.publications = [publication()]
  const request = mockRequests(current)
  renderPanel()
  await selectRelease()
  expect(
    screen.queryByRole('button', { name: /Download publishing package/ })
  ).not.toBeInTheDocument()
  await userEvent.click(
    screen.getByRole('button', { name: 'Prepare four publishing packages' })
  )
  await screen.findByRole('status')
  expect(
    request.mock.calls.find(([config]) => config.url?.endsWith('/jobs'))?.[0]
      .data
  ).toMatchObject({ action: 'package' })
  expect(
    request.mock.calls.some(([config]) => config.url?.endsWith('/confirm'))
  ).toBe(false)
  expect(
    screen.queryByRole('button', { name: /Download publishing package/ })
  ).not.toBeInTheDocument()
  current.publications = [
    {
      ...publication(),
      packages: {
        youtube: 'zip-youtube',
        douyin: 'zip-douyin',
        xiaohongshu: 'zip-xhs',
        bilibili: 'zip-bili',
      },
      state: 'packages_ready',
    },
  ]
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh publishing versions' })
  )
  await waitFor(() =>
    expect(
      screen.getAllByRole('button', { name: /Download publishing package/ })
    ).toHaveLength(4)
  )
})

test('YouTube upload waits for confirmation of the exact account and fingerprint; cancellation sends nothing', async () => {
  const current = snapshot()
  current.publications = [
    {
      ...publication(),
      connector_id: 'youtube-owner',
      account_id: 'channel-one',
      account_label: 'My channel',
    },
  ]
  current.accounts = [
    {
      id: 'youtube-owner',
      label: 'My channel',
      account_id: 'channel-one',
      state: 'configured',
      expires_at: 0,
    },
  ]
  const request = mockRequests(current)
  renderPanel()
  await selectRelease()
  await userEvent.click(
    screen.getByRole('button', { name: 'Review and confirm YouTube upload' })
  )
  await screen.findByRole('alertdialog')
  await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
  expect(request.mock.calls.some(([config]) => config.method === 'POST')).toBe(
    false
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Review and confirm YouTube upload' })
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirm upload to this account' })
  )
  await screen.findByRole('status')
  const writes = request.mock.calls.filter(
    ([config]) => config.method === 'POST'
  )
  expect(writes).toHaveLength(2)
  expect(writes[0][0].url).toMatch(/\/release\/confirm$/)
  expect(writes[0][0].data).toMatchObject({
    fingerprint: publication().fingerprint,
    confirm_external_write: true,
  })
  expect(writes[1][0].url).toMatch(/\/release\/jobs$/)
  expect(writes[1][0].data).toMatchObject({ action: 'publish' })
})

test('a cancelled version preserves its downloads and asks for a new version rather than resubmitting a terminal job', async () => {
  const current = snapshot()
  current.publications = [
    {
      ...publication(),
      state: 'cancelled',
      connector_id: 'youtube-owner',
      account_id: 'channel-one',
      packages: { youtube: 'stored-zip' },
    },
  ]
  current.accounts = [
    {
      id: 'youtube-owner',
      label: 'My channel',
      account_id: 'channel-one',
      state: 'configured',
      expires_at: 0,
    },
  ]
  const request = mockRequests(current)
  renderPanel()
  await selectRelease()
  expect(
    screen.getByText(/This publishing version is stopped/)
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Prepare four publishing packages' })
  ).toBeDisabled()
  expect(
    screen.queryByRole('button', { name: 'Review and confirm YouTube upload' })
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: /Download publishing package/ })
  ).toBeEnabled()
  expect(request.mock.calls.some(([config]) => config.method === 'POST')).toBe(
    false
  )
})

test('cancelling an unconfigured local draft does not present missing audience declarations as false', async () => {
  const current = snapshot()
  current.publications = [
    { ...publication(), made_for_kids: null, synthetic_media: null },
  ]
  const request = mockRequests(current)
  renderPanel()
  await selectRelease()
  await userEvent.click(
    screen.getByRole('button', { name: 'Cancel local publishing task' })
  )
  const dialog = await screen.findByRole('alertdialog')
  expect(dialog).toHaveTextContent('Made for children: Not specified')
  expect(dialog).toHaveTextContent('Synthetic media: Not specified')
  expect(request.mock.calls.some(([config]) => config.method === 'POST')).toBe(
    false
  )
})
