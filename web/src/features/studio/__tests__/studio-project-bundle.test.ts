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
import { Blob as NodeBlob } from 'node:buffer'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import type { StudioProject } from '../local-projects'
import { createStudioMediaStore } from '../media-store'
import {
  exportStudioProjectBundle,
  importStudioProjectBundle,
} from '../studio-project-bundle'
import { createStudioProject } from '../workspace'

const media = (value: string, type: string): Blob =>
  new NodeBlob([value], { type }) as unknown as Blob

beforeEach(() => vi.stubGlobal('Blob', NodeBlob))
afterEach(() => vi.unstubAllGlobals())

function projectWithMedia(): StudioProject {
  return {
    ...createStudioProject('Drama', 'original-project'),
    assembledMediaId: 'assembly-source',
    nodes: [
      {
        id: 'image-node',
        type: 'studio' as const,
        position: { x: 0, y: 0 },
        data: {
          kind: 'image' as const,
          title: 'Frame',
          prompt: 'a scene',
          mediaId: 'image-source',
        },
      },
      {
        id: 'video-node',
        type: 'studio' as const,
        position: { x: 100, y: 0 },
        data: {
          kind: 'video' as const,
          title: 'Clip',
          prompt: 'motion',
          mediaId: 'video-source',
        },
      },
    ],
  }
}

test('a ZIP round trip restores image, video and assembly media into the destination user namespace', async () => {
  const source = createStudioMediaStore(new IDBFactory(), 'bundle-source')
  const target = createStudioMediaStore(new IDBFactory(), 'bundle-target')
  const project = projectWithMedia()
  await source.put(12, 'image-source', media('image bytes', 'image/png'))
  await source.put(12, 'video-source', media('video bytes', 'video/mp4'))
  await source.put(12, 'assembly-source', media('assembly bytes', 'video/mp4'))

  const bundle = await exportStudioProjectBundle(project, 12, source)
  const imported = await importStudioProjectBundle(bundle, 13, target)

  expect(bundle.type).toBe('application/zip')
  expect(imported.id).not.toBe(project.id)
  expect(imported.nodes[0].data.mediaId).not.toBe('image-source')
  expect(imported.nodes[1].data.mediaId).not.toBe('video-source')
  expect(imported.assembledMediaId).not.toBe('assembly-source')
  expect(
    await (await target.get(13, imported.nodes[0].data.mediaId ?? ''))?.text()
  ).toBe('image bytes')
  expect(
    await (await target.get(13, imported.nodes[1].data.mediaId ?? ''))?.text()
  ).toBe('video bytes')
  expect(
    await (await target.get(13, imported.assembledMediaId ?? ''))?.text()
  ).toBe('assembly bytes')
  expect(await target.get(12, 'image-source')).toBeNull()
})

test('a ZIP round trip restores a soundtrack into the destination user namespace', async () => {
  const source = createStudioMediaStore(new IDBFactory(), 'bundle-audio-source')
  const target = createStudioMediaStore(new IDBFactory(), 'bundle-audio-target')
  const project = {
    ...createStudioProject('Drama', 'original-project'),
    soundtrackMediaId: 'soundtrack-source',
    soundtrackVolume: 0.4,
  }
  await source.put(12, 'soundtrack-source', media('audio bytes', 'audio/mpeg'))

  const bundle = await exportStudioProjectBundle(project, 12, source)
  const imported = await importStudioProjectBundle(bundle, 13, target)

  expect(imported.soundtrackMediaId).toBeDefined()
  expect(imported.soundtrackMediaId).not.toBe('soundtrack-source')
  expect(imported.soundtrackVolume).toBe(0.4)
  expect(
    await (await target.get(13, imported.soundtrackMediaId ?? ''))?.text()
  ).toBe('audio bytes')
  expect(await target.get(12, 'soundtrack-source')).toBeNull()
})

test('a ZIP round trip restores voiceover audio into the destination user namespace', async () => {
  const source = createStudioMediaStore(new IDBFactory(), 'bundle-voice-source')
  const target = createStudioMediaStore(new IDBFactory(), 'bundle-voice-target')
  const project = {
    ...createStudioProject('Narrated', 'original-project'),
    voiceoverMediaId: 'voice-source',
    voiceoverVolume: 0.7,
  }
  await source.put(12, 'voice-source', media('narration', 'audio/mpeg'))
  const bundle = await exportStudioProjectBundle(project, 12, source)
  const imported = await importStudioProjectBundle(bundle, 13, target)
  expect(imported.voiceoverMediaId).toBeDefined()
  expect(imported.voiceoverMediaId).not.toBe('voice-source')
  expect(imported.voiceoverVolume).toBe(0.7)
  expect(
    await (await target.get(13, imported.voiceoverMediaId ?? ''))?.text()
  ).toBe('narration')
})

