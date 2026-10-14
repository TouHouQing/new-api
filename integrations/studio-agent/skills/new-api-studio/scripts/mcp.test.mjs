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
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { join, resolve, dirname, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { handleMessage } from './mcp.mjs'

test('successful actions without a server data field still return a stable MCP result', async () => {
  const originalFetch = globalThis.fetch
  const oldUrl = process.env.NEW_API_URL, oldToken = process.env.NEW_API_ACCESS_TOKEN
  process.env.NEW_API_URL = 'http://127.0.0.1:13000'
  process.env.NEW_API_ACCESS_TOKEN = 'fixture-token'
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true }))
  try {
    const result = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'studio_revoke_review_link', arguments: { projectId: 'film', shareId: 'share' } } })
    assert.equal(result.result.isError, false)
    assert.deepEqual(result.result.structuredContent, { data: null })
    assert.deepEqual(result.result.content, [{ type: 'text', text: 'null' }])
  } finally {
    globalThis.fetch = originalFetch
    if (oldUrl === undefined) delete process.env.NEW_API_URL; else process.env.NEW_API_URL = oldUrl
    if (oldToken === undefined) delete process.env.NEW_API_ACCESS_TOKEN; else process.env.NEW_API_ACCESS_TOKEN = oldToken
  }
})

test('MCP validates nested arrays, operation records and declared minimum lengths before I/O', async () => {
  const originalFetch = globalThis.fetch
  let requests = 0
  globalThis.fetch = async () => {
    requests++
    return new Response(JSON.stringify({ success: true, data: {} }))
  }
  try {
    const cases = [
      ['studio_start_workflow', { projectId: 'film', revision: 1, kind: 'generate', nodeIds: ['../private'] }],
      ['studio_start_workflow', { projectId: 'film', revision: 1, kind: 'generate', nodeIds: [42] }],
      ['studio_control_workflow', { jobId: 'job', action: 'abandon', note: 'short' }],
      ['studio_edit_canvas', { sessionId: 'session', expectedRevision: 1, operations: [{}] }],
      ['studio_edit_canvas', { sessionId: 'session', expectedRevision: 1, operations: [null] }],
      ['studio_edit_canvas', { sessionId: 'session', expectedRevision: 1, requestId: 'invalid', operations: [{ op: 'add_node' }] }],
    ]
    for (const [name, args] of cases) {
      const result = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
      assert.equal(result.error?.code, -32602, name + ': ' + JSON.stringify(args))
    }
    assert.equal(requests, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('MCP exposes durable tools and rejects invalid or unconfirmed generation', async () => {
  const originalFetch = globalThis.fetch
  const oldUrl = process.env.NEW_API_URL, oldToken = process.env.NEW_API_ACCESS_TOKEN
  process.env.NEW_API_URL = 'http://127.0.0.1:13000'
  process.env.NEW_API_ACCESS_TOKEN = 'fixture-token'
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body)
    assert.equal(body.confirm_generation, false)
    return new Response(JSON.stringify({ success: false, message: 'generation requires explicit confirmation' }), { status: 400 })
  }
  try {
    const listed = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    for (const name of ['studio_read_project', 'studio_project_schema', 'studio_upload_file', 'studio_start_workflow', 'studio_review_take', 'studio_download_media']) assert.ok(listed.result.tools.some((tool) => tool.name === name))
    const invalid = await handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'studio_read_project', arguments: { projectId: '../private' } } })
    assert.equal(invalid.error.code, -32602)
    const unconfirmed = await handleMessage({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'studio_start_workflow', arguments: { projectId: 'film', revision: 1, kind: 'generate', budget: 100, nodeIds: ['video'], confirmGeneration: false } } })
    assert.equal(unconfirmed.result.isError, true)
    assert.match(unconfirmed.result.content[0].text, /retain requestId=/)
  } finally {
    globalThis.fetch = originalFetch
    if (oldUrl === undefined) delete process.env.NEW_API_URL; else process.env.NEW_API_URL = oldUrl
    if (oldToken === undefined) delete process.env.NEW_API_ACCESS_TOKEN; else process.env.NEW_API_ACCESS_TOKEN = oldToken
  }
})

