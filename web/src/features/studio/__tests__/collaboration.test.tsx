/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { StudioCollaboration } from '../studio-collaboration'
import { createStudioProject } from '../workspace'

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().auth.setUser({ id: 1, username: 'owner', role: 1 })
})
afterEach(() => {
  onlineManager.setOnline(true)
  vi.useRealTimers()
  localStorage.clear()
  useAuthStore.getState().auth.setUser(null)
  vi.restoreAllMocks()
})
const project = () => ({
  ...createStudioProject('Film', 'film'),
  nodes: [
    {
      id: 'shot',
      type: 'studio' as const,
      position: { x: 0, y: 0 },
      data: {
        kind: 'image' as const,
        title: 'Product',
        prompt: 'Photo',
        mediaId: 'old',
        selectedTakeId: 'take-one',
        takes: [
          {
            id: 'take-one',
            createdAt: '2026-10-18',
            prompt: 'Photo',
            status: 'completed' as const,
            mediaId: 'old',
          },
        ],
      },
    },
  ],
})
const snapshot = () => ({
  server_time: Math.floor(Date.now() / 1000),
  project_revision: 7,
  role: 'owner',
  members: [
    { user_id: 1, username: 'Owner', display_name: '', role: 'owner' },
    { user_id: 3, username: 'Reviewer', display_name: '', role: 'reviewer' },
  ],
  presence: [] as {
    user_id: number
    username: string
    display_name: string
    node_id: string
    view: string
    expires_at: number
  }[],
  assignments: [
    {
      id: 'task',
      version: 2,
      title: 'Check logo',
      priority: 'high',
      assignee_id: 3,
      author_id: 1,
      state: 'open',
      target: {
        project_revision: 6,
        node_id: 'shot',
        node_title: 'Product',
        take_id: 'take-one',
        media_id: 'old',
        digest: 'a'.repeat(64),
        kind: 'image',
        start: 0,
        end: 0,
      },
      events: [
        {
          operation_id: 'original',
          actor_id: 1,
          operation: 'create',
          state: 'open',
          note: 'Keep the logo clear',
          created_at: '2026-10-18',
          version: 1,
        },
      ],
      stale: false,
    },
  ],
})
function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <StudioCollaboration project={project()} selectedNodeId='shot' />
    </QueryClientProvider>
  )
}
function mockRequests(
  current: ReturnType<typeof snapshot>,
  failure: { write: boolean }
) {
  return vi.spyOn(api, 'request').mockImplementation(async (config) => {
    if (config.url?.endsWith('/presence')) {
      return { data: { success: true, data: {} } }
    }
    if (config.url?.endsWith('/collaboration')) {
      return { data: { success: true, data: current } }
    }
    if (config.url?.includes('/assignments')) {
      if (failure.write) throw new AxiosError('Network Error')
      return { data: { success: true, data: current.assignments[0] } }
    }
    throw new Error(`Unexpected request ${config.url}`)
  })
}

test('a new review task pins the source revision, exact selected take and chosen reviewer', async () => {
  const request = mockRequests(snapshot(), { write: false })
  renderPanel()
  await userEvent.click(
    await screen.findByRole('button', { name: 'Assign a review task' })
  )
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Review task title' }),
    'Check contrast'
  )
  await userEvent.click(
    within(screen.getByRole('form', { name: 'New review task' })).getByRole(
      'combobox',
      { name: 'Assigned reviewer' }
    )
  )
  await userEvent.click(await screen.findByRole('option', { name: 'Reviewer' }))
  await userEvent.click(
    screen.getByRole('button', { name: 'Create review task' })
  )
  await screen.findByRole('status')
  const call = request.mock.calls.find(([config]) =>
    config.url?.endsWith('/assignments')
  )?.[0]
  expect(call?.data).toMatchObject({
    operation: 'create',
    expected_version: 0,
    project_revision: 7,
    node_id: 'shot',
    take_id: 'take-one',
    media_id: 'old',
    assignee_id: 3,
    title: 'Check contrast',
  })
  expect(call?.headers).toMatchObject({ 'X-Studio-Document-Version': '2' })
})

