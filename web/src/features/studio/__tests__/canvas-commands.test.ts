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
import { expect, test } from 'vitest'

import {
  studioAssemblyProjectFromCanvas,
  planStudioAssembly,
} from '../assembly-plan'
import { isValidStudioConnection } from '../canvas-flow'
import {
  parseStudioProjectImport,
  serializeStudioProjectExport,
} from '../local-projects'
import {
  applyStudioCanvasOperations,
  studioCanvasDocumentFingerprint,
} from '../studio-canvas-commands'
import { compileStudioContinuityPrompt } from '../studio-continuity'
import { createStudioImageLayers } from '../studio-image-layers'
import { createStudioProject, recordStudioTake } from '../workspace'

function ids(): () => string {
  let index = 0
  return () => `id-${++index}`
}

test('a depth-reference draft accepts its typed control and invalidates its input fingerprint', () => {
  const original = applyStudioCanvasOperations(
    createStudioProject('Depth', 'depth'),
    [
      {
        op: 'add_node',
        nodeType: 'video',
        id: 'restyle',
        model: 'wan2.1-vace-1.3b',
      },
    ],
    ids()
  )
  const before = studioCanvasDocumentFingerprint(original)
  const configured = applyStudioCanvasOperations(
    original,
    [
      {
        op: 'update_node',
        nodeId: 'restyle',
        patch: { referenceControl: 'depth', seconds: 3, resolution: '640x384' },
      },
    ],
    ids()
  )
  expect(configured.nodes[0].data.referenceControl).toBe('depth')
  expect(studioCanvasDocumentFingerprint(configured)).not.toBe(before)
})

test('layer changes and timed image references advance the canvas authoring fingerprint', () => {
  const original = applyStudioCanvasOperations(
    createStudioProject('Film', 'layers'),
    [
      { op: 'add_node', nodeType: 'image', id: 'image' },
      { op: 'add_node', nodeType: 'video', id: 'video' },
    ]
  )
  const hash = studioCanvasDocumentFingerprint(original)
  const layers = createStudioImageLayers('stored-image', 128, 128, 'Background')
  const layered = {
    ...original,
    nodes: original.nodes.map((node) =>
      node.id === 'image'
        ? { ...node, data: { ...node.data, imageLayers: layers } }
        : node
    ),
  }
  expect(studioCanvasDocumentFingerprint(layered)).not.toBe(hash)
  const timed = {
    ...original,
    nodes: original.nodes.map((node) =>
      node.id === 'video'
        ? {
            ...node,
            data: {
              ...node.data,
              videoKeyframes: [{ time: 0.5, mediaId: 'stored-image' }],
            },
          }
        : node
    ),
  }
  expect(studioCanvasDocumentFingerprint(timed)).not.toBe(hash)
})

test('a motion draft keeps its account group and connects distinct image and video reference slots', () => {
  const source = applyStudioCanvasOperations(
    createStudioProject('Film', 'project'),
    [
      { op: 'add_node', nodeType: 'image', id: 'character' },
      { op: 'add_node', nodeType: 'video', id: 'movement' },
    ]
  )
  const draft = applyStudioCanvasOperations(source, [
    {
      op: 'add_node',
      nodeType: 'video',
      id: 'draft',
      title: 'Movement draft',
      model: 'wan2.1-vace-1.3b',
      group: 'local-group',
      prompt: 'Keep the character and transfer movement',
    },
    {
      op: 'connect',
      source: 'character',
      target: 'draft',
      sourceHandle: 'image',
      targetHandle: 'reference_image',
    },
    {
      op: 'connect',
      source: 'movement',
      target: 'draft',
      sourceHandle: 'video',
      targetHandle: 'reference_video',
    },
  ])
  expect(draft.nodes.find((node) => node.id === 'draft')?.data).toMatchObject({
    group: 'local-group',
    model: 'wan2.1-vace-1.3b',
    status: 'idle',
  })
  expect(draft.edges.map((edge) => edge.targetHandle)).toEqual([
    'reference_image',
    'reference_video',
  ])
  expect(draft.nodes.slice(0, 2)).toEqual(source.nodes)
})

test('an invalid operation rolls back the entire proposed transaction', () => {
  const project = createStudioProject('Film', 'project')
  expect(() =>
    applyStudioCanvasOperations(
      project,
      [
        { op: 'add_node', nodeType: 'note' },
        { op: 'update_node', nodeId: 'missing', patch: { title: 'Changed' } },
      ],
      ids()
    )
  ).toThrow('unavailable')
  expect(project.nodes).toHaveLength(0)
  expect(project.assets).toBeUndefined()
})

