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
import { getTaskArtifacts, getUserTaskLogs } from '@/features/usage-logs/api'
import { api, getUserModels } from '@/lib/api'

import type { StudioVideoRequest } from './model-profiles'

type RecordValue = Record<string, unknown>

export type StudioProviderKind = 'text' | 'image'
export type StudioTextOutput = {
  text: string
  imagePrompt: string
  videoPrompt: string
}
export type StudioProviderConfig = {
  kind: StudioProviderKind
  baseUrl: string
  hasKey: boolean
}
export type StudioProviderConfigs = Partial<
  Record<StudioProviderKind, StudioProviderConfig>
>
export type StudioGroup = { id: string; description: string }
export type StudioAttempt = {
  id: string
  group: string
  model: string
  stage: string
  httpStatus: number
  errorCode: string
  channelId: number
  taskId: string
  createdAt: string
}

export type StudioTaskState = {
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress: number
  error?: string
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseStudioAttempts(value: unknown): StudioAttempt[] {
  if (
    !isRecord(value) ||
    value.success !== true ||
    !Array.isArray(value.data)
  ) {
    throw new Error('Studio submissions are unavailable')
  }
  return value.data
    .filter(
      (item): item is RecordValue =>
        isRecord(item) &&
        typeof item.id === 'string' &&
        item.id.length > 0 &&
        typeof item.stage === 'string' &&
        typeof item.http_status === 'number'
    )
    .map((item) => ({
      id: item.id as string,
      group: typeof item.group === 'string' ? item.group : '',
      model: typeof item.model === 'string' ? item.model : '',
      stage: item.stage as string,
      httpStatus: item.http_status as number,
      errorCode: typeof item.error_code === 'string' ? item.error_code : '',
      channelId: typeof item.channel_id === 'number' ? item.channel_id : 0,
      taskId: typeof item.task_id === 'string' ? item.task_id : '',
      createdAt: typeof item.created_at === 'string' ? item.created_at : '',
    }))
}

export async function fetchStudioAttempts(): Promise<StudioAttempt[]> {
  const response = await api.get('/api/studio/attempts')
  return parseStudioAttempts(response.data)
}

export function parseStudioGroups(value: unknown): StudioGroup[] {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data)) {
    throw new Error('account groups are unavailable')
  }
  return Object.entries(value.data)
    .filter(([id, info]) => id !== 'auto' && isRecord(info))
    .map(([id, info]) => ({
      id,
      description:
        typeof (info as RecordValue).desc === 'string'
          ? ((info as RecordValue).desc as string)
          : '',
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function parseStudioProviderConfigs(
  value: unknown
): StudioProviderConfigs {
  if (
    !isRecord(value) ||
    value.success !== true ||
    !Array.isArray(value.data)
  ) {
    throw new Error('Studio service settings are unavailable')
  }
  const configs: StudioProviderConfigs = {}
  for (const item of value.data) {
    if (!isRecord(item) || (item.kind !== 'text' && item.kind !== 'image')) {
      continue
    }
    if (
      typeof item.base_url !== 'string' ||
      typeof item.has_key !== 'boolean'
    ) {
      continue
    }
    configs[item.kind] = {
      kind: item.kind,
      baseUrl: item.base_url,
      hasKey: item.has_key,
    }
  }
  return configs
}

export function parseStudioProviderModels(value: unknown): string[] {
  if (
    !isRecord(value) ||
    value.success !== true ||
    !Array.isArray(value.data)
  ) {
    throw new Error('Studio service models are unavailable')
  }
  return value.data.filter(
    (model): model is string =>
      typeof model === 'string' && model.length > 0 && model.length <= 200
  )
}

export function parseStudioImageResponse(value: unknown): {
  url: string
  urls?: string[]
} {
  if (
    isRecord(value) &&
    value.success === true &&
    isRecord(value.data) &&
    typeof value.data.url === 'string' &&
    value.data.url.length > 0
  ) {
    const urls = Array.isArray(value.data.urls)
      ? value.data.urls.filter(
          (url): url is string =>
            typeof url === 'string' &&
            (/^https?:\/\//i.test(url) || url.startsWith('data:image/'))
        )
      : []
    return urls.length > 1
      ? { url: value.data.url, urls }
      : { url: value.data.url }
  }
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new Error('image generation returned no image')
  }
  for (const item of value.data) {
    if (!isRecord(item)) continue
    if (typeof item.url === 'string' && /^https?:\/\//i.test(item.url)) {
      return { url: item.url }
    }
    if (typeof item.b64_json === 'string' && item.b64_json.length > 0) {
      return { url: `data:image/png;base64,${item.b64_json}` }
    }
  }
  throw new Error('image generation returned no image')
}

export function parseStudioVideoResponse(value: unknown): string {
  if (!isRecord(value)) throw new Error('video task ID is missing')
  const id = typeof value.id === 'string' ? value.id : value.task_id
  if (typeof id !== 'string' || id.trim() === '' || id.length > 191) {
    throw new Error('video task ID is missing')
  }
  return id
}

export function parseStudioTextResponse(value: unknown): StudioTextOutput {
  if (
    isRecord(value) &&
    value.success === true &&
    isRecord(value.data) &&
    typeof value.data.text === 'string' &&
    value.data.text.trim() !== '' &&
    typeof value.data.image_prompt === 'string' &&
    value.data.image_prompt.trim() !== '' &&
    typeof value.data.video_prompt === 'string' &&
    value.data.video_prompt.trim() !== ''
  ) {
    return {
      text: value.data.text.trim(),
      imagePrompt: value.data.image_prompt.trim(),
      videoPrompt: value.data.video_prompt.trim(),
    }
  }
  throw new Error('text generation returned no usable shot')
}

export function parseStudioTaskResponse(
  value: unknown,
  taskId: string
): StudioTaskState {
  const data = isRecord(value) && value.success === true ? value.data : null
  const items = isRecord(data) && Array.isArray(data.items) ? data.items : []
  const task = items.find((item) => isRecord(item) && item.task_id === taskId)
  if (!isRecord(task)) {
    throw new Error('video task was not found in this account')
  }

  const status = task.status
  const rawProgress =
    typeof task.progress === 'string' ? Number.parseInt(task.progress, 10) : 0
  const progress = Number.isFinite(rawProgress)
    ? Math.max(0, Math.min(100, rawProgress))
    : 0
  if (status === 'SUCCESS') return { status: 'completed', progress: 100 }
  if (status === 'FAILURE') {
    return {
      status: 'failed',
      progress,
      error:
        typeof task.fail_reason === 'string' ? task.fail_reason : undefined,
    }
  }
  if (status === 'IN_PROGRESS') return { status: 'processing', progress }
  return { status: 'queued', progress }
}

export async function fetchStudioModels(group: string): Promise<string[]> {
  const response = await getUserModels(group)
  if (!response.success || !Array.isArray(response.data)) {
    throw new Error(response.message || 'models are unavailable')
  }
  return response.data.filter(
    (model): model is string => typeof model === 'string'
  )
}

export async function fetchStudioGroups(): Promise<StudioGroup[]> {
  const response = await api.get('/api/user/self/groups')
  return parseStudioGroups(response.data)
}

export async function fetchStudioProviderConfigs(): Promise<StudioProviderConfigs> {
  const response = await api.get('/api/studio/providers')
  return parseStudioProviderConfigs(response.data)
}

export async function saveStudioProviderConfig(
  kind: StudioProviderKind,
  baseUrl: string,
  apiKey: string
): Promise<StudioProviderConfig> {
  const response = await api.put(`/api/studio/providers/${kind}`, {
    base_url: baseUrl,
    api_key: apiKey,
  })
  const configs = parseStudioProviderConfigs({
    success: response.data?.success,
    data: [response.data?.data],
  })
  const config = configs[kind]
  if (!config) throw new Error('Studio service settings were not saved')
  return config
}

export async function deleteStudioProviderConfig(
  kind: StudioProviderKind
): Promise<void> {
  await api.delete(`/api/studio/providers/${kind}`)
}

export async function fetchStudioProviderModels(
  kind: StudioProviderKind
): Promise<string[]> {
  const response = await api.get(`/api/studio/providers/${kind}/models`)
  return parseStudioProviderModels(response.data)
}

export async function generateStudioText(
  model: string,
  prompt: string
): Promise<StudioTextOutput> {
  const response = await api.post('/api/studio/providers/text/generate', {
    model,
    prompt,
  })
  return parseStudioTextResponse(response.data)
}

export async function generateStudioImage(
  model: string,
  prompt: string,
  options?: { size?: string; quality?: string; n?: number; image?: string }
): Promise<{ url: string; urls?: string[] }> {
  const response = await api.post(
    '/api/studio/providers/image/generate',
    buildStudioImageRequest(model, prompt, options)
  )
  return parseStudioImageResponse(response.data)
}

export function buildStudioImageRequest(
  model: string,
  prompt: string,
  options?: { size?: string; quality?: string; n?: number; image?: string }
): {
  model: string
  prompt: string
  size?: string
  quality?: string
  n?: number
  image?: string
} {
  return { model, prompt, ...options }
}

export async function createStudioVideo(
  request: StudioVideoRequest,
  group: string
): Promise<string> {
  if (!group) throw new Error('a video group is required')
  try {
    const response = await api.post('/pg/studio/videos', request, {
      params: { studio_group: group },
    })
    return parseStudioVideoResponse(response.data)
  } catch (error) {
    const response = isRecord(error) ? error.response : undefined
    const headers = isRecord(response) ? response.headers : undefined
    let attemptId: unknown
    if (isRecord(headers)) {
      attemptId = headers['x-studio-attempt-id']
      if (!attemptId && typeof headers.get === 'function') {
        attemptId = headers.get('x-studio-attempt-id')
      }
    }
    if (
      typeof attemptId === 'string' &&
      /^[A-Za-z0-9-]{1,64}$/.test(attemptId)
    ) {
      let message = 'video submission failed'
      if (error instanceof Error) message = error.message
      else if (isRecord(error) && typeof error.message === 'string') {
        message = error.message
      }
      throw new Error(`${message} (submission ${attemptId})`, { cause: error })
    }
    throw error
  }
}

export async function getStudioVideoTask(
  taskId: string
): Promise<StudioTaskState> {
  const response = await getUserTaskLogs({
    task_id: taskId,
    p: 1,
    page_size: 1,
  })
  return parseStudioTaskResponse(response, taskId)
}

export async function getStudioVideoContentUrl(
  taskId: string
): Promise<string> {
  const projection = await getTaskArtifacts(taskId)
  const video = projection.artifacts.find(
    (artifact) => artifact.type === 'video'
  )
  const url = video?.content_url || projection.legacyContentUrl
  if (!url) throw new Error('video output is unavailable')
  return url
}
