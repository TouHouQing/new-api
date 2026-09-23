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
type StoredMedia = { key: string; blob: Blob }

function mediaKey(userId: number, mediaId: string): string {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error('a valid user ID is required')
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(mediaId)) {
    throw new Error('a valid media ID is required')
  }
  return `${userId}:${mediaId}`
}

export function createStudioMediaStore(factory: IDBFactory, name: string) {
  let databasePromise: Promise<IDBDatabase> | null = null

  function open(): Promise<IDBDatabase> {
    if (databasePromise) return databasePromise
    databasePromise = new Promise((resolve, reject) => {
      const request = factory.open(name, 1)
      request.addEventListener('upgradeneeded', () => {
        request.result.createObjectStore('media', { keyPath: 'key' })
      })
      request.addEventListener('success', () => resolve(request.result), {
        once: true,
      })
      request.addEventListener(
        'error',
        () =>
          reject(request.error ?? new Error('media storage is unavailable')),
        { once: true }
      )
    })
    return databasePromise
  }

  return {
    async put(userId: number, mediaId: string, blob: Blob): Promise<void> {
      const key = mediaKey(userId, mediaId)
      const database = await open()
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('media', 'readwrite')
        transaction
          .objectStore('media')
          .put({ key, blob } satisfies StoredMedia)
        transaction.addEventListener('complete', () => resolve(), {
          once: true,
        })
        transaction.addEventListener(
          'error',
          () => reject(transaction.error ?? new Error('media save failed')),
          { once: true }
        )
        transaction.addEventListener(
          'abort',
          () => reject(transaction.error ?? new Error('media save failed')),
          { once: true }
        )
      })
    },
    async get(userId: number, mediaId: string): Promise<Blob | null> {
      const key = mediaKey(userId, mediaId)
      const database = await open()
      return new Promise<Blob | null>((resolve, reject) => {
        const transaction = database.transaction('media', 'readonly')
        const request = transaction.objectStore('media').get(key)
        request.addEventListener(
          'success',
          () => {
            const value = request.result as StoredMedia | undefined
            resolve(value?.blob ?? null)
          },
          { once: true }
        )
        request.addEventListener(
          'error',
          () => reject(request.error ?? new Error('media read failed')),
          { once: true }
        )
      })
    },
    async delete(userId: number, mediaId: string): Promise<void> {
      const key = mediaKey(userId, mediaId)
      const database = await open()
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('media', 'readwrite')
        transaction.objectStore('media').delete(key)
        transaction.addEventListener('complete', () => resolve(), {
          once: true,
        })
        transaction.addEventListener(
          'error',
          () => reject(transaction.error ?? new Error('media delete failed')),
          { once: true }
        )
        transaction.addEventListener(
          'abort',
          () => reject(transaction.error ?? new Error('media delete failed')),
          { once: true }
        )
      })
    },
  }
}

export function studioMediaStore() {
  if (typeof indexedDB === 'undefined') {
    throw new Error('browser media storage is unavailable')
  }
  return createStudioMediaStore(indexedDB, 'newapi-studio-media-v1')
}
