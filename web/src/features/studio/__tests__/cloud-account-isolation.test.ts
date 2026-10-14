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
import { Blob as NodeBlob } from 'node:buffer'

import { AxiosError } from 'axios'
import { IDBFactory } from 'fake-indexeddb'
import { assert, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { createStudioMediaStore } from '../media-store'
import { createStudioCloudStore } from '../studio-cloud'
import { studioProductionSchema } from '../studio-production'
import { recordStudioTake, createStudioProject } from '../workspace'

test('a refresh ignored while typing does not acknowledge unsaved edits or lose them in the next save', async () => {
  const original = createStudioProject('Original', 'typing-during-refresh')
  original.production = studioProductionSchema.parse({})
  let remote = structuredClone(original)
  let revision = 1
  let release: () => void = () => {}
  let started: () => void = () => {}
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  const reading = new Promise<void>((resolve) => {
    started = resolve
  })
  let holdRefresh = false
  const request = vi
    .spyOn(api, 'request')
    .mockImplementation(async (config) => {
      if (
        config.method === 'GET' &&
        config.url === '/api/studio/cloud/projects'
      ) {
        if (holdRefresh) {
          started()
          await waiting
        }
        return {
          data: {
            success: true,
            data: [
              {
                id: original.id,
                revision,
                role: 'owner',
                owner_id: 12,
                document: structuredClone(remote),
              },
            ],
          },
        }
      }
      if (config.method === 'PUT') {
        remote = structuredClone(
          (config.data as { document: typeof original }).document
        )
        revision++
      }
      return {
        data: {
          success: true,
          data: {
            id: original.id,
            revision,
            role: 'owner',
            owner_id: 12,
            document: structuredClone(remote),
          },
        },
      }
    })
  try {
    const store = createStudioCloudStore(
      createStudioMediaStore(new IDBFactory(), 'typing-refresh')
    )
    const loaded = await store.loadProjects(12)
    assert(loaded)
    let current: (typeof original)[] = loaded
    const before = current
    holdRefresh = true
    const refresh = store.syncProjects(12, before, () => current)
    await reading
    const draft = structuredClone(original)
    draft.title = 'Latest typed title'
    current = [draft]
    assert(remote.production)
    remote.production.brief = 'A completed background task'
    revision++
    const save = store.saveProjects(12, current)
    release()
    await refresh
    await save
    expect(remote.title).toBe('Latest typed title')
    expect(remote.production?.brief).toBe('A completed background task')
  } finally {
    release()
    request.mockRestore()
  }
})

test('reopening after a failed save retains the unsaved local draft and merges server results', async () => {
  const original = createStudioProject('Original', 'unsaved-reopen')
  original.production = studioProductionSchema.parse({})
  let remote = structuredClone(original)
  const local = createStudioMediaStore(new IDBFactory(), 'unsaved-reopen')
  let failWrite = false
  const request = vi
    .spyOn(api, 'request')
    .mockImplementation(async (config) => {
      if (config.method === 'PUT') {
        if (failWrite) throw new Error('Storage temporarily unavailable')
        remote = structuredClone(
          (config.data as { document: typeof original }).document
        )
      }
      const item = {
        id: original.id,
        revision: 1,
        role: 'owner',
        owner_id: 12,
        document: structuredClone(remote),
      }
      return {
        data: {
          success: true,
          data: config.url === '/api/studio/cloud/projects' ? [item] : item,
        },
      }
    })
  try {
    const store = createStudioCloudStore(local)
    await store.loadProjects(12)
    const draft = structuredClone(original)
    draft.title = 'Unsaved title'
    failWrite = true
    await expect(store.saveProjects(12, [draft])).rejects.toThrow(
      'Storage temporarily unavailable'
    )
    assert(remote.production)
    remote.production.brief = 'Result completed on the server'
    const reopened = createStudioCloudStore(local)
    const projects = await reopened.loadProjects(12)
    expect(projects?.[0].title).toBe('Unsaved title')
    expect(projects?.[0].production?.brief).toBe(
      'Result completed on the server'
    )
  } finally {
    request.mockRestore()
  }
})

test('a stable unsaved draft survives an accepted refresh and a second server edit', async () => {
  const original = createStudioProject('Original', 'accepted-refresh')
  original.production = studioProductionSchema.parse({})
  let remote = structuredClone(original)
  let revision = 1
  const request = vi
    .spyOn(api, 'request')
    .mockImplementation(async (config) => {
      if (config.method === 'PUT') {
        remote = structuredClone(
          (config.data as { document: typeof original }).document
        )
        revision++
      }
      const record = {
        id: original.id,
        revision,
        role: 'owner',
        owner_id: 12,
        document: structuredClone(remote),
      }
      return {
        data: {
          success: true,
          data: config.url?.endsWith('/projects') ? [record] : record,
        },
      }
    })
  try {
    const store = createStudioCloudStore(
      createStudioMediaStore(new IDBFactory(), 'accepted-refresh')
    )
    await store.loadProjects(12)
    let current = [{ ...original, title: 'Stable unsaved title' }]
    assert(remote.production)
    remote.production.brief = 'First server result'
    revision++
    current = await store.syncProjects(12, current, () => current)
    store.acceptSyncedProjects(12, current)
    remote.production.brief = 'Second server result'
    revision++
    await store.saveProjects(12, current)
    expect(remote.title).toBe('Stable unsaved title')
    expect(remote.production.brief).toBe('Second server result')
  } finally {
    request.mockRestore()
  }
})

test.each([false, true])(
  'switching accounts while cached media is being read rejects the old save before any remote upload (same account logs back in: %s)',
  async (logsBackIn) => {
    const local = createStudioMediaStore(
      new IDBFactory(),
      'cloud-account-isolation'
    )
    const source = new NodeBlob(['private first-account media'], {
      type: 'video/mp4',
    }) as unknown as Blob
    await local.put(12, 'private-source', source)
    const project = createStudioProject('Private film', 'private-film')
    project.nodes = [
      {
        id: 'clip',
        type: 'studio',
        position: { x: 0, y: 0 },
        data: {
          kind: 'video',
          title: 'Private clip',
          prompt: '',
          mediaId: 'private-source',
          status: 'completed',
        },
      },
    ]
    let readStarted = () => {}
    const reading = new Promise<void>((resolve) => {
      readStarted = resolve
    })
    let resumeRead = () => {}
    const resume = new Promise<void>((resolve) => {
      resumeRead = resolve
    })
    const realGet = local.get
    const read = vi
      .spyOn(local, 'get')
      .mockImplementation(async (userId, mediaId) => {
        const blob = await realGet(userId, mediaId)
        if (userId === 12 && mediaId === 'private-source') {
          readStarted()
          await resume
        }
        return blob
      })
    const request = vi
      .spyOn(api, 'request')
      .mockImplementation(async (config) => ({
        data: {
          success: true,
          data:
            config.method === 'PUT'
              ? {
                  id: project.id,
                  owner_id: 12,
                  role: 'owner',
                  revision: 2,
                  document: (config.data as { document: typeof project })
                    .document,
                }
              : {
                  id: project.id,
                  owner_id: 12,
                  role: 'owner',
                  revision: 1,
                  document: project,
                },
        },
      }))
    const upload = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true } })
    try {
      const cloud = createStudioCloudStore(local)
      const pending = cloud.saveProjects(12, [project]).then(
        () => null,
        (error: unknown) => error
      )
      await reading
      await cloud.put(
        13,
        'second-account-media',
        new NodeBlob(['second account']) as unknown as Blob
      )
      if (logsBackIn) {
        await cloud.put(
          12,
          'new-session-media',
          new NodeBlob(['new session']) as unknown as Blob
        )
      }
      resumeRead()
      expect(await pending).toBeInstanceOf(Error)
      expect(upload).not.toHaveBeenCalled()
      expect(request).not.toHaveBeenCalled()
      expect(await (await realGet(13, 'second-account-media'))?.text()).toBe(
        'second account'
      )
    } finally {
      resumeRead()
      read.mockRestore()
      request.mockRestore()
      upload.mockRestore()
    }
  }
)

