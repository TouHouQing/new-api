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
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { Tabs } from '@/components/ui/tabs'
import { api } from '@/lib/api'

import { StudioConnectorPanel } from '../studio-connector-panel'
import {
  studioProductionSchema,
  studioProjectRenderPlan,
  studioSeriesVersionSchema,
} from '../studio-production'
import { StudioProductionContext } from '../studio-production-context'
import { useStudioProductionController } from '../studio-production-controller'
import { StudioProductionDeliveryTab } from '../studio-production-delivery-tab'
import { StudioProductionMediaTab } from '../studio-production-media-tab'
import { StudioProductionPrevisTab } from '../studio-production-previs-tab'
import { StudioProductionReviewTab } from '../studio-production-review-tab'
import { StudioProductionTimelineTab } from '../studio-production-timeline-tab'
import * as series from '../studio-series'
import { StudioSeriesPanel } from '../studio-series-panel'
import { addStudioNode, createStudioProject } from '../workspace'

vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  fetchStudioModels: vi.fn(async () => ['whisper-local']),
}))

let role = 'owner'
let jobs: unknown[] = []
let connectors: unknown[] = []
let selectedNodeId: string | null = null
const project = addStudioNode(
  addStudioNode(createStudioProject('Film', 'film'), 'audio', 'voice'),
  'video',
  'video'
)
project.nodes[0].data.mediaId = 'voice-reference'
project.nodes[1].data.mediaId = 'video-reference'

function Host({
  tab,
  includeInactiveMedia = false,
}: {
  includeInactiveMedia?: boolean
  tab:
    | 'media'
    | 'previs'
    | 'delivery'
    | 'timeline'
    | 'review'
    | 'connections'
    | 'versions'
}) {
  const [document, setDocument] = useState(project)
  const controller = useStudioProductionController({
    initialTab: tab === 'media' ? 'media' : 'workflow',
    open: true,
    onOpenChange: () => {},
    project: document,
    userId: 1,
    selectedNodeId,
    onSave: async () => {},
    onRefresh: async () => {},
    onUpdate: setDocument,
    getMedia: async () => null,
  })
  return (
    <StudioProductionContext.Provider value={controller}>
      <output data-testid='saved-media-draft'>
        {JSON.stringify(document.production?.mediaDraft || null)}
      </output>
      <output data-testid='saved-media-drafts'>
        {JSON.stringify(document.production?.mediaDrafts || [])}
      </output>
      <Tabs defaultValue={tab}>
        {(tab === 'media' || includeInactiveMedia) && (
          <StudioProductionMediaTab />
        )}
        {tab === 'previs' && <StudioProductionPrevisTab />}
        {tab === 'delivery' && <StudioProductionDeliveryTab />}
        {tab === 'timeline' && <StudioProductionTimelineTab />}
        {tab === 'review' && <StudioProductionReviewTab />}
        {tab === 'connections' && <StudioConnectorPanel />}
        {tab === 'versions' && <StudioSeriesPanel />}
      </Tabs>
    </StudioProductionContext.Provider>
  )
}
function mount(
  tab:
    | 'media'
    | 'previs'
    | 'delivery'
    | 'timeline'
    | 'review'
    | 'connections'
    | 'versions',
  includeInactiveMedia = false
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <Host tab={tab} includeInactiveMedia={includeInactiveMedia} />
    </QueryClientProvider>
  )
  if (tab === 'media') {
    fireEvent.click(
      screen.getByRole('button', {
        name: /Language and advanced tool parameters/,
      })
    )
  }
  if (tab === 'delivery') {
    fireEvent.click(
      screen.getByRole('button', { name: 'Advanced export settings' })
    )
  }
  if (tab === 'previs') {
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Precise camera and position settings',
      })
    )
  }
  return view
}

function SelectionHost({
  open,
  target,
}: {
  open: boolean
  target: string | null
}) {
  const controller = useStudioProductionController({
    open,
    onOpenChange: () => {},
    project,
    userId: 1,
    selectedNodeId: target,
    onSave: async () => {},
    onRefresh: async () => {},
    onUpdate: () => {},
    getMedia: async () => null,
  })
  return (
    <div>
      <output data-testid='workflow-selection'>
        {controller.selectedNodes.join(',')}
      </output>
      <button
        type='button'
        onClick={() => controller.setSelectedNodes(['video'])}
      >
        Choose video manually
      </button>
    </div>
  )
}

