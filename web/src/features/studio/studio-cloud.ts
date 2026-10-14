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
import { isAxiosError } from 'axios'
import { t } from 'i18next'

import { api } from '@/lib/api'

import {
  studioProjectSchema,
  saveStudioProjects,
  type StudioProject,
} from './local-projects'
import type { createStudioMediaStore } from './media-store'
import {
  mergeStudioCloudDocument,
  StudioCloudConflictError,
} from './studio-cloud-merge'
import { studioDocumentMediaIds } from './studio-media-references'
import { studioWorkflowProblem } from './studio-workflow-problem'

export type StudioCloudProject = {
  id: string
  owner_id: number
  revision: number
  role: 'owner' | 'editor' | 'reviewer' | 'viewer'
  document: StudioProject
}
export type StudioCloudVersion = {
  revision: number
  author_id: number
  created_at: string
}
export type StudioCloudComment = {
  id: number
  revision: number
  author_id: number
  node_id: string
  take_id: string
  seconds: number
  message: string
  resolved: boolean
}
export type StudioCloudJob = {
  budget?: number
  used_quota?: number
  settlement_final?: boolean
  connector?: { id: string; provider: string; action: string }
  run_after?: number
  node_ids?: string[]
  id: string
  user_id: number
  kind: string
  status: string
  progress: number
  error: string
  revision: number
  result?: unknown
}

export async function studioCloudRequest<T>(
  path: string,
  method = 'GET',
  body?: unknown
): Promise<T> {
  let response
  try {
    response = await api.request({
      url: `/api/studio/cloud${path}`,
      method,
      data: body,
    })
  } catch (problem) {
    if (
      isAxiosError(problem) &&
      problem.response?.data?.code === 'studio_insufficient_quota'
    ) {
      throw new Error(
        t(
          'Insufficient generation credit. Add credit or continue with free editing.'
        )
      )
    }
    if (
      isAxiosError(problem) &&
      typeof problem.response?.data?.message === 'string'
    ) {
      const message = problem.response.data.message as string
      const mapped = studioWorkflowProblem(message)
      if (!mapped.startsWith('The task failed.')) {
        throw new Error(t(mapped), { cause: problem })
      }
    }
    throw problem
  }
  if (response.data?.success !== true) {
    throw new Error(response.data?.message || 'Studio request failed')
  }
  return response.data.data as T
}

export async function studioCloudMedia(
  projectId: string,
  mediaId: string
): Promise<Blob> {
  const response = await api.get(
    `/api/studio/cloud/media/${encodeURIComponent(mediaId)}?project_id=${encodeURIComponent(projectId)}`,
    { responseType: 'blob' }
  )
  return response.data as Blob
}

export async function refreshStudioProjects(
  store: {
    loadProjects: (userId: number) => Promise<StudioProject[] | null>
    syncProjects?: (
      userId: number,
      projects: StudioProject[],
      getCurrentProjects?: () => StudioProject[]
    ) => Promise<StudioProject[]>
    acceptSyncedProjects?: (userId: number, projects: StudioProject[]) => void
  },
  userId: number,
  getProjects: () => StudioProject[],
  isCurrentUser: () => boolean
): Promise<StudioProject[] | null> {
  const before = getProjects()
  const restored = store.syncProjects
    ? await store.syncProjects(userId, before, getProjects)
    : await store.loadProjects(userId)
  // A completed task can refresh while the user edits another field. Merge
  // existing edits and leave any newer edits for the next synchronization.
  if (!isCurrentUser() || getProjects() !== before) return null
  if (restored) store.acceptSyncedProjects?.(userId, restored)
  return restored
}

function documentForStorage(
  userId: number,
  project: StudioProject
): StudioProject {
  let raw = ''
  saveStudioProjects(
    {
      setItem: (_key, value) => {
        raw = value
      },
    },
    userId,
    [project]
  )
  return studioProjectSchema.parse(JSON.parse(raw).projects[0]) as StudioProject
}

function mediaReferences(projects: StudioProject[]): Set<string> {
  return studioDocumentMediaIds(projects)
}

