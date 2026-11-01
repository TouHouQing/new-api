/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { t } from 'i18next'

import type { StudioProject } from './local-projects'
import {
  studioProductionSchema,
  studioProjectTimeline,
  type StudioTimelineClip,
} from './studio-production'

export type StudioAudioOrigins = Readonly<Record<string, string | null>>

const rounded = (value: number) => Math.round(value * 1000000) / 1000000

export function pinStudioAudioAnchorClip(
  project: StudioProject,
  clipId: string
): StudioProject {
  const timeline = studioProjectTimeline(project)
  const clip = timeline.find((item) => item.id === clipId)
  const node = project.nodes.find((item) => item.id === clip?.nodeId)
  if (!clip || !node || node.data.locked) {
    throw new Error(t('Choose an unlocked exact clip before attaching audio.'))
  }
  const takeId = clip.takeId || node.data.selectedTakeId
  const selected = takeId
    ? node.data.takes?.find(
        (item) => item.id === takeId && item.status === 'completed'
      )
    : undefined
  const mediaId = takeId ? selected?.mediaId : node.data.mediaId
  if (!mediaId) {
    throw new Error(
      t(
        'The exact audio-bound clip source is unavailable. Restore it or detach its audio first.'
      )
    )
  }
  const existing =
    selected ||
    node.data.takes?.find(
      (item) => item.mediaId === mediaId && item.status === 'completed'
    )
  if (!existing && (node.data.takes?.length || 0) >= 100) {
    throw new Error(t('Archive unused clip versions before attaching audio.'))
  }
  const pinned = existing || {
    id: crypto.randomUUID(),
    mediaId,
    sourceMode: 'upload' as const,
    status: 'completed' as const,
    prompt: node.data.prompt || '',
    createdAt: new Date().toISOString(),
  }
  const production = project.production || studioProductionSchema.parse({})
  return {
    ...project,
    nodes: project.nodes.map((item) =>
      item.id === node.id && !existing
        ? {
            ...item,
            data: { ...item.data, takes: [...(item.data.takes || []), pinned] },
          }
        : item
    ),
    production: {
      ...production,
      documentVersion: 2,
      timelineEdited: true,
      timeline: timeline.map((item) =>
        item.id === clipId ? { ...item, takeId: pinned.id } : item
      ),
    },
  }
}

