/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { webcrypto, createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import type { StudioProject } from '../local-projects'
import { studioCloudRequest } from '../studio-cloud'
import { studioProductionSchema } from '../studio-production'
import { StudioRecipeGallery } from '../studio-recipe-gallery'
import {
  importStudioSampleFilm,
  readStudioSampleImport,
  saveStudioSampleImport,
  studioSampleFilmSchema,
  studioSampleManifestSchema,
  type StudioSampleFilm,
  type StudioSampleImportState,
} from '../studio-video-recipes'
import { addStudioShot, createStudioProject } from '../workspace'

vi.mock('@/lib/api', () => ({ api: { put: vi.fn() } }))
vi.mock('../studio-cloud', async (original) => ({
  ...(await original<typeof import('../studio-cloud')>()),
  studioCloudRequest: vi.fn(),
}))

const bytes = new Uint8Array([1, 2, 3, 4])
const sample: StudioSampleFilm = {
  id: 'story',
  version: 1,
  duration: 3.0625,
  width: 384,
  height: 224,
  film_url: '/studio-examples/story/film.mp4',
  poster_url: '/studio-examples/story/poster.jpg',
  project_url: '/studio-examples/story/project.json',
  source: 'Original local generation',
  license: 'Model and source asset terms apply',
  verification: 'verified',
  notes: 'Three second visual excerpt',
  inputs: [],
  media: [
    {
      id: 'film',
      url: '/studio-examples/story/source.mp4',
      mime_type: 'video/mp4',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
    },
  ],
}
const source = addStudioShot(
  createStudioProject('Story', 'sample-story'),
  'shot',
  { text: 'text', image: 'image', video: 'video' },
  'A fox goes home'
)
source.nodes = source.nodes.map((node) =>
  node.id !== 'video'
    ? node
    : {
        ...node,
        data: {
          ...node.data,
          mediaId: 'film',
          selectedTakeId: 'original-take',
          takes: [
            {
              id: 'original-take',
              prompt: 'Fox returns home',
              createdAt: '2026-10-18',
              status: 'completed',
              mediaId: 'film',
              requestSnapshot: JSON.stringify({
                assets: [
                  { id: 'subject', mediaId: 'film', versionId: 'reference-v1' },
                ],
              }),
            },
          ],
        },
      }
)
source.production = studioProductionSchema.parse({
  timeline: [
    {
      id: 'clip',
      nodeId: 'video',
      takeId: 'original-take',
      trimStart: 0.5,
      trimEnd: 2.5,
      caption: 'Home at last',
    },
  ],
})
let saved: StudioProject | undefined
let failSave = false
let failRead = false
const uploaded = vi.mocked(api.put)

beforeEach(() => {
  saved = undefined
  failSave = false
  failRead = false
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('manifest.json')) {
        return new Response(JSON.stringify({ version: 1, samples: [sample] }))
      }
      if (url.endsWith('project.json')) {
        return new Response(JSON.stringify(source))
      }
      return new Response(bytes)
    })
  )
  uploaded.mockResolvedValue({ data: { success: true } })
  vi.mocked(studioCloudRequest).mockImplementation(
    async <T,>(_path: string, method = 'GET', body?: unknown): Promise<T> => {
      if (method === 'PUT') {
        saved = (body as { document: StudioProject }).document
        if (failSave) throw new Error('Response lost')
        return { document: saved } as T
      }
      if (failRead) throw new Error('Read unavailable')
      return { document: saved } as T
    }
  )
})
afterEach(() => vi.unstubAllGlobals())

function importState(): StudioSampleImportState {
  return {
    projectId: 'independent-copy',
    createdAt: '2026-10-18',
    media: {},
    uploaded: new Set(),
  }
}

test('copying a film retains its complete timeline and original Take while remapping immutable media IDs', async () => {
  const state = importState()
  const project = await importStudioSampleFilm(sample, state)
  expect(project.id).toBe('independent-copy')
  const videoTake = project.nodes.find((node) => node.id === 'video')?.data
    .takes?.[0]
  expect(JSON.parse(videoTake?.requestSnapshot || '{}').assets[0].mediaId).toBe(
    state.media.film
  )
  expect(project.production?.timeline[0]).toMatchObject({
    trimStart: 0.5,
    trimEnd: 2.5,
    caption: 'Home at last',
    takeId: 'original-take',
  })
  expect(project.nodes.find((node) => node.id === 'video')?.data.mediaId).toBe(
    state.media.film
  )
  expect(
    project.nodes.find((node) => node.id === 'video')?.data.takes?.[0].prompt
  ).toBe('Fox returns home')
  expect(source.nodes.find((node) => node.id === 'video')?.data.mediaId).toBe(
    'film'
  )
  expect(uploaded).toHaveBeenCalledOnce()
})

test('an altered sample media file is rejected before upload or project creation', async () => {
  await expect(
    importStudioSampleFilm(
      { ...sample, media: [{ ...sample.media[0], sha256: '0'.repeat(64) }] },
      importState()
    )
  ).rejects.toThrow('integrity check')
  expect(uploaded).not.toHaveBeenCalled()
  expect(studioCloudRequest).not.toHaveBeenCalled()
})

