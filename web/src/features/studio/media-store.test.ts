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
import { Blob as NodeBlob } from 'node:buffer'

import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, test } from 'vitest'

import { createStudioMediaStore } from './media-store'

const blob = (value: string): Blob =>
  new NodeBlob([value], { type: 'video/mp4' }) as unknown as Blob

describe('browser-local Studio media', () => {
  test('keeps image and video bytes separate for users sharing a browser', async () => {
    const store = createStudioMediaStore(new IDBFactory(), 'studio-media-test')
    await store.put(12, 'shot', blob('user twelve'))
    await store.put(13, 'shot', blob('user thirteen'))

    expect(await (await store.get(12, 'shot'))?.text()).toBe('user twelve')
    expect(await (await store.get(13, 'shot'))?.text()).toBe('user thirteen')
  })

  test('deletes only the selected account asset', async () => {
    const store = createStudioMediaStore(
      new IDBFactory(),
      'studio-media-delete-test'
    )
    await store.put(12, 'shot', blob('A'))
    await store.put(13, 'shot', blob('B'))
    await store.delete(12, 'shot')

    expect(await store.get(12, 'shot')).toBeNull()
    expect(await (await store.get(13, 'shot'))?.text()).toBe('B')
  })

  test('rejects invalid account and media identifiers', async () => {
    const store = createStudioMediaStore(
      new IDBFactory(),
      'studio-media-invalid-test'
    )
    await expect(store.put(0, 'shot', blob('A'))).rejects.toThrow('user ID')
    await expect(store.get(12, '../shot')).rejects.toThrow('media ID')
  })

  test('retries opening browser media storage after a temporary failure', async () => {
    const underlying = new IDBFactory()
    let attempts = 0
    const factory = {
      open(name: string, version: number) {
        attempts += 1
        if (attempts === 1) throw new Error('temporary storage failure')
        return underlying.open(name, version)
      },
    } as IDBFactory
    const store = createStudioMediaStore(
      factory,
      'studio-media-open-retry-test'
    )
    await expect(store.put(12, 'shot', blob('A'))).rejects.toThrow(
      'temporary storage failure'
    )
    await expect(store.put(12, 'shot', blob('A'))).resolves.toBeUndefined()
    expect(attempts).toBe(2)
  })
})
