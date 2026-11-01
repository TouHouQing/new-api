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
import { Blob as NodeBlob, Buffer } from 'node:buffer'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import {
  serializeStudioProjectExport,
  type StudioProject,
} from '../local-projects'
import { createStudioMediaStore } from '../media-store'
import {
  mapStudioMediaReferences,
  studioDocumentMediaIds,
} from '../studio-media-references'
import { studioProductionSchema } from '../studio-production'
import {
  exportStudioProjectBundle,
  importStudioProjectBundle,
} from '../studio-project-bundle'
import { addStudioShot, createStudioProject } from '../workspace'

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

type TestBundleManifest = {
  project: StudioProject
  media: { path: string; type: string; size: number }[]
  takeAuxiliaryMedia?: Record<string, string>
  productionMedia?: Record<string, string>
  documentMedia?: Record<string, string>
}

async function rewriteBundleManifest(
  bundle: Blob,
  update: (manifest: TestBundleManifest) => void,
  omit: string[] = []
): Promise<Blob> {
  // Build real stored ZIP fixtures with independently recalculated checksums,
  // so missing references test the manifest contract rather than CRC failure.
  const bytes = new Uint8Array(await bundle.arrayBuffer())
  const view = new DataView(bytes.buffer)
  const files: { path: string; blob: Blob }[] = []
  for (let at = 0; view.getUint32(at, true) === 0x04034b50; ) {
    const size = view.getUint32(at + 18, true)
    const nameLength = view.getUint16(at + 26, true)
    const start = at + 30 + nameLength + view.getUint16(at + 28, true)
    const path = new TextDecoder().decode(
      bytes.slice(at + 30, at + 30 + nameLength)
    )
    let blob = bundle.slice(start, start + size)
    if (path === 'project.json') {
      const manifest = JSON.parse(await blob.text()) as TestBundleManifest
      update(manifest)
      blob = new Blob([JSON.stringify(manifest)])
    }
    if (!omit.includes(path)) files.push({ path, blob })
    at = start + size
  }
  const parts: BlobPart[] = []
  const central: ArrayBuffer[] = []
  let offset = 0
  for (const file of files) {
    const body = new Uint8Array(await file.blob.arrayBuffer())
    let checksum = 0xffffffff
    for (const byte of body) {
      checksum ^= byte
      for (let bit = 0; bit < 8; bit += 1) {
        checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0)
      }
    }
    checksum = (checksum ^ 0xffffffff) >>> 0
    const name = new TextEncoder().encode(file.path)
    const local = new Uint8Array(30 + name.length)
    const header = new DataView(local.buffer)
    header.setUint32(0, 0x04034b50, true)
    header.setUint16(4, 20, true)
    header.setUint16(6, 0x0800, true)
    header.setUint32(14, checksum, true)
    header.setUint32(18, body.length, true)
    header.setUint32(22, body.length, true)
    header.setUint16(26, name.length, true)
    local.set(name, 30)
    const entry = new Uint8Array(46 + name.length)
    const index = new DataView(entry.buffer)
    index.setUint32(0, 0x02014b50, true)
    index.setUint16(4, 20, true)
    index.setUint16(6, 20, true)
    index.setUint16(8, 0x0800, true)
    index.setUint32(16, checksum, true)
    index.setUint32(20, body.length, true)
    index.setUint32(24, body.length, true)
    index.setUint16(28, name.length, true)
    index.setUint32(42, offset, true)
    entry.set(name, 46)
    central.push(entry.buffer)
    parts.push(local.buffer, file.blob)
    offset += local.length + body.length
  }
  const end = new ArrayBuffer(22)
  const trailer = new DataView(end)
  trailer.setUint32(0, 0x06054b50, true)
  trailer.setUint16(8, files.length, true)
  trailer.setUint16(10, files.length, true)
  trailer.setUint32(
    12,
    central.reduce((sum, entry) => sum + entry.byteLength, 0),
    true
  )
  trailer.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end], { type: 'application/zip' })
}