test('a character node shares its selected reference and profile with the asset library', () => {
  let project = applyStudioCanvasOperations(
    createStudioProject('Film', 'project'),
    [{ op: 'add_node', id: 'actor', nodeType: 'character', title: 'Mira' }],
    ids()
  )
  const assetId = project.nodes[0].data.linkedAssetId
  if (!assetId) throw new Error('Expected a linked character asset')
  project = applyStudioCanvasOperations(
    project,
    [
      {
        op: 'upsert_asset',
        id: assetId,
        kind: 'character',
        title: 'Mira',
        prompt: 'Cartographer',
        profile: { wardrobe: 'Blue coat', continuity: 'Keep the same face' },
      },
    ],
    ids()
  )
  project = recordStudioTake(project, 'actor', {
    id: 'portrait',
    createdAt: '2026-09-28T00:00:00Z',
    prompt: 'Portrait',
    status: 'completed',
    mediaId: 'portrait-media',
  })

  expect(project.assets?.[0].mediaId).toBe('portrait-media')
  expect(project.assets?.[0].versions?.[0].profile?.wardrobe).toBe('Blue coat')
  const prompt = compileStudioContinuityPrompt({
    prompt: 'Walking through a harbor',
    assets: project.assets,
    assetIds: [assetId],
  })
  expect(prompt).toContain('Blue coat')
  expect(prompt).toContain('Keep the same face')
})

test('notes stay manual even when the project has a default text model', () => {
  const base = {
    ...createStudioProject('Film', 'project'),
    defaults: { textModel: 'text-model' },
  }
  const project = applyStudioCanvasOperations(
    base,
    [
      {
        op: 'add_node',
        nodeType: 'note',
        id: 'note',
        prompt: 'Keep the light warm',
      },
    ],
    ids()
  )
  expect(project.nodes[0].data.model).toBeUndefined()
  expect(project.nodes[0].data.purpose).toBe('note')
  expect(() =>
    applyStudioCanvasOperations(project, [
      { op: 'update_node', nodeId: 'note', patch: { model: 'text-model' } },
    ])
  ).toThrow('manual')
})

test('cycles and attempts to forge task results are rejected before changing the document', () => {
  const project = applyStudioCanvasOperations(
    createStudioProject('Film', 'project'),
    [
      { op: 'add_node', nodeType: 'text', id: 'a' },
      { op: 'add_node', nodeType: 'text', id: 'b' },
      { op: 'connect', source: 'a', target: 'b' },
    ],
    ids()
  )
  expect(() =>
    applyStudioCanvasOperations(project, [
      { op: 'connect', source: 'b', target: 'a' },
    ])
  ).toThrow('cyclic')
  expect(() =>
    applyStudioCanvasOperations(project, [
      { op: 'update_node', nodeId: 'a', patch: { taskId: 'forged-task' } },
    ])
  ).toThrow()
  expect(project.edges).toHaveLength(1)
})

test('duplicating generated nodes copies configuration and internal edges without paid results', () => {
  let project = applyStudioCanvasOperations(
    createStudioProject('Film', 'project'),
    [
      { op: 'add_node', nodeType: 'text', id: 'brief', model: 'text-model' },
      { op: 'add_node', nodeType: 'image', id: 'image', model: 'image-model' },
      { op: 'connect', source: 'brief', target: 'image' },
    ],
    ids()
  )
  project = recordStudioTake(project, 'image', {
    id: 'paid-take',
    createdAt: '2026-09-28T00:00:00Z',
    prompt: 'Portrait',
    status: 'completed',
    mediaId: 'paid-media',
    chargedQuota: 20,
  })
  const next = applyStudioCanvasOperations(
    project,
    [{ op: 'duplicate', nodeIds: ['brief', 'image'] }],
    ids()
  )
  const copied = next.nodes.filter(
    (node) => !['brief', 'image'].includes(node.id)
  )
  expect(copied).toHaveLength(2)
  expect(copied.find((node) => node.data.kind === 'image')?.data).toMatchObject(
    { model: 'image-model', status: 'idle' }
  )
  expect(
    copied.find((node) => node.data.kind === 'image')?.data.takes
  ).toBeUndefined()
  expect(
    copied.find((node) => node.data.kind === 'image')?.data.mediaId
  ).toBeUndefined()
  expect(
    next.edges.some(
      (edge) =>
        copied.some((node) => node.id === edge.source) &&
        copied.some((node) => node.id === edge.target)
    )
  ).toBe(true)
})

test('input edits and deletion are blocked while an unpinned dependent task is active', () => {
  let project = applyStudioCanvasOperations(
    createStudioProject('Film', 'project'),
    [
      { op: 'add_node', nodeType: 'text', id: 'brief' },
      { op: 'add_node', nodeType: 'video', id: 'video', model: 'video-model' },
      { op: 'connect', source: 'brief', target: 'video' },
    ],
    ids()
  )
  project = recordStudioTake(project, 'video', {
    id: 'pending',
    createdAt: '2026-09-28T00:00:00Z',
    prompt: 'Film',
    status: 'queued',
    taskId: 'upstream-task',
  })
  expect(() =>
    applyStudioCanvasOperations(project, [
      { op: 'update_node', nodeId: 'brief', patch: { prompt: 'New idea' } },
    ])
  ).toThrow('active')
  expect(() =>
    applyStudioCanvasOperations(project, [
      { op: 'remove_nodes', nodeIds: ['brief'] },
    ])
  ).toThrow('active')
  expect(project.nodes[1].data.taskId).toBe('upstream-task')
})

