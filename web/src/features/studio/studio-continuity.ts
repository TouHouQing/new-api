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
import type { StudioAsset } from './local-projects'

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
      prompt: asset.prompt,
      mediaId: asset.mediaId,
      outputUrl: asset.outputUrl,
    }
  }
  const version = asset.versions?.find((item) => item.id === versionId)
  if (!version) throw new Error('Pinned Studio asset version is unavailable')
  return {
    prompt: version.prompt,
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
