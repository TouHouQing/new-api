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

import {
  connectedGenerationInput,
  isValidStudioConnection,
  planStudioExecution,
  type StudioCanvasNode,
} from './canvas-flow'

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
  test('a pinned completed text take supplies its own prompt without rerunning the source', () => {
    const text = {
      ...nodes[0],
      data: {
        ...nodes[0].data,
        selectedTakeId: 'new',
        outputText: 'New scene',
        takes: [
          {
            id: 'old',
            createdAt: '2026-09-26T00:00:00Z',
            prompt: 'scene',
            status: 'completed' as const,
            outputText: 'Old scene',
          },
        ],
      },
    }
    const video = { ...nodes[2], data: { ...nodes[2].data, prompt: '' } }
    const edges = [
      {
        id: 'pinned',
        source: 'text',
        target: 'video',
        data: { sourceTakeId: 'old' },
      },
    ]
    expect(connectedGenerationInput([text, video], edges, 'video').prompt).toBe(
      'Old scene'
    )
    expect(
      planStudioExecution([text, video], edges, 'video').map((node) => node.id)
    ).toEqual(['video'])
  })
  test('plans only the ancestors of a target in dependency order', () => {
    const image = {
      ...nodes[1],
      data: { ...nodes[1].data, outputUrl: undefined },
    }
    const graph = [
      nodes[0],
      image,
      nodes[2],
      {
        ...nodes[2],
        id: 'other-video',
      },
    ]
    expect(
      planStudioExecution(
        graph,
        [
          { id: 'text-image', source: 'text', target: 'image' },
          { id: 'image-video', source: 'image', target: 'video' },
        ],
        'video'
      ).map((node) => node.id)
    ).toEqual(['text', 'image', 'video'])
  })

  test('rejects cycles and unsupported node connections', () => {
    const edges = [{ id: 'text-video', source: 'text', target: 'video' }]
    expect(isValidStudioConnection(nodes, edges, 'video', 'text')).toBe(false)
    expect(isValidStudioConnection(nodes, edges, 'video', 'image')).toBe(false)
    expect(isValidStudioConnection(nodes, edges, 'text', 'image')).toBe(true)
    expect(() =>
      planStudioExecution(
        nodes,
        [
          { id: 'a', source: 'text', target: 'video' },
          { id: 'b', source: 'video', target: 'text' },
        ],
        'video'
      )
    ).toThrow('cycle')
    const blank = nodes.map((node) =>
      node.id === 'video'
        ? { ...node, data: { ...node.data, prompt: '' } }
        : node
    )
    expect(() =>
      connectedGenerationInput(
        blank,
        [
          { id: 'a', source: 'video', target: 'image' },
          { id: 'b', source: 'image', target: 'video' },
        ],
        'video'
      )
    ).not.toThrow()
  })

  test('automatically accepts common image edit links without advanced ports', () => {
    const secondImage = { ...nodes[1], id: 'image-two' }
    expect(
      isValidStudioConnection([...nodes, secondImage], [], 'image', 'image-two')
    ).toBe(true)
    expect(
      isValidStudioConnection(
        [...nodes, secondImage],
        [],
        'text',
        'video',
        'video_prompt',
        null
      )
    ).toBe(true)
    expect(
      isValidStudioConnection(
        [...nodes, secondImage],
        [],
        'image',
        'video',
        null,
        'reference_image'
      )
    ).toBe(true)
  })

  test('rejects a second image input when an image edit already has a reference', () => {
    const secondSource = { ...nodes[1], id: 'image-two' }
    const target = { ...nodes[1], id: 'image-edit' }
    const graph = [...nodes, secondSource, target]
    expect(
      isValidStudioConnection(
        graph,
        [{ id: 'first', source: 'image', target: 'image-edit' }],
        'image-two',
        'image-edit'
      )
    ).toBe(false)
    expect(
      isValidStudioConnection(
        graph,
        [
          {
            id: 'first',
            source: 'image',
            target: 'image-edit',
            targetHandle: 'reference_image',
          },
        ],
        'image-two',
        'image-edit',
        'image',
        'reference_image'
      )
    ).toBe(false)
    expect(
      isValidStudioConnection(
        graph,
        [{ id: 'first', source: 'image', target: 'video' }],
        'image-two',
        'video'
      )
    ).toBe(true)
  })

  test('accepts typed media ports and rejects a second first frame', () => {
    expect(
      isValidStudioConnection(
        nodes,
        [],
        'text',
        'image',
        'image_prompt',
        'prompt'
      )
    ).toBe(true)
    expect(
      isValidStudioConnection(
        nodes,
        [],
        'text',
        'video',
        'image_prompt',
        'prompt'
      )
    ).toBe(false)
    const secondImage = { ...nodes[1], id: 'image-two' }
    expect(
      isValidStudioConnection(
        [...nodes, secondImage],
        [],
        'image',
        'image-two',
        'image',
        'reference_image'
      )
    ).toBe(true)
    expect(
      isValidStudioConnection(
        [...nodes, secondImage],
        [
          {
            id: 'first',
            source: 'image',
            target: 'video',
            targetHandle: 'first_frame',
          },
        ],
        'image-two',
        'video',
        'image',
        'first_frame'
      )
    ).toBe(false)
    const secondVideo = { ...nodes[2], id: 'video-two' }
    expect(
      isValidStudioConnection(
        [...nodes, secondVideo],
        [],
        'video',
        'video-two',
        'video',
        'extend_video'
      )
    ).toBe(true)
  })

  test('allows two distinct output roles from one source to the same target', () => {
    const first = {
      id: 'scene',
      source: 'text',
      target: 'video',
      sourceHandle: 'scene',
      targetHandle: 'prompt',
    }
    expect(
      isValidStudioConnection(
        nodes,
        [first],
        'text',
        'video',
        'video_prompt',
        'prompt'
      )
    ).toBe(true)
    expect(
      isValidStudioConnection(
        nodes,
        [first],
        'text',
        'video',
        'scene',
        'prompt'
      )
    ).toBe(false)
  })

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

  test('routes one generated shot to the image and video prompts it needs', () => {
    const shotNodes = nodes.map((node) =>
      node.id === 'text'
        ? {
            ...node,
            data: {
              ...node.data,
              outputText: 'A woman at a rainy street corner',
              outputImagePrompt:
                'A still frame of a woman at a rainy street corner',
              outputVideoPrompt: 'She turns toward camera as it pushes in',
            },
          }
        : node
    )
    expect(
      connectedGenerationInput(
        shotNodes,
        [{ id: 'ti', source: 'text', target: 'image' }],
        'image'
      ).prompt
    ).toBe('A still frame of a woman at a rainy street corner\n\ncinematic')
    expect(
      connectedGenerationInput(
        shotNodes,
        [{ id: 'tv', source: 'text', target: 'video' }],
        'video'
      ).prompt
    ).toBe(
      'A woman at a rainy street corner\n\nShe turns toward camera as it pushes in\n\nslow push in'
    )
    expect(
      connectedGenerationInput(
        shotNodes,
        [
          { id: 'tv', source: 'text', target: 'video' },
          { id: 'iv', source: 'image', target: 'video' },
        ],
        'video'
      )
    ).toEqual({
      prompt: 'She turns toward camera as it pushes in\n\nslow push in',
      imageUrl: 'https://cdn.example/frame.png',
    })
  })

  test('does not repeat a manual shot description when scene and motion are identical', () => {
    const shotNodes = nodes.map((node) =>
      node.id === 'text'
        ? {
            ...node,
            data: {
              ...node.data,
              outputText: 'A woman enters a station.',
              outputVideoPrompt: 'A woman enters a station.',
            },
          }
        : node
    )
    expect(
      connectedGenerationInput(
        shotNodes,
        [{ id: 'tv', source: 'text', target: 'video' }],
        'video'
      ).prompt
    ).toBe('A woman enters a station.\n\nslow push in')
  })

  test('a partial saved text result falls back to its saved prompt instead of the old brief', () => {
    const shotNodes = nodes.map((node) =>
      node.id === 'text'
        ? {
            ...node,
            data: {
              ...node.data,
              outputText: '',
              outputImagePrompt: 'Saved still frame',
              outputVideoPrompt: '',
            },
          }
        : node
    )
    expect(
      connectedGenerationInput(
        shotNodes,
        [{ id: 'tv', source: 'text', target: 'video' }],
        'video'
      ).prompt
    ).toBe('Saved still frame\n\nslow push in')
  })

  test('uses an explicit text output port instead of guessing by target kind', () => {
    const text = {
      ...nodes[0],
      data: {
        ...nodes[0].data,
        outputText: 'A woman in the rain',
        outputImagePrompt: 'A still portrait in the rain',
        outputVideoPrompt: 'She turns as the camera approaches',
      },
    }
    const video = { ...nodes[2], data: { ...nodes[2].data, prompt: '' } }
    expect(
      connectedGenerationInput(
        [text, video],
        [
          {
            id: 'scene-video',
            source: 'text',
            sourceHandle: 'scene',
            target: 'video',
            targetHandle: 'prompt',
          },
        ],
        'video'
      ).prompt
    ).toBe('A woman in the rain')
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

  test('passes text through an image node when the final video has no prompt', () => {
    const draft = nodes.map((node) =>
      node.id === 'video'
        ? { ...node, data: { ...node.data, prompt: '' } }
        : node
    )
    expect(
      connectedGenerationInput(
        draft,
        [
          { id: 'text-image', source: 'text', target: 'image' },
          { id: 'image-video', source: 'image', target: 'video' },
        ],
        'video'
      )
    ).toEqual({
      prompt: 'Rainy city at dusk',
      imageUrl: 'https://cdn.example/frame.png',
    })
  })
})