test('an invalid number in a project draft cannot throw from the saved-state indicator', async () => {
  const project = createStudioProject('Valid', 'numeric-save')
  const request = vi.spyOn(api, 'request').mockResolvedValue({
    data: {
      success: true,
      data: [{ id: project.id, role: 'owner', revision: 1, document: project }],
    },
  })
  try {
    const cloud = createStudioCloudStore(
      createStudioMediaStore(new IDBFactory(), 'invalid-save-indicator')
    )
    await cloud.loadProjects(12)
    const invalid = {
      ...project,
      production: { ...studioProductionSchema.parse({}), width: 0 },
    }
    expect(() => cloud.isProjectSaved(12, invalid)).not.toThrow()
    expect(cloud.isProjectSaved(12, invalid)).toBe(false)
    expect(cloud.cloudRecord(project.id)?.revision).toBe(1)
  } finally {
    request.mockRestore()
  }
})

test('an autosave cannot advance the revision while a saved native edit is being submitted', async () => {
  const base = createStudioProject('Original', 'serial-native')
  let remote = { id: base.id, role: 'owner', revision: 1, document: base }
  const request = vi
    .spyOn(api, 'request')
    .mockImplementation(async (config) => {
      if (config.method === 'PUT') {
        remote = {
          ...remote,
          revision: remote.revision + 1,
          document: (config.data as { document: typeof base }).document,
        }
      }
      return {
        data: {
          success: true,
          data: config.url?.endsWith('/projects') ? [remote] : remote,
        },
      }
    })
  let entered = () => {},
    resume = () => {}
  const submitting = new Promise<void>((resolve) => {
    entered = resolve
  })
  const submitted = new Promise<void>((resolve) => {
    resume = resolve
  })
  try {
    const cloud = createStudioCloudStore(
      createStudioMediaStore(new IDBFactory(), 'serial-native')
    )
    await cloud.loadProjects(12)
    const operation = cloud.withSavedProjects(
      12,
      [{ ...base, title: 'Edit result' }],
      async () => {
        entered()
        await submitted
        return remote.revision
      }
    )
    await submitting
    const autosave = cloud.saveProjects(12, [{ ...base, title: 'Later edit' }])
    expect(remote.document.title).toBe('Edit result')
    resume()
    expect(await operation).toBe(2)
    await autosave
    expect(remote.document.title).toBe('Later edit')
  } finally {
    resume()
    request.mockRestore()
  }
})