function auxiliaryProject(): {
  project: StudioProject
  blobs: [string, Blob][]
} {
  const project = projectWithMedia()
  project.nodes = project.nodes.slice(0, 1)
  project.assembledMediaId = undefined
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4WQAAAAASUVORK5CYII=',
    'base64'
  )
  const wav = new Uint8Array(52)
  const wave = new DataView(wav.buffer)
  wav.set(new TextEncoder().encode('RIFF'), 0)
  wave.setUint32(4, 44, true)
  wav.set(new TextEncoder().encode('WAVEfmt '), 8)
  wave.setUint32(16, 16, true)
  wave.setUint16(20, 1, true)
  wave.setUint16(22, 1, true)
  wave.setUint32(24, 8000, true)
  wave.setUint32(28, 16000, true)
  wave.setUint16(32, 2, true)
  wave.setUint16(34, 16, true)
  wav.set(new TextEncoder().encode('data'), 36)
  wave.setUint32(40, 8, true)
  ;[-32768, -1, 0, 32767].forEach((sample, index) =>
    wave.setInt16(44 + index * 2, sample, true)
  )
  const makeBlob = (
    parts: ConstructorParameters<typeof NodeBlob>[0],
    type: string
  ) => new NodeBlob(parts, { type }) as unknown as Blob
  const blobs: [string, Blob][] = [
    ['image-source', makeBlob([png], 'image/png')],
    ['aux-mask', makeBlob([png], 'image/png')],
    ['aux-depth', makeBlob([png], 'image/png')],
    ['aux-vocals', makeBlob([wav], 'audio/wav')],
    ['aux-drums', makeBlob([wav], 'audio/wav')],
    ['aux-transcript', media('{"text":"你好","words":[]}', 'application/json')],
    [
      'aux-subtitles',
      media('1\n00:00:00,000 --> 00:00:00,500\n你好\n', 'text/plain'),
    ],
    [
      'aux-analysis',
      media('{"confidence":0.5,"reviewed":false}', 'application/json'),
    ],
  ]
  const auxiliary = blobs.slice(1).map(([mediaId, blob]) => ({
    role: mediaId.slice(4),
    mediaId,
    mimeType: blob.type,
  }))
  const take = {
    id: 'take-1',
    createdAt: '2026-10-18T00:00:00Z',
    prompt: 'owned bytes',
    status: 'completed' as const,
    mediaId: 'image-source',
    auxiliary,
  }
  project.nodes[0].data.takes = [
    take,
    {
      ...take,
      id: 'take-2',
      auxiliary: [
        auxiliary[0],
        {
          role: 'source',
          mediaId: 'image-source',
          mimeType: 'image/png',
        },
      ],
    },
  ]
  project.production = studioProductionSchema.parse({
    audioTracks: [{ id: 'shared-audio', mediaId: 'aux-vocals' }],
  })
  return { project, blobs }
}

function projectWithActiveMediaReferences(): {
  project: StudioProject
  snapshot: string
  bytes: Blob
} {
  const project = projectWithMedia()
  project.nodes = project.nodes.slice(0, 1)
  project.nodes.push({
    id: 'draft-output',
    type: 'studio',
    position: { x: 100, y: 0 },
    data: { kind: 'image', title: 'Image tool output', prompt: '' },
  })
  project.assembledMediaId = undefined
  const snapshot = JSON.stringify({
    media_id: 'historical-receipt-only',
    reference_media_ids: ['image-source', 'historical-unavailable-reference'],
    note: 'Immutable historical request, preserve its exact bytes',
  })
  project.nodes[0].data.takes = [
    {
      id: 'take-original',
      prompt: 'original',
      status: 'completed',
      mediaId: 'image-source',
      createdAt: '2026-10-19T00:00:00Z',
      requestSnapshot: snapshot,
    },
  ]
  const draft = {
    node_id: 'draft-output',
    action: 'image_upscale',
    model: 'studio-image-upscale',
    prompt: '',
    seconds: 1,
    reference_media_ids: ['image-source', 'draft-only-source'],
  }
  project.production = studioProductionSchema.parse({
    mediaDraft: draft,
    mediaDrafts: [draft, { ...draft, node_id: 'image-node' }],
  })
  const bytes = new NodeBlob(
    [
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4WQAAAAASUVORK5CYII=',
        'base64'
      ),
    ],
    { type: 'image/png' }
  ) as unknown as Blob
  return { project, snapshot, bytes }
}

