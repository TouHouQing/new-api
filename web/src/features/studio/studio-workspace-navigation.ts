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
import type { StudioProject } from './local-projects'
import {
  studioCreationProgress,
  type StudioCreationStep,
} from './studio-creation'
import { studioMediaModelAction } from './studio-media-draft'

export const STUDIO_WORKSPACE_STAGES = [
  'story',
  'shots',
  'visual',
  'edit',
  'deliver',
] as const
export const STUDIO_WORKSPACE_TOOLS = [
  'assistant',
  'assets',
  'media',
  'previs',
  'review',
  'versions',
  'members',
  'planning',
] as const
export type StudioWorkspaceTool = (typeof STUDIO_WORKSPACE_TOOLS)[number]

export function studioWorkspaceStage(
  value: string
): StudioCreationStep | undefined {
  return (
    (
      {
        plan: 'shots',
        workflow: 'visual',
        timeline: 'edit',
        delivery: 'deliver',
        voice: 'edit',
      } as Record<string, StudioCreationStep>
    )[value] || STUDIO_WORKSPACE_STAGES.find((stage) => stage === value)
  )
}

export function studioWorkspaceEntry(
  project: StudioProject,
  nodeId?: string | null
): StudioCreationStep {
  const node = project.nodes.find((node) => node.id === nodeId)
  if (node?.data.sourceMode === 'upload') {
    return node.data.kind === 'video' ? 'edit' : 'visual'
  }
  if (project.production?.guide?.step) return project.production.guide.step
  if (studioCreationProgress(project).edit) return 'edit'
  return project.shots?.length ? 'visual' : 'story'
}

export function studioGeneratableNodeIds(
  project: StudioProject,
  ids: string[]
): string[] {
  return [...new Set(ids)].filter((id) =>
    project.nodes.some(
      (node) =>
        node.id === id &&
        node.data.sourceMode !== 'upload' &&
        node.data.purpose !== 'assembly' &&
        !studioMediaModelAction(node.data.model)
    )
  )
}
