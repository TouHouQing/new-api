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
import i18next from 'i18next'

import { connectedGenerationInput } from './canvas-flow'
import type { StudioProject } from './local-projects'
import {
  studioProductionSchema,
  studioProjectTimeline,
} from './studio-production'
import { addStudioNode, recordStudioTake, updateStudioNode } from './workspace'

export function prepareStudioRework(
  project: StudioProject,
  sourceId: string,
  targetId: string,
  instructions: string,
  mode: 'angle' | 'light' | 'region' | 'range',
  values: {
    start: number
    end: number
    x: number
    y: number
    width: number
    height: number
  }
): StudioProject {
  const source = project.nodes.find((node) => node.id === sourceId)
  if (!source?.data.mediaId || !['image', 'video'].includes(source.data.kind)) {
    throw new Error('Select a stored image or video')
  }
  if (!instructions.trim()) throw new Error('Describe the requested change')
  if (
    mode === 'region' &&
    (![values.x, values.y, values.width, values.height].every(
      Number.isInteger
    ) ||
      values.x < 0 ||
      values.y < 0 ||
      values.width < 2 ||
      values.height < 2 ||
      values.width > 4096 ||
      values.height > 4096)
  ) {
    throw new Error(i18next.t('Select a valid image region'))
  }
  if (mode === 'region' && source.data.kind !== 'image') {
    throw new Error(
      'Region editing uses a still image; extract a frame to edit a video region'
    )
  }
  if (
    mode === 'range' &&
    (source.data.kind !== 'video' ||
      values.end <= values.start ||
      values.end - values.start < 1)
  ) {
    throw new Error('Select a video range of at least one second')
  }
  const prompt = connectedGenerationInput(
    project.nodes,
    project.edges,
    sourceId
  ).prompt
  const model =
    source.data.model ||
    (source.data.kind === 'image'
      ? project.defaults?.imageModel
      : project.defaults?.videoModel)
  if (!model) {
    throw new Error('Select a model for this project before planning rework')
  }
  let next = updateStudioNode(
    addStudioNode(project, source.data.kind, targetId),
    targetId,
    {
      title: `${source.data.title} · ${i18next.t(`studio.rework.${mode}`, { defaultValue: mode })}`,
      prompt: `${prompt}\n\n${instructions}`,
      model,
      group: source.data.group || project.defaults?.videoGroup,
      seconds:
        mode === 'range'
          ? Math.max(1, Math.round(values.end - values.start))
          : source.data.seconds,
      ratio: source.data.ratio,
      resolution: source.data.resolution,
      imageSize:
        mode === 'region' && model === 'flux.2-klein-4b'
          ? `${Math.max(64, Math.round((values.width * Math.min(1, 1024 / Math.max(values.width, values.height))) / 16) * 16)}x${Math.max(64, Math.round((values.height * Math.min(1, 1024 / Math.max(values.width, values.height))) / 16) * 16)}`
          : source.data.imageSize,
      imageCount: 1,
      assetIds: source.data.assetIds,
      assetVersionIds: source.data.assetVersionIds,
      derivedFrom: {
        nodeId: source.id,
        takeId: source.data.selectedTakeId,
        mediaId: source.data.mediaId,
        action: mode,
      },
      ...(mode === 'region'
        ? {
            reworkRegion: {
              sourceMediaId: source.data.mediaId,
              x: values.x,
              y: values.y,
              width: values.width,
              height: values.height,
            },
          }
        : {}),
      ...(mode === 'range'
        ? {
            reworkRange: {
              sourceNodeId: source.id,
              sourceMediaId: source.data.mediaId,
              start: values.start,
              end: values.end,
            },
          }
        : {}),
    }
  )
  if (mode !== 'region' && mode !== 'range') {
    next = {
      ...next,
      edges: [
        ...next.edges,
        ...project.edges
          .filter((edge) => edge.target === sourceId)
          .map((edge) => ({
            ...edge,
            id: crypto.randomUUID(),
            target: targetId,
          })),
      ],
    }
    if (source.data.kind === 'image') {
      next.edges.push({
        id: crypto.randomUUID(),
        source: sourceId,
        target: targetId,
        sourceHandle: 'image',
        targetHandle: 'reference_image',
        data: { sourceTakeId: source.data.selectedTakeId },
      })
    }
    if (source.data.kind === 'video') {
      next = updateStudioNode(next, targetId, {
        reworkRange: {
          sourceNodeId: sourceId,
          sourceMediaId: source.data.mediaId,
          start: 0,
          end: source.data.seconds || 5,
        },
      })
    }
  }
  return next
}