test('opening a platform workflow selects the requested canvas node and preserves manual choices while open', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = (open: boolean, target: string | null) => (
    <QueryClientProvider client={client}>
      <SelectionHost open={open} target={target} />
    </QueryClientProvider>
  )
  const mounted = render(view(false, null))
  mounted.rerender(view(true, 'voice'))
  await waitFor(() =>
    expect(screen.getByTestId('workflow-selection')).toHaveTextContent('voice')
  )
  fireEvent.click(screen.getByText('Choose video manually'))
  expect(screen.getByTestId('workflow-selection')).toHaveTextContent('video')
  mounted.rerender(view(true, 'voice'))
  expect(screen.getByTestId('workflow-selection')).toHaveTextContent('video')
  mounted.rerender(view(false, 'voice'))
  mounted.rerender(view(true, 'voice'))
  await waitFor(() =>
    expect(screen.getByTestId('workflow-selection')).toHaveTextContent('voice')
  )
})
beforeEach(() => {
  selectedNodeId = null
  role = 'owner'
  jobs = []
  connectors = []
  project.production = undefined
  vi.spyOn(api, 'request').mockImplementation(async (config) => {
    const url = config.url || ''
    let data: unknown = []
    if (url.endsWith('/jobs')) data = jobs
    if (url.endsWith('/connectors')) data = connectors
    if (url.endsWith('/film')) {
      data = { id: 'film', document: project, role, revision: 1 }
    }
    if (url.endsWith('/capabilities')) {
      data = {
        quota_per_unit: 500000,
        render_available: true,
        available_quota: 10000000,
        generation_credit_available: true,
      }
    }
    return { data: { success: true, data } } as Awaited<
      ReturnType<typeof api.request>
    >
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
})
afterEach(() => vi.restoreAllMocks())

test('invalid subtitle text blocks delivery before any rendering job is accepted', async () => {
  const previous = project.captionsText
  try {
    project.captionsText = 'This is not a valid subtitle file'
    mount('delivery')
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Fit footage to the frame' })
      ).toBeEnabled()
    )
    expect(screen.getByRole('button', { name: 'Export video' })).toBeDisabled()
    expect(
      vi
        .mocked(api.request)
        .mock.calls.every(([config]) => config.method !== 'POST')
    ).toBe(true)
  } finally {
    project.captionsText = previous
  }
})

test('speech production has one primary voice picker and creates output copies automatically', async () => {
  mount('media')
  await userEvent.click(
    screen.getByRole('combobox', { name: 'studio.production.mediaAction' })
  )
  await userEvent.click(
    screen.getByRole('option', {
      name: 'studio.production.mediaAction.voice_speech',
    })
  )
  expect(
    screen.getAllByRole('combobox', { name: 'Choose a character voice' })
  ).toHaveLength(1)
  expect(
    screen.queryByRole('combobox', { name: 'studio.production.mediaTarget' })
  ).toBeNull()
  expect(
    screen.getByText(
      'A new output copy is created automatically. Existing footage stays available.'
    )
  ).toBeVisible()
})

test('subtitle recognition starts with the configured local model and keeps a manual choice', async () => {
  mount('timeline')
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Advanced model settings' }))
  const input = screen.getByRole('textbox', {
    name: 'studio.production.transcriptionModel',
  })
  await waitFor(() => expect(input).toHaveValue('whisper-local'))
  fireEvent.change(input, { target: { value: 'custom-recognition-alias' } })
  expect(input).toHaveValue('custom-recognition-alias')
})

