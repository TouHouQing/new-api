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

import type { StudioProject } from './local-projects'
import type { StudioNativeEdit } from './studio-native-edits'
import { addStudioNode, updateStudioNode } from './workspace'

export function studioEditedMediaTitle(
  project: StudioProject,
  sourceId: string,
  label: string
): string {
  const source = project.nodes.find((node) => node.id === sourceId)
  if (!source) throw new Error('Stored source media is required')
  let number =
    project.nodes.filter((node) => node.data.derivedFrom?.nodeId === sourceId)
      .length + 1
  let title: string
  do {
    const suffix = ` · ${label.slice(0, 100)} · ${i18next.t('Edited copy')} ${number++}`
    title =
      source.data.title.slice(0, Math.max(0, 200 - suffix.length)) + suffix
  } while (project.nodes.some((node) => node.data.title === title))
  return title
}

export function createStudioEditedNode(
  project: StudioProject,
  sourceId: string,
  targetId: string,
  action: StudioNativeEdit
): StudioProject {
  const source = project.nodes.find((node) => node.id === sourceId)
  if (!source?.data.mediaId || source.data.kind === 'text') {
    throw new Error('Stored source media is required')
  }
  if (source.data.locked) {
    throw new Error('Unlock the source before creating an edit')
  }
  let kind = source.data.kind
  if (action === 'frame') kind = 'image'
  if (action === 'extract_audio') kind = 'audio'
  return updateStudioNode(addStudioNode(project, kind, targetId), targetId, {
    title: studioEditedMediaTitle(
      project,
      sourceId,
      i18next.isInitialized
        ? i18next.t(
            [`studio.media.action.${action}`, `studio.edit.${action}`],
            { defaultValue: action }
          )
        : action
    ),
    sourceMode: 'upload',
    derivedFrom: {
      nodeId: source.id,
      takeId: source.data.selectedTakeId,
      mediaId: source.data.mediaId,
      action,
    },
  })
}
