/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { useEffect, useRef, useState } from 'react'

import type { StudioProject } from './local-projects'
import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import { studioProductionSchema } from './studio-production'

function timelineSnapshot(project: StudioProject) {
  const production = studioProductionSchema.parse(project.production || {})
  return structuredClone({
    project: {
      shots: project.shots || [],
      captionsText: project.captionsText || '',
      captionOffsetSeconds: project.captionOffsetSeconds || 0,
      soundtrackOffsetSeconds: project.soundtrackOffsetSeconds || 0,
      voiceoverOffsetSeconds: project.voiceoverOffsetSeconds || 0,
      soundtrackMediaId: project.soundtrackMediaId,
      soundtrackVolume: project.soundtrackVolume,
      voiceoverMediaId: project.voiceoverMediaId,
      voiceoverVolume: project.voiceoverVolume,
    },
    production: {
      timeline: production?.timeline || [],
      timelineEdited: production?.timelineEdited || false,
      audioTracks: production?.audioTracks || [],
      dialogueCues: production?.dialogueCues || [],
      reframes: production?.reframes,
      motionGraphics: production?.motionGraphics || [],
      musicVideoPlan: production.musicVideoPlan,
      captionDraft: production.captionDraft,
      audioMix: production.audioMix,
      framing: production.framing,
      fit: production.fit,
      width: production.width,
      height: production.height,
      fps: production.fps,
    },
  })
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)])
    )
  }
  return value
}

function sameSnapshot(a: unknown, b: unknown) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}

export type StudioTimelineEdit = {
  projectId: string
  before: ReturnType<typeof timelineSnapshot>
  after: ReturnType<typeof timelineSnapshot>
}

export function studioTimelineEdit(
  before: StudioProject,
  after: StudioProject
): StudioTimelineEdit {
  if (before.id !== after.id) {
    throw new Error('Timeline history belongs to a different project.')
  }
  return {
    projectId: before.id,
    before: timelineSnapshot(before),
    after: timelineSnapshot(after),
  }
}

export function studioUndoTimelineEdit(
  current: StudioProject,
  edit: StudioTimelineEdit
): StudioProject {
  if (current.id !== edit.projectId) {
    throw new Error(
      'The timeline changed after this edit. Review project history before restoring it.'
    )
  }
  if (!current.production) throw new Error('The timeline is unavailable.')
  const now = timelineSnapshot(current)
  function revertChanged<T extends object>(
    present: T,
    before: T,
    after: T
  ): Partial<T> {
    const patch: Partial<T> = {}
    for (const key of Object.keys(before) as (keyof T)[]) {
      if (sameSnapshot(before[key], after[key])) continue
      if (!sameSnapshot(present[key], after[key])) {
        throw new Error(
          'The timeline changed after this edit. Review project history before restoring it.'
        )
      }
      patch[key] = structuredClone(before[key])
    }
    return patch
  }
  const projectPatch = revertChanged(
    now.project,
    edit.before.project,
    edit.after.project
  )
  const productionPatch = revertChanged(
    now.production,
    edit.before.production,
    edit.after.production
  )
  return {
    ...current,
    ...projectPatch,
    production: { ...current.production, ...productionPatch },
    updatedAt: new Date().toISOString(),
  }
}

/** The controller keeps this history across creation steps, scoped to one user/project. */
export function useStudioTimelineHistory(
  userId: number | undefined,
  projectId: string
) {
  const scope = `${userId ?? 'local'}:${projectId}`
  const activeScope = useRef(scope)
  activeScope.current = scope
  const [state, setState] = useState<{
    scope: string
    edits: StudioTimelineEdit[]
  }>({ scope, edits: [] })
  useEffect(() => {
    setState((current) =>
      current.scope === scope ? current : { scope, edits: [] }
    )
  }, [scope])
  const edits = state.scope === scope ? state.edits : []
  return {
    edits,
    remember(before: StudioProject, after: StudioProject) {
      if (
        activeScope.current !== scope ||
        before.id !== projectId ||
        after.id !== projectId
      ) {
        return
      }
      const edit = studioTimelineEdit(before, after)
      if (sameSnapshot(edit.before, edit.after)) return
      setState((current) => ({
        scope,
        edits: [
          ...(current.scope === scope ? current.edits : []).slice(-19),
          edit,
        ],
      }))
    },
    pop() {
      if (activeScope.current !== scope) return
      setState((current) =>
        current.scope === scope
          ? { scope, edits: current.edits.slice(0, -1) }
          : current
      )
    },
  }
}

export type StudioTimelineHistory = ReturnType<typeof useStudioTimelineHistory>

/** Only a successful server commit can create an undo entry. CAS still belongs to the server. */
export async function applyStudioEditWithUndo(
  path: string,
  plan: { id: string; revision: number },
  history?: Pick<ReturnType<typeof useStudioTimelineHistory>, 'remember'>
) {
  const before = history
    ? await studioCloudRequest<StudioCloudProject>(path)
    : undefined
  const result = await studioCloudRequest<{
    project: StudioCloudProject
    applied_revision: number
  }>(`${path}/edit-plans/${encodeURIComponent(plan.id)}/apply`, 'POST', {
    revision: plan.revision,
  })
  if (before && result.project?.document) {
    history?.remember(before.document, result.project.document)
  }
  return result
}