test('active media drafts preserve exact reference bytes and aliases across users without rewriting historical receipts', async () => {
  const source = createStudioMediaStore(new IDBFactory(), 'active-draft-source')
  const target = createStudioMediaStore(new IDBFactory(), 'active-draft-target')
  const { project, snapshot, bytes } = projectWithActiveMediaReferences()
  await source.put(12, 'image-source', bytes)
  await source.put(12, 'draft-only-source', bytes)
  const bundle = await exportStudioProjectBundle(project, 12, source)
  const imported = await importStudioProjectBundle(bundle, 13, target)
  const refs = imported.production?.mediaDraft?.reference_media_ids
  if (!refs) throw new Error('Imported active draft is missing')
  expect(refs).toHaveLength(2)
  expect(refs?.[0]).toBe(imported.nodes[0].data.mediaId)
  expect(refs?.[0]).not.toBe('image-source')
  expect(refs?.[1]).not.toBe('draft-only-source')
  expect(
    imported.production?.mediaDrafts.map((draft) => draft.reference_media_ids)
  ).toEqual([refs, refs])
  expect(await (await target.get(13, refs[1]))?.arrayBuffer()).toEqual(
    await bytes.arrayBuffer()
  )
  expect((await target.get(13, refs[1]))?.type).toBe('image/png')
  expect(imported.nodes[0].data.takes?.[0].requestSnapshot).toBe(snapshot)
  expect([...studioDocumentMediaIds(imported)]).not.toContain(
    'historical-unavailable-reference'
  )
  expect(project.production?.mediaDraft?.reference_media_ids).toEqual([
    'image-source',
    'draft-only-source',
  ])
})

test('missing draft-only reference source rejects export instead of producing an incomplete editable backup', async () => {
  const source = createStudioMediaStore(new IDBFactory(), 'draft-reference-gap')
  const { project, bytes } = projectWithActiveMediaReferences()
  await source.put(12, 'image-source', bytes)
  await expect(exportStudioProjectBundle(project, 12, source)).rejects.toThrow(
    'missing'
  )
})

test('a new bundle missing active draft reference mapping rejects before destination writes', async () => {
  const source = createStudioMediaStore(
    new IDBFactory(),
    'draft-bad-map-source'
  )
  const target = createStudioMediaStore(
    new IDBFactory(),
    'draft-bad-map-target'
  )
  const { project, bytes } = projectWithActiveMediaReferences()
  await source.put(12, 'image-source', bytes)
  await source.put(12, 'draft-only-source', bytes)
  const bundle = await exportStudioProjectBundle(project, 12, source)
  const missing = await rewriteBundleManifest(bundle, (manifest) => {
    delete manifest.productionMedia?.['draft-only-source']
    const path = manifest.documentMedia?.['draft-only-source']
    if (path && manifest.documentMedia) {
      delete manifest.documentMedia['draft-only-source']
      manifest.documentMedia['unrelated-reference'] = path
    }
  })
  const put = vi.fn(target.put)
  await expect(
    importStudioProjectBundle(missing, 13, { ...target, put })
  ).rejects.toThrow('invalid')
  expect(put).not.toHaveBeenCalled()
})

test('media reference helpers recognize only explicit snake fields and never parse historical strings', () => {
  const snapshot = JSON.stringify({
    media_id: 'receipt-only',
    reference_media_ids: ['old-reference'],
  })
  const document = {
    operation: { media_id: 'source', reference_media_ids: ['reference'] },
    custom_media_id: 'non-media-text',
    custom_media_ids: ['non-media-list'],
    requestSnapshot: snapshot,
  }
  expect([...studioDocumentMediaIds(document)].sort()).toEqual([
    'reference',
    'source',
  ])
  expect(mapStudioMediaReferences(document, (id) => `new-${id}`)).toEqual({
    operation: {
      media_id: 'new-source',
      reference_media_ids: ['new-reference'],
    },
    custom_media_id: 'non-media-text',
    custom_media_ids: ['non-media-list'],
    requestSnapshot: snapshot,
  })
})

