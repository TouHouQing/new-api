/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { afterEach, expect, test, vi } from 'vitest'

vi.mock('@/lib/auth-session', () => ({
  getFreshAuthHeaders: async () => ({
    Authorization: 'Bearer workbench-session',
    'Content-Type': 'application/json',
  }),
  refreshAuthentication: vi.fn(),
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

test('authenticates hosted uploads without overriding their multipart media type', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetch)
  const { headers } = await import('../workbench-auth-bridge')
  const [first, second] = await Promise.all([headers(), headers()])

  expect(first).toEqual({ Authorization: 'Bearer workbench-session' })
  expect(second).toEqual(first)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledWith('/api/workbench/host-session', {
    method: 'POST',
    credentials: 'same-origin',
    headers: first,
  })
})
