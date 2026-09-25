import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
import {
  fireEvent,
  render as testingRender,
  screen,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { describe, expect, test, vi } from 'vitest'

import type { StudioCanvasNode } from './canvas-flow'
import { StudioInspector } from './studio-inspector'

vi.mock('@/components/json-code-editor', () => ({
  JsonCodeEditor: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string
    onChange: (value: string) => void
    ariaLabel: string
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  fetchStudioModels: vi.fn(async () => ['特价-sd2.5三十秒']),
}))
vi.mock('@/features/pricing/api', () => ({
  getPricing: vi.fn(async () => ({
    success: true,
    data: [],
    vendors: [],
    group_ratio: { default: 1 },
    usable_group: { default: { desc: 'Default', ratio: 1 } },
    supported_endpoint: {},
    auto_groups: [],
  })),
}))

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return testingRender(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  )
}

const video = (model: string): StudioCanvasNode => ({
  id: 'video',
  type: 'studio',
  position: { x: 0, y: 0 },
  data: {
    kind: 'video',
    title: 'Shot',
    prompt: 'Forest',
    model,
    seconds: 5,
    resolution: model === 'MiniMax-H3' ? '768P' : '720p',
    ratio: '16:9',
  },
})

describe('Studio model controls', () => {
  test('keeps invalid or secret metadata drafts out of saved project state', () => {
    const node = video('会员套餐甲')
    const onChange = vi.fn()
    render(
      <StudioInspector
        node={node}
        models={['会员套餐甲']}
        videoGroups={[{ id: 'default', description: 'Default' }]}
        videoGroup='default'
        providerConfigured={false}
        onConfigureProvider={vi.fn()}
        onChange={onChange}
        onGenerate={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'studio.video.advanced' })
    )
    fireEvent.change(screen.getByLabelText('studio.video.metadata'), {
      target: { value: '{"api_key":"sk-private"}' },
    })
    expect(onChange).not.toHaveBeenCalledWith({
      metadataJson: '{"api_key":"sk-private"}',
    })
    expect(
      (
        screen.getByRole('button', {
          name: 'studio.generate',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
    fireEvent.change(screen.getByLabelText('studio.video.metadata'), {
      target: { value: '{"aigc_watermark":false}' },
    })
    expect(onChange).toHaveBeenCalledWith({
      metadataJson: '{"aigc_watermark":false}',
    })
  })
  test('explains an invalid advanced draft before submission even when collapsed', () => {
    const node = video('会员套餐甲')
    node.data.metadataJson = '{"duration":999999}'
    render(
      <StudioInspector
        node={node}
        models={['会员套餐甲']}
        videoGroups={[{ id: 'default', description: 'Default' }]}
        videoGroup='default'
        providerConfigured={false}
        onConfigureProvider={vi.fn()}
        onChange={vi.fn()}
        onGenerate={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    expect(
      (
        screen.getByRole('button', {
          name: 'studio.generate',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain(
      'studio.video.metadataInvalid'
    )
  })
  test('lets an unknown site alias submit custom resolution and ratio without a family guess', async () => {
    const node = video('轮换渠道-会员视频')
    node.data.videoFamily = undefined
    node.data.resolution = 'custom-1536'
    node.data.ratio = '2:3'
    const onChange = vi.fn()
    render(
      <StudioInspector
        node={node}
        models={['轮换渠道-会员视频']}
        videoGroups={[{ id: 'default', description: 'Default' }]}
        videoGroup='default'
        providerConfigured={false}
        onConfigureProvider={vi.fn()}
        onChange={onChange}
        onGenerate={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    expect(
      (
        screen.getByRole('button', {
          name: 'studio.generate',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
    expect(
      (screen.getByLabelText('studio.resolution') as HTMLInputElement).value
    ).toBe('custom-1536')
    expect(
      (screen.getByLabelText('studio.ratio') as HTMLInputElement).value
    ).toBe('2:3')
    fireEvent.change(screen.getByLabelText('studio.resolution'), {
      target: { value: 'custom-2048' },
    })
    expect(onChange).toHaveBeenCalledWith({ resolution: 'custom-2048' })
  })
  test('shows only H3 duration and resolution controls for an H3 node', () => {
    render(
      <StudioInspector
        node={video('MiniMax-H3')}
        models={['MiniMax-H3', 'doubao-seedance-2-0-260128']}
        videoGroups={[{ id: 'default', description: 'Default' }]}
        videoGroup='default'
        providerConfigured={false}
        onConfigureProvider={vi.fn()}
        onChange={vi.fn()}
        onGenerate={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    expect(screen.getByText('2K')).toBeTruthy()
    expect(screen.queryByText('1080p')).toBeNull()
  })

  test('shows Seedance 2.0 output tiers for a Seedance node', () => {
    render(
      <StudioInspector
        node={video('doubao-seedance-2-0-260128')}
        models={['MiniMax-H3', 'doubao-seedance-2-0-260128']}
        videoGroups={[{ id: 'default', description: 'Default' }]}
        videoGroup='default'
        providerConfigured={false}
        onConfigureProvider={vi.fn()}
        onChange={vi.fn()}
        onGenerate={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    expect(screen.getByText('1080p')).toBeTruthy()
    expect(screen.queryByText('2K')).toBeNull()
  })

  test('keeps a thirty-second duration on an existing video alias node', async () => {
    const node = video('特价-sd2.5三十秒')
    node.data.videoFamily = 'seedance-2'
    node.data.seconds = 30
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <StudioInspector
        node={node}
        models={['特价-sd2.5三十秒']}
        videoGroups={[{ id: 'default', description: 'Default' }]}
        videoGroup='default'
        providerConfigured={false}
        onConfigureProvider={vi.fn()}
        onChange={onChange}
        onGenerate={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    const duration = screen.getByLabelText(
      'studio.duration'
    ) as HTMLInputElement
    expect(duration.max).toBe('3600')
    expect(duration.value).toBe('30')
    expect(
      (
        screen.getByRole('button', {
          name: 'studio.generate',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
    await user.clear(duration)
    expect(onChange).not.toHaveBeenCalledWith({ seconds: 0 })
    expect(
      (
        screen.getByRole('button', {
          name: 'studio.generate',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
  })

  test('selecting a site alias preserves the user-entered duration', async () => {
    const node = video('')
    node.data.seconds = 30
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <StudioInspector
        node={node}
        models={['特价-sd2.5三十秒']}
        videoGroups={[{ id: 'default', description: 'Default' }]}
        videoGroup='default'
        providerConfigured={false}
        onConfigureProvider={vi.fn()}
        onChange={onChange}
        onGenerate={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await user.click(
      screen.getByRole('button', { name: 'studio.model.select' })
    )
    await user.click(
      await screen.findByRole('button', { name: '特价-sd2.5三十秒' })
    )
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        model: '特价-sd2.5三十秒',
        videoFamily: undefined,
        seconds: 30,
      })
    )
  })

  test('offers a retry when a completed video was not saved locally', () => {
    const node = video('MiniMax-H3')
    node.data.status = 'completed'
    node.data.taskId = 'task-one'
    render(
      <StudioInspector
        node={node}
        models={['MiniMax-H3']}
        videoGroups={[{ id: 'default', description: 'Default' }]}
        videoGroup='default'
        providerConfigured={false}
        onConfigureProvider={vi.fn()}
        onChange={vi.fn()}
        onGenerate={vi.fn()}
        onDelete={vi.fn()}
        onRetryMedia={vi.fn()}
      />
    )
    expect(
      screen.getByRole('button', { name: 'studio.media.retry' })
    ).toBeTruthy()
  })

  test('shows site model aliases without asking for a media request format', () => {
    render(
      <StudioInspector
        node={video('my-site-video-alias')}
        models={['my-site-video-alias']}
        videoGroups={[{ id: 'video-vip', description: 'Video VIP' }]}
        videoGroup='video-vip'
        providerConfigured={false}
        onConfigureProvider={vi.fn()}
        onChange={vi.fn()}
        onGenerate={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    expect(
      screen.getByRole('combobox', { name: 'studio.video.group' })
    ).toBeTruthy()
    expect(
      screen.queryByRole('combobox', { name: 'studio.video.family' })
    ).toBeNull()
  })

  test('keeps thirty seconds while ignoring a saved legacy family selection', () => {
    const node = video('会员套餐甲')
    node.data.videoFamily = 'seedance-2'
    node.data.seconds = 30
    render(
      <StudioInspector
        node={node}
        models={['会员套餐甲']}
        videoGroups={[{ id: 'default', description: 'Default' }]}
        videoGroup='default'
        providerConfigured={false}
        onConfigureProvider={vi.fn()}
        onChange={vi.fn()}
        onGenerate={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    expect(
      (screen.getByLabelText('studio.duration') as HTMLInputElement).value
    ).toBe('30')
    expect(
      (screen.getByLabelText('studio.duration') as HTMLInputElement).max
    ).toBe('3600')
    expect(
      screen.queryByRole('combobox', { name: 'studio.video.family' })
    ).toBeNull()
    expect(
      (
        screen.getByRole('button', {
          name: 'studio.generate',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
  })

  test('changes the site group before selecting a model', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <StudioInspector
        node={video('MiniMax-H3')}
        models={['MiniMax-H3']}
        videoGroups={[
          { id: 'default', description: 'Default' },
          { id: 'vip', description: 'VIP' },
        ]}
        videoGroup='default'
        providerConfigured={false}
        onConfigureProvider={vi.fn()}
        onChange={onChange}
        onGenerate={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await user.click(
      screen.getByRole('combobox', { name: 'studio.video.group' })
    )
    await user.click(await screen.findByRole('option', { name: /VIP/ }))
    expect(onChange).toHaveBeenCalledWith({
      group: 'vip',
      model: undefined,
      videoFamily: undefined,
      resolution: undefined,
    })
  })

  test('offers external service settings when a text node has no provider', () => {
    const node = video('')
    node.data.kind = 'text'
    const onConfigureProvider = vi.fn()
    render(
      <StudioInspector
        node={node}
        models={[]}
        videoGroups={[]}
        videoGroup=''
        providerConfigured={false}
        onConfigureProvider={onConfigureProvider}
        onChange={vi.fn()}
        onGenerate={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    expect(screen.getByText('studio.source.manual')).toBeTruthy()
    screen.getByRole('button', { name: 'studio.provider.settings' }).click()
    expect(onConfigureProvider).toHaveBeenCalledOnce()
  })

  test('shows the two downstream prompts produced by an AI text node', () => {
    const node = video('')
    node.data.kind = 'text'
    node.data.model = 'text-model'
    node.data.outputText = 'A woman at dusk'
    node.data.outputImagePrompt = 'A still portrait at dusk'
    node.data.outputVideoPrompt = 'She turns as the camera moves closer'
    render(
      <StudioInspector
        node={node}
        models={['text-model']}
        videoGroups={[]}
        videoGroup=''
        providerConfigured
        onConfigureProvider={vi.fn()}
        onChange={vi.fn()}
        onGenerate={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    expect(screen.getByText('studio.text.imagePrompt')).toBeTruthy()
    expect(screen.getByText('A still portrait at dusk')).toBeTruthy()
    expect(screen.getByText('studio.text.videoPrompt')).toBeTruthy()
    expect(
      screen.getByText('She turns as the camera moves closer')
    ).toBeTruthy()
  })
})