test('seven auxiliary files round trip exact binary bytes across users and share one archive entry per media ID', async () => {
  const source = createStudioMediaStore(new IDBFactory(), 'aux-source')
  const target = createStudioMediaStore(new IDBFactory(), 'aux-target')
  const { project, blobs } = auxiliaryProject()
  for (const [id, blob] of blobs) await source.put(12, id, blob)
  const get = vi.fn(source.get)
  const bundle = await exportStudioProjectBundle(project, 12, {
    ...source,
    get,
  })
  const imported = await importStudioProjectBundle(bundle, 13, target)
  const auxiliary = imported.nodes[0].data.takes?.[0].auxiliary || []
  expect(auxiliary).toHaveLength(7)
  for (const [index, [originalId, original]] of blobs.slice(1).entries()) {
    const entry = auxiliary[index]
    expect(entry.mediaId).not.toBe(originalId)
    expect(entry.mimeType).toBe(original.type)
    expect(await (await target.get(13, entry.mediaId))?.arrayBuffer()).toEqual(
      await original.arrayBuffer()
    )
    expect(await target.get(12, entry.mediaId)).toBeNull()
    expect(await target.get(13, originalId)).toBeNull()
  }
  expect(imported.nodes[0].data.takes?.[1].auxiliary?.[0].mediaId).toBe(
    auxiliary[0].mediaId
  )
  expect(imported.nodes[0].data.takes?.[1].auxiliary?.[1].mediaId).toBe(
    imported.nodes[0].data.mediaId
  )
  expect(imported.production?.audioTracks[0].mediaId).toBe(auxiliary[2].mediaId)
  expect(get.mock.calls.map(([, id]) => id).sort()).toEqual(
    blobs.map(([id]) => id).sort()
  )
  const bytes = new Uint8Array(await bundle.arrayBuffer())
  expect(new DataView(bytes.buffer).getUint16(bytes.length - 12, true)).toBe(9)
})

test('export rejects an auxiliary file missing from source storage', async () => {
  const source = createStudioMediaStore(new IDBFactory(), 'aux-missing-source')
  const { project, blobs } = auxiliaryProject()
  for (const [id, blob] of blobs) {
    if (id !== 'aux-mask') await source.put(12, id, blob)
  }
  await expect(exportStudioProjectBundle(project, 12, source)).rejects.toThrow(
    'missing'
  )
})

test('legacy version 1 without auxiliary metadata remains importable', async () => {
  const source = createStudioMediaStore(new IDBFactory(), 'aux-legacy-source')
  const target = createStudioMediaStore(new IDBFactory(), 'aux-legacy-target')
  const project = projectWithMedia()
  project.nodes = project.nodes.slice(0, 1)
  project.assembledMediaId = undefined
  await source.put(
    12,
    'image-source',
    media('legacy primary bytes', 'image/png')
  )
  const bundle = await exportStudioProjectBundle(project, 12, source)
  const legacy = await rewriteBundleManifest(bundle, (manifest) => {
    delete manifest.takeAuxiliaryMedia
    delete manifest.documentMedia
  })
  const imported = await importStudioProjectBundle(legacy, 13, target)
  expect(imported.title).toBe(project.title)
  expect(
    await (await target.get(13, imported.nodes[0].data.mediaId || ''))?.text()
  ).toBe('legacy primary bytes')
})

test('legacy version 1 containing an unpackaged auxiliary reference rejects before saving foreign IDs', async () => {
  const source = createStudioMediaStore(
    new IDBFactory(),
    'aux-legacy-gap-source'
  )
  const target = createStudioMediaStore(
    new IDBFactory(),
    'aux-legacy-gap-target'
  )
  const project = projectWithMedia()
  project.nodes = project.nodes.slice(0, 1)
  project.assembledMediaId = undefined
  project.nodes[0].data.takes = [
    {
      id: 'take',
      createdAt: '2026-10-18T00:00:00Z',
      prompt: 'owned',
      status: 'completed',
      mediaId: 'image-source',
    },
  ]
  await source.put(12, 'image-source', media('owned primary', 'image/png'))
  const bundle = await exportStudioProjectBundle(project, 12, source)
  const legacy = await rewriteBundleManifest(bundle, (manifest) => {
    delete manifest.takeAuxiliaryMedia
    delete manifest.documentMedia
    const take = manifest.project.nodes[0].data.takes?.[0]
    if (!take) throw new Error('fixture take missing')
    take.auxiliary = [
      {
        role: 'depth',
        mediaId: 'foreign-old-auxiliary',
        mimeType: 'image/png',
      },
    ]
  })
  const put = vi.fn(target.put)
  await expect(
    importStudioProjectBundle(legacy, 13, { ...target, put })
  ).rejects.toThrow('invalid')
  expect(put).not.toHaveBeenCalled()
})