test('a task completing during a CAS retry preserves both its Take and the local title change', async () => {
  const base = createStudioProject('Original', 'task-save-race')
  base.nodes = [
    {
      id: 'image',
      type: 'studio',
      position: { x: 0, y: 0 },
      data: { kind: 'image', title: 'Image', prompt: '' },
    },
  ]
  let remote = { id: base.id, role: 'owner', revision: 1, document: base }
  let competed = false
  const request = vi
    .spyOn(api, 'request')
    .mockImplementation(async (config) => {
      if (config.method === 'PUT') {
        if (!competed) {
          competed = true
          remote = {
            ...remote,
            revision: 2,
            document: recordStudioTake(base, 'image', {
              id: 'completed-task',
              createdAt: '2026-10-11T00:00:00Z',
              status: 'completed',
              prompt: '',
              mediaId: 'stored-image',
            }),
          }
          throw new AxiosError(
            'Revision changed',
            'ERR_BAD_REQUEST',
            undefined,
            undefined,
            { status: 409 } as never
          )
        }
        remote = {
          ...remote,
          revision: remote.revision + 1,
          document: (config.data as { document: typeof base }).document,
        }
      }
      return {
        data: {
          success: true,
          data: config.url?.endsWith('/projects') ? [remote] : remote,
        },
      }
    })
  try {
    const cloud = createStudioCloudStore(
      createStudioMediaStore(new IDBFactory(), 'task-save-race')
    )
    await cloud.loadProjects(12)
    await cloud.saveProjects(12, [{ ...base, title: 'Local title' }])
    expect(remote.document.title).toBe('Local title')
    expect(remote.document.nodes[0].data.mediaId).toBe('stored-image')
    expect(remote.document.nodes[0].data.takes?.[0].id).toBe('completed-task')
  } finally {
    request.mockRestore()
  }
})

test('ignoring a refresh while typing does not turn the next autosave into deletion of a completed Take', async () => {
  const base = createStudioProject('Original', 'ignored-refresh')
  base.nodes = [
    {
      id: 'image',
      type: 'studio',
      position: { x: 0, y: 0 },
      data: { kind: 'image', title: 'Image', prompt: '' },
    },
  ]
  let remote = { id: base.id, role: 'owner', revision: 1, document: base }
  const request = vi
    .spyOn(api, 'request')
    .mockImplementation(async (config) => {
      if (config.method === 'PUT') {
        remote = {
          ...remote,
          revision: remote.revision + 1,
          document: (config.data as { document: typeof base }).document,
        }
      }
      return {
        data: {
          success: true,
          data: config.url?.endsWith('/projects') ? [remote] : remote,
        },
      }
    })
  try {
    const cloud = createStudioCloudStore(
      createStudioMediaStore(new IDBFactory(), 'ignored-refresh')
    )
    await cloud.loadProjects(12)
    remote = {
      ...remote,
      revision: 2,
      document: recordStudioTake(base, 'image', {
        id: 'new-result',
        createdAt: '2026-10-11T00:00:00Z',
        status: 'completed',
        prompt: '',
        mediaId: 'new-media',
      }),
    }
    await cloud.syncProjects(12, [base])
    // The user typed while refreshing, so the UI keeps its current draft.
    await cloud.saveProjects(12, [{ ...base, title: 'New title' }])
    expect(remote.document.title).toBe('New title')
    expect(remote.document.nodes[0].data.mediaId).toBe('new-media')
    expect(remote.document.nodes[0].data.takes?.[0].id).toBe('new-result')
  } finally {
    request.mockRestore()
  }
})