test('subtitle recognition exposes its budget beside the action and rejects invalid spending limits', async () => {
  mount('timeline')
  const user = userEvent.setup()
  await user.click(
    screen.getByRole('combobox', { name: 'studio.production.audioTracks' })
  )
  await user.click(
    screen.getByRole('option', { name: project.nodes[0].data.title })
  )
  const submit = screen.getByRole('button', {
    name: 'studio.production.transcribe',
  })
  expect(submit).toBeDisabled()
  expect(
    screen.getByText('Confirm the budget before generating.')
  ).toBeVisible()
  const budget = screen.getByRole('spinbutton', {
    name: 'studio.production.budget',
  })
  await waitFor(() =>
    expect(
      screen.queryByText('Loading balance and service access')
    ).not.toBeInTheDocument()
  )
  for (const value of ['0', '-1', '4001']) {
    fireEvent.change(budget, { target: { value } })
    await user.click(
      screen.getByRole('checkbox', { name: 'studio.production.confirm' })
    )
    expect(submit).toBeDisabled()
  }
  fireEvent.change(budget, { target: { value: '5' } })
  await user.click(
    screen.getByRole('checkbox', { name: 'studio.production.confirm' })
  )
  await waitFor(() => expect(submit).toBeEnabled())
  expect(
    vi
      .mocked(api.request)
      .mock.calls.some(
        ([config]) => config.method === 'POST' && config.url?.endsWith('/jobs')
      )
  ).toBe(false)
})

test('reopening a selected song restores its immutable lyrics and zero seed without starting another model', async () => {
  const audio = project.nodes[0]
  const original = { ...audio.data }
  selectedNodeId = audio.id
  audio.data.model = 'studio-music'
  audio.data.selectedTakeId = 'song-take'
  audio.data.takes = [
    {
      id: 'song-take',
      createdAt: '2026-10-07T00:00:00Z',
      status: 'completed',
      model: 'studio-music',
      prompt: 'My song',
      mediaId: 'saved-song',
      requestSnapshot: JSON.stringify({
        action: 'music',
        node_id: audio.id,
        model: 'studio-music',
        prompt: 'My song',
        seconds: 30,
        language: 'zh',
        voice_id: 'default',
        options: {
          music_mode: 'song',
          lyrics: '阳光里的故事',
          bpm: 100,
          seed: 0,
        },
      }),
    },
  ]
  try {
    mount('media')
    expect(screen.getByRole('textbox', { name: 'Lyrics' })).toHaveValue(
      '阳光里的故事'
    )
    expect(screen.getByRole('spinbutton', { name: 'Music seed' })).toHaveValue(
      0
    )
    expect(
      screen.getByRole('textbox', { name: 'studio.production.mediaPrompt' })
    ).toHaveValue('My song')
    expect(
      screen.getByRole('button', { name: 'studio.production.runMedia' })
    ).toBeDisabled()
    expect(
      vi
        .mocked(api.request)
        .mock.calls.every(([config]) => config.method !== 'POST')
    ).toBe(true)
  } finally {
    audio.data = original
  }
})

test('unsubmitted song edits survive closing the production panel and require fresh confirmation', async () => {
  const audio = project.nodes[0]
  const original = { ...audio.data }
  selectedNodeId = audio.id
  audio.data.model = 'studio-music'
  project.production = studioProductionSchema.parse({
    mediaDraft: {
      action: 'music',
      model: 'studio-music',
      node_id: audio.id,
      prompt: 'New song',
      seconds: 30,
      reference_media_ids: ['voice-reference'],
      options: {
        music_mode: 'song',
        lyrics: 'Original words',
        seed: 0,
        bpm: 100,
      },
    },
  })
  try {
    const view = mount('media')
    fireEvent.change(screen.getByRole('textbox', { name: 'Lyrics' }), {
      target: { value: 'Unsaved new verse' },
    })
    let saved: unknown
    await waitFor(() => {
      saved = JSON.parse(
        screen.getByTestId('saved-media-draft').textContent || 'null'
      )
      expect(saved).toMatchObject({
        node_id: audio.id,
        reference_media_ids: ['voice-reference'],
        options: { lyrics: 'Unsaved new verse', seed: 0 },
      })
    })
    view.unmount()
    project.production = studioProductionSchema.parse({ mediaDraft: saved })
    mount('media')
    expect(screen.getByRole('textbox', { name: 'Lyrics' })).toHaveValue(
      'Unsaved new verse'
    )
    expect(screen.getByRole('spinbutton', { name: 'Music seed' })).toHaveValue(
      0
    )
    expect(
      screen.getByRole('button', { name: 'studio.production.runMedia' })
    ).toBeDisabled()
    expect(
      vi
        .mocked(api.request)
        .mock.calls.every(([config]) => config.method !== 'POST')
    ).toBe(true)
  } finally {
    audio.data = original
  }
})