test('an incomplete manifest cannot silently discard source clips from an editable sample', async () => {
  await expect(
    importStudioSampleFilm({ ...sample, media: [] }, importState())
  ).rejects.toThrow('every project asset')
  expect(uploaded).not.toHaveBeenCalled()
})

test('a lost save response is reconciled and a later retry keeps the same project and uploaded assets', async () => {
  const state = importState()
  failSave = true
  failRead = true
  await expect(importStudioSampleFilm(sample, state)).rejects.toThrow(
    'Response lost'
  )
  failRead = false
  const result = await importStudioSampleFilm(sample, state)
  expect(result.id).toBe('independent-copy')
  expect(uploaded).toHaveBeenCalledOnce()
})

test('changing account during asset download stops the import before any upload', async () => {
  let current = true
  vi.mocked(fetch).mockImplementation(async (url) => {
    if (String(url).endsWith('project.json')) {
      return new Response(JSON.stringify(source))
    }
    current = false
    return new Response(bytes)
  })
  await expect(
    importStudioSampleFilm(sample, importState(), () => {
      if (!current) throw new Error('Account changed')
    })
  ).rejects.toThrow('Account changed')
  expect(uploaded).not.toHaveBeenCalled()
})

test('unreviewed sample films cannot be imported as verified examples', async () => {
  await expect(
    importStudioSampleFilm(
      { ...sample, verification: 'needs_review' },
      importState()
    )
  ).rejects.toThrow('awaiting review')
  expect(fetch).not.toHaveBeenCalled()
})

test('the gallery plays the actual film and keeps copying disabled for a viewer', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <StudioRecipeGallery readOnly onInstantiate={vi.fn()} />
    </QueryClientProvider>
  )
  const video = await screen.findByLabelText('Character story')
  expect(video).toHaveAttribute('src', '/studio-examples/story/film.mp4')
  expect(
    screen.getByRole('button', { name: 'Copy film as an editable project' })
  ).toBeDisabled()
  fireEvent.click(
    screen.getByRole('button', { name: 'Copy film as an editable project' })
  )
  expect(studioCloudRequest).not.toHaveBeenCalled()
})

test('sample URLs must resolve to bundled assets instead of arbitrary external media', () => {
  expect(
    studioSampleFilmSchema.safeParse({
      ...sample,
      film_url: 'https://external.example/sample.mp4',
    }).success
  ).toBe(false)
})

test('a persisted import resumes after reload with the same project/media IDs and uploaded assets', () => {
  const state: StudioSampleImportState = {
    projectId: crypto.randomUUID(),
    createdAt: '2026-10-18T00:00:00Z',
    media: { film: crypto.randomUUID() },
    uploaded: new Set(['film']),
  }
  const key = 'newapi:studio:sample-import:v1:user:1:story:1'
  saveStudioSampleImport(localStorage, key, state)
  const restored = readStudioSampleImport(localStorage, key)
  expect(restored?.projectId).toBe(state.projectId)
  expect(restored?.media).toEqual(state.media)
  expect(restored?.uploaded.has('film')).toBe(true)
  localStorage.removeItem(key)
  localStorage.setItem(key, '{broken')
  expect(readStudioSampleImport(localStorage, key)).toBeUndefined()
  localStorage.removeItem(key)
})

test('all six published real samples copy their complete validated projects with exact bundled asset hashes', async () => {
  const root = new NodeURL('../../../../public/', import.meta.url)
  const catalog = studioSampleManifestSchema.parse(
    JSON.parse(
      readFileSync(new NodeURL('studio-examples/manifest.json', root), 'utf8')
    )
  )
  expect(new Set(catalog.samples.map((item) => item.id))).toEqual(
    new Set(['store', 'product', 'story', 'explain', 'presenter', 'music'])
  )
  vi.mocked(fetch).mockImplementation(
    async (url) =>
      new Response(
        new Uint8Array(readFileSync(new NodeURL(`.${String(url)}`, root)))
      )
  )
  for (const item of catalog.samples) {
    expect(item.verification).toBe('verified')
    const state = { ...importState(), projectId: crypto.randomUUID() }
    const copied = await importStudioSampleFilm(item, state)
    expect(copied.id).toBe(state.projectId)
    expect(copied.nodes.length).toBeGreaterThanOrEqual(5)
    expect(copied.production?.timeline).toHaveLength(1)
    expect(copied.production?.audioTracks.length).toBeGreaterThan(0)
    expect(copied.assembledMediaId).toBe(state.media[`sample-${item.id}-film`])
    const video = copied.nodes.find(
      (node) => node.id === `sample-${item.id}-video-node`
    )
    const originalTake = video?.data.takes?.[0]
    expect(
      JSON.parse(originalTake?.requestSnapshot || '{}').assets[0].mediaId
    ).toBe(copied.assets?.[0].mediaId)
  }
})
