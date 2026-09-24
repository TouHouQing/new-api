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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import type { StudioCanvasNode } from './canvas-flow'
import { StudioInspector } from './studio-inspector'

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

  test('shows site model aliases and asks which video family they use', () => {
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
      screen.getByRole('combobox', { name: 'studio.video.family' })
    ).toBeTruthy()
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
    expect(screen.getByText('studio.provider.configureHint')).toBeTruthy()
    screen.getByRole('button', { name: 'studio.provider.settings' }).click()
    expect(onConfigureProvider).toHaveBeenCalledOnce()
  })
})
