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
  metadata?: Record<string, unknown>
}

export type StudioVideoRequest = {
  model: string
  prompt: string
  seconds: string
  duration?: number
  metadata: Record<string, unknown> & {
    resolution?: string
    ratio?: string
    content?: Array<{
      type: 'image_url' | 'video_url'
      role?: 'reference_image' | 'reference_video'
      image_url?: { url: string }
      video_url?: { url: string }
    }>
    reference_video?: string[]
  }
  images?: string[]
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
      [input.imageUrl, ...(input.imageUrls || [])].filter(
        (url): url is string => Boolean(url)
      )
    ),
  ]
  const videos = [...new Set(input.videoUrls || [])]
  if (model.family === 'generic' && images.length && videos.length) {
    throw new Error(
      'choose a media request format for mixed image and video references'
    )
  }
  if (
    images
      .filter((url) => url.startsWith('data:'))
      .reduce((total, url) => total + url.length, 0) > 30_000_000
  ) {
    throw new Error('image inputs exceed the Studio request limit')
  }
  if (images.length > 32 || videos.length > 32) {
    throw new Error('too many media references')
  }

  for (const image of images) {
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
    metadata: {
      ...extraMetadata,
      ...(input.resolution.trim()
        ? { resolution: input.resolution.trim() }
        : {}),
      ...(input.ratio.trim() ? { ratio: input.ratio.trim() } : {}),
    },
  }
  if (model.family === 'minimax-h3') request.duration = input.seconds
  if (videos.length && model.family === 'minimax-h3') {
    if (images.length) {
      request.metadata.content = [
        ...images.map((url) => ({
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
    } else {
      request.metadata.reference_video = videos
    }
  } else {
    if (images.length) request.images = images
    if (videos.length) {
      request.metadata.content = videos.map((url) => ({
        type: 'video_url',
        video_url: { url },
      }))
    }
  }
  return request
}