test('a declared auxiliary entry absent from ZIP rejects before any destination media write', async () => {
  const source = createStudioMediaStore(new IDBFactory(), 'aux-entry-source')
  const target = createStudioMediaStore(new IDBFactory(), 'aux-entry-target')
  const { project, blobs } = auxiliaryProject()
  for (const [id, blob] of blobs) await source.put(12, id, blob)
  const bundle = await exportStudioProjectBundle(project, 12, source)
  const missing = await rewriteBundleManifest(bundle, () => {}, ['media/2'])
  const put = vi.fn(target.put)
  await expect(
    importStudioProjectBundle(missing, 13, { ...target, put })
  ).rejects.toThrow('invalid')
  expect(put).not.toHaveBeenCalled()
})

test('legacy version 1 restores every auxiliary byte explicitly mapped by productionMedia', async () => {
  const source = createStudioMediaStore(
    new IDBFactory(),
    'aux-old-complete-source'
  )
  const target = createStudioMediaStore(
    new IDBFactory(),
    'aux-old-complete-target'
  )
  const { project, blobs } = auxiliaryProject()
  for (const [id, blob] of blobs) await source.put(12, id, blob)
  const bundle = await exportStudioProjectBundle(project, 12, source)
  const legacy = await rewriteBundleManifest(bundle, (manifest) => {
    manifest.productionMedia = {
      ...manifest.productionMedia,
      ...manifest.takeAuxiliaryMedia,
    }
    delete manifest.takeAuxiliaryMedia
    delete manifest.documentMedia
  })
  const imported = await importStudioProjectBundle(legacy, 13, target)
  const auxiliary = imported.nodes[0].data.takes?.[0].auxiliary || []
  expect(auxiliary).toHaveLength(7)
  for (const [index, [id, original]] of blobs.slice(1).entries()) {
    expect(auxiliary[index].mediaId).not.toBe(id)
    expect(
      await (await target.get(13, auxiliary[index].mediaId))?.arrayBuffer()
    ).toEqual(await original.arrayBuffer())
  }
  expect(imported.production?.audioTracks[0].mediaId).toBe(auxiliary[2].mediaId)
})

test('legacy version 1 with only some auxiliary IDs in productionMedia rejects before writes', async () => {
  const source = createStudioMediaStore(
    new IDBFactory(),
    'aux-old-partial-source'
  )
  const target = createStudioMediaStore(
    new IDBFactory(),
    'aux-old-partial-target'
  )
  const { project, blobs } = auxiliaryProject()
  for (const [id, blob] of blobs) await source.put(12, id, blob)
  const bundle = await exportStudioProjectBundle(project, 12, source)
  const partial = await rewriteBundleManifest(bundle, (manifest) => {
    manifest.productionMedia = {
      ...manifest.productionMedia,
      ...manifest.takeAuxiliaryMedia,
    }
    delete manifest.productionMedia['aux-mask']
    delete manifest.takeAuxiliaryMedia
    delete manifest.documentMedia
  })
  const put = vi.fn(target.put)
  await expect(
    importStudioProjectBundle(partial, 13, { ...target, put })
  ).rejects.toThrow('invalid')
  expect(put).not.toHaveBeenCalled()
})

test('missing auxiliary map cannot use a document-only fallback as a legacy production mapping', async () => {
  const source = createStudioMediaStore(
    new IDBFactory(),
    'aux-document-only-source'
  )
  const target = createStudioMediaStore(
    new IDBFactory(),
    'aux-document-only-target'
  )
  const { project, blobs } = auxiliaryProject()
  for (const [id, blob] of blobs) await source.put(12, id, blob)
  const bundle = await exportStudioProjectBundle(project, 12, source)
  const missing = await rewriteBundleManifest(bundle, (manifest) => {
    delete manifest.takeAuxiliaryMedia
  })
  const put = vi.fn(target.put)
  await expect(
    importStudioProjectBundle(missing, 13, { ...target, put })
  ).rejects.toThrow('invalid')
  expect(put).not.toHaveBeenCalled()
})

