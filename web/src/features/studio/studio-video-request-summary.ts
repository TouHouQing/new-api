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
