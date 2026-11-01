/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

import {
  StudioCampaignExperiments,
  type StudioCampaign,
} from '../studio-campaign-experiments'
import { studioCloudRequest } from '../studio-cloud'
import { addStudioNode, createStudioProject } from '../workspace'

vi.mock('../studio-cloud', async (original) => ({
  ...(await original<typeof import('../studio-cloud')>()),
  studioCloudRequest: vi.fn(),
}))

const project = addStudioNode(
  addStudioNode(createStudioProject('Master', 'master'), 'video', 'hook'),
  'video',
  'benefit'
)
project.nodes[0].data.title = 'Opening shot'
project.nodes[1].data.title = 'Benefit shot'
const requests: Array<{ path: string; body: unknown }> = []
let saved: StudioCampaign[] = []
let loseCreateResponse = false
const campaign: StudioCampaign = {
  id: 'campaign',
  title: 'Compare hooks',
  revision: 1,
  source_project_id: 'master',
  source_revision: 5,
  total_budget: 400,
  sample_variant_id: 'v1',
  axes: [
    {
      id: 'hook',
      label: 'Hook',
      kind: 'hook',
      path: '/nodes/0/data/prompt',
      values: [
        { id: 'a', label: 'A', value: 'A hook' },
        { id: 'b', label: 'B', value: 'B hook' },
      ],
    },
  ],
  variants: [
    {
      id: 'v1',
      values: { hook: 'a' },
      budget: 200,
      project_id: 'child-1',
      changed_node_ids: ['hook'],
    },
    {
      id: 'v2',
      values: { hook: 'b' },
      budget: 200,
      project_id: 'child-2',
      changed_node_ids: ['hook'],
    },
  ],
}

beforeEach(() => {
  requests.length = 0
  saved = []
  loseCreateResponse = false
  vi.mocked(studioCloudRequest).mockImplementation(
    async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
      if (method !== 'GET') requests.push({ path, body })
      if (path === '/capabilities') return { quota_per_unit: 500000 } as T
      if (path === '/projects/master') {
        return {
          id: 'master',
          revision: 5,
          role: 'owner',
          document: project,
        } as T
      }
      if (path === '/projects/master/campaigns') {
        if (method === 'POST') {
          if (loseCreateResponse) {
            loseCreateResponse = false
            throw new Error('Response lost; retry your saved draft')
          }
          return campaign as T
        }
        return saved as T
      }
      return {} as T
    }
  )
})

function mount(readOnly = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const onSave = vi.fn(async () => {})
  const onOpenProject = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <StudioCampaignExperiments
        project={project}
        onSave={onSave}
        readOnly={readOnly}
        onOpenProject={onOpenProject}
      />
    </QueryClientProvider>
  )
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Compare opening hooks and creative variants',
    })
  )
  return { onSave, onOpenProject }
}

async function fillMatrix() {
  fireEvent.change(screen.getByLabelText('Experiment name'), {
    target: { value: 'Four openings' },
  })
  fireEvent.change(screen.getByLabelText('Variable 1 target'), {
    target: { value: '/nodes/0/data/prompt' },
  })
  fireEvent.change(screen.getByLabelText('Variable 2 target'), {
    target: { value: '/nodes/1/data/prompt' },
  })
  for (const label of [
    'Opening hook · A',
    'Opening hook · B',
    'Benefit to demonstrate · A',
    'Benefit to demonstrate · B',
  ]) {
    fireEvent.change(screen.getByLabelText(label), {
      target: { value: `New direction ${label}` },
    })
  }
  await waitFor(() =>
    expect(
      screen.getByRole('button', {
        name: 'Create independent experiment drafts',
      })
    ).toBeEnabled()
  )
}