test('viewing delivery with a hidden media tab preserves the previous unsubmitted draft', async () => {
  selectedNodeId = project.nodes[1].id
  project.production = studioProductionSchema.parse({
    mediaDraft: {
      node_id: project.nodes[0].id,
      action: 'music',
      model: 'studio-music',
      prompt: 'Keep my unsubmitted song',
      seconds: 30,
      options: { music_mode: 'song', lyrics: 'Keep this verse', seed: 0 },
    },
  })
  const original = JSON.stringify(project.production.mediaDraft)
  mount('delivery', true)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Export video' })).toBeEnabled()
  )
  expect(screen.getByTestId('saved-media-draft')).toHaveTextContent(original)
  expect(
    vi
      .mocked(api.request)
      .mock.calls.every(([config]) => config.method !== 'POST')
  ).toBe(true)
})

test('opening media from a normal video node resumes the saved song instead of clearing it', async () => {
  selectedNodeId = project.nodes[1].id
  project.production = studioProductionSchema.parse({
    mediaDraft: {
      node_id: project.nodes[0].id,
      action: 'music',
      model: 'studio-music',
      prompt: 'Resume my song',
      seconds: 30,
      options: {
        music_mode: 'song',
        lyrics: 'Saved unsubmitted verse',
        seed: 0,
      },
    },
  })
  mount('media')
  expect(screen.getByRole('textbox', { name: 'Lyrics' })).toHaveValue(
    'Saved unsubmitted verse'
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Advanced output settings' })
  )
  expect(
    screen.getByRole('combobox', { name: 'studio.production.mediaTarget' })
  ).toHaveTextContent(project.nodes[0].data.title)
  expect(
    screen.getByRole('button', { name: 'studio.production.runMedia' })
  ).toBeDisabled()
})

test('editing one song preserves the other song draft and restores each node independently', async () => {
  const audio = project.nodes[0]
  const original = { ...audio.data }
  audio.data.model = 'studio-music'
  const other = structuredClone(audio)
  other.id = 'other-song'
  other.data.title = 'Other song'
  project.nodes.push(other)
  const drafts = [
    {
      node_id: audio.id,
      action: 'music',
      model: 'studio-music',
      prompt: 'First song',
      seconds: 30,
      options: { music_mode: 'song', lyrics: 'First saved verse', seed: 0 },
    },
    {
      node_id: other.id,
      action: 'music',
      model: 'studio-music',
      prompt: 'Second song',
      seconds: 30,
      options: { music_mode: 'song', lyrics: 'Second saved verse', seed: 3 },
    },
  ]
  project.production = studioProductionSchema.parse({
    mediaDraft: drafts[1],
    mediaDrafts: drafts,
  })
  selectedNodeId = audio.id
  try {
    const view = mount('media')
    expect(screen.getByRole('textbox', { name: 'Lyrics' })).toHaveValue(
      'First saved verse'
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Lyrics' }), {
      target: { value: 'First changed verse' },
    })
    let saved: unknown[] = []
    await waitFor(() => {
      saved = JSON.parse(
        screen.getByTestId('saved-media-drafts').textContent || '[]'
      )
      expect(saved).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            node_id: audio.id,
            options: expect.objectContaining({
              lyrics: 'First changed verse',
              seed: 0,
            }),
          }),
          expect.objectContaining({
            node_id: other.id,
            options: expect.objectContaining({
              lyrics: 'Second saved verse',
              seed: 3,
            }),
          }),
        ])
      )
    })
    const last = JSON.parse(
      screen.getByTestId('saved-media-draft').textContent || 'null'
    )
    view.unmount()
    project.production = studioProductionSchema.parse({
      mediaDraft: last,
      mediaDrafts: saved,
    })
    selectedNodeId = other.id
    mount('media')
    expect(screen.getByRole('textbox', { name: 'Lyrics' })).toHaveValue(
      'Second saved verse'
    )
    expect(screen.getByRole('spinbutton', { name: 'Music seed' })).toHaveValue(
      3
    )
    expect(
      screen.getByRole('button', { name: 'studio.production.runMedia' })
    ).toBeDisabled()
  } finally {
    project.nodes.pop()
    audio.data = original
  }
})

