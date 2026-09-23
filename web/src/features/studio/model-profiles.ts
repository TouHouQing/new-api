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
export type StudioVideoModel = {
  id: string
  family: 'seedance-2' | 'minimax-h3'
  resolutions: string[]
  minSeconds: number
  maxSeconds: number
}

export type StudioVideoInput = {
  prompt: string
  seconds: number
  resolution: string
  ratio: string
  imageUrl?: string
}

export type StudioVideoRequest = {
  model: string
  prompt: string
  seconds: number
  duration?: number
  metadata: { resolution: string; ratio: string }
  images?: string[]
}

const FULL_SEEDANCE_RESOLUTIONS = ['480p', '720p', '1080p', '4k']
const LITE_SEEDANCE_RESOLUTIONS = ['480p', '720p']
const H3_RESOLUTIONS = ['768P', '2K']
const RATIOS = new Set([
  '21:9',
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
  'adaptive',
])

export function selectStudioVideoModels(ids: string[]): StudioVideoModel[] {
  const models: StudioVideoModel[] = []
  for (const id of ids) {
    const normalized = id.toLowerCase()
    if (normalized === 'minimax-h3') {
      models.push({
        id,
        family: 'minimax-h3',
        resolutions: H3_RESOLUTIONS,
        minSeconds: 4,
        maxSeconds: 15,
      })
      continue
    }
    if (
      normalized === 'sd2' ||
      /^doubao-seedance-2[-_.]0(?:-|$)/.test(normalized) ||
      /^seedance-2[._-]0(?:-|$)/.test(normalized)
    ) {
      const lite =
        normalized.includes('-fast-') || normalized.includes('-mini-')
      models.push({
        id,
        family: 'seedance-2',
        resolutions: lite
          ? LITE_SEEDANCE_RESOLUTIONS
          : FULL_SEEDANCE_RESOLUTIONS,
        minSeconds: 4,
        maxSeconds: 15,
      })
    }
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
  if (!model.resolutions.includes(input.resolution)) {
    throw new Error('resolution is unavailable for the selected model')
  }
  if (
    !RATIOS.has(input.ratio) ||
    (input.ratio === 'adaptive' && !input.imageUrl)
  ) {
    throw new Error('ratio is unavailable for the selected input')
  }

  const request: StudioVideoRequest = {
    model: model.id,
    prompt,
    seconds: input.seconds,
    metadata: { resolution: input.resolution, ratio: input.ratio },
  }
  if (model.family === 'minimax-h3') request.duration = input.seconds
  if (input.imageUrl) {
    let url: URL
    try {
      url = new URL(input.imageUrl)
    } catch {
      throw new Error('a public image URL is required')
    }
    if (url.protocol !== 'https:') {
      throw new Error('a public image URL is required')
    }
    request.images = [url.toString()]
  }
  return request
}
