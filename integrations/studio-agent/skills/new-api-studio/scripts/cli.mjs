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
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import { editCanvas, request, runNode, workspacePath } from './client.mjs'
import { handleMessage } from './mcp.mjs'

export async function main(argv = process.argv.slice(2)) {
  const [action, sessionId, ...rest] = argv
  const option = (name) => {
    const index = rest.indexOf(name)
    return index >= 0 ? rest[index + 1] : undefined
  }
  let result
  if (action === 'cloud') {
    const file = option('--file')
    const args = file ? JSON.parse(await readFile(file, 'utf8')) : {}
    const response = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: sessionId, arguments: args } })
    if (response.error || response.result.isError) throw new Error(response.error?.message || response.result.content[0].text)
    result = response.result.structuredContent.data
  } else if (action === 'list') result = await request('/sessions')
  else if (action === 'read' || action === 'catalog') {
    result = await request(workspacePath(sessionId))
    if (action === 'catalog') result = result.snapshot?.capabilities
  } else if (action === 'edit') {
    const file = option('--file')
    if (!file)
      throw new Error(
        'Use edit SESSION --revision N --file operations.json [--request-id UUID]'
      )
    result = await editCanvas({
      sessionId,
      expectedRevision: Number(option('--revision')),
      requestId: option('--request-id'),
      operations: JSON.parse(await readFile(file, 'utf8')),
    })
  } else if (action === 'run') {
    result = await runNode({
      sessionId,
      nodeId: rest[0],
      expectedRevision: Number(option('--revision')),
      requestId: option('--request-id'),
      confirmGeneration: rest.includes('--confirm-generation'),
      ...(rest.includes('--budget') ? { budget: Number(option('--budget')) } : {}),
    })
  } else if (action === 'job') {
    if (!rest[0]) throw new Error('Use job SESSION JOB_ID')
    result = await request(
      `${workspacePath(sessionId)}/commands/${encodeURIComponent(rest[0])}`
    )
  } else
    throw new Error(
      'Commands: list | read SESSION | catalog SESSION | edit SESSION --revision N --file FILE | run SESSION NODE --revision N --confirm-generation [--budget QUOTA] | job SESSION JOB'
    )
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return result
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