test('audio production shows pending review instructions and requires an explicit version acceptance', async () => {
  project.production = studioProductionSchema.parse({
    changes: [
      {
        id: 'review-plan',
        kind: 'review',
        action: 'regenerate',
        seconds: 12,
        message: 'regenerate at 12.00s: Correct the sung words',
        nodeIds: ['voice'],
        status: 'pending',
        createdAt: '2026-10-07T00:00:00Z',
      },
    ],
  })
  mount('media')
  expect(await screen.findByText(/Correct the sung words/)).toBeVisible()
  expect(screen.queryByText(/^regenerate at/)).toBeNull()
  await waitFor(() =>
    expect(
      screen.getByRole('button', {
        name: 'studio.production.acceptCurrentVersion',
      })
    ).toBeEnabled()
  )
  fireEvent.click(
    screen.getByRole('button', {
      name: 'studio.production.acceptCurrentVersion',
    })
  )
  await waitFor(() =>
    expect(screen.queryByText(/Correct the sung words/)).toBeNull()
  )
  expect(
    vi
      .mocked(api.request)
      .mock.calls.every(([config]) => config.method !== 'POST')
  ).toBe(true)
})

test('changing a music node to narration does not restore a stale song draft over the new operation', async () => {
  const audio = project.nodes[0]
  const original = { ...audio.data }
  selectedNodeId = audio.id
  audio.data.model = 'studio-voice-speech'
  audio.data.prompt = 'New narration'
  project.production = studioProductionSchema.parse({
    mediaDraft: {
      node_id: audio.id,
      action: 'music',
      model: 'studio-music',
      prompt: 'Old song',
      seconds: 30,
      options: { music_mode: 'song', lyrics: 'Old lyrics', seed: 0 },
    },
  })
  try {
    mount('media')
    expect(screen.queryByRole('textbox', { name: 'Lyrics' })).toBeNull()
    expect(
      screen.getByRole('textbox', { name: 'studio.production.mediaPrompt' })
    ).toHaveValue('New narration')
    await waitFor(() =>
      expect(
        JSON.parse(
          screen.getByTestId('saved-media-draft').textContent || 'null'
        )
      ).toMatchObject({ action: 'voice_speech' })
    )
    expect(
      vi
        .mocked(api.request)
        .mock.calls.every(([config]) => config.method !== 'POST')
    ).toBe(true)
  } finally {
    audio.data = original
  }
})

test('image tool editing restores its reference without unrelated voice controls or a duration field', async () => {
  const source = project.nodes[0]
  const original = { ...source.data }
  source.data.kind = 'image'
  source.data.model = 'studio-image-bg-remove'
  source.data.selectedTakeId = 'image-tool-take'
  source.data.takes = [
    {
      id: 'image-tool-take',
      createdAt: '2026-10-07T00:00:00Z',
      status: 'completed',
      prompt: '',
      mediaId: 'voice-reference',
      requestSnapshot: JSON.stringify({
        action: 'image_bg_remove',
        model: 'studio-image-bg-remove',
        seconds: 1,
        node_id: source.id,
        reference_media_ids: ['video-reference'],
      }),
    },
  ]
  selectedNodeId = source.id
  try {
    mount('media')
    expect(
      screen.queryByRole('spinbutton', {
        name: 'studio.production.mediaSeconds',
      })
    ).toBeNull()
    expect(screen.queryByText('Favourite voices')).toBeNull()
    await userEvent.click(
      screen.getByRole('button', { name: 'Advanced output settings' })
    )
    expect(
      screen.getByRole('combobox', { name: 'studio.production.mediaTarget' })
    ).toHaveTextContent(source.data.title)
    await waitFor(() =>
      expect(
        JSON.parse(
          screen.getByTestId('saved-media-draft').textContent || 'null'
        )
      ).toMatchObject({
        action: 'image_bg_remove',
        reference_media_ids: ['video-reference'],
      })
    )
  } finally {
    source.data = original
  }
})

