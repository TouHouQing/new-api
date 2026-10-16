/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import type { StudioProject } from './local-projects'
import { studioProductionSchema } from './studio-production'

// Use the immutable request receipt. Changing a node's next settings never
// relabels footage which has already been produced.
export function studioTakeSizeLabel(
  snapshot: string | undefined
): string | undefined {
  if (!snapshot) return undefined
  try {
    const request = JSON.parse(snapshot)
    if (request.model !== 'wan2.2-ti2v-5b') return undefined
    const size = request.size || request.resolution
    if (size === '384x224' || size === '224x384') return 'Draft size'
    if (size === '640x384' || size === '384x640') return 'Final size'
  } catch {
    /* Historical receipts without size remain unlabelled. */
  }
  return undefined
}

export function studioSetDraftStage(
  project: StudioProject,
  nodeId: string,
  stage: 'draft' | 'final'
) {
  const node = project.nodes.find((item) => item.id === nodeId)
  if (!node || node.data.model !== 'wan2.2-ti2v-5b') {
    throw new Error('This model has no configured draft profile')
  }
  if (node.data.ratio === '1:1' || node.data.resolution === '512x512') {
    throw new Error('No square draft profile is configured for this model')
  }
  if (
    node.data.payloadPatchJson?.trim() &&
    node.data.payloadPatchJson.trim() !== '{}'
  ) {
    throw new Error(
      'Clear custom request overrides before using a draft profile'
    )
  }
  const production = project.production || studioProductionSchema.parse({})
  const previous =
    production.finalResolutions[node.id] ||
    node.data.resolution ||
    (node.data.ratio === '9:16' ? '384x640' : '640x384')
  let resolution = previous
  if (stage === 'draft') {
    resolution =
      node.data.ratio === '9:16' || /^(224x384|384x640)$/.test(previous)
        ? '224x384'
        : '384x224'
  }
  return {
    ...project,
    production: {
      ...production,
      generationStage: stage,
      finalResolutions: { ...production.finalResolutions, [node.id]: previous },
    },
    nodes: project.nodes.map((item) =>
      item.id === node.id
        ? { ...item, data: { ...item.data, resolution } }
        : item
    ),
  }
}
