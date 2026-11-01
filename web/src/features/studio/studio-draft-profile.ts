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
    if (size === '384x224' || size === '224x384') {
      return 'Legacy draft size needs picture review'
    }
    if (Number(request.seconds) > 0 && Number(request.seconds) <= 2.1) {
      return 'Short preview clip'
    }
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
  const metadata = JSON.parse(node.data.metadataJson || '{}') as Record<
    string,
    unknown
  >
  if (
    [
      'frames',
      'fps',
      'seconds',
      'duration',
      'width',
      'height',
      'resolution',
      'size',
    ].some((key) => metadata[key] !== undefined)
  ) {
    throw new Error(
      'Clear custom frame, duration or size overrides before using a trial clip'
    )
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
  let previous =
    production.finalResolutions[node.id] ||
    node.data.resolution ||
    (node.data.ratio === '9:16' ? '384x640' : '640x384')
  if (!['640x384', '384x640', '512x512'].includes(previous)) {
    previous = node.data.ratio === '9:16' ? '384x640' : '640x384'
  }
  const finalSeconds =
    production.finalDurations?.[node.id] ?? node.data.seconds ?? 5
  const seconds = stage === 'draft' ? Math.min(2, finalSeconds) : finalSeconds
  return {
    ...project,
    production: {
      ...production,
      documentVersion: 2,
      generationStage: stage,
      finalResolutions: { ...production.finalResolutions, [node.id]: previous },
      finalDurations: { ...production.finalDurations, [node.id]: finalSeconds },
    },
    nodes: project.nodes.map((item) =>
      item.id === node.id
        ? { ...item, data: { ...item.data, resolution: previous, seconds } }
        : item
    ),
  }
}
