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
  studioProjectsKey,
  type StudioProject,
} from './local-projects'
import type { createStudioMediaStore } from './media-store'

type ProjectStore = Pick<
  ReturnType<typeof createStudioMediaStore>,
  'loadProjects' | 'saveProjectsIfAbsent'
>

export type StudioProjectMigration = {
  source: 'indexeddb' | 'legacy' | 'empty'
  projects: StudioProject[]
}

export async function migrateLegacyStudioProjects(
  store: ProjectStore,
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  userId: number
): Promise<StudioProjectMigration> {
  const existing = await store.loadProjects(userId)
  if (existing !== null) {
    return { source: 'indexeddb', projects: existing }
  }

  const key = studioProjectsKey(userId)
  const raw = storage.getItem(key)
  if (raw === null) return { source: 'empty', projects: [] }

  const projects = loadStudioProjects({ getItem: () => raw }, userId)
  const inserted = await store.saveProjectsIfAbsent(userId, projects)
  if (!inserted) {
    const current = await store.loadProjects(userId)
    if (current === null) {
      throw new Error('Studio projects changed during migration')
    }
    return { source: 'indexeddb', projects: current }
  }

  try {
    storage.removeItem(key)
  } catch {
    // IndexedDB already has a durable copy; keep the legacy bytes as backup.
  }
  return { source: 'legacy', projects }
}

export type StudioStorageHealth = {
  usageBytes: number | null
  quotaBytes: number | null
  usageRatio: number | null
  backupWarning: 'browser-local' | 'near-quota' | 'estimate-unavailable'
}

export async function getStudioStorageHealth(
  manager: Pick<StorageManager, 'estimate'> | null | undefined
): Promise<StudioStorageHealth> {
  if (!manager) {
    return {
      usageBytes: null,
      quotaBytes: null,
      usageRatio: null,
      backupWarning: 'estimate-unavailable',
    }
  }

  try {
    const estimate = await manager.estimate()
    const usageBytes =
      typeof estimate.usage === 'number' &&
      Number.isFinite(estimate.usage) &&
      estimate.usage >= 0
        ? estimate.usage
        : null
    const quotaBytes =
      typeof estimate.quota === 'number' &&
      Number.isFinite(estimate.quota) &&
      estimate.quota > 0
        ? estimate.quota
        : null
    const usageRatio =
      usageBytes !== null && quotaBytes !== null
        ? usageBytes / quotaBytes
        : null
    if (usageRatio === null) {
      return {
        usageBytes,
        quotaBytes,
        usageRatio,
        backupWarning: 'estimate-unavailable',
      }
    }
    return {
      usageBytes,
      quotaBytes,
      usageRatio,
      backupWarning: usageRatio >= 0.8 ? 'near-quota' : 'browser-local',
    }
  } catch {
    return {
      usageBytes: null,
      quotaBytes: null,
      usageRatio: null,
      backupWarning: 'estimate-unavailable',
    }
  }
}
