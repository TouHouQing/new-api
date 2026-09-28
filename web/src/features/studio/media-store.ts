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
import {
  loadStudioProjects,
  saveStudioProjects,
  studioProjectsKey,
  type StudioProject,
} from './local-projects'

type StoredMedia = { key: string; blob: Blob }
type StoredProjects = { key: string; raw: string }

function serializeProjects(userId: number, projects: StudioProject[]): string {
  let raw = ''
  saveStudioProjects(
    { setItem: (_key, value) => (raw = value) },
    userId,
    projects
  )
  return raw
}

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
  let writeQueue: Promise<void> = Promise.resolve()

  function open(): Promise<IDBDatabase> {
    if (databasePromise) return databasePromise
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(name, 2)
      request.addEventListener('upgradeneeded', () => {
        if (!request.result.objectStoreNames.contains('media')) {
          request.result.createObjectStore('media', { keyPath: 'key' })
        }
        if (!request.result.objectStoreNames.contains('projects')) {
          request.result.createObjectStore('projects', { keyPath: 'key' })
        }
      })
      request.addEventListener(
        'success',
        () => {
          const database = request.result
          database.addEventListener('versionchange', () => {
            database.close()
            databasePromise = null
          })
          resolve(database)
        },
        { once: true }
      )
      request.addEventListener(
        'error',
        () =>
          reject(request.error ?? new Error('media storage is unavailable')),
        { once: true }
      )
    }).catch((error: unknown) => {
      databasePromise = null
      throw error
    })
    return databasePromise
  }

  function enqueueWrite(operation: () => Promise<void>): Promise<void> {
    const pending = writeQueue.then(operation)
    writeQueue = pending.catch(() => {})
    return pending
  }

  async function write(
    stores: string | string[],
    operation: (transaction: IDBTransaction) => void
  ): Promise<void> {
    const database = await open()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(stores, 'readwrite')
      transaction.addEventListener('complete', () => resolve(), { once: true })
      transaction.addEventListener(
        'abort',
        () =>
          reject(transaction.error ?? new Error('Studio storage write failed')),
        { once: true }
      )
      transaction.addEventListener(
        'error',
        () =>
          reject(transaction.error ?? new Error('Studio storage write failed')),
        { once: true }
      )
      try {
        operation(transaction)
      } catch (error) {
        transaction.abort()
        reject(error)
      }
    })
  }

  return {
    async put(userId: number, mediaId: string, blob: Blob): Promise<void> {
      const key = mediaKey(userId, mediaId)
      await enqueueWrite(() => {
        return write('media', (transaction) => {
          transaction
            .objectStore('media')
            .put({ key, blob } satisfies StoredMedia)
        })
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
      await enqueueWrite(() => {
        return write('media', (transaction) => {
          transaction.objectStore('media').delete(key)
        })
      })
    },
    async loadProjects(userId: number): Promise<StudioProject[] | null> {
      const key = studioProjectsKey(userId)
      const database = await open()
      return new Promise<StudioProject[] | null>((resolve, reject) => {
        const transaction = database.transaction('projects', 'readonly')
        const request = transaction.objectStore('projects').get(key)
        request.addEventListener(
          'success',
          () => {
            const stored = request.result as StoredProjects | undefined
            if (!stored) {
              resolve(null)
              return
            }
            try {
              resolve(loadStudioProjects({ getItem: () => stored.raw }, userId))
            } catch (error) {
              reject(error)
            }
          },
          { once: true }
        )
        request.addEventListener(
          'error',
          () =>
            reject(request.error ?? new Error('Studio projects read failed')),
          { once: true }
        )
      })
    },
    async saveProjects(
      userId: number,
      projects: StudioProject[]
    ): Promise<void> {
      const key = studioProjectsKey(userId)
      const raw = serializeProjects(userId, projects)
      await enqueueWrite(() =>
        write('projects', (transaction) => {
          transaction
            .objectStore('projects')
            .put({ key, raw } satisfies StoredProjects)
        })
      )
    },
    async saveProjectsIfAbsent(
      userId: number,
      projects: StudioProject[]
    ): Promise<boolean> {
      const key = studioProjectsKey(userId)
      const raw = serializeProjects(userId, projects)
      let inserted = false
      await enqueueWrite(async () => {
        const database = await open()
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction('projects', 'readwrite')
          const request = transaction.objectStore('projects').get(key)
          request.addEventListener(
            'success',
            () => {
              if (request.result !== undefined) return
              try {
                transaction
                  .objectStore('projects')
                  .put({ key, raw } satisfies StoredProjects)
                inserted = true
              } catch (error) {
                transaction.abort()
                reject(error)
              }
            },
            { once: true }
          )
          transaction.addEventListener('complete', () => resolve(), {
            once: true,
          })
          transaction.addEventListener(
            'abort',
            () =>
              reject(
                transaction.error ?? new Error('Studio storage write failed')
              ),
            { once: true }
          )
          transaction.addEventListener(
            'error',
            () =>
              reject(
                transaction.error ?? new Error('Studio storage write failed')
              ),
            { once: true }
          )
        })
      })
      return inserted
    },
    async putWithProjects(
      userId: number,
      mediaId: string,
      blob: Blob,
      projects: StudioProject[]
    ): Promise<void> {
      const mediaStorageKey = mediaKey(userId, mediaId)
      const projectStorageKey = studioProjectsKey(userId)
      const raw = serializeProjects(userId, projects)
      await enqueueWrite(() =>
        write(['media', 'projects'], (transaction) => {
          transaction
            .objectStore('projects')
            .put({ key: projectStorageKey, raw } satisfies StoredProjects)
          transaction
            .objectStore('media')
            .put({ key: mediaStorageKey, blob } satisfies StoredMedia)
        })
      )
    },
    async deleteWithProjects(
      userId: number,
      mediaId: string,
      projects: StudioProject[]
    ): Promise<void> {
      const mediaStorageKey = mediaKey(userId, mediaId)
      const projectStorageKey = studioProjectsKey(userId)
      const raw = serializeProjects(userId, projects)
      await enqueueWrite(() =>
        write(['media', 'projects'], (transaction) => {
          transaction.objectStore('media').delete(mediaStorageKey)
          transaction
            .objectStore('projects')
            .put({ key: projectStorageKey, raw } satisfies StoredProjects)
        })
      )
    },
  }
}

export function studioMediaStore() {
  if (typeof indexedDB === 'undefined') {
    throw new Error('browser media storage is unavailable')
  }
  return createStudioMediaStore(indexedDB, 'newapi-studio-media-v1')
}