test('exports an unnormalized legacy video task without losing its media mapping', async () => {
  const source = createStudioMediaStore(
    new IDBFactory(),
    'bundle-legacy-source'
  )
  const target = createStudioMediaStore(
    new IDBFactory(),
    'bundle-legacy-target'
  )
  const project = createStudioProject('Legacy', 'legacy')
  project.nodes = [
    {
      id: 'video',
      type: 'studio',
      position: { x: 0, y: 0 },
      data: {
        kind: 'video',
        title: 'Video',
        prompt: 'scene',
        status: 'completed',
        taskId: 'task-legacy',
        mediaId: 'legacy-clip',
      },
    },
  ]
  await source.put(12, 'legacy-clip', media('legacy bytes', 'video/mp4'))
  const bundle = await exportStudioProjectBundle(project, 12, source)
  const imported = await importStudioProjectBundle(bundle, 13, target)
  expect(imported.nodes[0].data.takes?.[0].taskId).toBe('task-legacy')
  expect(imported.nodes[0].data.takes?.[0].mediaId).toBe(
    imported.nodes[0].data.mediaId
  )
})

test('export rejects a referenced media blob that is missing', async () => {
  const source = createStudioMediaStore(new IDBFactory(), 'bundle-missing')
  await expect(
    exportStudioProjectBundle(projectWithMedia(), 12, source)
  ).rejects.toThrow('missing')
})

test('export refuses a completed image whose remote result was never saved locally', async () => {
  const source = createStudioMediaStore(new IDBFactory(), 'bundle-remote-only')
  const project = createStudioProject('Remote-only image', 'remote-project')
  project.nodes = [
    {
      id: 'image',
      type: 'studio',
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        title: 'Frame',
        prompt: 'portrait',
        status: 'completed',
        outputUrl: 'https://images.example/temporary-result.png',
      },
    },
  ]
  await expect(exportStudioProjectBundle(project, 12, source)).rejects.toThrow(
    'studio.bundle.mediaMissing'
  )
})

test('export refuses a missing historical take even when the selected image is local', async () => {
  const source = createStudioMediaStore(
    new IDBFactory(),
    'bundle-take-remote-only'
  )
  const project = createStudioProject('Variants', 'variant-project')
  project.nodes = [
    {
      id: 'image',
      type: 'studio',
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        title: 'Frame',
        prompt: 'portrait',
        status: 'completed',
        mediaId: 'selected-local',
        takes: [
          {
            id: 'older',
            createdAt: '2026-09-26T00:00:00Z',
            prompt: 'portrait',
            status: 'completed',
            outputUrl: 'https://images.example/older.png',
          },
        ],
      },
    },
  ]
  await source.put(12, 'selected-local', media('selected', 'image/png'))
  await expect(exportStudioProjectBundle(project, 12, source)).rejects.toThrow(
    'studio.bundle.mediaMissing'
  )
})

test('a round trip restores take and asset media without retaining browser URLs', async () => {
  const source = createStudioMediaStore(
    new IDBFactory(),
    'bundle-nested-source'
  )
  const target = createStudioMediaStore(
    new IDBFactory(),
    'bundle-nested-target'
  )
  const project = projectWithMedia()
  project.nodes = project.nodes.slice(0, 1)
  project.assembledMediaId = undefined
  project.nodes[0].data.takes = [
    {
      id: 'take-1',
      createdAt: '2026-09-25T00:00:00.000Z',
      prompt: 'alternate',
      status: 'completed',
      mediaId: 'take-source',
      outputUrl: 'blob:local-only',
    },
  ]
  project.assets = [
    {
      id: 'asset-1',
      kind: 'character',
      title: 'Lead',
      prompt: 'character',
      mediaId: 'asset-source',
      outputUrl: 'blob:local-asset',
    },
  ]
  await source.put(12, 'image-source', media('image bytes', 'image/png'))
  await source.put(12, 'take-source', media('take bytes', 'image/png'))
  await source.put(12, 'asset-source', media('asset bytes', 'image/png'))

  const bundle = await exportStudioProjectBundle(project, 12, source)
  const imported = await importStudioProjectBundle(bundle, 13, target)

  expect(await bundle.text()).not.toContain('blob:local')
  expect(imported.nodes[0].data.takes?.[0].mediaId).not.toBe('take-source')
  expect(imported.assets?.[0].mediaId).not.toBe('asset-source')
  expect(imported.nodes[0].data.takes?.[0].outputUrl).toBeUndefined()
  expect(imported.assets?.[0].outputUrl).toBeUndefined()
  expect(
    await (
      await target.get(13, imported.nodes[0].data.takes?.[0].mediaId ?? '')
    )?.text()
  ).toBe('take bytes')
  expect(
    await (await target.get(13, imported.assets?.[0].mediaId ?? ''))?.text()
  ).toBe('asset bytes')
})