export function applyStudioReworkRange(
  project: StudioProject,
  targetId: string,
  sourceDuration: number,
  outputDuration: number,
  sourceHasAudio: boolean,
  durations: Readonly<Record<string, number>> = {}
): StudioProject {
  if (
    !Number.isFinite(sourceDuration) ||
    !Number.isFinite(outputDuration) ||
    sourceDuration <= 0 ||
    outputDuration <= 0
  ) {
    throw new Error('Media duration is unavailable')
  }
  const target = project.nodes.find((node) => node.id === targetId)
  const range = target?.data.reworkRange
  if (!range || !target?.data.mediaId || target.data.status !== 'completed') {
    throw new Error('Finish and review the replacement clip first')
  }
  const timeline = studioProjectTimeline(project)
  const index = timeline.findIndex(
    (clip) =>
      clip.nodeId === range.sourceNodeId &&
      clip.trimStart <= range.start &&
      (clip.trimEnd || sourceDuration) >= range.end
  )
  if (index < 0) {
    throw new Error('The original time range is no longer in the timeline')
  }
  const original = timeline[index]
  const originalNode = project.nodes.find((node) => node.id === original.nodeId)
  const originalMediaId = original.takeId
    ? originalNode?.data.takes?.find((take) => take.id === original.takeId)
        ?.mediaId
    : originalNode?.data.mediaId
  if (originalMediaId !== range.sourceMediaId) {
    throw new Error('The original Take changed after this rework was planned')
  }
  const duration = range.end - range.start
  const speed = outputDuration / duration
  if (original.speed !== 1 || speed < 0.25 || speed > 4) {
    throw new Error('Adjust clip speeds before replacing this time range')
  }
  const production = project.production || studioProductionSchema.parse({})
  const sourceShot = project.shots?.find(
    (shot) => shot.videoNodeId === range.sourceNodeId
  )
  const replacesDialogue = production.dialogueCues.some(
    (cue) => cue.shotId === sourceShot?.id && cue.audioMediaId
  )
  const captionFor = (start: number, end: number) => {
    const cueStart = original.trimStart + original.captionOffset
    const cueEnd =
      original.captionDuration > 0
        ? cueStart + original.captionDuration
        : original.trimEnd || sourceDuration
    const intersection = Math.min(end, cueEnd) - Math.max(start, cueStart)
    return {
      caption: intersection > 0 ? original.caption : '',
      captionOffset: Math.max(0, cueStart - start),
      captionDuration: Math.max(0, intersection),
    }
  }
  const items = []
  if (range.start > original.trimStart) {
    items.push({
      ...original,
      id: crypto.randomUUID(),
      trimEnd: range.start,
      muted: original.muted || sourceHasAudio,
      ...captionFor(original.trimStart, range.start),
      fadeOut: 0,
    })
  }
  items.push({
    ...original,
    id: crypto.randomUUID(),
    nodeId: target.id,
    takeId: target.data.selectedTakeId,
    trimStart: 0,
    trimEnd: outputDuration,
    speed,
    muted: true,
    ...captionFor(range.start, range.end),
    captionOffset: Math.max(
      0,
      original.captionOffset - (range.start - original.trimStart)
    ),
    fadeIn: 0,
    fadeOut: 0,
  })
  if (range.end < (original.trimEnd || sourceDuration)) {
    items.push({
      ...original,
      id: crypto.randomUUID(),
      trimStart: range.end,
      muted: original.muted || sourceHasAudio,
      ...captionFor(range.end, original.trimEnd || sourceDuration),
      fadeIn: 0,
      captionOffset: Math.max(
        0,
        original.captionOffset - (range.end - original.trimStart)
      ),
    })
  }
  const before = timeline.slice(0, index).reduce((sum, clip) => {
    const node = project.nodes.find((node) => node.id === clip.nodeId)
    return (
      sum +
      ((clip.trimEnd ||
        durations[node?.data.mediaId || ''] ||
        node?.data.seconds ||
        5) -
        clip.trimStart) /
        clip.speed
    )
  }, 0)
  const audioTracks =
    sourceHasAudio && !original.muted && !replacesDialogue
      ? [
          ...production.audioTracks,
          {
            id: crypto.randomUUID(),
            mediaId: range.sourceMediaId,
            start: original.trimStart,
            offset: before,
            duration: (original.trimEnd || sourceDuration) - original.trimStart,
            volume: original.volume,
          },
        ]
      : production.audioTracks
  return {
    ...project,
    production: {
      ...production,
      timelineEdited: true,
      timeline: [
        ...timeline.slice(0, index),
        ...items,
        ...timeline.slice(index + 1),
      ],
      audioTracks,
    },
    updatedAt: new Date().toISOString(),
  }
}

export function acceptStudioReworkImage(
  project: StudioProject,
  targetId: string
): StudioProject {
  const target = project.nodes.find((node) => node.id === targetId)
  const source = project.nodes.find(
    (node) => node.id === target?.data.derivedFrom?.nodeId
  )
  const take = target?.data.takes?.find(
    (take) => take.id === target.data.selectedTakeId
  )
  if (
    !target ||
    target.data.kind !== 'image' ||
    !source ||
    source.data.locked ||
    !take ||
    take.status !== 'completed'
  ) {
    throw new Error(
      'Select a completed image result and unlock the original node before accepting it'
    )
  }
  return recordStudioTake(project, source.id, take)
}
