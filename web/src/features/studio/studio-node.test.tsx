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
import { fireEvent, render, screen } from '@testing-library/react'
import { ReactFlowProvider, type NodeProps } from '@xyflow/react'
import { expect, test } from 'vitest'

import type { StudioCanvasNode } from './canvas-flow'
import { StudioNode } from './studio-node'

test('keeps drag handles outside the node card visible and reachable', () => {
  const props = {
    id: 'text-1',
    type: 'studio',
    selected: false,
    dragging: false,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    zIndex: 0,
    data: { kind: 'text', title: 'Text 1', prompt: 'Scene' },
  } as NodeProps<StudioCanvasNode>

  render(
    <ReactFlowProvider>
      <StudioNode {...props} />
    </ReactFlowProvider>
  )

  const card = screen.getByLabelText('Text 1')
  expect(
    card.querySelectorAll('.react-flow__handle:not([aria-hidden="true"])')
  ).toHaveLength(2)
  expect(
    card.querySelector('.react-flow__handle.source:not([aria-hidden="true"])')
  ).not.toHaveAttribute('data-handleid')
  expect(card).toHaveClass('overflow-visible')
  expect(card).not.toHaveClass('overflow-hidden')
})

test('shows uncommon text outputs only when expanded', () => {
  const props = {
    id: 'text-1',
    type: 'studio',
    selected: false,
    dragging: false,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    zIndex: 0,
    data: { kind: 'text', title: 'Text 1', prompt: 'Scene' },
  } as NodeProps<StudioCanvasNode>
  render(
    <ReactFlowProvider>
      <StudioNode {...props} />
    </ReactFlowProvider>
  )
  expect(screen.queryByTitle('studio.port.videoPrompt')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'studio.port.advanced' }))
  expect(screen.getByTitle('studio.port.videoPrompt')).toBeInTheDocument()
  expect(screen.getByTitle('studio.port.imagePrompt')).toBeInTheDocument()
})

test('keeps a connected specialized port visible when advanced options are closed', () => {
  const props = {
    id: 'text-1',
    type: 'studio',
    selected: false,
    dragging: false,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    zIndex: 0,
    data: {
      kind: 'text',
      title: 'Text 1',
      prompt: 'Scene',
      usedSourceHandles: ['video_prompt'],
    },
  } as NodeProps<StudioCanvasNode>
  render(
    <ReactFlowProvider>
      <StudioNode {...props} />
    </ReactFlowProvider>
  )
  expect(screen.getByTitle('studio.port.videoPrompt')).toBeInTheDocument()
  expect(
    document.querySelectorAll('.react-flow__handle:not([aria-hidden="true"])')
  ).toHaveLength(3)
})

test('a connected video has one visible output while both saved handle IDs remain addressable', () => {
  const props = {
    id: 'video-1',
    type: 'studio',
    selected: false,
    dragging: false,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    zIndex: 0,
    data: {
      kind: 'video',
      title: 'Video 1',
      prompt: '',
      usedSourceHandles: ['video'],
    },
  } as NodeProps<StudioCanvasNode>
  render(
    <ReactFlowProvider>
      <StudioNode {...props} />
    </ReactFlowProvider>
  )
  const card = screen.getByLabelText('Video 1')
  expect(
    card.querySelectorAll(
      '.react-flow__handle.source:not([aria-hidden="true"])'
    )
  ).toHaveLength(1)
  expect(
    card.querySelector('.react-flow__handle.source[data-handleid="video"]')
  ).toBeTruthy()
  expect(
    card.querySelector('.react-flow__handle.source:not([data-handleid])')
  ).toBeTruthy()
})

test('a final video shows its connected reference input and opens generic input on demand', () => {
  const props = {
    id: 'final',
    type: 'studio',
    selected: false,
    dragging: false,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    zIndex: 0,
    data: {
      kind: 'video',
      title: 'Final',
      prompt: '',
      usedTargetHandles: ['reference_video'],
    },
  } as NodeProps<StudioCanvasNode>
  render(
    <ReactFlowProvider>
      <StudioNode {...props} />
    </ReactFlowProvider>
  )
  const card = screen.getByLabelText('Final')
  expect(
    card.querySelectorAll(
      '.react-flow__handle.target:not([aria-hidden="true"])'
    )
  ).toHaveLength(1)
  expect(screen.getByTitle('studio.port.referenceVideo')).toBeTruthy()
  expect(screen.queryByTitle('studio.port.input')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'studio.port.advanced' }))
  expect(screen.getByTitle('studio.port.input')).toBeTruthy()
})

test('a video with an older automatic input keeps that input visible beside named references', () => {
  const props = {
    id: 'final',
    type: 'studio',
    selected: false,
    dragging: false,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    zIndex: 0,
    data: {
      kind: 'video',
      title: 'Final',
      prompt: '',
      usedTargetHandles: ['reference_video'],
      hasLegacyTargetHandle: true,
    },
  } as NodeProps<StudioCanvasNode>
  render(
    <ReactFlowProvider>
      <StudioNode {...props} />
    </ReactFlowProvider>
  )
  expect(screen.getByTitle('studio.port.input')).toBeTruthy()
  expect(screen.getByTitle('studio.port.referenceVideo')).toBeTruthy()
})
