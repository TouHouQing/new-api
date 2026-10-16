/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import type { StudioProject } from './local-projects'

export function studioProjectDisplayTitle(project: StudioProject): string {
  if (
    project.title &&
    !/^(?:未命名项目|Untitled(?: project)?)$/i.test(project.title)
  ) {
    return project.title
  }
  return (
    project.production?.creativeBrief?.subject ||
    project.production?.brandKit?.name ||
    project.production?.brief?.split(/[。.!?\n]/)[0]?.slice(0, 48) ||
    project.nodes
      .find((node) => node.data.sourceMode === 'upload' && node.data.mediaId)
      ?.data.title?.replace(/\.[a-z\d]{1,5}$/i, '')
      .slice(0, 48) ||
    project.title
  )
}