// IndexedDB is an offline cache. Cloud revisions are kept outside the editable
// project so UI edits cannot forge an expected revision or another owner.
export function createStudioCloudStore(
  local: ReturnType<typeof createStudioMediaStore>
) {
  const records = new Map<string, StudioCloudProject>()
  const fingerprints = new Map<string, string>()
  const uploaded = new Set<string>()
  const acknowledged = new Map<string, StudioProject>()
  const pendingRefreshes = new WeakMap<
    StudioProject[],
    { epoch: number; records: StudioCloudProject[] }
  >()
  const conflicts = new Map<
    string,
    {
      path: string
      base: StudioProject
      local: StudioProject
      remote: StudioCloudProject
    }
  >()
  let account = 0
  let accountEpoch = 0
  let queue: Promise<void> = Promise.resolve()
  const resetAccount = (userId: number): void => {
    if (account === userId) return
    account = userId
    accountEpoch += 1
    queue = Promise.resolve()
    records.clear()
    fingerprints.clear()
    uploaded.clear()
    acknowledged.clear()
    conflicts.clear()
  }
  const assertAccount = (userId: number, epoch: number): void => {
    if (account !== userId || accountEpoch !== epoch) {
      throw new Error(t('Studio account changed'))
    }
  }
  const mediaQuery = (mediaId: string, projects?: StudioProject[]): string => {
    if (projects) {
      for (const project of projects) {
        if (
          records.has(project.id) &&
          mediaReferences([project]).has(mediaId)
        ) {
          return `?project_id=${encodeURIComponent(project.id)}`
        }
      }
    }
    for (const record of records.values()) {
      if (mediaReferences([record.document]).has(mediaId)) {
        return `?project_id=${encodeURIComponent(record.id)}`
      }
    }
    return ''
  }
  const requireNewMediaId = (userId: number, mediaId: string): void => {
    resetAccount(userId)
    for (const record of records.values()) {
      if (mediaReferences([record.document]).has(mediaId)) {
        throw new Error('Stored media is immutable; use a new media ID')
      }
    }
  }
  const upload = async (
    userId: number,
    mediaId: string,
    blob: Blob,
    epoch: number,
    projects?: StudioProject[]
  ): Promise<void> => {
    assertAccount(userId, epoch)
    const query = mediaQuery(mediaId, projects)
    const uploadKey = `${mediaId}${query}`
    if (uploaded.has(uploadKey)) return
    const response = await api.put(
      `/api/studio/cloud/media/${encodeURIComponent(mediaId)}${query}`,
      blob,
      {
        headers: { 'Content-Type': blob.type || 'application/octet-stream' },
        timeout: 180_000,
      }
    )
    assertAccount(userId, epoch)
    if (response.data?.success !== true) {
      throw new Error(response.data?.message || 'Media upload failed')
    }
    uploaded.add(uploadKey)
  }
  const saveRemote = async (
    userId: number,
    projects: StudioProject[],
    epoch: number
  ): Promise<void> => {
    assertAccount(userId, epoch)
    for (const mediaId of mediaReferences(projects)) {
      const blob = await local.get(userId, mediaId)
      assertAccount(userId, epoch)
      if (blob) await upload(userId, mediaId, blob, epoch, projects)
    }
    for (const project of projects) {
      assertAccount(userId, epoch)
      let record = records.get(project.id)
      let document = documentForStorage(userId, project)
      const fingerprint = JSON.stringify(document)
      if (!record) {
        try {
          const current = await studioCloudRequest<StudioCloudProject>(
            `/projects/${encodeURIComponent(project.id)}`
          )
          assertAccount(userId, epoch)
          current.document = studioProjectSchema.parse(
            current.document
          ) as StudioProject
          record = current
          records.set(project.id, current)
          if (
            JSON.stringify(documentForStorage(userId, current.document)) !==
            fingerprint
          ) {
            throw new Error('Project already exists; refresh before editing it')
          }
          fingerprints.set(project.id, fingerprint)
        } catch (error) {
          if (!isAxiosError(error) || error.response?.status !== 404) {
            throw error
          }
        }
      }
      if (fingerprints.get(project.id) === fingerprint) continue
      if (record && !['owner', 'editor'].includes(record.role)) continue
      let saved: StudioCloudProject | undefined
      for (let attempt = 0; attempt < 3; attempt++) {
        document = documentForStorage(userId, project)
        try {
          let revision = record?.revision || 0
          if (record) {
            const current = await studioCloudRequest<StudioCloudProject>(
              `/projects/${encodeURIComponent(project.id)}`
            )
            assertAccount(userId, epoch)
            current.document = studioProjectSchema.parse(
              current.document
            ) as StudioProject
            if (
              current.revision !== record.revision ||
              JSON.stringify(current.document) !==
                JSON.stringify(record.document)
            ) {
              try {
                document = mergeStudioCloudDocument(
                  record.document,
                  document,
                  current.document
                )
              } catch (error) {
                if (error instanceof StudioCloudConflictError) {
                  conflicts.set(project.id, {
                    path: error.path,
                    base: record.document,
                    local: document,
                    remote: current,
                  })
                }
                throw error
              }
              revision = current.revision
            }
          }
          saved = await studioCloudRequest<StudioCloudProject>(
            `/projects/${encodeURIComponent(project.id)}`,
            'PUT',
            { revision, document }
          )
          break
        } catch (error) {
          if (
            attempt === 2 ||
            !isAxiosError(error) ||
            error.response?.status !== 409
          ) {
            throw error
          }
          // A rejected CAS did not write. Merge against a fresh revision;
          // overlapping edits still fail explicitly in the three-way merge.
        }
      }
      if (!saved) throw new Error(t('studio.project.saveFailed'))
      assertAccount(userId, epoch)
      records.set(project.id, {
        ...saved,
        document: documentForStorage(userId, project),
      })
      fingerprints.set(project.id, fingerprint)
      acknowledged.set(project.id, documentForStorage(userId, project))
      conflicts.delete(project.id)
    }
    for (const [id, record] of records) {
      if (
        projects.some((project) => project.id === id) ||
        record.role !== 'owner'
      ) {
        continue
      }
      assertAccount(userId, epoch)
      await studioCloudRequest(`/projects/${encodeURIComponent(id)}`, 'DELETE')
      assertAccount(userId, epoch)
      records.delete(id)
      fingerprints.delete(id)
      acknowledged.delete(id)
    }
    await local.saveProjects(
      userId,
      [...acknowledged.values()],
      'cloud-baseline'
    )
  }
  const persist = async (
    userId: number,
    projects: StudioProject[],
    epoch?: number
  ): Promise<void> => {
    if (epoch === undefined) resetAccount(userId)
    const expectedEpoch = epoch ?? accountEpoch
    assertAccount(userId, expectedEpoch)
    await local.saveProjects(userId, projects)
    assertAccount(userId, expectedEpoch)
    const pending = queue
      .catch(() => {})
      .then(() => saveRemote(userId, projects, expectedEpoch))
    queue = pending
    await pending
  }
  return {
    ...local,
    async loadProjects(userId: number): Promise<StudioProject[] | null> {
      resetAccount(userId)
      const epoch = accountEpoch
      await queue.catch(() => {})
      assertAccount(userId, epoch)
      const cached = await local.loadProjects(userId)
      const baselines = await local.loadProjects(userId, 'cloud-baseline')
      assertAccount(userId, epoch)
      const cloud = await studioCloudRequest<StudioCloudProject[]>('/projects')
      assertAccount(userId, epoch)
      records.clear()
      fingerprints.clear()
      for (const baseline of baselines || []) {
        acknowledged.set(baseline.id, baseline)
      }
      const restored: StudioProject[] = []
      for (const record of cloud) {
        record.document = studioProjectSchema.parse(
          record.document
        ) as StudioProject
        const draft = cached?.find((item) => item.id === record.id)
        const base = acknowledged.get(record.id)
        let document = record.document
        if (draft && base && ['owner', 'editor'].includes(record.role)) {
          try {
            document = mergeStudioCloudDocument(base, draft, record.document)
          } catch (error) {
            if (!(error instanceof StudioCloudConflictError)) throw error
            conflicts.set(record.id, {
              path: error.path,
              base,
              local: draft,
              remote: record,
            })
            document = draft
          }
        }
        records.set(record.id, { ...record, document: base || record.document })
        acknowledged.set(record.id, base || record.document)
        restored.push(document)
        fingerprints.set(record.id, JSON.stringify(record.document))
        for (const mediaId of mediaReferences([record.document])) {
          uploaded.add(`${mediaId}?project_id=${encodeURIComponent(record.id)}`)
        }
      }
      if (cloud.length) {
        const projects = restored
        for (const draft of cached || []) {
          if (!records.has(draft.id) && !acknowledged.has(draft.id)) {
            projects.push(draft)
          }
        }
        await local.saveProjects(
          userId,
          [...acknowledged.values()],
          'cloud-baseline'
        )
        await local.saveProjects(userId, projects)
        return projects
      }
      const existing = await local.loadProjects(userId)
      assertAccount(userId, epoch)
      if (existing?.length) await saveRemote(userId, existing, epoch)
      return existing
    },
    async saveProjects(
      userId: number,
      projects: StudioProject[]
    ): Promise<void> {
      await persist(userId, projects)
    },
    async withSavedProjects<T>(
      userId: number,
      projects: StudioProject[],
      operation: () => Promise<T>
    ): Promise<T> {
      resetAccount(userId)
      const epoch = accountEpoch
      await local.saveProjects(userId, projects)
      const pending = queue
        .catch(() => {})
        .then(async () => {
          await saveRemote(userId, projects, epoch)
          assertAccount(userId, epoch)
          return operation()
        })
      queue = pending.then(
        () => {},
        () => {}
      )
      return pending
    },
    async saveLocalProjects(
      userId: number,
      projects: StudioProject[]
    ): Promise<void> {
      resetAccount(userId)
      await local.saveProjects(userId, projects)
    },
    async saveProjectsIfAbsent(
      userId: number,
      projects: StudioProject[]
    ): Promise<boolean> {
      resetAccount(userId)
      const epoch = accountEpoch
      const inserted = await local.saveProjectsIfAbsent(userId, projects)
      assertAccount(userId, epoch)
      if (inserted) await saveRemote(userId, projects, epoch)
      return inserted
    },
    async put(userId: number, mediaId: string, blob: Blob): Promise<void> {
      requireNewMediaId(userId, mediaId)
      await local.put(userId, mediaId, blob)
    },
    async get(userId: number, mediaId: string): Promise<Blob | null> {
      resetAccount(userId)
      const epoch = accountEpoch
      const cached = await local.get(userId, mediaId)
      if (account !== userId || accountEpoch !== epoch) return null
      if (cached) return cached
      const response = await api.get(
        `/api/studio/cloud/media/${encodeURIComponent(mediaId)}${mediaQuery(mediaId)}`,
        { responseType: 'blob' }
      )
      const blob = response.data as Blob
      if (account !== userId || accountEpoch !== epoch) return null
      await local.put(userId, mediaId, blob)
      if (account !== userId || accountEpoch !== epoch) return null
      uploaded.add(`${mediaId}${mediaQuery(mediaId)}`)
      return blob
    },
    async putWithProjects(
      userId: number,
      mediaId: string,
      blob: Blob,
      projects: StudioProject[]
    ): Promise<void> {
      requireNewMediaId(userId, mediaId)
      const epoch = accountEpoch
      await local.putWithProjects(userId, mediaId, blob, projects)
      await upload(userId, mediaId, blob, epoch, projects)
      await persist(userId, projects, epoch)
    },
    async deleteWithProjects(
      userId: number,
      mediaId: string,
      projects: StudioProject[]
    ): Promise<void> {
      resetAccount(userId)
      const epoch = accountEpoch
      await local.deleteWithProjects(userId, mediaId, projects)
      // Cloud bytes remain available to immutable project revisions and Takes.
      await persist(userId, projects, epoch)
    },
    cloudRecord(projectId: string): StudioCloudProject | undefined {
      return records.get(projectId)
    },
    saveConflicts() {
      return [...conflicts].map(([projectId, value]) => ({
        projectId,
        ...value,
      }))
    },
    acceptSyncedProjects(userId: number, projects: StudioProject[]) {
      const staged = pendingRefreshes.get(projects)
      if (!staged || account !== userId || staged.epoch !== accountEpoch) return
      for (const current of staged.records) {
        records.set(current.id, current)
        acknowledged.set(current.id, current.document)
        fingerprints.set(current.id, JSON.stringify(current.document))
        for (const mediaId of mediaReferences([current.document])) {
          uploaded.add(
            `${mediaId}?project_id=${encodeURIComponent(current.id)}`
          )
        }
      }
      for (const id of records.keys()) {
        if (!staged.records.some((record) => record.id === id)) {
          records.delete(id)
          acknowledged.delete(id)
          fingerprints.delete(id)
        }
      }
      pendingRefreshes.delete(projects)
    },
    async resolveConflict(
      userId: number,
      projectId: string,
      resolution: 'local' | 'remote',
      currentProjects?: StudioProject[]
    ): Promise<StudioProject[]> {
      resetAccount(userId)
      const epoch = accountEpoch
      const conflict = conflicts.get(projectId)
      if (!conflict) throw new Error(t('No saved conflict is available'))
      const current = await studioCloudRequest<StudioCloudProject>(
        `/projects/${encodeURIComponent(projectId)}`
      )
      assertAccount(userId, epoch)
      const projects =
        currentProjects || (await local.loadProjects(userId)) || []
      assertAccount(userId, epoch)
      const draft =
        projects.find((item) => item.id === projectId) || conflict.local
      const document = mergeStudioCloudDocument(
        conflict.base,
        draft,
        current.document,
        resolution
      )
      records.set(projectId, current)
      const resolved = projects.map((item) =>
        item.id === projectId ? document : item
      )
      await persist(userId, resolved, epoch)
      return resolved
    },
    isProjectSaved(userId: number, project: StudioProject): boolean {
      if (account !== userId) return false
      try {
        return (
          fingerprints.get(project.id) ===
          JSON.stringify(documentForStorage(userId, project))
        )
      } catch {
        // Invalid drafts must never throw during React rendering or be treated as saved.
        return false
      }
    },
    async syncProjects(
      userId: number,
      projects: StudioProject[],
      getCurrentProjects?: () => StudioProject[]
    ): Promise<StudioProject[]> {
      resetAccount(userId)
      const epoch = accountEpoch
      const pending = queue
        .catch(() => {})
        .then(async () => {
          assertAccount(userId, epoch)
          const remote =
            await studioCloudRequest<StudioCloudProject[]>('/projects')
          assertAccount(userId, epoch)
          const latestProjects = getCurrentProjects?.() || projects
          // The caller will ignore this refresh while typing. Advancing the
          // merge base here would turn its unsaved fields into server changes.
          if (latestProjects !== projects) return latestProjects
          const merged = remote.map((current) => {
            current.document = studioProjectSchema.parse(
              current.document
            ) as StudioProject
            const base = records.get(current.id)
            const localProject = latestProjects.find(
              (project) => project.id === current.id
            )
            let document = current.document
            if (
              base &&
              localProject &&
              ['owner', 'editor'].includes(current.role)
            ) {
              const localDocument = documentForStorage(userId, localProject)
              try {
                document = mergeStudioCloudDocument(
                  base.document,
                  localDocument,
                  current.document
                )
              } catch (error) {
                if (error instanceof StudioCloudConflictError) {
                  conflicts.set(current.id, {
                    path: error.path,
                    base: base.document,
                    local: localDocument,
                    remote: current,
                  })
                }
                throw error
              }
            }
            if (
              localProject &&
              JSON.stringify(documentForStorage(userId, localProject)) ===
                JSON.stringify(document)
            ) {
              return localProject
            }
            return document
          })
          for (const project of latestProjects) {
            if (!records.has(project.id)) merged.push(project)
          }
          // The caller acknowledges only after accepting this exact result.
          // A discarded refresh must not alter merge bases or overwrite drafts.
          pendingRefreshes.set(merged, { epoch, records: remote })
          return merged
        })
      queue = pending.then(
        () => {},
        () => {}
      )
      return pending
    },
  }
}
