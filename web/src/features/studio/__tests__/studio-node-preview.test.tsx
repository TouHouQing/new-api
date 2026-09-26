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
import { render, screen } from '@testing-library/react'
import { ReactFlowProvider, type NodeProps } from '@xyflow/react'
import { expect, test } from 'vitest'

import type { StudioCanvasNode } from '../canvas-flow'
import { StudioNode } from '../studio-node'

function renderVideoNode(data: NodeProps<StudioCanvasNode>['data']) {
  const props = {
    id: 'video-1',
    type: 'studio',
    selected: false,
    dragging: false,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    zIndex: 0,
    data,
  } as NodeProps<StudioCanvasNode>

  render(
    <ReactFlowProvider>
      <StudioNode {...props} />
    </ReactFlowProvider>
  )
}

test('completed video with a local preview shows an accessible compact player', () => {
  renderVideoNode({
    kind: 'video',
    title: 'Clip 1',
    prompt: 'Camera follows the subject',
    status: 'completed',
    previewUrl: 'blob:local-preview',
    outputUrl: 'https://example.com/remote.mp4',
  })

  const video = screen.getByLabelText('Clip 1 · studio.kind.video')
  expect(video).toBeInstanceOf(HTMLVideoElement)
  expect(video).toHaveAttribute('src', 'blob:local-preview')
  expect(video).toHaveAttribute('controls')
  expect(video).toHaveAttribute('preload', 'metadata')
  expect(video).toHaveClass('nodrag', 'nopan', 'max-h-28')
})

test('completed video uses its output URL when the local preview is empty', () => {
  renderVideoNode({
    kind: 'video',
    title: 'Clip 1',
    prompt: 'Camera follows the subject',
    status: 'completed',
    previewUrl: '',
    outputUrl: 'https://example.com/remote.mp4',
  })

  expect(screen.getByLabelText('Clip 1 · studio.kind.video')).toHaveAttribute(
    'src',
    'https://example.com/remote.mp4'
  )
})

test('completed video without a URL keeps the ready fallback', () => {
  renderVideoNode({
    kind: 'video',
    title: 'Clip 1',
    prompt: 'Camera follows the subject',
    status: 'completed',
  })

  expect(screen.getByText('studio.node.videoReady')).toBeInTheDocument()
  expect(screen.queryByLabelText('Clip 1 · studio.kind.video')).toBeNull()
})

test('unfinished video with a URL does not show a player', () => {
  renderVideoNode({
    kind: 'video',
    title: 'Clip 1',
    prompt: 'Camera follows the subject',
    status: 'processing',
    outputUrl: 'https://example.com/remote.mp4',
  })

  expect(screen.queryByLabelText('Clip 1 · studio.kind.video')).toBeNull()
})

test('an invalidated video shows which upstream node made it stale', () => {
  renderVideoNode({
    kind: 'video',
    title: 'Clip 2',
    prompt: 'Continue',
    status: 'idle',
    staleSourceTitle: 'Text 1',
  })
  expect(screen.getByText('studio.stale.sourceChanged')).toBeInTheDocument()
})
