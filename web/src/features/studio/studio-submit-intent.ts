/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { isAxiosError } from 'axios'
import { t } from 'i18next'

import type { StudioCloudJob } from './studio-cloud'
import { studioCloudRequestRaw as studioCloudRequest } from './studio-cloud-request'

export const studioUnconfirmedRequest =
  'The request result is not confirmed. Refresh the task or project before trying again.'

export function studioRequestIsUnconfirmed(error: unknown): boolean {
  if (isAxiosError(error)) {
    return (
      !error.response ||
      error.response.status >= 500 ||
      error.response.status === 408
    )
  }
  return (
    error instanceof Error &&
    error.cause !== undefined &&
    studioRequestIsUnconfirmed(error.cause)
  )
}

type Intent = { requestId: string; body: Record<string, unknown> }
const key = (actor: number, project: string) =>
  `studio-job-intent:v1:${actor}:${project}`

export function hasStudioJobIntent(actor: number, project: string): boolean {
  try {
    return localStorage.getItem(key(actor, project)) !== null
  } catch {
    return false
  }
}

function load(actor: number, project: string): Intent | undefined {
  const raw = localStorage.getItem(key(actor, project))
  if (!raw) return
  const parsed: unknown = JSON.parse(raw)
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('requestId' in parsed) ||
    typeof parsed.requestId !== 'string' ||
    !('body' in parsed) ||
    !parsed.body ||
    typeof parsed.body !== 'object'
  ) {
    throw new Error(t(studioUnconfirmedRequest))
  }
  return parsed as Intent
}

export async function reconcileStudioJobIntent(
  actor: number,
  project: string
): Promise<StudioCloudJob | undefined> {
  const pending = load(actor, project)
  if (!pending) return
  const jobs = await studioCloudRequest<StudioCloudJob[]>(
    `/projects/${encodeURIComponent(project)}/jobs`
  )
  const found = jobs.find((job) => job.request_id === pending.requestId)
  if (found) {
    localStorage.removeItem(key(actor, project))
    window.dispatchEvent(new Event('studio-job-intent'))
  }
  return found
}

export async function submitStudioJobOnce(
  actor: number,
  project: string,
  body: Record<string, unknown>
): Promise<{ job: StudioCloudJob; recovered: boolean }> {
  const path = `/projects/${encodeURIComponent(project)}/jobs`
  let pending = load(actor, project)
  if (pending) {
    const found = await reconcileStudioJobIntent(actor, project)
    if (found) return { job: found, recovered: true }
    const signature = (value: Record<string, unknown>) =>
      JSON.stringify({ ...value, revision: undefined, request_id: undefined })
    if (signature(pending.body) !== signature(body)) {
      throw new Error(t(studioUnconfirmedRequest))
    }
  } else {
    pending = {
      requestId:
        typeof body.request_id === 'string'
          ? body.request_id
          : crypto.randomUUID(),
      body,
    }
    // Write before submission. An unresolved intent never expires automatically.
    localStorage.setItem(key(actor, project), JSON.stringify(pending))
  }
  try {
    const job = await studioCloudRequest<StudioCloudJob>(path, 'POST', {
      ...pending.body,
      request_id: pending.requestId,
    })
    localStorage.removeItem(key(actor, project))
    window.dispatchEvent(new Event('studio-job-intent'))
    return { job, recovered: false }
  } catch (error) {
    if (!studioRequestIsUnconfirmed(error)) {
      localStorage.removeItem(key(actor, project))
      window.dispatchEvent(new Event('studio-job-intent'))
      throw error
    }
    // A lost response may hide an accepted job. Only a real server receipt can
    // resolve it; GET failure keeps the same frozen request for the next check.
    try {
      const found = await reconcileStudioJobIntent(actor, project)
      if (found) return { job: found, recovered: true }
    } catch {
      /* Keep the durable unresolved intent. */
    }
    window.dispatchEvent(new Event('studio-job-intent'))
    throw new Error(t(studioUnconfirmedRequest), { cause: error })
  }
}
