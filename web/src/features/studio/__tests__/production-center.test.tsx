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
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import type { StudioProject } from '../local-projects'
import { studioMediaDraftSchema } from '../studio-media-draft'
import { studioProductionSchema } from '../studio-production'
import { StudioProductionPanel } from '../studio-production-panel'
import { applyStudioScreenplay } from '../studio-screenplay'
import { addStudioNode, createStudioProject } from '../workspace'

vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  fetchStudioModels: vi.fn(async () => [
    'qwen3.5:9b',
    'flux.2-klein-4b',
    'wan2.2-ti2v-5b',
  ]),
}))

let document: StudioProject

let jobs: unknown[] = []

function Host() {
  const [project, setProject] = useState(document)

  return (
    <StudioProductionPanel
      open
      onOpenChange={() => {}}
      project={project}
      userId={1}
      selectedNodeId={null}
      onUpdate={setProject}
      onSave={async () => {}}
      onRefresh={async () => {}}
      getMedia={async () => null}
    />
  )
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <Host />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  document = createStudioProject('Film', 'film')
  jobs = []

  vi.spyOn(api, 'request').mockImplementation(async (config) => {
    const url = config.url || ''
    let data: unknown = []

    if (url.endsWith('/film')) {
      data = { id: 'film', revision: 1, role: 'owner', document }
    }

    if (url.endsWith('/capabilities')) {
      data = {
        render_available: true,
        storage_available: true,
        quota_per_unit: 500000,
        available_quota: 10000000,
        generation_credit_available: true,
      }
    }

    if (url.endsWith('/jobs')) data = jobs

    if (url.endsWith('/events')) data = { events: [], cursor: '' }

    return { data: { success: true, data } } as Awaited<
      ReturnType<typeof api.request>
    >
  })
})

afterEach(() => vi.restoreAllMocks())

test('an empty production center opens story first, retains advanced tools and prevents empty previews', async () => {
  mount()
  await screen.findByRole('tab', { name: '1 Story and shots' })

  expect(
    screen.getByRole('tab', { name: '1 Story and shots' })
  ).toHaveAttribute('aria-selected', 'true')

  expect(
    screen.queryByRole('tab', { name: 'studio.production.versions' })
  ).not.toBeInTheDocument()

  await userEvent.click(
    screen.getByRole('button', { name: 'More production tools' })
  )

  expect(
    screen.getByRole('tab', { name: 'studio.production.versions' })
  ).toBeVisible()

  await userEvent.click(screen.getByRole('tab', { name: '3 Edit and sound' }))

  expect(
    screen.getByRole('button', { name: 'studio.production.preview' })
  ).toBeDisabled()

  expect(
    screen.getByRole('button', { name: 'Build a rough cut from shot order' })
  ).toBeDisabled()

  expect(
    screen.getByText(
      'No footage is ready yet. Generate or import a clip before editing.'
    )
  ).toBeVisible()
})

test('first-shot generation confirms exactly one video and keeps scheduling and effects optional', async () => {
  document = applyStudioScreenplay(document, {
    title: 'Film',
    brief: 'A cat walks to a gate.',
    shots: [
      {
        id: 'first',
        title: 'First',
        text: 'Cat walks',
        imagePrompt: 'Cat in a garden',
        videoPrompt: 'Cat walking slowly',
        seconds: 2,
      },
      {
        id: 'second',
        title: 'Second',
        text: 'Cat stops',
        imagePrompt: 'Cat at a gate',
        videoPrompt: 'Cat stops at a gate',
        seconds: 2,
      },
    ],
  })

  for (const node of document.nodes) {
    node.data.model =
      node.data.kind === 'video' ? 'wan2.2-ti2v-5b' : 'flux.2-klein-4b'
  }

  const firstVideo = document.shots?.[0]?.videoNodeId
  expect(firstVideo).toBeTypeOf('string')

  mount()
  await screen.findByRole('button', { name: 'Try the first shot' })

  expect(
    screen.queryByRole('textbox', { name: 'Start time (optional)' })
  ).not.toBeInTheDocument()

  expect(
    screen.queryByRole('button', { name: 'Timed keyframes and long shots' })
  ).not.toBeInTheDocument()

  await userEvent.click(
    screen.getByRole('button', { name: 'Try the first shot' })
  )

  await userEvent.click(
    screen.getByRole('checkbox', { name: 'studio.production.confirm' })
  )

  await userEvent.click(
    screen.getByRole('button', { name: 'Generate selected footage' })
  )

  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/api/studio/cloud/projects/film/jobs',
        data: expect.objectContaining({
          node_ids: [firstVideo],
          confirm_generation: true,
          kind: 'generate',
        }),
      })
    )
  )

  expect(
    vi
      .mocked(api.request)
      .mock.calls.some(([config]) => config.url?.startsWith('/api/token'))
  ).toBe(false)
})

