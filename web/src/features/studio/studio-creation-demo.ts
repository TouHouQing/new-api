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
import type { TFunction } from 'i18next'

import type { StudioProject } from './local-projects'
import { studioPlanStoryDraft } from './studio-creation'
import { studioProductionSchema } from './studio-production'
import { applyStudioScreenplay } from './studio-screenplay'
import { addStudioNode, recordStudioTake } from './workspace'

export async function loadStudioEditingExample(
  project: StudioProject,
  put: (id: string, blob: Blob) => Promise<void>,
  t: TFunction
): Promise<StudioProject> {
  const screenplay = studioPlanStoryDraft(
    project,
    t('studio.creation.demo.story'),
    6
  )
  if (screenplay.shots.length !== 2) {
    throw new Error('The editing example needs two shots')
  }
  screenplay.shots = screenplay.shots.map((shot, index) => ({
    ...shot,
    title: t('Example shot {{number}}', { number: index + 1 }),
  }))
  let next = applyStudioScreenplay(project, screenplay)
  const mediaIds: string[] = []
  for (const filename of ['shot-1.mp4', 'shot-2.mp4', 'music.mp3']) {
    const response = await fetch(`/studio-example/${filename}`)
    if (!response.ok) {
      throw new Error(
        t(
          'The example footage could not be loaded. You can upload your own footage.'
        )
      )
    }
    const blob = await response.blob()
    if (!blob.size || blob.type.includes('text/html')) {
      throw new Error(
        t(
          'The example footage could not be loaded. You can upload your own footage.'
        )
      )
    }
    const id = crypto.randomUUID()
    await put(id, blob)
    mediaIds.push(id)
  }
  const shots = next.shots || []
  for (const [index, shot] of shots.entries()) {
    const node = next.nodes.find((node) => node.id === shot.videoNodeId)
    if (!node) throw new Error('The editing example shot is unavailable')
    const take = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      status: 'completed' as const,
      sourceMode: 'upload' as const,
      prompt: '',
      mediaId: mediaIds[index],
    }
    next = recordStudioTake(next, node.id, take)
    next = {
      ...next,
      nodes: next.nodes.map((item) =>
        item.id === node.id
          ? {
              ...item,
              data: {
                ...item.data,
                title: shot.title,
                sourceMode: 'upload',
                seconds: 3,
              },
            }
          : item
      ),
    }
  }
  const musicNodeId = crypto.randomUUID()
  next = addStudioNode(next, 'audio', musicNodeId)
  next = recordStudioTake(next, musicNodeId, {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: 'completed',
    sourceMode: 'upload',
    prompt: '',
    mediaId: mediaIds[2],
  })
  next = {
    ...next,
    nodes: next.nodes.map((node) =>
      node.id === musicNodeId
        ? {
            ...node,
            data: { ...node.data, title: t('Example music'), seconds: 6 },
          }
        : node
    ),
  }
  next = {
    ...next,
    production: {
      ...(next.production || studioProductionSchema.parse({})),
      guide: { step: 'edit', goal: 'story' },
      width: 640,
      height: 360,
      fps: 24,
      timelineEdited: true,
      timeline: shots.map((shot, index) => ({
        id: shot.id,
        nodeId: shot.videoNodeId,
        trimStart: 0,
        trimEnd: 3,
        speed: 1,
        volume: 0,
        muted: true,
        caption: t(`studio.creation.demo.caption${index + 1}`),
        captionOffset: 0,
        captionDuration: 3,
        fadeIn: 0,
        fadeOut: 0,
      })),
      audioTracks: [
        {
          id: crypto.randomUUID(),
          mediaId: mediaIds[2],
          start: 0,
          offset: 0,
          volume: 0.3,
          duration: 6,
        },
      ],
    },
  }
  return next
}
