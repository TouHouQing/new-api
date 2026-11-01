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
import { getFreshAuthHeaders, refreshAuthentication } from '@/lib/auth-session'

const sessionFetch = window.fetch.bind(window)

let readSessionExpires = 0
let preparing: Promise<void> | undefined

// This module is built separately for the workbench. It reuses New API's
// existing refresh, rotation and cross-tab session coordination.
export async function headers(): Promise<Record<string, string>> {
  const result = await getFreshAuthHeaders()
  // Axios/fetch must set each request body's media type, especially the
  // browser-generated multipart boundary used by resource uploads.
  delete result['Content-Type']
  if (Date.now() >= readSessionExpires) {
    preparing ??= sessionFetch('/api/workbench/host-session', {
      method: 'POST',
      credentials: 'same-origin',
      headers: result,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Workbench session is unavailable')
        readSessionExpires = Date.now() + 240_000
      })
      .finally(() => {
        preparing = undefined
      })
    await preparing
  }
  return result
}

export async function refresh(): Promise<void> {
  const outcome = await refreshAuthentication()
  readSessionExpires = 0
  if (outcome.kind !== 'authenticated') {
    throw new Error('Please sign in to New API')
  }
}
