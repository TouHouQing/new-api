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
import type { StudioVideoRequest } from './model-profiles'

/** Durable, non-secret parameters for comparing a completed Studio take. */
export async function safeStudioVideoRequestSnapshot(
  request: StudioVideoRequest,
  sources?: {
    edges: Array<{
      source: string
      takeId?: string
      role?: string | null
      mediaId?: string
    }>
    assets?: Array<{ id: string; mediaId?: string }>
  }
): Promise<string> {
  const metadata = request.metadata || {}
  const details = inspectStudioVideoRequest(request)
  const mediaFingerprints = await Promise.all(
    details.media.map(async ({ kind, role, url }) => {
      let fingerprint: string
      if (globalThis.crypto?.subtle) {
        const digest = await globalThis.crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(url)
        )
        fingerprint = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, '0')
        ).join('')
      } else {
        // Browser contexts without SubtleCrypto can still distinguish versions.
        let hash = 2166136261
        for (let index = 0; index < url.length; index += 1) {
          hash = Math.imul(hash ^ url.charCodeAt(index), 16777619)
        }
        fingerprint = `fnv1a-${(hash >>> 0).toString(16)}`
      }
      return { kind, role, fingerprint }
    })
  )
  return JSON.stringify(
    {
      model: request.model,
      seconds: request.seconds,
      duration: request.duration,
      mode: request.mode,
      size: request.size,
      resolution: metadata.resolution,
      ratio: metadata.ratio,
      mediaRoles: details.roles,
      mediaFingerprints,
      sourceEdges: sources?.edges,
      assets: sources?.assets,
      metadataFields: Object.keys(metadata).filter(
        (key) =>
          !['resolution', 'ratio', 'content', 'reference_video'].includes(key)
      ),
    },
    null,
    2
  ).slice(0, 16_384)
}

export function inspectStudioVideoRequest(request: StudioVideoRequest) {
  const content = Array.isArray(request.metadata?.content)
    ? request.metadata.content.filter(
        (item) => item && typeof item === 'object' && !Array.isArray(item)
      )
    : []
  const referenceVideos = Array.isArray(request.metadata?.reference_video)
    ? request.metadata.reference_video
    : []
  const media = [
    ...(request.image
      ? [{ kind: 'image' as const, role: 'image', url: request.image }]
      : []),
    ...(request.images || []).map((url) => ({
      kind: 'image' as const,
      role: 'first_frame',
      url,
    })),
    ...(request.input_reference
      ? [
          {
            kind: 'image' as const,
            role: 'input_reference',
            url: request.input_reference,
          },
        ]
      : []),
    ...referenceVideos.map((url) => ({
      kind: 'video' as const,
      role: 'reference_video',
      url,
    })),
    ...content.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const url = item.image_url?.url || item.video_url?.url
      if (!url) return []
      return [
        {
          kind:
            item.type === 'image_url' ? ('image' as const) : ('video' as const),
          role: item.role || item.type,
          url,
        },
      ]
    }),
  ].filter(
    (item) =>
      typeof item.url === 'string' &&
      (item.url.startsWith('https://') ||
        (item.kind === 'image' &&
          /^data:image\/(?:png|jpeg|webp);base64,/i.test(item.url)))
  )
  const roles = [
    ...(request.image ? ['image'] : []),
    ...(request.images || []).map(() => 'image'),
    ...(request.input_reference ? ['input_reference'] : []),
    ...referenceVideos.map(() => 'reference_video'),
    ...content.map((item) => item.role || item.type),
  ]
  return {
    prompt: request.prompt,
    duration: request.duration ?? Number(request.seconds),
    roles,
    media,
    payload: JSON.stringify(
      request,
      (_key, value: unknown) =>
        typeof value === 'string' && value.startsWith('data:')
          ? `[inline media: ${value.length} characters]`
          : value,
      2
    ),
  }
}
