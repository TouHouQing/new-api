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
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, dirname, basename } from 'node:path'

import { expect, test } from 'vitest'

test.each([
  [
    'project CRLF',
    '/*\r\nCopyright (C) 2023-2026 QuantumNous\r\nProtected attribution\r\n*/\r\n',
  ],
  ['third-party LF', '/*\nMIT License\nCopyright (c) Example Authors\n*/\n'],
])(
  'formatting preserves the exact %s license banner before sorted imports',
  (_name, header) => {
    const root = resolve(import.meta.dirname, '../..')
    const directory = mkdtempSync(join(tmpdir(), 'protected-format-'))
    try {
      writeFileSync(join(directory, '.gitignore'), '')
      writeFileSync(
        join(directory, '.oxfmtrc.json'),
        '{"sortImports":true,"semi":false,"singleQuote":true}'
      )
      const fixture = join(directory, 'fixture.ts')
      writeFileSync(
        fixture,
        `${
          header
        }import zebra from './z'\nimport alpha from './a'\nexport const names=[zebra,alpha]\n`
      )
      const environment = {
        ...process.env,
        PATH:
          resolve(root, 'node_modules/.bin') +
          (process.platform === 'win32' ? ';' : ':') +
          process.env.PATH,
      }
      execFileSync(
        process.execPath,
        [join(root, 'scripts/format-with-protected-headers.mjs'), '--write'],
        { cwd: directory, env: environment, stdio: 'pipe' }
      )
      const result = readFileSync(fixture, 'utf8')
      expect(result.startsWith(header)).toBe(true)
      expect(result.match(/Copyright/g)).toHaveLength(1)
      expect(result.indexOf('import alpha')).toBeLessThan(
        result.indexOf('import zebra')
      )
    } finally {
      if (
        dirname(resolve(directory)) !== resolve(tmpdir()) ||
        !basename(directory).startsWith('protected-format-')
      ) {
        throw new Error('Unexpected cleanup target')
      }
      rmSync(directory, { recursive: true, force: true })
    }
  }
)
