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
import { planStudioExecution } from './canvas-flow'
import type { StudioProject } from './local-projects'

// Match StudioWorkflowOrder: an unpinned reference card's linked node is an
// execution dependency even when no visible canvas wire connects the two.
export function studioWorkflowScope(project: StudioProject, targets: string[]) {
  const edges = [...project.edges]
  for (const node of project.nodes) {
    for (const assetId of node.data.assetIds || []) {
      if (node.data.assetVersionIds?.[assetId]) continue
      for (const source of project.nodes) {
        if (source.id !== node.id && source.data.linkedAssetId === assetId) {
          edges.push({
            id: `reference:${source.id}:${node.id}`,
            source: source.id,
            target: node.id,
          })
        }
      }
    }
  }
  const planned = new Map<string, StudioProject['nodes'][number]>()
  for (const target of targets) {
    for (const node of planStudioExecution(project.nodes, edges, target)) {
      planned.set(node.id, node)
    }
  }
  return [...planned.values()]
}
