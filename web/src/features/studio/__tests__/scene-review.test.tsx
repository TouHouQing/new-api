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
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'

import { StudioSceneReview } from '../studio-scene-review'
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
vi.mock('../studio-timeline-preview', () => ({
  StudioTimelinePreview: () => <p>Actual source interval player</p>,
}))
vi.mock('../studio-reference-analysis-panel', () => ({
  StudioReferenceAnalysisPanel: (props: {
    initialSegment: {
      mediaId: string
      takeId?: string
      start: number
      end: number
    }
  }) => (
    <p>Explicit analysis segment: {JSON.stringify(props.initialSegment)}</p>
  ),
}))

const project = updateStudioNode(
  addStudioNode(
    createStudioProject('Our film', 'scene-ui-project'),
    'video',
    'source'
  ),
  'source',
  { mediaId: 'original-media', seconds: 61, status: 'completed' }
)
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
let source = {
  id: 'analysis-1',
  document: {
    source_media_id: 'original-media',
    source_digest: 'f'.repeat(64),
    analysis: {
      kind: 'scene_detect',
      start: 0,
      end: 61,
      cuts: [{ time: 1 }, { time: 60 }],
      source_take_id: 'take-original',
    },
  },
}
let reviewedCuts: { time: number; original_time?: number }[] = []

beforeEach(() => {
  mocks.request.mockReset()
  mocks.error.mockReset()
  context.props.onSave.mockClear()
  context.props.onRefresh.mockClear()
  context.setActiveTab.mockClear()
  context.writable = true
  source = {
    id: 'analysis-1',
    document: {
      source_media_id: 'original-media',
      source_digest: 'f'.repeat(64),
      analysis: {
        kind: 'scene_detect',
        start: 0,
        end: 61,
        cuts: [{ time: 1 }, { time: 60 }],
        source_take_id: 'take-original',
      },
    },
  }
  mocks.context.mockReturnValue(context)
  mocks.request.mockImplementation(
    async (path: string, method = 'GET', body?: Record<string, unknown>) => {
      if (path.endsWith('/analyses/correction-1')) {
        return {
          ...source,
          id: 'correction-1',
          document: {
            ...source.document,
            analysis: {
              ...source.document.analysis,
              kind: 'scene_correction',
              parent_id: 'analysis-1',
              cuts: reviewedCuts,
            },
          },
        }
      }
      if (path.includes('/analyses/')) return source
      if (method === 'GET' && path.endsWith('/scene-studies')) return []
      if (body?.action === 'correct') {
        reviewedCuts = body.cuts as typeof reviewedCuts
        return { id: 'correction-1' }
      }
      if (body?.action === 'prepare') {
        const times = [
          0,
          ...reviewedCuts.map((cut) => cut.time),
          source.document.analysis.end,
        ]
        const shots = (
          body.shots as {
            scene_index: number
            title: string
            text: string
            image_prompt: string
            video_prompt: string
            camera: string
            dialogue: string
          }[]
        ).map((shot, index) => ({
          id: `own-${index}`,
          title: shot.title,
          text: shot.text,
          imagePrompt: shot.image_prompt,
          videoPrompt: shot.video_prompt,
          camera: shot.camera,
          dialogue: shot.dialogue,
          seconds: Math.max(
            1,
            Math.round(times[shot.scene_index + 1] - times[shot.scene_index])
          ),
        }))
        return {
          id: 'own-plan',
          revision: 2,
          state: 'ready',
          document: {
            analysis_id: 'analysis-1',
            correction_id: 'correction-1',
            request: { subject: body.subject },
            next_document: {
              production: {
                screenplayDraft: JSON.stringify({
                  title: body.title,
                  brief: body.subject,
                  characters: [],
                  scenes: [],
                  props: [],
                  shots,
                }),
              },
            },
            impact: {
              shots: (body.shots as { scene_index: number }[]).map((shot) => ({
                scene_index: shot.scene_index,
                source_start: times[shot.scene_index],
                source_end: times[shot.scene_index + 1],
              })),
              duration: 61,
            },
          },
        }
      }
      if (path.endsWith('/apply')) return {}
      return { revision: 2, document: project }
    }
  )
})

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <StudioSceneReview analysisId='analysis-1' />
    </QueryClientProvider>
  )
}

