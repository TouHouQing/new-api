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
import { describe, expect, test } from 'vitest'

import { connectedGenerationInput, type StudioCanvasNode } from './canvas-flow'

const nodes: StudioCanvasNode[] = [
  {
    id: 'text',
    type: 'studio',
    position: { x: 0, y: 0 },
    data: {
      kind: 'text',
      title: 'Script',
      prompt: 'write a scene',
      outputText: 'Rainy city at dusk',
    },
  },
  {
    id: 'image',
    type: 'studio',
    position: { x: 300, y: 0 },
    data: {
      kind: 'image',
      title: 'Frame',
      prompt: 'cinematic',
      outputUrl: 'https://cdn.example/frame.png',
    },
  },
  {
    id: 'video',
    type: 'studio',
    position: { x: 600, y: 0 },
    data: { kind: 'video', title: 'Shot', prompt: 'slow push in' },
  },
]

describe('Studio canvas connections', () => {
  test('passes text and a generated image into a downstream video', () => {
    expect(
      connectedGenerationInput(
        nodes,
        [
          { id: 'e1', source: 'text', target: 'video' },
          { id: 'e2', source: 'image', target: 'video' },
        ],
        'video'
      )
    ).toEqual({
      prompt: 'Rainy city at dusk\n\nslow push in',
      imageUrl: 'https://cdn.example/frame.png',
    })
  })

  test('does not submit a browser blob URL as an upstream image reference', () => {
    const localNodes: StudioCanvasNode[] = [
      {
        ...nodes[1],
        data: {
          ...nodes[1].data,
          outputUrl: 'blob:https://new.thqllm.com/local',
        },
      },
      nodes[2],
    ]
    expect(
      connectedGenerationInput(
        localNodes,
        [{ id: 'e2', source: 'image', target: 'video' }],
        'video'
      )
    ).toEqual({ prompt: 'slow push in' })
  })

  test('does not read nodes outside direct incoming connections', () => {
    expect(connectedGenerationInput(nodes, [], 'video')).toEqual({
      prompt: 'slow push in',
    })
  })

  test('uses an ungenerated connected text prompt when the video prompt is empty', () => {
    const draftNodes: StudioCanvasNode[] = [
      {
        ...nodes[0],
        data: { kind: 'text', title: 'Script', prompt: 'A beautiful woman' },
      },
      {
        ...nodes[2],
        data: { kind: 'video', title: 'Shot', prompt: '' },
      },
    ]
    expect(
      connectedGenerationInput(
        draftNodes,
        [{ id: 'draft', source: 'text', target: 'video' }],
        'video'
      )
    ).toEqual({ prompt: 'A beautiful woman' })
  })
})
