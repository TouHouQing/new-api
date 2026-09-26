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
import {
  planStudioExecution,
  resolveStudioEdgeSource,
  type StudioCanvasNode,
} from './canvas-flow'
import type { StudioProject } from './local-projects'

const VIDEO_ACTIVE_STATES = new Set([
  'completed',
  'submitting',
  'queued',
  'processing',
])

export function planStudioVideoBatch(
  project: StudioProject,
  limit: number
): {
  targets: string[]
  billableNodes: StudioCanvasNode[]
  capped: boolean
} {
  const targets: string[] = []
  const billableNodes: StudioCanvasNode[] = []
  const counted = new Set<string>()
  let capped = false
  for (const shot of project.shots || []) {
    const target = project.nodes.find((node) => node.id === shot.videoNodeId)
    if (
      !target?.data.model ||
      VIDEO_ACTIVE_STATES.has(target.data.status || '')
    ) {
      continue
    }
    const required = planStudioExecution(
      project.nodes,
      project.edges,
      target.id
    ).filter(
      (node) =>
        node.data.kind === 'video' &&
        node.data.model &&
        !VIDEO_ACTIVE_STATES.has(node.data.status || '') &&
        !counted.has(node.id)
    )
    if (billableNodes.length + required.length > limit) {
      capped = true
      break
    }
    targets.push(target.id)
    for (const node of required) {
      counted.add(node.id)
      billableNodes.push(node)
    }
  }
  return { targets, billableNodes, capped }
}

export function studioNodeInputFingerprint(
  project: StudioProject,
  nodeId: string
): string {
  const node = project.nodes.find((item) => item.id === nodeId)
  if (!node) return 'missing'
  const sourceEdges = project.edges.filter((edge) => edge.target === nodeId)
  const sources = sourceEdges.map((edge) => {
    const original = project.nodes.find((item) => item.id === edge.source)
    let source: StudioCanvasNode | undefined
    try {
      source = original ? resolveStudioEdgeSource(original, edge) : undefined
    } catch {
      // Invalid imported pins remain visible; execution reports their error.
      source = undefined
    }
    return [
      edge.id,
      edge.sourceHandle,
      edge.targetHandle,
      edge.data?.sourceTakeId,
      source?.data.prompt,
      source?.data.model,
      source?.data.selectedTakeId,
      source?.data.outputText,
      source?.data.outputImagePrompt,
      source?.data.outputVideoPrompt,
      source?.data.mediaId,
      source?.data.taskId,
    ]
  })
  const { data } = node
  return JSON.stringify([
    nodeId,
    data.kind,
    data.model,
    data.group,
    data.videoFamily,
    data.prompt,
    data.seconds,
    data.resolution,
    data.ratio,
    data.metadataJson,
    data.payloadPatchJson,
    data.imageSize,
    data.imageQuality,
    data.imageCount,
    data.assetIds,
    project.assets
      ?.filter((asset) => data.assetIds?.includes(asset.id))
      .map((asset) => [asset.id, asset.prompt, asset.mediaId]),
    sources,
  ])
}

export function studioPromptWithAssets(
  prompt: string,
  project: StudioProject,
  assetIds: readonly string[] | undefined
): string {
  const context = (project.assets || [])
    .filter((asset) => assetIds?.includes(asset.id))
    .map(
      (asset) =>
        `${asset.kind}: ${asset.title}${asset.prompt ? ` — ${asset.prompt}` : ''}`
    )
  return [prompt.trim(), ...context].filter(Boolean).join('\n\n')
}

/** Shares one upstream request across branches that reach the same node. */
export class StudioExecutionCoordinator {
  private readonly inFlight = new Map<string, Promise<unknown>>()
  private readonly completed = new Map<string, unknown>()

  forgetVideoTask(taskId: string): void {
    for (const [key, value] of this.completed) {
      if (
        value &&
        typeof value === 'object' &&
        'taskId' in value &&
        value.taskId === taskId
      ) {
        this.completed.delete(key)
      }
    }
  }

  run<T>(
    key: string,
    task: () => Promise<T>,
    options?: { reuseCompleted?: boolean; force?: boolean }
  ): Promise<T> {
    const existing = this.inFlight.get(key)
    if (existing) return existing as Promise<T>
    if (options?.reuseCompleted && !options.force && this.completed.has(key)) {
      return Promise.resolve(this.completed.get(key) as T)
    }
    const promise = task()
      .then((value) => {
        if (options?.reuseCompleted) {
          this.completed.delete(key)
          this.completed.set(key, value)
          if (this.completed.size > 500) {
            const oldest = this.completed.keys().next().value
            if (oldest) this.completed.delete(oldest)
          }
        }
        return value
      })
      .finally(() => {
        if (this.inFlight.get(key) === promise) this.inFlight.delete(key)
      })
    this.inFlight.set(key, promise)
    return promise
  }
}
