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
import { nanoid } from 'nanoid'

import {
  parseStudioProjectImport,
  serializeStudioProjectExport,
  type StudioProject,
} from './local-projects'

export type StudioMediaStore = {
  get(userId: number, mediaId: string): Promise<Blob | null>
  put(userId: number, mediaId: string, blob: Blob): Promise<void>
  delete(userId: number, mediaId: string): Promise<void>
}

type MediaEntry = { path: string; type: string; size: number }
type BundleManifest = {
  format: 'newapi-studio-project-bundle'
  version: 1
  project: StudioProject
  media: MediaEntry[]
  nodeMedia: (string | null)[]
  takeMedia: (string | null)[][]
  assetMedia: (string | null)[]
  assembledMedia: string | null
  soundtrackMedia?: string | null
}
type ZipEntry = { path: string; blob: Blob; crc: number; offset: number }
type ZipIndexEntry = { path: string; offset: number; size: number; crc: number }

const MAX_PROJECT_BYTES = 2_000_000
const MAX_MEDIA_BYTES = 512 * 1024 * 1024
const MAX_BUNDLE_BYTES = 1024 * 1024 * 1024
const MAX_MEDIA_ENTRIES = 1000
const CHUNK_BYTES = 1024 * 1024
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function invalidBundle(): never {
  throw new Error('studio project bundle is invalid')
}

function validateUserId(userId: number): void {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error('a valid user ID is required')
  }
}

function portableProject(project: StudioProject): StudioProject {
  const validated = parseStudioProjectImport(
    serializeStudioProjectExport(project)
  )
  return {
    ...validated,
    assembledMediaId: undefined,
    soundtrackMediaId: undefined,
    nodes: validated.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        mediaId: undefined,
        outputUrl: undefined,
        takes: node.data.takes?.map((take) => ({
          ...take,
          mediaId: undefined,
          outputUrl: undefined,
        })),
      },
    })),
    assets: validated.assets?.map((asset) => ({
      ...asset,
      mediaId: undefined,
      outputUrl: undefined,
    })),
  }
}

function readU16(view: DataView, offset: number): number {
  if (offset < 0 || offset + 2 > view.byteLength) invalidBundle()
  return view.getUint16(offset, true)
}

function readU32(view: DataView, offset: number): number {
  if (offset < 0 || offset + 4 > view.byteLength) invalidBundle()
  return view.getUint32(offset, true)
}

