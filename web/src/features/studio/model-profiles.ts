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
export type StudioVideoFamily =
  | 'generic'
  | 'seedance-2'
  | 'seedance-2.5'
  | 'minimax-h3'

export type StudioVideoModel = {
  id: string
  family: StudioVideoFamily
  resolutions: string[]
  minSeconds: number
  maxSeconds: number
  defaultSeconds: number
}

export type StudioVideoInput = {
  prompt: string
  seconds: number
  resolution: string
  ratio: string
  imageUrl?: string
  imageUrls?: string[]
  videoUrls?: string[]
  imageReferences?: { url: string; role: 'first_frame' | 'reference_image' }[]
  videoReferences?: { url: string; role: 'reference_video' | 'extend_video' }[]
  metadata?: Record<string, unknown>
}

export type StudioVideoRequest = {
  model: string
  prompt: string
  seconds: string
  duration?: number
  mode?: string
  size?: string
  image?: string
  input_reference?: string
  metadata: Record<string, unknown> & {
    resolution?: string
    ratio?: string
    content?: Array<{
      type: 'image_url' | 'video_url'
      role?:
        | 'first_frame'
        | 'last_frame'
        | 'reference_image'
        | 'reference_video'
      image_url?: { url: string }
      video_url?: { url: string }
    }>
    reference_video?: string[]
  }
  images?: string[]
}

const PATCH_FIELDS = new Set([
  'seconds',
  'duration',
  'mode',
  'size',
  'image',
  'images',
  'input_reference',
  'metadata',
])

function safePayloadObject(value: unknown, depth = 0): boolean {
  if (depth > 8) return false
  if (Array.isArray(value)) {
    return value.every((item) => safePayloadObject(item, depth + 1))
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).every(
      ([key, item]) =>
        !/^(?:__proto__|constructor|prototype|api_key|apikey|authorization|token|secret)$/i.test(
          key
        ) && safePayloadObject(item, depth + 1)
    )
  }
  return (
    value === null || ['string', 'number', 'boolean'].includes(typeof value)
  )
}

/** Overrides only fields that the New API video task endpoint can receive. */
export function parseStudioVideoPayloadPatch(
  raw: string
): Partial<StudioVideoRequest> {
  if (!raw.trim()) return {}
  if (raw.length > 16_384) throw new Error('video request patch is too large')
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('video request patch must be valid JSON')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('video request patch must be an object')
  }
  if (!safePayloadObject(value)) {
    throw new Error('video request patch contains an unsafe field')
  }
  const patch = value as Record<string, unknown>
  if (Object.keys(patch).some((key) => !PATCH_FIELDS.has(key))) {
    throw new Error('video request patch contains an unsupported field')
  }
  if (
    patch.seconds !== undefined &&
    (typeof patch.seconds !== 'string' ||
      !/^\d{1,4}$/.test(patch.seconds) ||
      Number(patch.seconds) < 1 ||
      Number(patch.seconds) > 3600)
  ) {
    throw new Error('seconds must be a string from 1 to 3600')
  }
  if (
    patch.duration !== undefined &&
    (typeof patch.duration !== 'number' ||
      !Number.isInteger(patch.duration) ||
      patch.duration < 1 ||
      patch.duration > 3600)
  ) {
    throw new Error('duration must be a number from 1 to 3600')
  }
  if (
    patch.seconds !== undefined &&
    patch.duration !== undefined &&
    Number(patch.seconds) !== patch.duration
  ) {
    throw new Error('seconds and duration must match')
  }
  for (const key of ['mode', 'size', 'image', 'input_reference']) {
    const field = patch[key]
    if (
      field !== undefined &&
      (typeof field !== 'string' || field.length > 4096)
    ) {
      throw new Error(`${key} must be a short string`)
    }
  }
  if (
    patch.images !== undefined &&
    (!Array.isArray(patch.images) ||
      patch.images.length > 32 ||
      patch.images.some(
        (item) => typeof item !== 'string' || item.length > 4096
      ))
  ) {
    throw new Error('images must be a list of at most 32 URLs')
  }
  if (
    patch.metadata !== undefined &&
    (typeof patch.metadata !== 'object' ||
      patch.metadata === null ||
      Array.isArray(patch.metadata))
  ) {
    throw new Error('metadata must be an object')
  }
  return patch as Partial<StudioVideoRequest>
}

