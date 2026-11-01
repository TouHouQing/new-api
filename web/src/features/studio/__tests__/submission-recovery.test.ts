/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { AxiosError } from 'axios'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { studioCloudRequest, type StudioCloudJob } from '../studio-cloud'
import {
  reconcileStudioJobIntent,
  studioUnconfirmedRequest,
  submitStudioJobOnce,
} from '../studio-submit-intent'

const body = {
  kind: 'render',
  revision: 2,
  budget: 0,
  node_ids: [],
  render: { width: 640, height: 384 },
}
let accepted: StudioCloudJob[]
let writes: Record<string, unknown>[]
let offline: boolean
let drop: boolean
beforeEach(() => {
  localStorage.clear()
  accepted = []
  writes = []
  offline = false
  drop = true
  vi.spyOn(api, 'request').mockImplementation(async (config) => {
    if (offline) throw new AxiosError('Network Error', 'ERR_NETWORK')
    if (config.method === 'POST') {
      const request = config.data as Record<string, unknown>
      writes.push(request)
      let job = accepted.find((j) => j.request_id === request.request_id)
      if (!job) {
        job = {
          id: 'real-receipt',
          request_id: String(request.request_id),
          user_id: 17,
          kind: 'render',
          revision: 2,
          status: 'queued',
          progress: 0,
          error: '',
        }
        accepted.push(job)
      }
      if (drop) throw new AxiosError('Network Error', 'ERR_NETWORK')
      return { data: { success: true, data: job } } as Awaited<
        ReturnType<typeof api.request>
      >
    }
    return { data: { success: true, data: accepted } } as Awaited<
      ReturnType<typeof api.request>
    >
  })
})
afterEach(() => {
  useAuthStore.getState().auth.reset()
  vi.restoreAllMocks()
})

test('a real accepted response loss is reconciled with GET without creating another job', async () => {
  const result = await submitStudioJobOnce(17, 'film', body)
  expect(result.recovered).toBe(true)
  expect(result.job.id).toBe('real-receipt')
  expect(writes).toHaveLength(1)
  expect(accepted).toHaveLength(1)
  expect(localStorage.length).toBe(0)
})

test.each(['media', 'transcribe', 'inspect', 'previs', 'generate'])(
  'the %s API entry uses the same durable request and reconciles a lost response',
  async (kind) => {
    useAuthStore.setState((state) => ({
      auth: {
        ...state.auth,
        user: { id: 17, username: 'owned-test', role: 1, group: 'default' },
      },
    }))
    const request = { ...body, kind, request_id: `caller-${kind}` }
    const result = await studioCloudRequest<StudioCloudJob>(
      '/projects/film/jobs',
      'POST',
      request
    )
    expect(result.id).toBe('real-receipt')
    expect(writes).toHaveLength(1)
    expect(writes[0].request_id).toBe(`caller-${kind}`)
    expect(accepted).toHaveLength(1)
    expect(localStorage.length).toBe(0)
  }
)

test('uncertainty from a direct tool entry updates the open workspace and a later check makes no duplicate POST', async () => {
  useAuthStore.setState((state) => ({
    auth: {
      ...state.auth,
      user: { id: 17, username: 'owned-test', role: 1, group: 'default' },
    },
  }))
  const changed = vi.fn()
  window.addEventListener('studio-job-intent', changed)
  try {
    vi.mocked(api.request).mockImplementationOnce(async (config) => {
      const request = config.data as Record<string, unknown>
      writes.push(request)
      accepted.push({
        id: 'accepted-tool',
        request_id: String(request.request_id),
        user_id: 17,
        kind: 'media',
        revision: 2,
        status: 'queued',
        progress: 0,
        error: '',
      })
      offline = true
      throw new AxiosError('Network Error', 'ERR_NETWORK')
    })
    await expect(
      studioCloudRequest('/projects/film/jobs', 'POST', {
        ...body,
        kind: 'media',
        request_id: 'caller-tool',
      })
    ).rejects.toThrow(studioUnconfirmedRequest)
    expect(changed).toHaveBeenCalledOnce()
    expect(localStorage.length).toBe(1)
    offline = false
    await studioCloudRequest('/projects/film/jobs', 'POST', {
      ...body,
      kind: 'media',
      request_id: 'caller-retry',
      revision: 3,
    })
    expect(writes).toHaveLength(1)
    expect(localStorage.length).toBe(0)
  } finally {
    window.removeEventListener('studio-job-intent', changed)
  }
})

test('an offline receipt check preserves the frozen id and survives a reopened caller', async () => {
  vi.mocked(api.request).mockImplementationOnce(async (config) => {
    const request = config.data as Record<string, unknown>
    writes.push(request)
    accepted.push({
      id: 'accepted-before-offline',
      request_id: String(request.request_id),
      user_id: 17,
      kind: 'render',
      revision: 2,
      status: 'queued',
      progress: 0,
      error: '',
    })
    offline = true
    throw new AxiosError('Network Error', 'ERR_NETWORK')
  })
  await expect(submitStudioJobOnce(17, 'film', body)).rejects.toThrow(
    studioUnconfirmedRequest
  )
  expect(localStorage.length).toBe(1)
  offline = false
  const result = await submitStudioJobOnce(17, 'film', { ...body, revision: 3 })
  expect(result.job.id).toBe('accepted-before-offline')
  expect(result.recovered).toBe(true)
  expect(writes).toHaveLength(1)
  expect(accepted).toHaveLength(1)
})

test('a request never received by the server reuses its exact body and id after reconnect', async () => {
  offline = true
  await expect(submitStudioJobOnce(17, 'film', body)).rejects.toThrow(
    studioUnconfirmedRequest
  )
  const saved = JSON.parse(
    localStorage.getItem('studio-job-intent:v1:17:film') || '{}'
  )
  offline = false
  drop = false
  await submitStudioJobOnce(17, 'film', { ...body, revision: 3 })
  expect(writes).toHaveLength(1)
  expect(writes[0]).toEqual({ ...body, request_id: saved.requestId })
})

test('a different edit cannot silently replace an unresolved generation approval', async () => {
  offline = true
  await expect(submitStudioJobOnce(17, 'film', body)).rejects.toThrow()
  offline = false
  drop = false
  await expect(
    submitStudioJobOnce(17, 'film', { ...body, budget: 20 })
  ).rejects.toThrow(studioUnconfirmedRequest)
  expect(writes).toHaveLength(0)
  expect(localStorage.length).toBe(1)
})

test('checking a previous request never POSTs and cannot resolve another actor’s intent', async () => {
  offline = true
  await expect(submitStudioJobOnce(17, 'film', body)).rejects.toThrow()
  offline = false
  await reconcileStudioJobIntent(16, 'film')
  await reconcileStudioJobIntent(17, 'film')
  expect(writes).toHaveLength(0)
  expect(localStorage.length).toBe(1)
})

test('definite validation rejection clears the pending submission', async () => {
  vi.mocked(api.request).mockRejectedValueOnce(
    new AxiosError('Invalid request', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 400,
      data: { message: 'invalid' },
      statusText: 'Bad Request',
      headers: {},
      config: {} as never,
    })
  )
  await expect(submitStudioJobOnce(17, 'film', body)).rejects.toThrow()
  expect(localStorage.length).toBe(0)
})

test('a lost edit-application response has explicit uncertainty guidance', async () => {
  offline = true
  await expect(
    studioCloudRequest('/projects/film/edit-plans/plan/apply', 'POST', {
      revision: 2,
    })
  ).rejects.toThrow(studioUnconfirmedRequest)
})