test('audio reviews preview the stored version and record its selected Take', async () => {
  selectedNodeId = project.nodes[0].id
  const original = { ...project.nodes[0].data }
  project.nodes[0].data.selectedTakeId = 'audio-take'
  project.nodes[0].data.takes = [
    {
      id: 'audio-take',
      createdAt: '2026-10-07T00:00:00Z',
      status: 'completed',
      prompt: '',
      mediaId: 'voice-reference',
    },
  ]
  vi.spyOn(api, 'get').mockResolvedValue({
    data: new Blob(['audio'], { type: 'audio/wav' }),
  })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:review-audio')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  try {
    const view = mount('review')
    const preview = await screen.findByLabelText('Review Take preview')
    expect(preview.tagName).toBe('AUDIO')
    expect(preview).toHaveAttribute('controls')
    fireEvent.timeUpdate(preview, { target: { currentTime: 2.5 } })
    expect(
      screen.getByRole('spinbutton', { name: 'studio.production.time' })
    ).toHaveValue(2.5)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'studio.review.retake' })
      ).toBeEnabled()
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'studio.review.retake' })
    )
    await waitFor(() =>
      expect(
        vi
          .mocked(api.request)
          .mock.calls.some(
            ([config]) =>
              config.url?.endsWith('/review') &&
              config.method === 'POST' &&
              (config.data as { take_id?: string }).take_id === 'audio-take'
          )
      ).toBe(true)
    )
    view.unmount()
    expect(revoke).toHaveBeenCalledWith('blob:review-audio')
  } finally {
    project.nodes[0].data = original
  }
})

test('preparing a regional version prevents edits to the previous version and episode until complete', async () => {
  project.production = studioProductionSchema.parse({
    episodes: [{ id: 'episode', title: 'Episode one', shotIds: [] }],
  })
  let finish:
    | ((
        value: Awaited<ReturnType<typeof series.createStudioRegionalVersion>>
      ) => void)
    | undefined
  vi.spyOn(series, 'createStudioRegionalVersion').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  mount('versions')
  const create = screen.getByRole('button', { name: 'Create regional version' })
  await waitFor(() => expect(create).toBeEnabled())
  fireEvent.click(create)
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: 'New episode title' })
    ).toBeDisabled()
  )
  expect(screen.getByRole('combobox', { name: 'Episode' })).toBeDisabled()
  if (!finish) throw new Error('Version creation must start')
  finish(
    studioSeriesVersionSchema.parse({
      id: 'english',
      episodeId: 'episode',
      title: 'Episode one English',
      language: 'en',
      region: 'US',
      timeline: [{ id: 'clip', nodeId: 'video', trimEnd: 1 }],
    })
  )
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: 'New episode title' })
    ).toBeEnabled()
  )
  expect(screen.getByRole('textbox', { name: 'Version title' })).toHaveValue(
    'Episode one English'
  )
})

test('review selectors show the clip title and current version label before their menus open', async () => {
  mount('review')
  const source = await screen.findByRole('combobox', {
    name: 'Review media',
  })
  expect(source).toHaveTextContent(project.nodes[1].data.title)
  expect(
    screen.getByRole('combobox', { name: 'studio.production.take' })
  ).toHaveTextContent('studio.production.currentTake')
})

test('a completed image version can be previewed and reviewed', async () => {
  const source = project.nodes[0]
  const original = { ...source.data }
  source.data.kind = 'image'
  selectedNodeId = source.id
  vi.spyOn(api, 'get').mockResolvedValue({
    data: new Blob(['image'], { type: 'image/png' }),
  })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:review-image')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  try {
    mount('review')
    const preview = await screen.findByRole('img', { name: source.data.title })
    expect(preview).toHaveAttribute('src', 'blob:review-image')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'studio.review.approved' })
      ).toBeEnabled()
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'studio.review.approved' })
    )
    await waitFor(() =>
      expect(
        vi
          .mocked(api.request)
          .mock.calls.some(
            ([config]) =>
              config.method === 'POST' && config.url?.endsWith('/review')
          )
      ).toBe(true)
    )
  } finally {
    source.data = original
  }
})

test('opening optional connections without configuration explains the empty state and sends no external write', async () => {
  mount('connections')
  expect(
    await screen.findByText(
      'No external account is configured. These connections are optional for local creation and delivery.'
    )
  ).toBeVisible()
  expect(
    vi
      .mocked(api.request)
      .mock.calls.every(
        ([config]) =>
          config.method !== 'POST' &&
          config.url?.startsWith('/api/studio/cloud')
      )
  ).toBe(true)
})

test('a viewer cannot fetch or run the project owner connection catalog', async () => {
  role = 'viewer'
  mount('connections')
  expect(
    await screen.findByText(
      'External connections are managed by the project owner.'
    )
  ).toBeVisible()
  expect(
    vi
      .mocked(api.request)
      .mock.calls.some(([config]) => config.url?.endsWith('/connectors'))
  ).toBe(false)
  expect(
    screen.queryByRole('button', { name: 'Run the connection task' })
  ).not.toBeInTheDocument()
})