test('two hooks by two benefits creates four scoped draft allocations without starting a model job', async () => {
  const { onSave } = mount()
  await fillMatrix()
  fireEvent.click(
    screen.getByRole('button', { name: 'Create independent experiment drafts' })
  )
  await waitFor(() => expect(requests).toHaveLength(1))
  expect(onSave).toHaveBeenCalledOnce()
  expect(requests[0]).toMatchObject({
    path: '/projects/master/campaigns',
    body: {
      project_revision: 5,
      total_budget: 2500000,
      sample_variant_id: 'v1',
      variants: [
        expect.objectContaining({ budget: 625000 }),
        expect.objectContaining({ budget: 625000 }),
        expect.objectContaining({ budget: 625000 }),
        expect.objectContaining({ budget: 625000 }),
      ],
    },
  })
  expect(requests.some((request) => request.path.includes('/submit'))).toBe(
    false
  )
})

test('a lost creation response retries with the same request ID and keeps all entered values', async () => {
  mount()
  await fillMatrix()
  loseCreateResponse = true
  fireEvent.click(
    screen.getByRole('button', { name: 'Create independent experiment drafts' })
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('Response lost')
  expect(screen.getByLabelText('Experiment name')).toHaveValue('Four openings')
  fireEvent.click(
    screen.getByRole('button', { name: 'Create independent experiment drafts' })
  )
  await waitFor(() => expect(requests).toHaveLength(2))
  expect(requests[1].body).toEqual(requests[0].body)
})

test('a duplicate target path prevents conflicting variable definitions from being submitted', async () => {
  mount()
  await fillMatrix()
  fireEvent.change(screen.getByLabelText('Variable 2 target'), {
    target: { value: '/nodes/0/data/prompt' },
  })
  expect(
    screen.getByRole('button', { name: 'Create independent experiment drafts' })
  ).toBeDisabled()
})

test('the other variant stays blocked until sample approval and generation needs an explicit confirmation', async () => {
  saved = [campaign]
  mount()
  const generate = await screen.findByRole('button', {
    name: 'Generate the sample',
  })
  expect(
    screen.getByRole('button', { name: 'Generate this variant' })
  ).toBeDisabled()
  fireEvent.click(generate)
  expect(requests).toHaveLength(0)
  fireEvent.click(
    screen.getByRole('button', { name: 'Generate within this variant budget' })
  )
  await waitFor(() =>
    expect(requests).toEqual([
      {
        path: '/campaigns/campaign/variants/v1/submit',
        body: { confirm_generation: true },
      },
    ])
  )
})

test('continuing one failed variant reuses its existing job receipt and budget', async () => {
  saved = [
    {
      ...campaign,
      sample_approved_revision: 8,
      variants: [
        { ...campaign.variants[1], job_id: 'saved-job', job_status: 'failed' },
      ],
    },
  ]
  mount()
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Continue this saved variant workflow',
    })
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Generate within this variant budget' })
  )
  await waitFor(() =>
    expect(requests).toEqual([
      {
        path: '/jobs/saved-job/control',
        body: { action: 'resume', confirm_generation: true },
      },
    ])
  )
})

test('batch generation confirms once and submits only the remaining selected variants', async () => {
  saved = [
    {
      ...campaign,
      sample_approved_revision: 8,
      variants: [
        {
          ...campaign.variants[0],
          job_id: 'finished-sample',
          job_status: 'succeeded',
        },
        campaign.variants[1],
        { ...campaign.variants[1], id: 'v3', project_id: 'child-3' },
      ],
    },
  ]
  mount()
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Generate the remaining selected variants',
    })
  )
  expect(requests).toHaveLength(0)
  fireEvent.click(
    screen.getByRole('button', { name: 'Generate within this variant budget' })
  )
  await waitFor(() =>
    expect(requests.map((request) => request.path)).toEqual([
      '/campaigns/campaign/variants/v2/submit',
      '/campaigns/campaign/variants/v3/submit',
    ])
  )
})

test('opening a variant selects its independent project and viewers cannot start generation', async () => {
  saved = [campaign]
  const { onOpenProject } = mount(true)
  fireEvent.click(
    (
      await screen.findAllByRole('button', { name: 'Open variant for editing' })
    )[0]
  )
  expect(onOpenProject).toHaveBeenCalledWith('child-1')
  expect(
    screen.getByRole('button', { name: 'Generate the sample' })
  ).toBeDisabled()
  expect(screen.getByLabelText('Experiment name')).toBeDisabled()
  expect(requests).toHaveLength(0)
})