test('file tools stream only configured input files and preserve existing downloads', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-agent-'))
  const input = join(directory, 'input'), output = join(directory, 'output')
  await mkdir(input); await writeFile(join(input, 'clip.mp4'), 'fixture-video')
  const originalFetch = globalThis.fetch
  const names = ['NEW_API_URL', 'NEW_API_ACCESS_TOKEN', 'NEW_API_INPUT_DIR', 'NEW_API_OUTPUT_DIR']
  const before = names.map((name) => process.env[name])
  process.env.NEW_API_URL = 'http://127.0.0.1:13000'; process.env.NEW_API_ACCESS_TOKEN = 'fixture-token'; process.env.NEW_API_INPUT_DIR = input; process.env.NEW_API_OUTPUT_DIR = output
  let uploads = 0
  globalThis.fetch = async (_url, options) => {
    if (options.method === 'PUT') {
      uploads++
      assert.equal(options.headers['Content-Type'], 'video/mp4')
      const bytes = []; for await (const chunk of options.body) bytes.push(chunk)
      assert.equal(Buffer.concat(bytes).toString(), 'fixture-video')
      return new Response(JSON.stringify({ success: true, data: { media_id: 'uploaded' } }))
    }
    return new Response('fixture-video', { headers: { 'Content-Length': '13' } })
  }
  const call = (name, args) => handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
  try {
    const uploaded = await call('studio_upload_file', { mediaId: 'uploaded', filename: 'clip.mp4' }); assert.equal(uploaded.result.isError, false); assert.equal(uploads, 1)
    const escaped = await call('studio_upload_file', { mediaId: 'escaped', filename: '../clip.mp4' }); assert.equal(escaped.result.isError, true); assert.equal(uploads, 1)
    const downloaded = await call('studio_download_media', { mediaId: 'uploaded', filename: 'film.mp4' }); assert.equal(downloaded.result.isError, false)
    assert.equal(await readFile(join(output, 'film.mp4'), 'utf8'), 'fixture-video')
    const overwrite = await call('studio_download_media', { mediaId: 'uploaded', filename: 'film.mp4' }); assert.equal(overwrite.result.isError, true)
    await writeFile(join(directory, 'outside.mp4'), 'outside')
    try { await symlink(join(directory, 'outside.mp4'), join(input, 'escape.mp4'), 'file') }
    catch (error) { if (error.code === 'EPERM') { context.diagnostic('Symlink permission is unavailable; traversal and overwrite protections were verified'); return }; throw error }
    const linked = await call('studio_upload_file', { mediaId: 'linked', filename: 'escape.mp4' }); assert.equal(linked.result.isError, true); assert.equal(uploads, 1)
  } finally {
    globalThis.fetch = originalFetch
    names.forEach((name, index) => { if (before[index] === undefined) delete process.env[name]; else process.env[name] = before[index] })
    assert.equal(dirname(resolve(directory)),resolve(tmpdir()))
    assert.ok(basename(directory).startsWith('studio-agent-'))
    await rm(directory, { recursive: true, force: true })
  }
})


test('project discovery uses bounded summaries and full documents require an explicit legacy flag', async () => {
  const before = globalThis.fetch, oldUrl = process.env.NEW_API_URL, oldToken = process.env.NEW_API_ACCESS_TOKEN
  process.env.NEW_API_URL = 'http://127.0.0.1:13000'; process.env.NEW_API_ACCESS_TOKEN = 'fixture-token'
  const paths = []
  globalThis.fetch = async (url) => { paths.push(new URL(url).pathname + new URL(url).search); return new Response(JSON.stringify({ success: true, data: { projects: [{ id: 'film', title: 'Film', revision: 3 }], total: 1, nextOffset: null } })) }
  try {
    const result = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'studio_list_projects', arguments: { limit: 5, offset: 2 } } })
    assert.equal(result.result.isError, false)
    assert.ok(paths[0].endsWith('/projects?summary=true&offset=2&limit=5'))
    assert.equal(result.result.structuredContent.data.projects[0].document, undefined)
    await handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'studio_list_projects', arguments: { includeDocuments: true } } })
    assert.ok(paths[1].endsWith('/projects'))
  } finally { globalThis.fetch = before; if (oldUrl === undefined) delete process.env.NEW_API_URL; else process.env.NEW_API_URL = oldUrl; if (oldToken === undefined) delete process.env.NEW_API_ACCESS_TOKEN; else process.env.NEW_API_ACCESS_TOKEN = oldToken }
})
