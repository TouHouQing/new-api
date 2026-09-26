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
import type { StudioProject } from './local-projects'

export type StudioAssemblyErrorCode =
  | 'no_shots'
  | 'unfinished'
  | 'missing_video'
  | 'missing_media'
  | 'download_failed'

export class StudioAssemblyError extends Error {
  constructor(
    readonly code: StudioAssemblyErrorCode,
    readonly shotTitle?: string
  ) {
    super(code)
    this.name = 'StudioAssemblyError'
  }
}

export type StudioAssemblyClip = {
  shotId: string
  title: string
  taskId?: string
  mediaId?: string
  trimStart?: number
  trimEnd?: number
  muted?: boolean
  volume?: number
  fadeInSeconds?: number
  fadeOutSeconds?: number
}

export function planStudioAssembly(
  project: StudioProject
): StudioAssemblyClip[] {
  const shots = project.shots
  if (!shots?.length) throw new StudioAssemblyError('no_shots')
  return shots.map((shot, index) => {
    const previous = shots[index - 1]
    const fadeInSeconds =
      previous?.transition === 'fade'
        ? (previous.transitionSeconds ?? 0.5)
        : undefined
    const fadeOutSeconds =
      index < shots.length - 1 && shot.transition === 'fade'
        ? (shot.transitionSeconds ?? 0.5)
        : undefined
    const video = project.nodes.find((node) => node.id === shot.videoNodeId)
    if (!video || video.data.kind !== 'video') {
      throw new StudioAssemblyError('missing_video', shot.title)
    }
    if (video.data.status !== 'completed') {
      throw new StudioAssemblyError('unfinished', shot.title)
    }
    if (!video.data.mediaId && !video.data.taskId) {
      throw new StudioAssemblyError('missing_media', shot.title)
    }
    return {
      shotId: shot.id,
      title: shot.title,
      taskId: video.data.taskId,
      mediaId: video.data.mediaId,
      ...(shot.trimStart !== undefined ? { trimStart: shot.trimStart } : {}),
      ...(shot.trimEnd !== undefined ? { trimEnd: shot.trimEnd } : {}),
      ...(shot.muted !== undefined ? { muted: shot.muted } : {}),
      ...(shot.volume !== undefined ? { volume: shot.volume } : {}),
      ...(fadeInSeconds !== undefined ? { fadeInSeconds } : {}),
      ...(fadeOutSeconds !== undefined ? { fadeOutSeconds } : {}),
    }
  })
}

export function studioAssemblyFingerprint(project: StudioProject): string {
  return JSON.stringify([
    project.soundtrackMediaId,
    project.soundtrackVolume,
    project.soundtrackOffsetSeconds,
    project.voiceoverMediaId,
    project.voiceoverVolume,
    project.voiceoverOffsetSeconds,
    project.captionsText,
    project.captionOffsetSeconds,
    ...(project.shots || []).map((shot) => {
      const video = project.nodes.find((node) => node.id === shot.videoNodeId)
      return [
        shot.id,
        shot.videoNodeId,
        video?.data.status,
        video?.data.taskId,
        video?.data.mediaId,
        shot.trimStart,
        shot.trimEnd,
        shot.muted,
        shot.volume,
        shot.transition,
        shot.transitionSeconds,
      ]
    }),
  ])
}

export function reconcileStudioAssembly(
  previous: StudioProject,
  next: StudioProject
): StudioProject {
  if (
    previous.assembledMediaId &&
    studioAssemblyFingerprint(previous) !== studioAssemblyFingerprint(next)
  ) {
    return { ...next, assembledMediaId: undefined }
  }
  return next
}
