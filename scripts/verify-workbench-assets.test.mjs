import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyWorkbenchAssets } from './verify-workbench-assets.mjs'

test('hosted builds reject missing or invalid lazy-loaded catalogs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'thq-catalog-test-'))
  try {
    mkdirSync(join(dir, 'inspirations'))
    for (const name of ['manifest', 'seedance', 'haohaoxue', 'gallery-pool']) {
      writeFileSync(join(dir, 'inspirations', `${name}.json`), '{"entries":[]}')
    }
    assert.throws(() => verifyWorkbenchAssets(dir), /youmind.json/)
    writeFileSync(join(dir, 'inspirations/youmind.json'), '{}')
    assert.throws(() => verifyWorkbenchAssets(dir), /Invalid inspiration catalog/)
    writeFileSync(join(dir, 'inspirations/youmind.json'), '{"entries":[]}')
    assert.doesNotThrow(() => verifyWorkbenchAssets(dir))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
