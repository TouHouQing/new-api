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
import { describe, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import {
  StudioProjectStorageError,
  studioProjectsKey,
  type StudioProject,
} from './local-projects'
import { createStudioMediaStore } from './media-store'
import { createStudioCloudStore, refreshStudioProjects } from './studio-cloud'

const blob = (value: string): Blob =>
  new NodeBlob([value], { type: 'video/mp4' }) as unknown as Blob

const project = (title: string): StudioProject => ({
  id: 'project',
  title,
  nodes: [],
  edges: [],
  createdAt: '2026-09-26T00:00:00.000Z',
  updatedAt: '2026-09-26T00:00:00.000Z',
})

test('task refresh merges the existing draft and refuses to replace edits made while it is pending', async () => {
  let current = [project('Unsubmitted lyrics')]
  let finish: (projects: StudioProject[]) => void = () => {}
  const store = {
    loadProjects: vi.fn(async () => [project('Old server copy')]),
    syncProjects: vi.fn(
      (_userId: number, projects: StudioProject[]) =>
        new Promise<StudioProject[]>((resolve) => {
          expect(projects).toBe(current)
          finish = resolve
        })
    ),
  }
  const pending = refreshStudioProjects(
    store,
    1,
    () => current,
    () => true
  )
  current = [project('New lyrics typed during refresh')]
  finish([project('Completed take with earlier draft')])
  expect(await pending).toBeNull()
  expect(current[0].title).toBe('New lyrics typed during refresh')
  expect(store.loadProjects).not.toHaveBeenCalled()
})

test('task refresh accepts merged results when the workspace and account still match', async () => {
  const current = [project('Saved draft')]
  const merged = [project('Completed task and saved draft')]
  const store = {
    loadProjects: vi.fn(async () => null),
    syncProjects: vi.fn(async () => merged),
  }
  expect(
    await refreshStudioProjects(
      store,
      1,
      () => current,
      () => true
    )
  ).toBe(merged)
  expect(
    await refreshStudioProjects(
      store,
      1,
      () => current,
      () => false
    )
  ).toBeNull()
})

describe('browser-local Studio media', () => {
  test('cloud project edits reuse stored media without re-uploading cached bytes', async () => {
    const local = createStudioMediaStore(
      new IDBFactory(),
      'studio-cloud-cached-media'
    )
    const document = {
      ...project('Cloud'),
      production: { reviews: [] },
      nodes: [
        {
          id: 'clip',
          type: 'studio',
          position: { x: 0, y: 0 },
          data: {
            kind: 'video',
            title: 'Clip',
            prompt: '',
            status: 'completed',
            mediaId: 'source',
          },
        },
      ],
    }
    await local.put(12, 'source', blob('cached server bytes'))
    const record = {
      id: document.id,
      owner_id: 12,
      revision: 1,
      role: 'owner',
      document,
    }
    const request = vi
      .spyOn(api, 'request')
      .mockResolvedValueOnce({ data: { success: true, data: [record] } })
      .mockResolvedValueOnce({ data: { success: true, data: record } })
      .mockResolvedValueOnce({
        data: { success: true, data: { ...record, revision: 2 } },
      })
    const upload = vi.spyOn(api, 'put')
    try {
      const cloud = createStudioCloudStore(local)
      const loaded = await cloud.loadProjects(12)
      expect(loaded).toHaveLength(1)
      if (!loaded) throw new Error('Expected the stored cloud project')
      const production = loaded[0].production
      if (!production) {
        throw new Error('Expected normalized production defaults')
      }
      await cloud.saveProjects(12, [
        {
          ...loaded[0],
          title: 'Human edit',
          production: { ...production, width: 640 },
        },
      ])
      expect(upload).not.toHaveBeenCalled()
      expect(
        request.mock.calls.some(([config]) => config.method === 'PUT')
      ).toBe(true)
      expect(request.mock.calls.at(-1)?.[0].data).toMatchObject({
        document: { production: { width: 640 } },
      })
      await expect(
        cloud.put(12, 'source', blob('replacement'))
      ).rejects.toThrow('immutable')
      expect(await (await local.get(12, 'source'))?.text()).toBe(
        'cached server bytes'
      )
    } finally {
      request.mockRestore()
      upload.mockRestore()
    }
  })
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

  test('upgrades a v1 media database without losing existing bytes', async () => {
    const factory = new IDBFactory()
    const name = 'studio-media-upgrade-test'
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(name, 1)
      request.addEventListener('upgradeneeded', () =>
        request.result.createObjectStore('media', { keyPath: 'key' })
      )
      request.addEventListener('success', () => resolve(request.result))
      request.addEventListener('error', () => reject(request.error))
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = legacy.transaction('media', 'readwrite')
      transaction
        .objectStore('media')
        .put({ key: '12:shot', blob: blob('old') })
      transaction.addEventListener('complete', () => resolve())
      transaction.addEventListener('error', () => reject(transaction.error))
    })
    legacy.close()

    const store = createStudioMediaStore(factory, name)
    expect(await (await store.get(12, 'shot'))?.text()).toBe('old')
    await store.saveProjects(12, [project('Draft')])
    expect(await store.loadProjects(12)).toEqual([project('Draft')])
  })

  test('persists project metadata across store instances and isolates owners', async () => {
    const factory = new IDBFactory()
    const name = 'studio-project-durability-test'
    const first = createStudioMediaStore(factory, name)
    expect(await first.loadProjects(12)).toBeNull()
    await first.saveProjects(12, [project('Owner 12')])
    await first.saveProjects(13, [project('Owner 13')])

    const reopened = createStudioMediaStore(factory, name)
    expect(await reopened.loadProjects(12)).toEqual([project('Owner 12')])
    expect(await reopened.loadProjects(13)).toEqual([project('Owner 13')])
    await reopened.saveProjects(12, [])
    expect(await first.loadProjects(12)).toEqual([])
    expect(await first.loadProjects(13)).toEqual([project('Owner 13')])
  })

  test('serializes overlapping project saves in invocation order', async () => {
    const store = createStudioMediaStore(
      new IDBFactory(),
      'studio-project-save-order-test'
    )
    await Promise.all([
      store.saveProjects(12, [project('Earlier')]),
      store.saveProjects(12, [project('Latest')]),
    ])
    expect(await store.loadProjects(12)).toEqual([project('Latest')])
  })

  test('conditional migration save never replaces an existing snapshot', async () => {
    const store = createStudioMediaStore(
      new IDBFactory(),
      'studio-project-conditional-save-test'
    )
    await store.saveProjects(12, [project('Current')])
    expect(await store.saveProjectsIfAbsent(12, [project('Legacy')])).toBe(
      false
    )
    expect(await store.loadProjects(12)).toEqual([project('Current')])
    expect(await store.saveProjectsIfAbsent(13, [project('New')])).toBe(true)
    expect(await store.loadProjects(13)).toEqual([project('New')])
  })

  test('commits media and its project snapshot in one transaction', async () => {
    const store = createStudioMediaStore(
      new IDBFactory(),
      'studio-media-project-atomic-test'
    )
    await store.putWithProjects(12, 'shot', blob('first'), [project('First')])
    expect(await (await store.get(12, 'shot'))?.text()).toBe('first')
    expect(await store.loadProjects(12)).toEqual([project('First')])

    await store.deleteWithProjects(12, 'shot', [project('After delete')])
    expect(await store.get(12, 'shot')).toBeNull()
    expect(await store.loadProjects(12)).toEqual([project('After delete')])
  })

  test('rolls back project changes when a combined media write fails', async () => {
    const store = createStudioMediaStore(
      new IDBFactory(),
      'studio-media-project-rollback-test'
    )
    await store.saveProjects(12, [project('Before')])

    await expect(
      store.putWithProjects(12, 'shot', (() => {}) as unknown as Blob, [
        project('After'),
      ])
    ).rejects.toThrow()
    expect(await store.get(12, 'shot')).toBeNull()
    expect(await store.loadProjects(12)).toEqual([project('Before')])
  })

  test('rejects invalid project snapshots without changing saved metadata', async () => {
    const store = createStudioMediaStore(
      new IDBFactory(),
      'studio-invalid-project-test'
    )
    await store.saveProjects(12, [project('Before')])
    await expect(
      store.saveProjects(12, [{ ...project('After'), title: 'x'.repeat(201) }])
    ).rejects.toThrow()
    expect(await store.loadProjects(12)).toEqual([project('Before')])
  })

  test('surfaces a corrupt IndexedDB snapshot without replacing its bytes', async () => {
    const factory = new IDBFactory()
    const name = 'studio-corrupt-project-test'
    const store = createStudioMediaStore(factory, name)
    await store.saveProjects(12, [project('Before')])
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(name, 2)
      request.addEventListener('success', () => resolve(request.result))
      request.addEventListener('error', () => reject(request.error))
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('projects', 'readwrite')
      transaction
        .objectStore('projects')
        .put({ key: studioProjectsKey(12), raw: '{broken' })
      transaction.addEventListener('complete', () => resolve())
      transaction.addEventListener('error', () => reject(transaction.error))
    })
    database.close()

    await expect(store.loadProjects(12)).rejects.toMatchObject({
      name: StudioProjectStorageError.name,
      raw: '{broken',
    })
  })
})