test('a network failure keeps one recoverable operation and a retry checks membership before sending the same operation id', async () => {
  const failure = { write: true }
  const request = mockRequests(snapshot(), failure)
  const view = renderPanel()
  await userEvent.type(
    await screen.findByRole('textbox', {
      name: 'Reply or explain the revision',
    }),
    'Reduce reflection'
  )
  await userEvent.click(screen.getByRole('button', { name: 'Add reply' }))
  await screen.findByText('Pending review changes on this device')
  const stored = JSON.parse(
    localStorage.getItem('newapi:studio:review-queue:v1:user:1:project:film') ||
      '[]'
  )
  expect(stored).toHaveLength(1)
  expect(stored[0]).toMatchObject({
    id: 'task',
    expected_version: 2,
    note: 'Reduce reflection',
  })
  view.unmount()
  failure.write = false
  renderPanel()
  await userEvent.click(
    await screen.findByRole('button', { name: 'Check and synchronize' })
  )
  await waitFor(() =>
    expect(
      JSON.parse(
        localStorage.getItem(
          'newapi:studio:review-queue:v1:user:1:project:film'
        ) || '[]'
      )
    ).toEqual([])
  )
  const writes = request.mock.calls.filter(([config]) =>
    config.url?.endsWith('/assignments/task')
  )
  expect(writes).toHaveLength(2)
  expect(writes[1][0].data).toMatchObject({
    operation_id: stored[0].operation_id,
  })
  expect(writes[0][0].data).toMatchObject({
    operation_id: stored[0].operation_id,
  })
  const lastWrite =
    request.mock.calls.length -
    1 -
    [...request.mock.calls]
      .reverse()
      .findIndex(([config]) => config.url?.endsWith('/assignments/task'))
  expect(
    [...request.mock.calls]
      .slice(0, lastWrite)
      .reverse()
      .find(([config]) => !config.url?.endsWith('/presence'))?.[0].url
  ).toBe('/api/studio/cloud/projects/film/collaboration')
})

test('a browser offline event persists the reply immediately instead of leaving a paused mutation', async () => {
  const failure = { write: true }
  mockRequests(snapshot(), failure)
  renderPanel()
  const reply = await screen.findByRole('textbox', {
    name: 'Reply or explain the revision',
  })
  await userEvent.type(reply, 'Keep this offline feedback')
  onlineManager.setOnline(false)
  await userEvent.click(screen.getByRole('button', { name: 'Add reply' }))
  await screen.findByText('Pending review changes on this device')
  expect(reply).toBeEnabled()
  expect(
    localStorage.getItem('newapi:studio:review-queue:v1:user:1:project:film')
  ).toContain('Keep this offline feedback')
})

test('an offline operation whose task version changed stays pending without overwriting the newer review', async () => {
  localStorage.setItem(
    'newapi:studio:review-queue:v1:user:1:project:film',
    JSON.stringify([
      {
        id: 'task',
        operation_id: 'queued',
        operation: 'reply',
        expected_version: 1,
        note: 'Older note',
      },
    ])
  )
  const request = mockRequests(snapshot(), { write: false })
  renderPanel()
  await userEvent.click(
    await screen.findByRole('button', { name: 'Check and synchronize' })
  )
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Check and synchronize' })
    ).toBeEnabled()
  )
  expect(
    request.mock.calls.some(([config]) => config.url?.includes('/assignments'))
  ).toBe(false)
  expect(
    localStorage.getItem('newapi:studio:review-queue:v1:user:1:project:film')
  ).toContain('Older note')
})

test('cached presence disappears when its server expiry passes even without a new response', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-18T00:00:00Z'))
  const current = snapshot()
  current.presence = [
    {
      user_id: 3,
      username: 'Reviewer',
      display_name: '',
      node_id: 'shot',
      view: 'review',
      expires_at: current.server_time + 1,
    },
  ]
  mockRequests(current, { write: false })
  renderPanel()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  const online = screen.getByLabelText('Online project members')
  expect(within(online).getByText('Reviewer · Product')).toBeInTheDocument()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100)
  })
  expect(
    within(online).queryByText('Reviewer · Product')
  ).not.toBeInTheDocument()
  expect(
    within(online).getByText('No recent active sessions')
  ).toBeInTheDocument()
})