test('a context-only connection selects a valid operation and exposes the resource and text output', async () => {
  connectors = [
    {
      id: 'linear',
      provider: 'linear',
      label: 'Story issues',
      state: 'configured',
      operations: ['import_context'],
    },
  ]
  const user = userEvent.setup()
  mount('connections')
  await user.click(
    await screen.findByRole('combobox', { name: 'External connection' })
  )
  await user.click(await screen.findByRole('option', { name: /Story issues/ }))
  expect(
    screen.getByRole('combobox', { name: 'Connection operation' })
  ).toHaveTextContent('Connection operation import_context')
  expect(
    screen.getByRole('combobox', { name: 'External source file' })
  ).toBeVisible()
  await user.click(
    screen.getByRole('button', { name: 'Create an import output node' })
  )
  expect(
    screen.getByRole('combobox', { name: 'Import output node' })
  ).toHaveTextContent('Imported media')
  expect(
    screen.getByRole('button', { name: 'Run the connection task' })
  ).toBeDisabled()
  expect(
    vi
      .mocked(api.request)
      .mock.calls.every(([config]) => config.method !== 'POST')
  ).toBe(true)
})

test('a newer draft preview preserves the final delivery package and final video', async () => {
  jobs = [
    { kind: 'render', status: 'succeeded', result: { media_id: 'draft' } },
    {
      kind: 'render',
      status: 'succeeded',
      result: { media_id: 'final', package_media_id: 'package' },
    },
  ]
  vi.spyOn(api, 'get').mockResolvedValue({ data: new Blob(['video']) })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:final')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  mount('delivery')
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'studio.production.downloadPackage' })
    ).toBeInTheDocument()
  )
  expect(
    screen.getByRole('button', { name: 'studio.production.downloadVideo' })
  ).toBeInTheDocument()
  await waitFor(() =>
    expect(
      vi
        .mocked(api.get)
        .mock.calls.some(([url]) => url.includes('/media/final'))
    ).toBe(true)
  )
})

test('the same rendered film appears once when it is both the latest preview and final delivery', async () => {
  project.production = studioProductionSchema.parse({
    timelineEdited: true,
    timeline: [
      { id: 'clip', nodeId: project.nodes[1].id, trimStart: 0, trimEnd: 2 },
    ],
    width: 640,
    height: 360,
    fps: 24,
  })
  jobs = [
    {
      id: 'final',
      kind: 'render',
      status: 'succeeded',
      result: {
        media_id: 'final',
        package_media_id: 'package',
        request_plan: studioProjectRenderPlan(project, false),
      },
    },
  ]
  vi.spyOn(api, 'get').mockResolvedValue({ data: new Blob(['video']) })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:final')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const view = mount('delivery')
  await waitFor(() =>
    expect(view.container.querySelectorAll('video')).toHaveLength(1)
  )
  expect(view.container.querySelector('video')).toHaveAttribute(
    'src',
    'blob:final'
  )
})

test('voice cloning stays disabled until reference audio and voice permission are both selected', async () => {
  const user = userEvent.setup()
  mount('media')
  await user.click(
    screen.getByRole('button', { name: 'Advanced output settings' })
  )
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'studio.production.createMediaNode' })
    ).toBeEnabled()
  )
  await user.click(
    screen.getByRole('combobox', { name: 'studio.production.mediaAction' })
  )
  await user.click(
    screen.getByRole('option', {
      name: 'studio.production.mediaAction.voice_clone',
    })
  )
  await user.click(
    screen.getByRole('combobox', { name: 'studio.production.mediaTarget' })
  )
  await user.click(
    screen.getByRole('option', { name: project.nodes[0].data.title })
  )
  await user.click(screen.getByText('studio.production.confirm'))
  expect(
    screen.getByRole('button', { name: 'studio.production.runMedia' })
  ).toBeDisabled()
  await user.click(
    screen.getByRole('checkbox', { name: project.nodes[0].data.title })
  )
  expect(
    screen.getByRole('button', { name: 'studio.production.runMedia' })
  ).toBeDisabled()
  await user.click(screen.getByText('studio.production.voiceRights'))
  await user.type(
    screen.getByRole('textbox', { name: 'studio.production.mediaPrompt' }),
    'Authorized test dialogue'
  )
  expect(
    screen.getByRole('button', { name: 'studio.production.runMedia' })
  ).toBeDisabled()
  await user.click(screen.getByText('studio.production.confirm'))
  expect(
    screen.getByRole('button', { name: 'studio.production.runMedia' })
  ).toBeEnabled()
  expect(
    vi
      .mocked(api.request)
      .mock.calls.some(([config]) => config.method === 'POST')
  ).toBe(false)
})