test('export rejects extra project fields so provider credentials cannot enter an archive', async () => {
  const source = createStudioMediaStore(new IDBFactory(), 'bundle-secret')
  const project = {
    ...createStudioProject('Drama', 'project'),
    providerApiKey: 'secret',
  }
  await expect(exportStudioProjectBundle(project, 12, source)).rejects.toThrow(
    'invalid'
  )
})

test('import rejects archive paths outside the media directory', async () => {
  const source = createStudioMediaStore(new IDBFactory(), 'bundle-path-source')
  const target = createStudioMediaStore(new IDBFactory(), 'bundle-path-target')
  await source.put(12, 'image-source', media('image bytes', 'image/png'))
  const project = projectWithMedia()
  project.nodes = project.nodes.slice(0, 1)
  project.assembledMediaId = undefined
  const bundle = await exportStudioProjectBundle(project, 12, source)
  const bytes = new Uint8Array(await bundle.arrayBuffer())
  const from = new TextEncoder().encode('media/0')
  const to = new TextEncoder().encode('../evil')
  for (let at = 0; at <= bytes.length - from.length; at += 1) {
    if (from.every((value, index) => bytes[at + index] === value)) {
      bytes.set(to, at)
    }
  }

  await expect(
    importStudioProjectBundle(new Blob([bytes]), 13, target)
  ).rejects.toThrow('invalid')
})

test('import rejects corrupted media bytes before saving them', async () => {
  const source = createStudioMediaStore(new IDBFactory(), 'bundle-crc-source')
  const target = createStudioMediaStore(new IDBFactory(), 'bundle-crc-target')
  const project = projectWithMedia()
  project.nodes = project.nodes.slice(0, 1)
  project.assembledMediaId = undefined
  await source.put(12, 'image-source', media('image bytes', 'image/png'))
  const bundle = await exportStudioProjectBundle(project, 12, source)
  const bytes = new Uint8Array(await bundle.arrayBuffer())
  const needle = new TextEncoder().encode('image bytes')
  for (let at = 0; at <= bytes.length - needle.length; at += 1) {
    if (needle.every((value, index) => bytes[at + index] === value)) {
      bytes[at] ^= 1
      break
    }
  }

  await expect(
    importStudioProjectBundle(new Blob([bytes]), 13, target)
  ).rejects.toThrow('invalid')
})

test('import removes newly stored media when a later store write fails', async () => {
  const source = createStudioMediaStore(
    new IDBFactory(),
    'bundle-rollback-source'
  )
  const target = createStudioMediaStore(
    new IDBFactory(),
    'bundle-rollback-target'
  )
  const project = projectWithMedia()
  project.assembledMediaId = undefined
  await source.put(12, 'image-source', media('image bytes', 'image/png'))
  await source.put(12, 'video-source', media('video bytes', 'video/mp4'))
  const bundle = await exportStudioProjectBundle(project, 12, source)
  const written: string[] = []
  const failingStore = {
    get: target.get,
    delete: target.delete,
    async put(userId: number, mediaId: string, blob: Blob) {
      await target.put(userId, mediaId, blob)
      written.push(mediaId)
      if (written.length === 2) throw new Error('storage failed')
    },
  }

  await expect(
    importStudioProjectBundle(bundle, 13, failingStore)
  ).rejects.toThrow('storage failed')
  expect(written).toHaveLength(2)
  for (const id of written) expect(await target.get(13, id)).toBeNull()
})

test('empty projects still require a valid user namespace', async () => {
  const store = createStudioMediaStore(new IDBFactory(), 'bundle-user-id')
  await expect(
    exportStudioProjectBundle(createStudioProject('Drama', 'p'), 0, store)
  ).rejects.toThrow('user ID')
  const bundle = await exportStudioProjectBundle(
    createStudioProject('Drama', 'p'),
    12,
    store
  )
  await expect(importStudioProjectBundle(bundle, 0, store)).rejects.toThrow(
    'user ID'
  )
})
