import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

// These lazy-loaded catalogs must ship with every hosted build. Missing files
// must fail deployment instead of becoming a runtime 404 in the inspiration UI.
export function verifyWorkbenchAssets(directory) {
  for (const name of ['manifest', 'seedance', 'haohaoxue', 'youmind', 'gallery-pool']) {
    const file = resolve(directory, 'inspirations', `${name}.json`)
    if (!statSync(file).isFile()) throw new Error(`Missing workbench asset: ${file}`)
    const payload = JSON.parse(readFileSync(file, 'utf8'))
    if (name !== 'manifest' && !Array.isArray(payload.entries)) {
      throw new Error(`Invalid inspiration catalog: ${file}`)
    }
  }
}