test('a bundle preserves 3D asset versions and all node source-reference bytes in the destination namespace', async () => {
  const source = createStudioMediaStore(new IDBFactory(), 'all-refs-source')
  const target = createStudioMediaStore(new IDBFactory(), 'all-refs-target')
  const project = projectWithMedia()
  project.assembledMediaId = undefined
  project.nodes[0].data.reworkRegion = {
    sourceMediaId: 'image-source',
    x: 0,
    y: 0,
    width: 2,
    height: 2,
  }
  project.nodes[1].data.reworkRange = {
    sourceNodeId: 'video-node',
    sourceMediaId: 'video-source',
    start: 0.1,
    end: 0.8,
  }
  project.nodes[1].data.videoKeyframes = [
    { mediaId: 'frame-source', time: 0.5 },
  ]
  project.assets = [
    {
      id: 'actor',
      kind: 'character',
      title: 'Actor',
      prompt: 'owned',
      mediaId: 'image-source',
      modelMediaId: 'model-current',
      versions: [
        {
          id: 'v1',
          createdAt: '2026-10-18T00:00:00Z',
          prompt: 'owned first version',
          modelMediaId: 'model-v1',
        },
      ],
    },
  ]
  const glb = (label: string): Blob => {
    const json = new TextEncoder().encode(
      JSON.stringify({ asset: { version: '2.0' }, extras: { label } })
    )
    const length = Math.ceil(json.length / 4) * 4
    const bytes = new Uint8Array(20 + length)
    bytes.fill(32, 20)
    const view = new DataView(bytes.buffer)
    view.setUint32(0, 0x46546c67, true)
    view.setUint32(4, 2, true)
    view.setUint32(8, bytes.length, true)
    view.setUint32(12, length, true)
    view.setUint32(16, 0x4e4f534a, true)
    bytes.set(json, 20)
    return new NodeBlob([bytes], {
      type: 'model/gltf-binary',
    }) as unknown as Blob
  }
  const blobs = new Map<string, Blob>([
    ['image-source', auxiliaryProject().blobs[0][1]],
    ['video-source', media('source video bytes', 'video/mp4')],
    ['frame-source', auxiliaryProject().blobs[1][1]],
    ['model-current', glb('current')],
    ['model-v1', glb('first')],
  ])
  for (const [id, blob] of blobs) await source.put(12, id, blob)
  const parameters = JSON.parse(
    serializeStudioProjectExport(project)
  ) as StudioProject
  expect(parameters.assets?.[0].modelMediaId).toBeUndefined()
  expect(parameters.assets?.[0].versions?.[0].modelMediaId).toBeUndefined()
  const imported = await importStudioProjectBundle(
    await exportStudioProjectBundle(project, 12, source),
    13,
    target
  )
  const pairs: [string, string | undefined][] = [
    ['image-source', imported.nodes[0].data.reworkRegion?.sourceMediaId],
    ['video-source', imported.nodes[1].data.reworkRange?.sourceMediaId],
    ['frame-source', imported.nodes[1].data.videoKeyframes?.[0].mediaId],
    ['model-current', imported.assets?.[0].modelMediaId],
    ['model-v1', imported.assets?.[0].versions?.[0].modelMediaId],
  ]
  for (const [oldId, newId] of pairs) {
    expect(newId).toBeTruthy()
    expect(newId).not.toBe(oldId)
    expect(await (await target.get(13, newId || ''))?.arrayBuffer()).toEqual(
      await blobs.get(oldId)?.arrayBuffer()
    )
    expect(await target.get(13, oldId)).toBeNull()
  }
  expect(imported.nodes[0].data.reworkRegion?.sourceMediaId).toBe(
    imported.nodes[0].data.mediaId
  )
  expect(imported.nodes[1].data.reworkRange?.sourceMediaId).toBe(
    imported.nodes[1].data.mediaId
  )
  expect(imported.assets?.[0].mediaId).toBe(imported.nodes[0].data.mediaId)
})

