import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'

import { getPricing } from '@/features/pricing/api'

import { fetchStudioModels } from '../api'
import { StudioVideoModelPicker } from '../studio-video-model-picker'

vi.mock('@/features/pricing/api', () => ({ getPricing: vi.fn() }))
vi.mock('../api', () => ({ fetchStudioModels: vi.fn() }))

const catalog = {
  success: true,
  data: [
    {
      id: 1,
      model_name: 'site-video-alias',
      description: 'A flexible video model',
      quota_type: 1,
      model_ratio: 0,
      completion_ratio: 1,
      model_price: 0.416,
      enable_groups: ['vip'],
    },
    {
      id: 2,
      model_name: 'dynamic-video',
      description: 'Uses channel-specific billing',
      quota_type: 1,
      model_ratio: 0,
      completion_ratio: 1,
      model_price: 0.2,
      enable_groups: ['vip'],
      supported_endpoint_types: ['openai-video'],
    },
    {
      id: 3,
      model_name: 'not-enabled',
      description: 'Must stay hidden',
      quota_type: 1,
      model_ratio: 0,
      completion_ratio: 1,
      model_price: 9,
      enable_groups: ['vip'],
    },
  ],
  vendors: [],
  group_ratio: { vip: 1.5 },
  usable_group: { vip: { desc: 'VIP', ratio: 1.5 } },
  supported_endpoint: {},
  auto_groups: [],
}

beforeEach(() => {
  vi.mocked(fetchStudioModels).mockReset()
  vi.mocked(getPricing).mockReset()
  vi.mocked(fetchStudioModels).mockResolvedValue([
    'site-video-alias',
    'dynamic-video',
    'available-without-metadata',
  ])
  vi.mocked(getPricing).mockResolvedValue(catalog)
})

function renderPicker(props: {
  group: string
  selectedModel: string
  durationSeconds: number
  onSelect: (modelId: string) => void
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <StudioVideoModelPicker {...props} />
    </QueryClientProvider>
  )
}

test('shows only freshly available site models with description and group price', async () => {
  const onSelect = vi.fn()
  const user = userEvent.setup()
  renderPicker({
    group: 'vip',
    selectedModel: '',
    durationSeconds: 5,
    onSelect,
  })

  const trigger = screen.getByRole('button', { name: 'studio.model.select' })
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await user.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(fetchStudioModels).toHaveBeenCalledWith('vip')
  expect(await screen.findByText('A flexible video model')).toBeInTheDocument()
  expect(screen.queryByText('Must stay hidden')).toBeNull()
  expect(screen.getByText('$0.624')).toBeInTheDocument()
  expect(
    screen.getByText('studio.model.descriptionMissing')
  ).toBeInTheDocument()

  await user.type(
    screen.getByRole('textbox', { name: 'studio.model.search' }),
    'site-video'
  )
  expect(screen.queryByText('Uses channel-specific billing')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'site-video-alias' }))
  expect(onSelect).toHaveBeenCalledWith('site-video-alias')
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
})

test('marks channel-dependent prices as a reference instead of a final charge', async () => {
  const user = userEvent.setup()
  renderPicker({
    group: 'vip',
    selectedModel: 'dynamic-video',
    durationSeconds: 30,
    onSelect: vi.fn(),
  })
  await user.click(screen.getByRole('button', { name: 'dynamic-video' }))
  expect(
    await screen.findByText('Uses channel-specific billing')
  ).toBeInTheDocument()
  expect(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'dynamic-video',
    })
  ).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('studio.model.priceReference')).toBeInTheDocument()
})

test('keeps the model picker usable when the pricing catalog is unavailable', async () => {
  vi.mocked(getPricing).mockRejectedValue(new Error('pricing offline'))
  const user = userEvent.setup()
  renderPicker({
    group: 'vip',
    selectedModel: '',
    durationSeconds: 5,
    onSelect: vi.fn(),
  })
  await user.click(screen.getByRole('button', { name: 'studio.model.select' }))
  expect(
    await screen.findByText('available-without-metadata')
  ).toBeInTheDocument()
  expect(
    screen.getAllByText('studio.model.priceUnknown').length
  ).toBeGreaterThan(0)
})

test('refreshes the available models when the channel list changes', async () => {
  const user = userEvent.setup()
  renderPicker({
    group: 'vip',
    selectedModel: '',
    durationSeconds: 5,
    onSelect: vi.fn(),
  })
  await user.click(screen.getByRole('button', { name: 'studio.model.select' }))
  expect(await screen.findByText('A flexible video model')).toBeInTheDocument()
  vi.mocked(fetchStudioModels).mockResolvedValue(['new-channel-model'])
  await user.click(screen.getByRole('button', { name: 'studio.model.refresh' }))
  expect(await screen.findByText('new-channel-model')).toBeInTheDocument()
  expect(screen.queryByText('A flexible video model')).toBeNull()
})

test('shows a retry action when the current group model request fails', async () => {
  vi.mocked(fetchStudioModels).mockRejectedValueOnce(new Error('offline'))
  const user = userEvent.setup()
  renderPicker({
    group: 'vip',
    selectedModel: '',
    durationSeconds: 5,
    onSelect: vi.fn(),
  })

  await user.click(screen.getByRole('button', { name: 'studio.model.select' }))
  expect(await screen.findByText('studio.model.loadFailed')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('A flexible video model')).toBeInTheDocument()
})

test('requires a video group before opening the model dialog', () => {
  renderPicker({
    group: '',
    selectedModel: '',
    durationSeconds: 5,
    onSelect: vi.fn(),
  })
  expect(
    screen.getByRole('button', { name: 'studio.model.select' })
  ).toBeDisabled()
  expect(fetchStudioModels).not.toHaveBeenCalled()
})