// A new clip must name its exact old clip or explicitly declare independence.
// Identical node/Take references alone never imply that two instances are linked.
export function reconcileStudioAudioAnchors(
  project: StudioProject,
  nextTimeline: StudioTimelineClip[],
  origins: StudioAudioOrigins = {},
  durations: Readonly<Record<string, number>> = {}
): StudioProject {
  const production = project.production || studioProductionSchema.parse({})
  if (nextTimeline.length > 100 || production.audioTracks.length > 100) {
    throw new Error(
      t(
        'This edit would create more than one hundred audio tracks. Reduce the fragments or detach audio first.'
      )
    )
  }
  const nextProject = {
    ...project,
    production: { ...production, timelineEdited: true, timeline: nextTimeline },
    updatedAt: new Date().toISOString(),
  }
  const oldTimeline = studioProjectTimeline(project)
  const identity = (clip: StudioTimelineClip) => {
    const node = project.nodes.find((item) => item.id === clip.nodeId)
    const takeId = clip.takeId || node?.data.selectedTakeId || ''
    const take = takeId
      ? node?.data.takes?.find(
          (item) => item.id === takeId && item.status === 'completed'
        )
      : undefined
    const mediaId = takeId ? take?.mediaId : node?.data.mediaId
    return mediaId ? { nodeId: clip.nodeId, takeId, mediaId } : undefined
  }
  if (production.reframes !== undefined) {
    const reframes: NonNullable<typeof production.reframes> = {}
    for (const destination of nextTimeline) {
      const originId = Object.hasOwn(origins, destination.id)
        ? origins[destination.id]
        : destination.id
      const original = oldTimeline.find((item) => item.id === originId)
      const ref = original && production.reframes[original.id]
      if (!original || !ref) continue
      const before = identity(original),
        after = identity(destination)
      if (
        before &&
        after &&
        before.nodeId === after.nodeId &&
        before.takeId === after.takeId &&
        before.mediaId === after.mediaId &&
        ref.sourceMediaId === before.mediaId
      ) {
        reframes[destination.id] = ref
      }
    }
    nextProject.production = {
      ...nextProject.production,
      documentVersion: 2,
      reframes,
    }
  }
  const attached = production.audioTracks.some(
    (track) => track.anchorKind === 'source' || track.anchorKind === 'clip'
  )
  if (!attached) return nextProject
  if (
    oldTimeline.length === nextTimeline.length &&
    oldTimeline.every((clip, index) =>
      (
        ['id', 'nodeId', 'takeId', 'trimStart', 'trimEnd', 'speed'] as const
      ).every((key) => clip[key] === nextTimeline[index][key])
    )
  ) {
    return nextProject
  }
  const source = (clip: StudioTimelineClip) => {
    const node = project.nodes.find((item) => item.id === clip.nodeId)
    const takeId = clip.takeId || node?.data.selectedTakeId
    const take = takeId
      ? node?.data.takes?.find(
          (item) => item.id === takeId && item.status === 'completed'
        )
      : undefined
    const mediaId = takeId ? take?.mediaId : node?.data.mediaId
    if (!node || !mediaId) {
      throw new Error(
        t(
          'The exact audio-bound clip source is unavailable. Restore it or detach its audio first.'
        )
      )
    }
    const end = clip.trimEnd ?? durations[mediaId]
    if (
      end === undefined ||
      !Number.isFinite(end) ||
      end <= clip.trimStart ||
      !Number.isFinite(clip.speed) ||
      clip.speed < 0.25 ||
      clip.speed > 4
    ) {
      throw new Error(
        t(
          'Wait for the actual media duration or set an exact trim range before editing attached audio.'
        )
      )
    }
    return {
      clip,
      mediaId,
      takeId: takeId || '',
      end,
      duration: (end - clip.trimStart) / clip.speed,
      locked: node.data.locked === true,
    }
  }
  let oldProgram = 0
  const oldClips = oldTimeline.map((clip) => {
    const resolved = source(clip)
    const result = { ...resolved, program: oldProgram }
    oldProgram += resolved.duration
    return result
  })
  let newProgram = 0
  const newClips = nextTimeline.map((clip) => {
    const oldId = Object.hasOwn(origins, clip.id)
      ? origins[clip.id]
      : oldClips.find((item) => item.clip.id === clip.id)?.clip.id
    if (
      oldId === undefined ||
      (oldId !== null && !oldClips.some((item) => item.clip.id === oldId))
    ) {
      throw new Error(
        t(
          'The new clip has no exact edit origin. Restore its origin or detach attached audio before continuing.'
        )
      )
    }
    const resolved = source(clip)
    const original = oldClips.find((item) => item.clip.id === oldId)
    if (
      original &&
      (original.mediaId !== resolved.mediaId ||
        original.takeId !== resolved.takeId ||
        original.clip.nodeId !== clip.nodeId)
    ) {
      throw new Error(
        t(
          'Changing an attached clip source requires detaching its audio first.'
        )
      )
    }
    const result = { ...resolved, program: newProgram, oldId }
    newProgram += resolved.duration
    return result
  })
  const output: typeof production.audioTracks = []
  for (const track of production.audioTracks) {
    if (track.anchorKind !== 'source' && track.anchorKind !== 'clip') {
      output.push(track)
      continue
    }
    const bound = oldClips.find((item) => item.clip.id === track.anchorClipId)
    if (
      !bound ||
      track.anchorSourceStart === undefined ||
      !Number.isFinite(track.anchorSourceStart)
    ) {
      throw new Error(
        t(
          'Attached audio is missing its exact clip or anchor. Restore the binding before editing.'
        )
      )
    }
    const audioSpeed = track.speed ?? 1
    const available =
      track.duration ?? (durations[track.mediaId] ?? 0) - track.start
    if (
      !Number.isFinite(available) ||
      available <= 0 ||
      !Number.isFinite(audioSpeed) ||
      audioSpeed < 0.25 ||
      audioSpeed > 4
    ) {
      throw new Error(
        t(
          'Wait for the attached audio duration or enter its source duration before editing.'
        )
      )
    }
    if (
      track.anchorKind === 'source'
        ? track.anchorSourceStart < bound.clip.trimStart ||
          track.anchorSourceStart >= bound.end
        : track.anchorSourceStart < 0 ||
          track.anchorSourceStart >= bound.duration
    ) {
      throw new Error(t('The audio anchor must lie inside the selected clip.'))
    }
    const fragments: typeof production.audioTracks = []
    for (const destination of newClips.filter(
      (item) => item.oldId === bound.clip.id
    )) {
      let sourceStart: number,
        sourceDuration: number,
        offset: number,
        anchor: number,
        speed: number
      if (track.anchorKind === 'source') {
        const a = Math.max(track.anchorSourceStart, destination.clip.trimStart)
        const b = Math.min(
          track.anchorSourceStart + (available / audioSpeed) * bound.clip.speed,
          destination.end
        )
        if (b <= a) continue
        sourceStart =
          track.start +
          ((a - track.anchorSourceStart) / bound.clip.speed) * audioSpeed
        sourceDuration = ((b - a) / bound.clip.speed) * audioSpeed
        offset =
          destination.program +
          (a - destination.clip.trimStart) / destination.clip.speed
        anchor = a
        speed = (audioSpeed * destination.clip.speed) / bound.clip.speed
      } else {
        const local =
          track.anchorSourceStart -
          (destination.clip.trimStart - bound.clip.trimStart) / bound.clip.speed
        const from = Math.max(0, local)
        const to = Math.min(
          destination.duration,
          local + available / audioSpeed
        )
        if (to <= from) continue
        sourceStart = track.start + Math.max(0, -local) * audioSpeed
        sourceDuration = (to - from) * audioSpeed
        offset = destination.program + from
        anchor = from
        speed = audioSpeed
      }
      if (speed < 0.25 || speed > 4 || sourceDuration < 0.01) {
        throw new Error(
          t(
            'This edit needs an unsupported audio speed or a fragment shorter than 0.01 seconds. Adjust the cut or detach the audio first.'
          )
        )
      }
      fragments.push({
        ...track,
        id: fragments.length ? crypto.randomUUID() : track.id,
        start: rounded(sourceStart),
        duration: rounded(sourceDuration),
        offset: rounded(offset),
        speed: rounded(speed),
        anchorClipId: destination.clip.id,
        anchorSourceStart: rounded(anchor),
      })
    }
    if (
      bound.locked &&
      (fragments.length !== 1 ||
        fragments[0].anchorClipId !== track.anchorClipId ||
        Math.abs(fragments[0].offset - track.offset) > 0.000001 ||
        Math.abs(fragments[0].start - track.start) > 0.000001 ||
        Math.abs((fragments[0].duration ?? 0) - available) > 0.000001 ||
        Math.abs((fragments[0].speed ?? 1) - audioSpeed) > 0.000001)
    ) {
      throw new Error(t('Unlock the attached clip before changing its audio.'))
    }
    output.push(...fragments)
    if (output.length > 100) {
      throw new Error(
        t(
          'This edit would create more than one hundred audio tracks. Reduce the fragments or detach audio first.'
        )
      )
    }
  }
  if (output.length > 100) {
    throw new Error(
      t(
        'This edit would create more than one hundred audio tracks. Reduce the fragments or detach audio first.'
      )
    )
  }
  return {
    ...nextProject,
    production: {
      ...nextProject.production,
      documentVersion: 2,
      timelineEdited: true,
      timeline: nextTimeline,
      audioTracks: output,
    },
    updatedAt: new Date().toISOString(),
  }
}