test('resuming a failed task confirms its own frozen spending limit instead of borrowing the new-run checkbox', async () => {
  jobs = [
    {
      id: 'failed',
      user_id: 1,
      kind: 'generate',
      node_ids: [],
      status: 'failed',
      progress: 0,
      error: 'generation returned HTTP 403',
      budget: 1000,
      revision: 1,
    },
  ]

  mount()
  await userEvent.click(
    await screen.findByRole('tab', { name: '2 Generate footage' })
  )

  await userEvent.click(
    await screen.findByRole('button', { name: 'studio.production.resume' })
  )

  expect(
    screen.getByText(/This resumes the saved scope and spending limit/)
  ).toBeVisible()

  await userEvent.click(
    screen.getByRole('button', { name: 'Resume the saved task' })
  )

  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/studio/cloud/jobs/failed/control',
        method: 'POST',
        data: { action: 'resume', confirm_generation: true },
      })
    )
  )
})

test('the edit-page voice entry opens speech even when the last production draft used video depth', async () => {
  document = addStudioNode(document, 'video', 'imported-video')
  document.nodes[0].data.mediaId = 'imported-media'
  document.nodes[0].data.sourceMode = 'upload'
  document.production = studioProductionSchema.parse({
    mediaDraft: studioMediaDraftSchema.parse({
      action: 'video_depth',
      model: 'studio-video-depth',
      prompt: 'depth',
      seconds: 2,
      node_id: '',
    }),
  })
  mount()
  expect(
    await screen.findByRole('tab', { name: '3 Edit and sound' })
  ).toHaveAttribute('aria-selected', 'true')
  await userEvent.click(
    screen.getByRole('button', { name: 'Create voice or music' })
  )
  expect(
    await screen.findByRole('combobox', {
      name: 'studio.production.mediaAction',
    })
  ).toHaveTextContent('studio.production.mediaAction.voice_speech')
})

test('uploaded footage is never selected for first-shot generation', async () => {
  document = addStudioNode(document, 'video', 'uploaded-video')
  document.nodes[0].data.sourceMode = 'upload'
  document.nodes[0].data.mediaId = 'uploaded-media'
  mount()
  await userEvent.click(
    await screen.findByRole('tab', { name: '2 Generate footage' })
  )
  expect(
    screen.getByRole('button', { name: 'Try the first shot' })
  ).toBeDisabled()
})

test('an unapproved delivery clip opens the matching review controls', async () => {
  document = addStudioNode(document, 'video', 'review-video')
  document.nodes[0].data.mediaId = 'saved-video'
  document.nodes[0].data.status = 'completed'
  document.production = studioProductionSchema.parse({ requireApproved: true })
  mount()
  await userEvent.click(
    await screen.findByRole('tab', { name: '4 Review and export' })
  )
  await userEvent.click(
    screen.getByRole('button', { name: /^Review current footage/ })
  )
  expect(
    screen.getByRole('tab', { name: 'studio.production.review' })
  ).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('combobox', { name: 'Review media' })).toBeVisible()
})

test('opening generated footage for editing keeps the automatically created clip', async () => {
  document = addStudioNode(document, 'video', 'generated-video')
  document.nodes[0].data.mediaId = 'saved-video'
  document.nodes[0].data.selectedTakeId = 'saved-take'
  document.nodes[0].data.takes = [
    {
      id: 'saved-take',
      status: 'completed',
      prompt: 'A video draft',
      mediaId: 'saved-video',
      createdAt: new Date().toISOString(),
    },
  ]
  mount()
  await userEvent.click(
    await screen.findByRole('tab', { name: '2 Generate footage' })
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Try the first shot' })
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Edit this clip on the timeline' })
  )
  expect(screen.getByRole('tab', { name: '3 Edit and sound' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  expect(screen.getAllByRole('button', { name: /^\d+\. / })).toHaveLength(1)
})
