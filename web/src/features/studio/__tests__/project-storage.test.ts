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
import { IDBFactory } from 'fake-indexeddb'
import { expect, test } from 'vitest'

import {
  saveStudioProjects,
  StudioProjectStorageError,
  studioProjectsKey,
  type StudioProject,
} from '../local-projects'
import { createStudioMediaStore } from '../media-store'
import {
  getStudioStorageHealth,
  migrateLegacyStudioProjects,
} from '../project-storage'

const project = (title: string): StudioProject => ({
  id: 'project',
  title,
  nodes: [],
  edges: [],
  createdAt: '2026-09-26T00:00:00.000Z',
  updatedAt: '2026-09-26T00:00:00.000Z',
})

function legacyStorage() {
  const values = new Map<string, string>()
  return {
    getItem(key: string) {
      return values.get(key) ?? null
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
    removeItem(key: string) {
      values.delete(key)
    },
  }
}

test('migrates a valid legacy snapshot and removes it only after IndexedDB commits', async () => {
  const storage = legacyStorage()
  const store = createStudioMediaStore(
    new IDBFactory(),
    'studio-migration-test'
  )
  saveStudioProjects(storage, 12, [project('Legacy')])

  const result = await migrateLegacyStudioProjects(store, storage, 12)

  expect(result).toEqual({ source: 'legacy', projects: [project('Legacy')] })
  expect(await store.loadProjects(12)).toEqual([project('Legacy')])
  expect(storage.getItem(studioProjectsKey(12))).toBeNull()
})

test('prefers a valid IndexedDB snapshot and leaves stale legacy data alone', async () => {
  const storage = legacyStorage()
  const store = createStudioMediaStore(
    new IDBFactory(),
    'studio-migration-current-test'
  )
  await store.saveProjects(12, [project('Current')])
  saveStudioProjects(storage, 12, [project('Stale')])

  expect(await migrateLegacyStudioProjects(store, storage, 12)).toEqual({
    source: 'indexeddb',
    projects: [project('Current')],
  })
  expect(storage.getItem(studioProjectsKey(12))).not.toBeNull()
})

test('preserves corrupt legacy bytes for recovery without writing an empty snapshot', async () => {
  const storage = legacyStorage()
  const store = createStudioMediaStore(
    new IDBFactory(),
    'studio-migration-corrupt-test'
  )
  storage.setItem(studioProjectsKey(12), '{broken')

  await expect(
    migrateLegacyStudioProjects(store, storage, 12)
  ).rejects.toBeInstanceOf(StudioProjectStorageError)
  expect(storage.getItem(studioProjectsKey(12))).toBe('{broken')
  expect(await store.loadProjects(12)).toBeNull()
})

test('reports an empty workspace when neither store has a snapshot', async () => {
  const store = createStudioMediaStore(
    new IDBFactory(),
    'studio-migration-empty-test'
  )
  expect(await migrateLegacyStudioProjects(store, legacyStorage(), 12)).toEqual(
    {
      source: 'empty',
      projects: [],
    }
  )
})

test('reports usage and an elevated backup warning near browser quota', async () => {
  const manager = { estimate: async () => ({ usage: 81, quota: 100 }) }
  expect(await getStudioStorageHealth(manager)).toEqual({
    usageBytes: 81,
    quotaBytes: 100,
    usageRatio: 0.81,
    backupWarning: 'near-quota',
  })
})

test('keeps the browser-local backup warning below the quota threshold', async () => {
  expect(
    await getStudioStorageHealth({
      estimate: async () => ({ usage: 1, quota: 10 }),
    })
  ).toEqual({
    usageBytes: 1,
    quotaBytes: 10,
    usageRatio: 0.1,
    backupWarning: 'browser-local',
  })
})

test('reports unavailable estimates when browser storage cannot be queried', async () => {
  const manager = {
    estimate: async () => {
      throw new Error('unavailable')
    },
  }
  expect(await getStudioStorageHealth(manager)).toEqual({
    usageBytes: null,
    quotaBytes: null,
    usageRatio: null,
    backupWarning: 'estimate-unavailable',
  })
  expect(await getStudioStorageHealth(null)).toEqual({
    usageBytes: null,
    quotaBytes: null,
    usageRatio: null,
    backupWarning: 'estimate-unavailable',
  })
})
