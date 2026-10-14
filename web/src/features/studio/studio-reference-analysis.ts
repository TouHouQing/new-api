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
import { z } from 'zod'

import type { StudioProject } from './local-projects'
import {
  studioEditableScreenplay,
  applyStudioEditableScreenplay,
} from './studio-creation'
import { studioProductionSchema } from './studio-production'

export const studioReferenceAnalysisSchema = z.object({
  summary: z.string().min(1).max(5000),
  motion: z.string().max(10000).default(''),
  audio: z.string().max(10000).default(''),
  limitations: z.string().max(5000).default(''),
  shots: z
    .array(
      z
        .object({
          id: z.string().max(100).optional(),
          title: z.string().min(1).max(200),
          start: z.number().min(0),
          end: z.number().positive(),
          text: z.string().max(10000),
          imagePrompt: z.string().max(10000),
          videoPrompt: z.string().max(10000),
          camera: z.string().max(2000).default(''),
        })
        .refine(
          (shot) => shot.end > shot.start,
          'The shot must end after it starts'
        )
    )
    .max(12),
})
export type StudioReferenceAnalysis = z.infer<
  typeof studioReferenceAnalysisSchema
>

export function adoptStudioReferenceShots(
  project: StudioProject,
  analysisNodeId: string,
  input: StudioReferenceAnalysis,
  selected: number[]
): StudioProject {
  const analysis = studioReferenceAnalysisSchema.parse(input)
  const source = project.nodes.find((node) => node.id === analysisNodeId)
  if (
    !source?.data.outputText ||
    source.data.derivedFrom?.action !== 'analyze'
  ) {
    throw new Error('Select a saved reference analysis')
  }
  const draft = studioEditableScreenplay(project)
  if (
    !project.shots?.length &&
    !project.production?.brief &&
    !project.production?.screenplay &&
    !project.production?.screenplayDraft
  ) {
    draft.shots = []
  }
  const added = analysis.shots
    .filter((_shot, index) => selected.includes(index))
    .map((shot) => ({
      id: crypto.randomUUID(),
      title: shot.title,
      text: shot.text,
      imagePrompt: shot.imagePrompt,
      videoPrompt: shot.videoPrompt,
      camera: shot.camera,
      seconds: Math.min(3600, Math.max(1, Math.round(shot.end - shot.start))),
      characterIds: [],
      propIds: [],
      shotType: '',
      dialogue: '',
    }))
  if (!added.length) {
    throw new Error('Select the reference shots you want to adopt')
  }
  let next = applyStudioEditableScreenplay(project, {
    ...draft,
    shots: [...draft.shots, ...added],
  })
  const ids = new Set<string>(
    added.map((shot) => next.production?.screenplay?.shots[shot.id] || shot.id)
  )
  const targets = next.shots?.filter((shot) => ids.has(shot.id)) || []
  next = {
    ...next,
    nodes: next.nodes.map((node) => {
      if (!targets.some((shot) => shot.textNodeId === node.id)) return node
      return {
        ...node,
        data: {
          ...node.data,
          derivedFrom: {
            nodeId: source.id,
            mediaId: source.data.derivedFrom?.mediaId || '',
            takeId: source.data.selectedTakeId,
            action: 'analyze',
          },
        },
      }
    }),
    production: {
      ...(next.production || studioProductionSchema.parse({})),
      guide: {
        ...(next.production?.guide || { goal: 'story' as const }),
        step: 'shots',
      },
      screenplayDraft: undefined,
    },
  }
  return next
}