async function crc32(blob: Blob): Promise<number> {
  let crc = 0xffffffff
  for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
    const bytes = new Uint8Array(
      await blob.slice(offset, offset + CHUNK_BYTES).arrayBuffer()
    )
    for (const byte of bytes) {
      crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zipHeader(entry: ZipEntry): Uint8Array {
  const name = encoder.encode(entry.path)
  const bytes = new Uint8Array(30 + name.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x04034b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 0x0800, true)
  view.setUint32(14, entry.crc, true)
  view.setUint32(18, entry.blob.size, true)
  view.setUint32(22, entry.blob.size, true)
  view.setUint16(26, name.length, true)
  bytes.set(name, 30)
  return bytes
}

function zipCentralEntry(entry: ZipEntry): Uint8Array {
  const name = encoder.encode(entry.path)
  const bytes = new Uint8Array(46 + name.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x02014b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 20, true)
  view.setUint16(8, 0x0800, true)
  view.setUint32(16, entry.crc, true)
  view.setUint32(20, entry.blob.size, true)
  view.setUint32(24, entry.blob.size, true)
  view.setUint16(28, name.length, true)
  view.setUint32(42, entry.offset, true)
  bytes.set(name, 46)
  return bytes
}

async function writeZip(files: { path: string; blob: Blob }[]): Promise<Blob> {
  const parts: BlobPart[] = []
  const entries: ZipEntry[] = []
  let offset = 0
  for (const file of files) {
    const entry = { ...file, crc: await crc32(file.blob), offset }
    const header = zipHeader(entry)
    parts.push(header.buffer as ArrayBuffer, file.blob)
    entries.push(entry)
    offset += header.byteLength + file.blob.size
  }
  const centralOffset = offset
  for (const entry of entries) {
    const bytes = zipCentralEntry(entry)
    parts.push(bytes.buffer as ArrayBuffer)
    offset += bytes.byteLength
  }
  const end = new Uint8Array(22)
  const view = new DataView(end.buffer)
  view.setUint32(0, 0x06054b50, true)
  view.setUint16(8, entries.length, true)
  view.setUint16(10, entries.length, true)
  view.setUint32(12, offset - centralOffset, true)
  view.setUint32(16, centralOffset, true)
  parts.push(end.buffer as ArrayBuffer)
  return new Blob(parts, { type: 'application/zip' })
}

async function readZipIndex(file: Blob): Promise<Map<string, ZipIndexEntry>> {
  if (file.size < 22 || file.size > MAX_BUNDLE_BYTES) invalidBundle()
  const tailOffset = Math.max(0, file.size - 65_557)
  const tail = new Uint8Array(await file.slice(tailOffset).arrayBuffer())
  const tailView = new DataView(tail.buffer)
  let end = -1
  for (let at = tail.length - 22; at >= 0; at -= 1) {
    if (
      readU32(tailView, at) === 0x06054b50 &&
      at + 22 + readU16(tailView, at + 20) === tail.length
    ) {
      end = at
      break
    }
  }
  if (
    end < 0 ||
    readU16(tailView, end + 4) !== 0 ||
    readU16(tailView, end + 6) !== 0
  ) {
    invalidBundle()
  }
  const count = readU16(tailView, end + 10)
  if (
    count === 0 ||
    count > MAX_MEDIA_ENTRIES + 1 ||
    count !== readU16(tailView, end + 8)
  ) {
    invalidBundle()
  }
  const directorySize = readU32(tailView, end + 12)
  const directoryOffset = readU32(tailView, end + 16)
  if (
    directorySize > 128_000 ||
    directoryOffset + directorySize !== tailOffset + end
  ) {
    invalidBundle()
  }
  const directory = new Uint8Array(
    await file
      .slice(directoryOffset, directoryOffset + directorySize)
      .arrayBuffer()
  )
  const view = new DataView(directory.buffer)
  const entries = new Map<string, ZipIndexEntry>()
  let at = 0
  for (let index = 0; index < count; index += 1) {
    if (
      readU32(view, at) !== 0x02014b50 ||
      readU16(view, at + 8) !== 0x0800 ||
      readU16(view, at + 10) !== 0
    ) {
      invalidBundle()
    }
    const size = readU32(view, at + 24)
    const nameLength = readU16(view, at + 28)
    const extraLength = readU16(view, at + 30)
    const commentLength = readU16(view, at + 32)
    if (
      size !== readU32(view, at + 20) ||
      nameLength === 0 ||
      nameLength > 64 ||
      at + 46 + nameLength + extraLength + commentLength > directory.length
    ) {
      invalidBundle()
    }
    const path = decoder.decode(
      directory.subarray(at + 46, at + 46 + nameLength)
    )
    if (path !== 'project.json' && !/^media\/(0|[1-9]\d{0,3})$/.test(path)) {
      invalidBundle()
    }
    if (entries.has(path)) invalidBundle()
    entries.set(path, {
      path,
      size,
      crc: readU32(view, at + 16),
      offset: readU32(view, at + 42),
    })
    at += 46 + nameLength + extraLength + commentLength
  }
  if (at !== directory.length || !entries.has('project.json')) invalidBundle()
  return entries
}

async function readZipEntry(file: Blob, entry: ZipIndexEntry): Promise<Blob> {
  const header = new Uint8Array(
    await file.slice(entry.offset, entry.offset + 94).arrayBuffer()
  )
  const view = new DataView(header.buffer)
  if (
    readU32(view, 0) !== 0x04034b50 ||
    readU16(view, 6) !== 0x0800 ||
    readU16(view, 8) !== 0
  ) {
    invalidBundle()
  }
  const nameLength = readU16(view, 26)
  const extraLength = readU16(view, 28)
  if (nameLength !== encoder.encode(entry.path).length || nameLength > 64) {
    invalidBundle()
  }
  const name = decoder.decode(header.subarray(30, 30 + nameLength))
  if (
    name !== entry.path ||
    readU32(view, 14) !== entry.crc ||
    readU32(view, 18) !== entry.size ||
    readU32(view, 22) !== entry.size
  ) {
    invalidBundle()
  }
  const start = entry.offset + 30 + nameLength + extraLength
  if (start + entry.size > file.size) invalidBundle()
  const blob = file.slice(start, start + entry.size)
  if ((await crc32(blob)) !== entry.crc) invalidBundle()
  return blob
}

function validateManifest(
  value: unknown,
  entries: Map<string, ZipIndexEntry>
): BundleManifest {
  if (!value || typeof value !== 'object') invalidBundle()
  const manifest = value as Partial<BundleManifest>
  if (
    manifest.format !== 'newapi-studio-project-bundle' ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.media) ||
    !Array.isArray(manifest.nodeMedia) ||
    !Array.isArray(manifest.takeMedia) ||
    !Array.isArray(manifest.assetMedia)
  ) {
    invalidBundle()
  }
  if (
    manifest.media.length > MAX_MEDIA_ENTRIES ||
    entries.size !== manifest.media.length + 1
  ) {
    invalidBundle()
  }
  if (
    manifest.assembledMedia !== null &&
    typeof manifest.assembledMedia !== 'string'
  ) {
    invalidBundle()
  }
  if (
    manifest.soundtrackMedia !== undefined &&
    manifest.soundtrackMedia !== null &&
    typeof manifest.soundtrackMedia !== 'string'
  ) {
    invalidBundle()
  }
  if (!manifest.project) invalidBundle()
  const project = portableProject(manifest.project)
  if (
    manifest.nodeMedia.length !== project.nodes.length ||
    manifest.takeMedia.length !== project.nodes.length ||
    manifest.assetMedia.length !== (project.assets?.length ?? 0)
  ) {
    invalidBundle()
  }
  const paths = new Set<string>()
  for (let index = 0; index < manifest.media.length; index += 1) {
    const media = manifest.media[index]
    const path = `media/${index}`
    if (
      !media ||
      media.path !== path ||
      typeof media.type !== 'string' ||
      media.type.length > 128 ||
      [...media.type].some((char) => char.charCodeAt(0) < 32) ||
      media.size !== entries.get(path)?.size ||
      media.size > MAX_MEDIA_BYTES
    ) {
      invalidBundle()
    }
    paths.add(path)
  }
  for (let index = 0; index < project.nodes.length; index += 1) {
    if (
      !Array.isArray(manifest.takeMedia[index]) ||
      manifest.takeMedia[index].length !==
        (project.nodes[index].data.takes?.length ?? 0)
    ) {
      invalidBundle()
    }
  }
  const references = [
    ...manifest.nodeMedia,
    ...manifest.takeMedia.flat(),
    ...manifest.assetMedia,
    manifest.assembledMedia,
    manifest.soundtrackMedia ?? null,
  ]
  if (
    references.some(
      (path) => path !== null && (typeof path !== 'string' || !paths.has(path))
    )
  ) {
    invalidBundle()
  }
  if (paths.size !== new Set(references.filter((path) => path !== null)).size) {
    invalidBundle()
  }
  return { ...manifest, project } as BundleManifest
}

export async function exportStudioProjectBundle(
  project: StudioProject,
  userId: number,
  mediaStore: StudioMediaStore
): Promise<Blob> {
  validateUserId(userId)
  const safe = portableProject(project)
  const media: MediaEntry[] = []
  const blobs: Blob[] = []
  const paths = new Map<string, string>()
  let mediaBytes = 0
  async function addMedia(mediaId: string | undefined): Promise<string | null> {
    if (!mediaId) return null
    const previous = paths.get(mediaId)
    if (previous) return previous
    if (media.length >= MAX_MEDIA_ENTRIES) {
      throw new Error('studio project bundle is too large')
    }
    const blob = await mediaStore.get(userId, mediaId)
    if (!blob) throw new Error(`studio media is missing: ${mediaId}`)
    mediaBytes += blob.size
    if (
      blob.size > MAX_MEDIA_BYTES ||
      mediaBytes > MAX_BUNDLE_BYTES - MAX_PROJECT_BYTES - 128_000
    ) {
      throw new Error('studio project bundle is too large')
    }
    const path = `media/${media.length}`
    media.push({ path, type: blob.type, size: blob.size })
    blobs.push(blob)
    paths.set(mediaId, path)
    return path
  }
  const nodeMedia: (string | null)[] = []
  const takeMedia: (string | null)[][] = []
  for (const [index, node] of project.nodes.entries()) {
    nodeMedia.push(await addMedia(node.data.mediaId))
    const takes: (string | null)[] = []
    for (const take of safe.nodes[index].data.takes ?? []) {
      const original = node.data.takes?.find((item) => item.id === take.id)
      const legacyMediaId =
        !original && take.taskId === node.data.taskId
          ? node.data.mediaId
          : undefined
      takes.push(await addMedia(original?.mediaId || legacyMediaId))
    }
    takeMedia.push(takes)
  }
  const assetMedia: (string | null)[] = []
  for (const asset of project.assets ?? []) {
    assetMedia.push(await addMedia(asset.mediaId))
  }
  const assembledMedia = await addMedia(project.assembledMediaId)
  const soundtrackMedia = await addMedia(project.soundtrackMediaId)
  const manifest: BundleManifest = {
    format: 'newapi-studio-project-bundle',
    version: 1,
    project: safe,
    media,
    nodeMedia,
    takeMedia,
    assetMedia,
    assembledMedia,
    soundtrackMedia,
  }
  const json = JSON.stringify(manifest)
  const projectBlob = new Blob([json], { type: 'application/json' })
  if (projectBlob.size > MAX_PROJECT_BYTES) {
    throw new Error('studio project bundle is too large')
  }
  const files = [{ path: 'project.json', blob: projectBlob }]
  media.forEach((entry, index) =>
    files.push({ path: entry.path, blob: blobs[index] })
  )
  const zip = await writeZip(files)
  if (zip.size > MAX_BUNDLE_BYTES) {
    throw new Error('studio project bundle is too large')
  }
  return zip
}

export async function importStudioProjectBundle(
  file: Blob,
  userId: number,
  mediaStore: StudioMediaStore
): Promise<StudioProject> {
  validateUserId(userId)
  const entries = await readZipIndex(file)
  const projectEntry = entries.get('project.json')
  if (!projectEntry) invalidBundle()
  if (projectEntry.size > MAX_PROJECT_BYTES) invalidBundle()
  const projectJson = await readZipEntry(file, projectEntry)
  const manifest = validateManifest(
    JSON.parse(await projectJson.text()),
    entries
  )
  const mediaIds = new Map<string, string>()
  const saved: string[] = []
  try {
    for (const media of manifest.media) {
      const entry = entries.get(media.path)
      if (!entry) invalidBundle()
      const blob = await readZipEntry(file, entry)
      const mediaId = nanoid()
      saved.push(mediaId)
      await mediaStore.put(
        userId,
        mediaId,
        blob.slice(0, blob.size, media.type)
      )
      mediaIds.set(media.path, mediaId)
    }
    const resolveMedia = (path: string | null): string | undefined =>
      path ? mediaIds.get(path) : undefined
    return {
      ...manifest.project,
      id: nanoid(),
      updatedAt: new Date().toISOString(),
      nodes: manifest.project.nodes.map((node, index) => ({
        ...node,
        data: {
          ...node.data,
          mediaId: resolveMedia(manifest.nodeMedia[index]),
          takes: node.data.takes?.map((take, takeIndex) => ({
            ...take,
            mediaId: resolveMedia(manifest.takeMedia[index][takeIndex]),
          })),
        },
      })),
      assets: manifest.project.assets?.map((asset, index) => ({
        ...asset,
        mediaId: resolveMedia(manifest.assetMedia[index]),
      })),
      assembledMediaId: resolveMedia(manifest.assembledMedia),
      soundtrackMediaId: resolveMedia(manifest.soundtrackMedia ?? null),
    }
  } catch (error) {
    await Promise.allSettled(
      saved.map((mediaId) => mediaStore.delete(userId, mediaId))
    )
    throw error
  }
}