test('own subject adaptation previews every source range and applies only after review without generation', async () => {
  mount()
  await screen.findByText('Actual source interval player')
  fireEvent.change(screen.getByLabelText('My subject'), {
    target: { value: 'Our ceramic cup' },
  })
  fireEvent.change(screen.getByLabelText('My brand (optional)'), {
    target: { value: 'Our studio' },
  })
  fireEvent.change(screen.getByLabelText('Storyboard draft title'), {
    target: { value: 'Our new cup story' },
  })
  fireEvent.change(screen.getByLabelText('My action'), {
    target: { value: 'Our artisan presents a handmade cup' },
  })
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'I previewed the source and reviewed these scene boundaries.',
    })
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Preview my adapted storyboard' })
  )
  const comparison = await screen.findByLabelText('Source-to-draft comparison')
  expect(
    within(comparison).getByText('Our artisan presents a handmade cup')
  ).toBeVisible()
  const prepare = mocks.request.mock.calls.find(
    ([, , body]) => body?.action === 'prepare'
  )?.[2]
  expect(prepare).toMatchObject({
    subject: 'Our ceramic cup',
    brand: 'Our studio',
    correction_id: 'correction-1',
    revision: 2,
  })
  expect(prepare.shots[1].image_prompt).toContain('Our ceramic cup')
  expect(context.props.onRefresh).not.toHaveBeenCalled()
  const apply = screen.getByRole('button', {
    name: 'Apply my storyboard draft',
  })
  expect(apply).toBeDisabled()
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'I reviewed every adapted shot and the source-to-draft timing.',
    })
  )
  fireEvent.click(apply)
  await waitFor(() => expect(context.props.onRefresh).toHaveBeenCalledOnce())
  expect(context.setActiveTab).toHaveBeenCalledWith('plan')
  expect(mocks.request).toHaveBeenCalledWith(
    expect.stringContaining('/edit-plans/own-plan/apply'),
    'POST',
    { revision: 2 }
  )
  expect(
    mocks.request.mock.calls.some(([path]) => String(path).endsWith('/jobs'))
  ).toBe(false)
})

test('merge and split keep source times editable and reject an invalid manual boundary before saving', async () => {
  mount()
  await screen.findByText('Actual source interval player')
  fireEvent.click(
    screen.getByRole('button', { name: 'Merge scene 1 with next' })
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Correct cuts or split a scene' })
  )
  fireEvent.change(screen.getByLabelText('Split at source seconds'), {
    target: { value: '30.12' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Split current scene' }))
  expect(screen.getByLabelText('Boundary 1 in source seconds')).toHaveValue(
    30.12
  )
  fireEvent.change(screen.getByLabelText('Boundary 1 in source seconds'), {
    target: { value: '61' },
  })
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'I previewed the source and reviewed these scene boundaries.',
    })
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Save reviewed scene boundaries' })
  )
  await waitFor(() =>
    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Cut times must increase strictly inside the analyzed source interval.',
      })
    )
  )
  expect(mocks.request.mock.calls.some(([, method]) => method === 'POST')).toBe(
    false
  )
})

test('long scenes require an explicit shorter segment and selecting semantic analysis never submits a job', async () => {
  source.document.analysis.end = 180
  source.document.analysis.cuts = [{ time: 90 }]
  mount()
  const semantic = await screen.findByRole('button', {
    name: 'Choose this segment for semantic analysis',
  })
  expect(semantic).toBeDisabled()
  await userEvent.click(
    screen.getByRole('button', { name: 'Correct cuts or split a scene' })
  )
  fireEvent.change(screen.getByLabelText('Split at source seconds'), {
    target: { value: '30' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Split current scene' }))
  fireEvent.click(semantic)
  expect(screen.getByText(/Explicit analysis segment:/)).toHaveTextContent(
    '"mediaId":"original-media","takeId":"take-original","start":0,"end":30'
  )
  expect(mocks.request.mock.calls.some(([, method]) => method === 'POST')).toBe(
    false
  )
})

test('read-only review allows source inspection but disables every project and analysis mutation', async () => {
  context.writable = false
  mount()
  await screen.findByText('Actual source interval player')
  expect(screen.getByLabelText('My subject')).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Save reviewed scene boundaries' })
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Preview my adapted storyboard' })
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Merge scene 1 with next' })
  ).toBeDisabled()
  expect(mocks.request.mock.calls.some(([, method]) => method === 'POST')).toBe(
    false
  )
})
