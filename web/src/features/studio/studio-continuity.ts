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

import type {
  StudioAsset,
  StudioAssetProfile,
  StudioProject,
} from './local-projects'

/** A pinned role image uses the profile captured with that Take, too. */
export function studioNodeAssetContext(
  project: StudioProject,
  nodeId: string
): {
  assets: StudioAsset[]
  assetIds: string[]
  assetVersionIds: Record<string, string>
} {
  const node = project.nodes.find((item) => item.id === nodeId)
  const assetIds = new Set(node?.data.assetIds || [])
  if (node?.data.linkedAssetId) assetIds.add(node.data.linkedAssetId)
  const assetVersionIds = { ...node?.data.assetVersionIds }
  const overrides = new Map<string, StudioAsset>()
  for (const edge of project.edges.filter((edge) => edge.target === nodeId)) {
    const source = project.nodes.find((item) => item.id === edge.source)
    const asset = project.assets?.find(
      (item) => item.id === source?.data.linkedAssetId
    )
    if (!asset) continue
    assetIds.add(asset.id)
    const takeId = edge.data?.sourceTakeId
    if (!takeId || assetVersionIds[asset.id]) continue
    if (asset.versions?.some((version) => version.id === takeId)) {
      assetVersionIds[asset.id] = takeId
    } else {
      const take = source?.data.takes?.find((take) => take.id === takeId)
      if (take) {
        overrides.set(asset.id, {
          ...asset,
          prompt: take.prompt,
          profile: undefined,
          mediaId: take.mediaId,
          outputUrl: take.outputUrl,
        })
      }
    }
  }
  return {
    assets: (project.assets || []).map(
      (asset) => overrides.get(asset.id) || asset
    ),
    assetIds: [...assetIds],
    assetVersionIds,
  }
}

export function studioAssetDescription(
  prompt: string,
  profile?: StudioAssetProfile
): string {
  const details = Object.entries(profile || {})
    .filter(([, value]) => value?.trim())
    .map(([key, value]) => `${key}: ${value.trim()}`)
  return [prompt.trim(), ...details].filter(Boolean).join('\n')
}

export type StudioContinuityPromptInput = {
  prompt: string
  assets?: readonly StudioAsset[]
  assetIds?: readonly string[]
  assetVersionIds?: Readonly<Record<string, string>>
  previousShotNote?: string
}

export function resolveStudioAssetReference(
  asset: StudioAsset,
  versionId?: string
): { prompt: string; mediaId?: string; outputUrl?: string } {
  if (!versionId) {
    return {
      prompt: studioAssetDescription(asset.prompt, asset.profile),
      mediaId: asset.mediaId,
      outputUrl: asset.outputUrl,
    }
  }
  const version = asset.versions?.find((item) => item.id === versionId)
  if (!version) throw new Error('Pinned Studio asset version is unavailable')
  return {
    prompt: studioAssetDescription(version.prompt, version.profile),
    mediaId: version.mediaId,
    outputUrl: version.outputUrl,
  }
}

/** Adds selected project descriptions without rewriting the shot's own prompt. */
export function compileStudioContinuityPrompt(
  input: StudioContinuityPromptInput
): string {
  const selectedIds = new Set(input.assetIds || [])
  const seenIds = new Set<string>()
  const parts = input.prompt ? [input.prompt] : []
  const existingText = input.prompt.replaceAll(/\s+/g, ' ').toLowerCase()

  for (const asset of input.assets || []) {
    if (!selectedIds.has(asset.id) || seenIds.has(asset.id)) continue
    seenIds.add(asset.id)
    const reference = resolveStudioAssetReference(
      asset,
      input.assetVersionIds?.[asset.id]
    )
    const description = reference.prompt.trim()
    const context = `${asset.kind}: ${asset.title.trim()}${description ? ` — ${description}` : ''}`
    const descriptionAlreadyWritten =
      description &&
      existingText.includes(description.replaceAll(/\s+/g, ' ').toLowerCase())
    if (descriptionAlreadyWritten) continue
    if (!parts.some((part) => part.includes(context))) parts.push(context)
  }

  const previousShotNote = input.previousShotNote?.trim()
  if (previousShotNote) {
    const context = `Previous shot: ${previousShotNote}`
    const noteAlreadyWritten = existingText.includes(
      previousShotNote.replaceAll(/\s+/g, ' ').toLowerCase()
    )
    if (!noteAlreadyWritten && !parts.some((part) => part.includes(context))) {
      parts.push(context)
    }
  }

  return parts.join('\n\n')
}
