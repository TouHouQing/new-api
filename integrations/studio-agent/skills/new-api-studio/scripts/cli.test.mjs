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
import assert from 'node:assert/strict'
import test from 'node:test'
import { main } from './cli.mjs'

test('CLI forwards an explicit platform budget and preserves recovery request ID', async () => {
  const oldFetch = globalThis.fetch
  const oldUrl = process.env.NEW_API_URL
  const oldToken = process.env.NEW_API_ACCESS_TOKEN
  process.env.NEW_API_URL = 'http://127.0.0.1:13000'
  process.env.NEW_API_ACCESS_TOKEN = 'fixture-token'
  let submitted
  globalThis.fetch = async (_url, options) => {
    submitted = JSON.parse(options.body)
    return new Response(JSON.stringify({ success: true, data: { id: 'receipt' } }))
  }
  try {
    const requestId = '7276b702-a5e3-4bfc-a82c-2ad3fbcfc0a8'
    await main(['run', 'f16dacb9-e793-4203-b43a-6413303c867a', 'node', '--revision', '2', '--request-id', requestId, '--confirm-generation', '--budget', '2500000'])
    assert.equal(submitted.budget, 2500000)
    assert.equal(submitted.requestId, requestId)
    assert.equal(submitted.confirmGeneration, true)
  } finally {
    globalThis.fetch = oldFetch
    if (oldUrl === undefined) delete process.env.NEW_API_URL
    else process.env.NEW_API_URL = oldUrl
    if (oldToken === undefined) delete process.env.NEW_API_ACCESS_TOKEN
    else process.env.NEW_API_ACCESS_TOKEN = oldToken
  }
})

test('CLI rejects an invalid explicit budget before any request', async () => {
  const oldFetch = globalThis.fetch
  let requests = 0
  globalThis.fetch = async () => { requests++; throw new Error('Unexpected network request') }
  try {
    for (const budget of ['0', '-1', '2.5', 'not-a-number', '2000000001']) {
      await assert.rejects(main(['run', 'f16dacb9-e793-4203-b43a-6413303c867a', 'node', '--revision', '2', '--confirm-generation', '--budget', budget]), /generation budget/)
    }
    assert.equal(requests, 0)
  } finally {
    globalThis.fetch = oldFetch
  }
})