export function applyStudioVideoPayloadPatch(
  request: StudioVideoRequest,
  raw: string
): StudioVideoRequest {
  const patch = parseStudioVideoPayloadPatch(raw)
  const effectiveSeconds =
    patch.duration !== undefined
      ? String(patch.duration)
      : (patch.seconds ?? request.seconds)
  let effectiveDuration = request.duration
  if (patch.duration !== undefined) {
    effectiveDuration = patch.duration
  } else if (patch.seconds !== undefined && request.duration !== undefined) {
    effectiveDuration = Number(patch.seconds)
  }
  return {
    ...request,
    ...patch,
    seconds: effectiveSeconds,
    ...(effectiveDuration !== undefined ? { duration: effectiveDuration } : {}),
    metadata: { ...request.metadata, ...patch.metadata },
  }
}

const FULL_SEEDANCE_RESOLUTIONS = ['480p', '720p', '1080p', '4k']
const LITE_SEEDANCE_RESOLUTIONS = ['480p', '720p']
const SEEDANCE_25_RESOLUTIONS = ['480p', '720p', '1080p']
const H3_RESOLUTIONS = ['768P', '2K']
const GENERIC_RESOLUTIONS = ['720p', '1080p', '2K']
const STUDIO_MIN_SECONDS = 1
const STUDIO_MAX_SECONDS = 3600
const STUDIO_DEFAULT_SECONDS = 5
const RESERVED_METADATA_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'model',
  'prompt',
  'seconds',
  'duration',
  'images',
  'image',
  'input_reference',
  'content',
  'resolution',
  'ratio',
  'size',
  'n',
  'count',
  'output_count',
  'api_key',
  'apikey',
  'authorization',
  'token',
  'secret',
])

export function parseStudioVideoMetadata(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {}
  if (raw.length > 16_384) throw new Error('metadata JSON is too large')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('metadata must be valid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('metadata must be a JSON object')
  }
  const fields = parsed as Record<string, unknown>
  for (const key of Object.keys(fields)) {
    if (RESERVED_METADATA_KEYS.has(key.toLowerCase())) {
      throw new Error(`metadata field ${key} is reserved`)
    }
  }
  return Object.fromEntries(Object.entries(fields))
}

export function buildStudioVideoModel(
  id: string,
  family: StudioVideoFamily
): StudioVideoModel {
  const normalized = id.toLowerCase()
  if (family === 'generic') {
    return {
      id,
      family,
      resolutions: GENERIC_RESOLUTIONS,
      minSeconds: STUDIO_MIN_SECONDS,
      maxSeconds: STUDIO_MAX_SECONDS,
      defaultSeconds: STUDIO_DEFAULT_SECONDS,
    }
  }
  if (family === 'minimax-h3') {
    return {
      id,
      family,
      resolutions: H3_RESOLUTIONS,
      minSeconds: STUDIO_MIN_SECONDS,
      maxSeconds: STUDIO_MAX_SECONDS,
      defaultSeconds: STUDIO_DEFAULT_SECONDS,
    }
  }
  if (family === 'seedance-2.5') {
    return {
      id,
      family,
      resolutions: SEEDANCE_25_RESOLUTIONS,
      minSeconds: STUDIO_MIN_SECONDS,
      maxSeconds: STUDIO_MAX_SECONDS,
      defaultSeconds: STUDIO_DEFAULT_SECONDS,
    }
  }
  const lite = normalized.includes('-fast-') || normalized.includes('-mini-')
  return {
    id,
    family,
    resolutions: lite ? LITE_SEEDANCE_RESOLUTIONS : FULL_SEEDANCE_RESOLUTIONS,
    minSeconds: STUDIO_MIN_SECONDS,
    maxSeconds: STUDIO_MAX_SECONDS,
    defaultSeconds: STUDIO_DEFAULT_SECONDS,
  }
}

export function inferStudioVideoFamily(
  id: string
): StudioVideoFamily | undefined {
  const normalized = id.toLowerCase()
  if (
    normalized.includes('sd2.5') ||
    /^doubao-seedance-2[-_.]5(?:-|$)/.test(normalized) ||
    /^seedance-2[._-]5(?:-|$)/.test(normalized)
  ) {
    return 'seedance-2.5'
  }
  if (normalized === 'minimax-h3' || normalized === 'minimaxh3') {
    return 'minimax-h3'
  }
  if (
    normalized === 'sd2' ||
    normalized === 'seedance2' ||
    normalized === 'seedance2.0' ||
    /^doubao-seedance-2[-_.]0(?:-|$)/.test(normalized) ||
    /^seedance-2[._-]0(?:-|$)/.test(normalized)
  ) {
    return 'seedance-2'
  }
  return undefined
}

