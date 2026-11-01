/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { t } from 'i18next'
import { z } from 'zod'

import { api } from '@/lib/api'

import { studioProjectSchema, type StudioProject } from './local-projects'
import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import {
  mapStudioMediaReferences,
  studioDocumentMediaIds,
} from './studio-media-references'

const samplePath = z
  .string()
  .regex(
    /^\/studio-examples\/[a-z0-9/_-]+\.(mp4|webm|wav|mp3|png|jpg|webp|json)$/
  )
export const studioSampleFilmSchema = z.object({
  id: z.enum(['store', 'product', 'story', 'explain', 'presenter', 'music']),
  version: z.number().int().positive(),
  duration: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  film_url: samplePath,
  poster_url: samplePath,
  project_url: samplePath,
  source: z.string().min(1),
  license: z.string().min(1),
  verification: z.enum(['verified', 'needs_review']),
  method: z.enum(['native-video', 'image-edit', 'speech-portrait']).optional(),
  notes: z.string(),
  inputs: z.array(
    z.object({ key: z.string(), label: z.string(), value: z.string() })
  ),
  media: z
    .array(
      z.object({
        id: z.string().min(1),
        url: samplePath,
        mime_type: z.string().min(1),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        bytes: z.number().int().positive(),
      })
    )
    .min(1),
})
export const studioSampleManifestSchema = z.object({
  version: z.literal(1),
  samples: z.array(studioSampleFilmSchema).max(6),
})
export type StudioSampleFilm = z.infer<typeof studioSampleFilmSchema>
export type StudioSampleImportState = {
  projectId: string
  createdAt: string
  media: Record<string, string>
  uploaded: Set<string>
}
const importReceiptSchema = z
  .object({
    version: z.literal(1),
    projectId: z.string().uuid(),
    createdAt: z.string().max(40),
    media: z.record(z.string().min(1).max(128), z.string().uuid()),
    uploaded: z.array(z.string().min(1).max(128)).max(64),
  })
  .refine((receipt) => receipt.uploaded.every((id) => !!receipt.media[id]))

export function readStudioSampleImport(
  storage: Pick<Storage, 'getItem'>,
  key: string
): StudioSampleImportState | undefined {
  const raw = storage.getItem(key)
  if (!raw) return undefined
  try {
    const receipt = importReceiptSchema.parse(JSON.parse(raw))
    return {
      projectId: receipt.projectId,
      createdAt: receipt.createdAt,
      media: receipt.media,
      uploaded: new Set(receipt.uploaded),
    }
  } catch {
    return undefined
  }
}

export function saveStudioSampleImport(
  storage: Pick<Storage, 'setItem'>,
  key: string,
  state: StudioSampleImportState
): void {
  const receipt = importReceiptSchema.parse({
    version: 1,
    ...state,
    uploaded: [...state.uploaded],
  })
  storage.setItem(key, JSON.stringify(receipt))
}

/** Copy an actual editable project; never reconstruct it from recipe prompts. */
export async function importStudioSampleFilm(
  sample: StudioSampleFilm,
  state: StudioSampleImportState,
  assertCurrent: () => void = () => {},
  checkpoint: () => void = () => {}
): Promise<StudioProject> {
  assertCurrent()
  if (sample.verification !== 'verified') {
    throw new Error(
      t('This sample is awaiting review. Choose a verified example.')
    )
  }
  const response = await fetch(sample.project_url)
  assertCurrent()
  if (!response.ok) {
    throw new Error(t('The editable sample project is unavailable'))
  }
  const source = studioProjectSchema.parse(
    await response.json()
  ) as StudioProject
  assertCurrent()
  const assets = new Map(sample.media.map((item) => [item.id, item]))
  for (const id of studioDocumentMediaIds(source)) {
    if (!assets.has(id)) {
      throw new Error(
        t('The sample manifest does not include every project asset')
      )
    }
    if (!state.media[id]) state.media[id] = crypto.randomUUID()
  }
  checkpoint()
  for (const id of studioDocumentMediaIds(source)) {
    if (state.uploaded.has(id)) continue
    const asset = assets.get(id)
    if (!asset) throw new Error(t('The sample asset is unavailable'))
    const downloaded = await fetch(asset.url)
    assertCurrent()
    if (!downloaded.ok) {
      throw new Error(t('The sample asset could not be downloaded'))
    }
    const bytes = await downloaded.arrayBuffer()
    assertCurrent()
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    assertCurrent()
    const actual = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('')
    if (bytes.byteLength !== asset.bytes || actual !== asset.sha256) {
      throw new Error(t('The sample asset failed its integrity check'))
    }
    const uploaded = await api.put(
      `/api/studio/cloud/media/${encodeURIComponent(state.media[id])}`,
      new Blob([bytes], { type: asset.mime_type }),
      { headers: { 'Content-Type': asset.mime_type }, timeout: 180_000 }
    )
    assertCurrent()
    if (uploaded.data?.success !== true) {
      throw new Error(t('The sample asset could not be saved'))
    }
    state.uploaded.add(id)
    checkpoint()
  }
  const project = mapStudioMediaReferences(source, (id) => state.media[id])
  project.nodes = project.nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      takes: node.data.takes?.map((take) => {
        if (!take.requestSnapshot) return take
        try {
          const snapshot = mapStudioMediaReferences(
            JSON.parse(take.requestSnapshot),
            (id) => state.media[id]
          )
          return { ...take, requestSnapshot: JSON.stringify(snapshot) }
        } catch {
          return take
        }
      }),
    },
  }))
  project.id = state.projectId
  project.createdAt = state.createdAt
  project.updatedAt = state.createdAt
  try {
    assertCurrent()
    const saved = await studioCloudRequest<StudioCloudProject>(
      `/projects/${encodeURIComponent(project.id)}`,
      'PUT',
      { revision: 0, document: project }
    )
    assertCurrent()
    return studioProjectSchema.parse(saved.document) as StudioProject
  } catch (problem) {
    assertCurrent()
    // A lost successful response is reconciled against this import's unique ID.
    // Never overwrite an existing project or repeat model generation.
    try {
      const existing = await studioCloudRequest<StudioCloudProject>(
        `/projects/${encodeURIComponent(project.id)}`
      )
      assertCurrent()
      return studioProjectSchema.parse(existing.document) as StudioProject
    } catch {
      throw problem
    }
  }
}