test('a sound preset creates a new audio target and uses a free native workflow', async () => {
  const user = userEvent.setup()
  mount('media')
  await user.click(screen.getByRole('button', { name: 'Ready to use sounds' }))
  await user.click(
    screen.getByRole('button', { name: 'Free synthesized sound presets' })
  )
  const rain = screen.getByRole('button', { name: 'Rain sound' })
  await waitFor(() => expect(rain).toBeEnabled())
  await user.click(rain)
  await waitFor(() => {
    const request = vi
      .mocked(api.request)
      .mock.calls.find(
        ([config]) =>
          config.method === 'POST' &&
          config.url?.endsWith('/jobs') &&
          (config.data as { operation?: { action?: string } } | undefined)
            ?.operation?.action === 'sound_preset'
      )?.[0]
    expect(request?.data).toMatchObject({
      kind: 'transform',
      budget: 0,
      operation: { action: 'sound_preset', prompt: 'rain', seconds: 3 },
    })
    const body = request?.data as
      | { confirm_generation?: boolean; operation?: { node_id?: string } }
      | undefined
    expect(body?.confirm_generation).toBeUndefined()
    expect(body?.operation?.node_id).not.toBe('voice')
  })
})

test('a viewer can preview the stage but cannot place actors or export', async () => {
  role = 'viewer'
  mount('previs')
  await waitFor(() => expect(vi.mocked(api.request)).toHaveBeenCalled())
  expect(
    screen.getByRole('button', { name: 'studio.production.addActor' })
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'studio.production.exportPrevis' })
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'studio.production.play' })
  ).toBeEnabled()
})

test('a running render shows progress and prevents another export or preview submission', async () => {
  jobs = [{ id: 'render', kind: 'render', status: 'running', progress: 37 }]
  mount('delivery')
  const progress = await screen.findByRole('progressbar', {
    name: 'Render progress',
  })
  expect(progress).toHaveAttribute('aria-valuenow', '37')
  expect(screen.getByRole('button', { name: 'Export video' })).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Preview the exact export layout' })
  ).toBeDisabled()
})

test('timeline audio tracks identify their source and provide a named playback control', async () => {
  project.production = studioProductionSchema.parse({
    audioTracks: [
      {
        id: 'voice-track',
        mediaId: 'voice-reference',
        start: 0,
        offset: 0,
        volume: 1,
      },
    ],
  })
  project.nodes[0].data.title = 'Courier voice'
  vi.spyOn(api, 'get').mockResolvedValue({
    data: new Blob(['audio'], { type: 'audio/wav' }),
  })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:owned-audio')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  mount('timeline')
  const group = await screen.findByRole('group', { name: 'Courier voice' })
  expect(group).toBeVisible()
  const player = screen.getByLabelText('Preview audio track: Courier voice')
  await waitFor(() => expect(player).toHaveAttribute('src', 'blob:owned-audio'))
  expect(player).toHaveAttribute('controls')
  const user = userEvent.setup()
  const source = screen.getByRole('combobox', {
    name: 'studio.production.audioTracks',
  })
  await user.click(source)
  await user.click(screen.getByRole('option', { name: 'Courier voice' }))
  expect(source).toHaveTextContent('Courier voice')
})

test('adding a stage actor preserves its position controls and rejects an invalid camera distance', async () => {
  mount('previs')
  const button = screen.getByRole('button', {
    name: 'studio.production.addActor',
  })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button)
  expect(
    screen.getByLabelText(
      'studio.production.actor studio.production.position.endX'
    )
  ).toHaveValue(0)
  const camera = screen.getByLabelText('studio.production.camera.distance')
  fireEvent.change(camera, { target: { value: '100' } })
  expect(camera).toHaveValue(10)
})
