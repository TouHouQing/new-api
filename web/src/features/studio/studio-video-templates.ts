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
export type StudioVideoTemplateDraft = {
  model: string
  group: string
  seconds: number
  resolution: string
  ratio: string
  metadataJson?: string
  payloadPatchJson?: string
}
export type StudioVideoTemplate = StudioVideoTemplateDraft & {
  savedAt: string
  channelId?: number
}

function templateKey(userId: number): string {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error('Studio account is invalid')
  }
  return `newapi:studio:video-templates:v1:user:${userId}`
}

function safeFields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const safe: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (
      /__proto__|constructor|prototype|key|auth|token|secret|password|credential|prompt|text|caption|content|url|uri|image|video|audio|reference|bearer/i.test(
        key
      )
    ) {
      continue
    }
    if (typeof item === 'string') {
      if (
        item.length <= 1000 &&
        !/(?:https?:\/\/|data:|blob:|sk-)/i.test(item)
      ) {
        safe[key] = item
      }
    } else if (typeof item === 'number' && Number.isFinite(item)) {
      safe[key] = item
    } else if (typeof item === 'boolean' || item === null) {
      safe[key] = item
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      safe[key] = safeFields(item)
    }
  }
  return safe
}

export function createStudioVideoTemplateDraft(
  input: StudioVideoTemplateDraft
): StudioVideoTemplateDraft {
  if (
    !input.model ||
    !input.group ||
    !Number.isInteger(input.seconds) ||
    input.seconds < 1 ||
    input.seconds > 3600
  ) {
    throw new Error('Studio video template is invalid')
  }
  let metadata: unknown = {}
  let patch: unknown = {}
  try {
    metadata = JSON.parse(input.metadataJson || '{}')
  } catch {
    /* Invalid drafts are omitted. */
  }
  try {
    patch = JSON.parse(input.payloadPatchJson || '{}')
  } catch {
    /* Invalid drafts are omitted. */
  }
  const safeMetadata = safeFields(metadata)
  const safePatch = safeFields(patch)
  const payloadPatch: Record<string, unknown> = {}
  for (const key of ['seconds', 'duration', 'mode', 'size', 'metadata']) {
    if (key in safePatch) payloadPatch[key] = safePatch[key]
  }
  const draft: StudioVideoTemplateDraft = {
    model: input.model.slice(0, 200),
    group: input.group.slice(0, 100),
    seconds: input.seconds,
    resolution: input.resolution.slice(0, 100),
    ratio: input.ratio.slice(0, 40),
    ...(Object.keys(safeMetadata).length
      ? { metadataJson: JSON.stringify(safeMetadata) }
      : {}),
    ...(Object.keys(payloadPatch).length
      ? { payloadPatchJson: JSON.stringify(payloadPatch) }
      : {}),
  }
  if (JSON.stringify(draft).length > 16_384) {
    delete draft.metadataJson
  }
  if (JSON.stringify(draft).length > 16_384) {
    delete draft.payloadPatchJson
  }
  return draft
}

export function loadStudioVideoTemplates(
  storage: Pick<Storage, 'getItem'>,
  userId: number
): StudioVideoTemplate[] {
  const raw = storage.getItem(templateKey(userId))
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, 50).flatMap((item): StudioVideoTemplate[] => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return []
      const record = item as Record<string, unknown>
      if (
        typeof record.model !== 'string' ||
        typeof record.group !== 'string' ||
        typeof record.seconds !== 'number' ||
        typeof record.resolution !== 'string' ||
        typeof record.ratio !== 'string' ||
        typeof record.savedAt !== 'string'
      ) {
        return []
      }
      try {
        return [
          {
            ...createStudioVideoTemplateDraft({
              model: record.model,
              group: record.group,
              seconds: record.seconds,
              resolution: record.resolution,
              ratio: record.ratio,
              metadataJson:
                typeof record.metadataJson === 'string'
                  ? record.metadataJson
                  : undefined,
              payloadPatchJson:
                typeof record.payloadPatchJson === 'string'
                  ? record.payloadPatchJson
                  : undefined,
            }),
            savedAt: record.savedAt.slice(0, 40),
            channelId:
              typeof record.channelId === 'number' &&
              Number.isInteger(record.channelId) &&
              record.channelId > 0
                ? record.channelId
                : undefined,
          },
        ]
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

export function saveStudioVideoTemplate(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  userId: number,
  template: StudioVideoTemplate
): void {
  const safe = {
    ...createStudioVideoTemplateDraft(template),
    savedAt: template.savedAt.slice(0, 40),
    channelId: template.channelId,
  }
  const others = loadStudioVideoTemplates(storage, userId).filter(
    (item) =>
      item.group !== safe.group ||
      item.model !== safe.model ||
      item.channelId !== safe.channelId
  )
  storage.setItem(
    templateKey(userId),
    JSON.stringify([safe, ...others].slice(0, 50))
  )
}