test('legacy asset models without an explicitly packaged mapping remain undefined', async () => {
  const source = createStudioMediaStore(new IDBFactory(), 'old-model-source')
  const target = createStudioMediaStore(new IDBFactory(), 'old-model-target')
  const project = createStudioProject('Legacy asset recipe', 'old-model-recipe')
  project.assets = [
    {
      id: 'actor',
      kind: 'character',
      title: 'Actor',
      prompt: 'owned',
      versions: [
        { id: 'v1', createdAt: '2026-10-18T00:00:00Z', prompt: 'first' },
      ],
    },
  ]
  const bundle = await exportStudioProjectBundle(project, 12, source)
  const legacy = await rewriteBundleManifest(bundle, (manifest) => {
    delete manifest.documentMedia
    delete manifest.takeAuxiliaryMedia
    const asset = manifest.project.assets?.[0]
    if (!asset?.versions?.[0]) throw new Error('asset fixture missing')
    asset.modelMediaId = 'foreign-lost-model'
    asset.versions[0].modelMediaId = 'foreign-lost-model-v1'
  })
  const imported = await importStudioProjectBundle(legacy, 13, target)
  expect(imported.assets?.[0].modelMediaId).toBeUndefined()
  expect(imported.assets?.[0].versions?.[0].modelMediaId).toBeUndefined()
})

test('a new document mapping cannot silently discard a declared 3D model even when all ZIP entries exist', async () => {
  const source = createStudioMediaStore(
    new IDBFactory(),
    'new-model-incomplete-source'
  )
  const target = createStudioMediaStore(
    new IDBFactory(),
    'new-model-incomplete-target'
  )
  const project = createStudioProject('Owned model', 'new-model-project')
  project.assets = [
    {
      id: 'actor',
      kind: 'character',
      title: 'Actor',
      prompt: 'owned',
      modelMediaId: 'model-source',
    },
  ]
  await source.put(
    12,
    'model-source',
    media('owned binary model bytes', 'model/gltf-binary')
  )
  const bundle = await exportStudioProjectBundle(project, 12, source)
  const malformed = await rewriteBundleManifest(bundle, (manifest) => {
    const path = manifest.documentMedia?.['model-source']
    if (!path) throw new Error('fixture model mapping missing')
    manifest.documentMedia = { 'unrelated-id': path }
  })
  const put = vi.fn(target.put)
  await expect(
    importStudioProjectBundle(malformed, 13, { ...target, put })
  ).rejects.toThrow('invalid')
  expect(put).not.toHaveBeenCalled()
})

test.each(['videoKeyframes', 'reworkRange', 'reworkRegion'] as const)(
  'legacy unmapped %s source rejects before destination writes',
  async (field) => {
    const source = createStudioMediaStore(new IDBFactory(), `old-node-${field}`)
    const target = createStudioMediaStore(new IDBFactory(), `new-node-${field}`)
    const project = projectWithMedia()
    project.nodes = project.nodes.slice(0, 1)
    project.assembledMediaId = undefined
    await source.put(12, 'image-source', media('owned image', 'image/png'))
    const bundle = await exportStudioProjectBundle(project, 12, source)
    const legacy = await rewriteBundleManifest(bundle, (manifest) => {
      delete manifest.documentMedia
      delete manifest.takeAuxiliaryMedia
      const data = manifest.project.nodes[0].data
      if (field === 'videoKeyframes') {
        data.videoKeyframes = [{ mediaId: 'foreign-frame', time: 0.5 }]
      }
      if (field === 'reworkRange') {
        data.reworkRange = {
          sourceNodeId: 'image-node',
          sourceMediaId: 'foreign-video',
          start: 0,
          end: 1,
        }
      }
      if (field === 'reworkRegion') {
        data.reworkRegion = {
          sourceMediaId: 'foreign-image',
          x: 0,
          y: 0,
          width: 2,
          height: 2,
        }
      }
    })
    const put = vi.fn(target.put)
    await expect(
      importStudioProjectBundle(legacy, 13, { ...target, put })
    ).rejects.toThrow('invalid')
    expect(put).not.toHaveBeenCalled()
  }
)

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

