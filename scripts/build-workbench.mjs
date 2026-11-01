import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { verifyWorkbenchAssets } from './verify-workbench-assets.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'workbench/web')
const target = resolve(root, 'web/dist/workbench')
const bun = process.execPath
verifyWorkbenchAssets(resolve(source, 'public'))

function run(args, cwd, env = process.env) {
  const result = spawnSync(bun, args, { cwd, env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}

if (!existsSync(resolve(source, 'node_modules/vite/package.json'))) {
  const args = ['install', '--frozen-lockfile', '--no-cache']
  if (process.env.NPM_REGISTRY) args.push('--registry', process.env.NPM_REGISTRY)
  run(args, source)
}
run(['run', 'build'], source, {
  ...process.env,
  VITE_NEW_API_WORKBENCH: 'true',
  VITE_CANVAS_BACKEND_URL: '/api/workbench',
})
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
cpSync(resolve(source, 'dist'), target, { recursive: true })
verifyWorkbenchAssets(target)
run(['build', 'src/lib/workbench-auth-bridge.ts', '--outfile=dist/workbench/auth-bridge.js', '--target=browser', '--format=esm', '--minify'], resolve(root, 'web'))
