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

import { resolveStudioEdgeSource } from './canvas-flow'
import type { StudioProject } from './local-projects'

/** Materializes the assembly node's ordered, optionally pinned sources for the existing MP4 pipeline. */
export function studioAssemblyProjectFromCanvas(
  project: StudioProject,
  nodeId: string
): StudioProject {
  if (
    !project.nodes.some(
      (node) => node.id === nodeId && node.data.purpose === 'assembly'
    )
  ) {
    throw new StudioAssemblyError('missing_video')
  }
  const edges = project.edges.filter((edge) => edge.target === nodeId)
  const clips = edges.filter((edge) =>
    project.nodes.some(
      (node) => node.id === edge.source && node.data.kind === 'video'
    )
  )
  const replacements = new Map(
    clips.map((edge) => {
      const node = project.nodes.find((node) => node.id === edge.source)
      if (!node) throw new StudioAssemblyError('missing_video')
      return [node.id, resolveStudioEdgeSource(node, edge)]
    })
  )
  const audio: Partial<StudioProject> = {}
  for (const edge of edges) {
    const node = project.nodes.find((node) => node.id === edge.source)
    if (node?.data.kind !== 'audio') continue
    const source = resolveStudioEdgeSource(node, edge)
    if (source.data.status !== 'completed' || !source.data.mediaId) {
      throw new StudioAssemblyError('missing_media', source.data.title)
    }
    if (edge.targetHandle === 'voiceover') {
      audio.voiceoverMediaId = source.data.mediaId
    } else audio.soundtrackMediaId = source.data.mediaId
  }
  return {
    ...project,
    ...audio,
    nodes: project.nodes.map((node) => replacements.get(node.id) || node),
    shots: clips.map((edge) => {
      const existing = project.shots?.find(
        (shot) => shot.videoNodeId === edge.source
      )
      return (
        existing || {
          id: `clip-${edge.id}`,
          title:
            project.nodes.find((node) => node.id === edge.source)?.data.title ||
            'Clip',
          textNodeId: '',
          imageNodeId: '',
          videoNodeId: edge.source,
        }
      )
    }),
  }
}

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
    project.nodes
      .filter((node) => node.data.purpose === 'assembly')
      .map((node) =>
        project.edges
          .filter((edge) => edge.target === node.id)
          .map((edge) => {
            const node = project.nodes.find((node) => node.id === edge.source)
            let source = node
            try {
              source = node ? resolveStudioEdgeSource(node, edge) : undefined
            } catch {
              source = undefined
            }
            return [
              edge.id,
              edge.source,
              edge.targetHandle,
              edge.data?.sourceTakeId,
              source?.data.mediaId,
              source?.data.status,
              source?.data.selectedTakeId,
            ]
          })
      ),
    project.soundtrackMediaId,
    project.soundtrackVolume,
    project.soundtrackOffsetSeconds,
    project.voiceoverMediaId,
    project.voiceoverVolume,
    project.voiceoverOffsetSeconds,
    project.captionsText,
    project.captionOffsetSeconds,
    project.production?.timeline,
    project.production?.timelineEdited,
    project.production?.audioTracks,
    project.production?.width,
    project.production?.height,
    project.production?.fps,
    project.production?.requireApproved,
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
        shot.shotVoiceoverMediaId,
        shot.shotVoiceoverVolume,
        shot.shotVoiceoverOffsetSeconds,
        shot.shotCaptionText,
        shot.shotCaptionOffsetSeconds,
        shot.shotCaptionDurationSeconds,
      ]
    }),
  ])
}

export function reconcileStudioAssembly(
  previous: StudioProject,
  next: StudioProject
): StudioProject {
  if (studioAssemblyFingerprint(previous) !== studioAssemblyFingerprint(next)) {
    return {
      ...next,
      assembledMediaId: undefined,
      nodes: next.nodes.map((node) =>
        node.data.purpose === 'assembly' && node.data.status === 'completed'
          ? {
              ...node,
              data: {
                ...node.data,
                status: 'idle',
                mediaId: undefined,
                selectedTakeId: undefined,
                progress: undefined,
              },
            }
          : node
      ),
    }
  }
  return next
}
