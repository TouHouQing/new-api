/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { isAxiosError } from 'axios'
import { t } from 'i18next'

import { api } from '@/lib/api'

import { STUDIO_DOCUMENT_VERSION } from './studio-production-contract'
import { studioWorkflowProblem } from './studio-workflow-problem'

export async function studioCloudRequestRaw<T>(
  path: string,
  method = 'GET',
  body?: unknown
): Promise<T> {
  let response
  try {
    response = await api.request({
      url: `/api/studio/cloud${path}`,
      method,
      data: body,
      headers: { 'X-Studio-Document-Version': String(STUDIO_DOCUMENT_VERSION) },
    })
  } catch (problem) {
    if (
      isAxiosError(problem) &&
      method !== 'GET' &&
      (!problem.response ||
        problem.response.status >= 500 ||
        problem.response.status === 408)
    ) {
      // Keep the transport type/code so offline queues still recognize it.
      problem.message = t(
        'The request result is not confirmed. Refresh the task or project before trying again.'
      )
      throw problem
    }
    if (
      isAxiosError(problem) &&
      problem.response?.data?.code === 'studio_storage_unavailable'
    ) {
      throw new Error(
        t('Saving and media services are busy. Please try again shortly.'),
        { cause: problem }
      )
    }
    if (
      isAxiosError(problem) &&
      problem.response?.data?.code === 'studio_insufficient_quota'
    ) {
      throw new Error(
        t(
          'Insufficient generation credit. Add credit or continue with free editing.'
        )
      )
    }
    if (
      isAxiosError(problem) &&
      typeof problem.response?.data?.message === 'string'
    ) {
      const message = problem.response.data.message as string
      const mapped = studioWorkflowProblem(message)
      if (!mapped.startsWith('The task failed.')) {
        throw new Error(t(mapped), { cause: problem })
      }
    }
    throw problem
  }
  if (response.data?.success !== true) {
    throw new Error(response.data?.message || 'Studio request failed')
  }
  return response.data.data as T
}