test('a ZIP round trip retains pinned asset versions and shot voiceover media', async () => {
  const source = createStudioMediaStore(
    new IDBFactory(),
    'bundle-shot-asset-source'
  )
  const target = createStudioMediaStore(
    new IDBFactory(),
    'bundle-shot-asset-target'
  )
  const project = addStudioShot(
    createStudioProject('Episode', 'episode'),
    'shot-1',
    { text: 'text', image: 'image', video: 'video' },
    'Opening'
  )
  const shot = project.shots?.[0]
  if (!shot) throw new Error('shot fixture is missing')
  shot.shotVoiceoverMediaId = 'voice-one'
  project.assets = [
    {
      id: 'actor',
      kind: 'character',
      title: 'Lead',
      prompt: 'red coat',
      mediaId: 'actor-current',
      versions: [
        {
          id: 'v1',
          createdAt: '2026-09-26T00:00:00Z',
          prompt: 'blue coat',
          mediaId: 'actor-v1',
        },
      ],
    },
  ]
  const video = project.nodes.find((node) => node.id === 'video')
  if (!video) throw new Error('video fixture is missing')
  video.data.assetIds = ['actor']
  video.data.assetVersionIds = { actor: 'v1' }
  await source.put(12, 'actor-current', media('red coat', 'image/png'))
  await source.put(12, 'actor-v1', media('blue coat', 'image/png'))
  await source.put(12, 'voice-one', media('dialogue', 'audio/mpeg'))

  const bundle = await exportStudioProjectBundle(project, 12, source)
  const imported = await importStudioProjectBundle(bundle, 13, target)
  const versionId = imported.assets?.[0].versions?.[0].mediaId
  const voiceId = imported.shots?.[0].shotVoiceoverMediaId
  expect(versionId).toBeTruthy()
  expect(voiceId).toBeTruthy()
  expect(await (await target.get(13, versionId || ''))?.text()).toBe(
    'blue coat'
  )
  expect(await (await target.get(13, voiceId || ''))?.text()).toBe('dialogue')
  expect(
    imported.nodes.find((node) => node.id === 'video')?.data.assetVersionIds
  ).toEqual({ actor: 'v1' })
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

test('export refuses an asset version whose remote image was never saved locally', async () => {
  const source = createStudioMediaStore(
    new IDBFactory(),
    'bundle-version-remote-only'
  )
  const project = createStudioProject('Remote-only version', 'remote-version')
  project.assets = [
    {
      id: 'actor',
      kind: 'character',
      title: 'Actor',
      prompt: 'portrait',
      versions: [
        {
          id: 'v1',
          createdAt: '2026-09-26T00:00:00Z',
          prompt: 'portrait',
          outputUrl: 'https://example.com/portrait.png',
        },
      ],
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

test('a production bundle copies audio tracks and prop references into the destination namespace', async () => {
  const source = createStudioMediaStore(
    new IDBFactory(),
    'production-bundle-source'
  )
  const target = createStudioMediaStore(
    new IDBFactory(),
    'production-bundle-target'
  )
  const project = {
    ...createStudioProject('Production', 'production'),
    production: studioProductionSchema.parse({
      audioTracks: [{ id: 'music', mediaId: 'music-source', volume: 0.4 }],
      props: [
        { id: 'box', title: 'Box', description: '', mediaIds: ['prop-source'] },
      ],
    }),
  }
  await source.put(12, 'music-source', media('music', 'audio/mpeg'))
  await source.put(12, 'prop-source', media('prop', 'image/png'))
  const bundle = await exportStudioProjectBundle(project, 12, source)
  const imported = await importStudioProjectBundle(bundle, 13, target)
  const musicId = imported.production?.audioTracks[0].mediaId || ''
  const propId = imported.production?.props[0].mediaIds[0] || ''
  expect(musicId).not.toBe('music-source')
  expect(propId).not.toBe('prop-source')
  expect(await (await target.get(13, musicId))?.text()).toBe('music')
  expect(await (await target.get(13, propId))?.text()).toBe('prop')
  expect(imported.production?.reviews).toEqual([])
})
