import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleMessage } from './mcp.mjs'

test('production tools preserve frozen revisions and explicit side-effect confirmations', async () => {
  const originalFetch = globalThis.fetch
  const names = ['NEW_API_URL', 'NEW_API_ACCESS_TOKEN']
  const before = names.map(name => process.env[name])
  process.env.NEW_API_URL = 'http://127.0.0.1:13000'
  process.env.NEW_API_ACCESS_TOKEN = 'fixture-only'
  const requests = []
  globalThis.fetch = async (url, options) => {
    requests.push({ path: new URL(url).pathname + new URL(url).search, ...options })
    return new Response(JSON.stringify({ success: true, data: { id: 'receipt' } }))
  }
  const call = (name, args) => handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
  try {
    const cases = [
      ['studio_capability_profiles', {}, '/capability-profiles', 'GET'],
      ['studio_search_media', { projectId: 'film', query: '蓝色 cup', limit: 5 }, '/projects/film/media-index?query=%E8%93%9D%E8%89%B2%20cup&offset=0&limit=5', 'GET'],
      ['studio_scene_study', { projectId: 'film', input: { action: 'prepare', revision: 7 } }, '/projects/film/scene-studies', 'POST'],
      ['studio_beat_plan', { projectId: 'film' }, '/projects/film/beat-plans', 'GET'],
      ['studio_correct_transcript', { projectId: 'film', analysisId: 'asr', correction: { request_id: 'correction', segments: [] } }, '/projects/film/analyses/asr/transcript-corrections', 'POST'],
      ['studio_apply_edit', { projectId: 'film', planId: 'plan', revision: 7 }, '/projects/film/edit-plans/plan/apply', 'POST'],
      ['studio_submit_variant', { campaignId: 'matrix', variantId: 'child', confirmGeneration: false }, '/campaigns/matrix/variants/child/submit', 'POST'],
      ['studio_confirm_publication', { projectId: 'film', publicationId: 'publication', fingerprint: 'a'.repeat(64), confirmExternalWrite: false }, '/projects/film/publications/publication/confirm', 'POST'],
      ['studio_publication_action', { projectId: 'film', publicationId: 'publication', action: 'package', requestId: 'package-once' }, '/projects/film/publications/publication/jobs', 'POST'],
    ]
    for (const [name, args, path, method] of cases) {
      const result = await call(name, args)
      assert.equal(result.result.isError, false, name)
      const request = requests.at(-1)
      assert.ok(request.path.endsWith(path), name)
      assert.equal(request.method || 'GET', method, name)
      assert.equal(request.headers['X-Studio-Document-Version'], '2', name)
    }
    assert.deepEqual(JSON.parse(requests[5].body), { revision: 7 })
    assert.deepEqual(JSON.parse(requests[6].body), { confirm_generation: false })
    assert.equal(JSON.parse(requests[7].body).confirm_external_write, false)
    const count = requests.length
    const invalid = await call('studio_publication_action', { projectId: '../escape', publicationId: 'post', action: 'publish', requestId: 'same' })
    assert.equal(invalid.error.code, -32602)
    assert.equal(requests.length, count)
  } finally {
    globalThis.fetch = originalFetch
    names.forEach((name, index) => { if (before[index] === undefined) delete process.env[name]; else process.env[name] = before[index] })
  }
})