test('automatic layout follows dependencies and preserves locked node coordinates', () => {
  const project = applyStudioCanvasOperations(
    createStudioProject('Film', 'project'),
    [
      { op: 'add_node', nodeType: 'text', id: 'a', position: { x: 90, y: 80 } },
      { op: 'add_node', nodeType: 'image', id: 'b' },
      { op: 'connect', source: 'a', target: 'b' },
      { op: 'update_node', nodeId: 'a', patch: { locked: true } },
    ],
    ids()
  )
  const next = applyStudioCanvasOperations(project, [
    { op: 'layout', direction: 'horizontal' },
  ])
  expect(next.nodes[0].position).toEqual({ x: 90, y: 80 })
  expect(next.nodes[1].position.x).toBeGreaterThan(next.nodes[0].position.x)
})

test('a story template connects its reusable references into the shot workflow', () => {
  const project = applyStudioCanvasOperations(
    createStudioProject('Film', 'project'),
    [{ op: 'apply_template', templateId: 'story' }],
    ids()
  )
  expect(project.assets?.map((asset) => asset.kind)).toEqual([
    'character',
    'location',
    'style',
  ])
  const shot = project.shots?.[0]
  if (!shot) throw new Error('Expected a storyboard shot')
  expect(
    project.edges.filter(
      (edge) =>
        edge.target === shot.imageNodeId &&
        edge.targetHandle === 'reference_image'
    )
  ).toHaveLength(3)
  expect(
    project.nodes.find((node) => node.id === shot.textNodeId)?.data.assetIds
  ).toHaveLength(3)
})

test('assembly accepts one soundtrack slot and materializes ordered video sources with pinned Takes', () => {
  const newId = ids()
  let project = applyStudioCanvasOperations(
    createStudioProject('Film', 'project'),
    [
      { op: 'add_node', nodeType: 'video', id: 'clip1' },
      { op: 'add_node', nodeType: 'video', id: 'clip2' },
      { op: 'add_node', nodeType: 'audio', id: 'audio1' },
      { op: 'add_node', nodeType: 'audio', id: 'audio2' },
      { op: 'add_node', nodeType: 'assembly', id: 'assembly' },
    ],
    newId
  )
  project = recordStudioTake(project, 'clip1', {
    id: 'take1',
    createdAt: '2026-09-28T00:00:00Z',
    prompt: '',
    status: 'completed',
    mediaId: 'clip1-media',
  })
  project = recordStudioTake(project, 'clip2', {
    id: 'take2',
    createdAt: '2026-09-28T00:00:00Z',
    prompt: '',
    status: 'completed',
    mediaId: 'clip2-media',
  })
  project = recordStudioTake(project, 'audio1', {
    id: 'audio-take',
    createdAt: '2026-09-28T00:00:00Z',
    prompt: '',
    status: 'completed',
    mediaId: 'music-media',
  })
  project = applyStudioCanvasOperations(
    project,
    [{ op: 'connect', source: 'audio1', target: 'assembly' }],
    newId
  )
  expect(
    isValidStudioConnection(project.nodes, project.edges, 'audio2', 'assembly')
  ).toBe(false)
  expect(
    isValidStudioConnection(project.nodes, project.edges, 'audio2', 'clip1')
  ).toBe(false)
  const clips = project.edges.filter(
    (edge) => edge.target === 'assembly' && edge.targetHandle === 'clip'
  )
  project = applyStudioCanvasOperations(
    project,
    [
      { op: 'pin_connection', edgeId: clips[0].id, takeId: 'take1' },
      {
        op: 'reorder_clips',
        nodeId: 'assembly',
        edgeIds: clips.map((edge) => edge.id).reverse(),
      },
    ],
    newId
  )
  const source = studioAssemblyProjectFromCanvas(project, 'assembly')
  expect(source.soundtrackMediaId).toBe('music-media')
  expect(planStudioAssembly(source).map((clip) => clip.mediaId)).toEqual([
    'clip2-media',
    'clip1-media',
  ])
})

test('the project format round-trips new node purposes, camera profiles and viewport settings', () => {
  let project = applyStudioCanvasOperations(
    createStudioProject('Film', 'project'),
    [
      { op: 'add_node', nodeType: 'scene', id: 'location' },
      { op: 'add_node', nodeType: 'audio', id: 'speech' },
      {
        op: 'update_node',
        nodeId: 'location',
        patch: { camera: { lens: '35 mm' } },
      },
    ],
    ids()
  )
  project = {
    ...project,
    canvas: { viewport: { x: 20, y: 40, zoom: 0.8 }, snapToGrid: true },
  }
  const loaded = parseStudioProjectImport(serializeStudioProjectExport(project))
  expect(loaded.nodes[0].data.purpose).toBe('scene')
  expect(loaded.nodes[0].data.camera?.lens).toBe('35 mm')
  expect(loaded.nodes[1].data.kind).toBe('audio')
  expect(loaded.canvas?.viewport).toEqual({ x: 20, y: 40, zoom: 0.8 })
})