export function selectStudioVideoModels(ids: string[]): StudioVideoModel[] {
  const models: StudioVideoModel[] = []
  for (const id of ids) {
    const family = inferStudioVideoFamily(id)
    if (family) models.push(buildStudioVideoModel(id, family))
  }
  return models
}

export function buildStudioVideoRequest(
  model: StudioVideoModel,
  input: StudioVideoInput
): StudioVideoRequest {
  const prompt = input.prompt.trim()
  if (!prompt) throw new Error('prompt is required')
  if (
    !Number.isInteger(input.seconds) ||
    input.seconds < model.minSeconds ||
    input.seconds > model.maxSeconds
  ) {
    throw new Error('duration is outside the selected model range')
  }
  if (input.resolution.length > 100 || input.ratio.length > 40) {
    throw new Error('video settings are too long')
  }
  const extraMetadata = parseStudioVideoMetadata(
    JSON.stringify(input.metadata || {})
  )
  const images = [
    ...new Set(
      [
        input.imageUrl,
        ...(input.imageUrls || []),
        ...(input.imageReferences || [])
          .filter((reference) => reference.role === 'first_frame')
          .map((reference) => reference.url),
      ].filter((url): url is string => Boolean(url))
    ),
  ]
  const referenceImages = [
    ...new Set(
      (input.imageReferences || [])
        .filter((reference) => reference.role === 'reference_image')
        .map((reference) => reference.url)
    ),
  ]
  const videos = [
    ...new Set([
      ...(input.videoUrls || []),
      ...(input.videoReferences || []).map((reference) => reference.url),
    ]),
  ]
  if (
    [...images, ...referenceImages]
      .filter((url) => url.startsWith('data:'))
      .reduce((total, url) => total + url.length, 0) > 30_000_000
  ) {
    throw new Error('image inputs exceed the Studio request limit')
  }
  if (images.length + referenceImages.length > 32 || videos.length > 32) {
    throw new Error('too many media references')
  }

  for (const image of [...images, ...referenceImages]) {
    if (
      /^data:image\/(?:png|jpeg|webp|gif|bmp|tiff|heic|heif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(
        image
      ) &&
      image.length <= 40_000_000
    ) {
      continue
    }
    try {
      if (new URL(image).protocol === 'https:') continue
    } catch {
      // The user must provide a usable HTTPS URL or a supported image data URI.
    }
    throw new Error('a public image URL is required')
  }
  for (const video of videos) {
    try {
      if (new URL(video).protocol === 'https:') continue
    } catch {
      // Reference videos must be reachable by the selected upstream model.
    }
    throw new Error('a public video URL is required')
  }

  const request: StudioVideoRequest = {
    model: model.id,
    prompt,
    seconds: String(input.seconds),
    duration: input.seconds,
    metadata: {
      ...extraMetadata,
      ...(input.resolution.trim()
        ? { resolution: input.resolution.trim() }
        : {}),
      ...(input.ratio.trim() ? { ratio: input.ratio.trim() } : {}),
    },
  }
  if (
    input.videoReferences?.some(
      (reference) => reference.role === 'extend_video'
    )
  ) {
    request.mode = 'extend'
  }
  // Frame mode and reference mode cannot be mixed by Seedance or MiniMax H3.
  // Use reference images for mixed media and keep each URL in one field only.
  // New API's Doubao adapter combines `images` with `content`, while H3 treats
  // `content` as the complete media list.
  const mixedMedia =
    images.length > 0 && (referenceImages.length > 0 || videos.length > 0)
  if (images.length && !mixedMedia) request.images = images
  const contentImages = mixedMedia
    ? [...new Set([...images, ...referenceImages])]
    : referenceImages
  const content = [
    ...contentImages.map((url) => ({
      type: 'image_url' as const,
      role: 'reference_image' as const,
      image_url: { url },
    })),
    ...videos.map((url) => ({
      type: 'video_url' as const,
      role: 'reference_video' as const,
      video_url: { url },
    })),
  ]
  if (content.length) request.metadata.content = content
  return request
}
