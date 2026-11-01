/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/

/** Declared support, live readiness, and demonstrated quality are separate facts. */
export type StudioModelCapabilityEntry = {
  modelId: string
  action: string
  support: 'supported' | 'unsupported' | 'unknown'
  readiness: 'ready' | 'unavailable' | 'unknown'
  checkedAt?: string
  configurationDigest?: string
  constraints?: {
    minReferences?: number
    maxReferences?: number
    resolutions?: Array<{ width: number; height: number }>
    minSeconds?: number
    maxSeconds?: number
    notes?: string[]
  }
  evidence?: Array<{
    id: string
    modelId: string
    action: string
    configurationDigest?: string
    outcome: 'passed' | 'failed' | 'blocked'
    testedAt: string
    artifactUrl?: string
    scope?: string
  }>
}

export type StudioCapabilityAssessment = {
  canStart: boolean
  support: StudioModelCapabilityEntry['support']
  readiness: StudioModelCapabilityEntry['readiness'] | 'stale'
  verification: 'verified' | 'failed' | 'blocked' | 'unknown'
  reasons: Array<
    | 'support_unknown'
    | 'unsupported'
    | 'readiness_unknown'
    | 'unavailable'
    | 'readiness_stale'
    | 'references_out_of_range'
    | 'resolution_unsupported'
    | 'duration_out_of_range'
    | 'invalid_input'
  >
  evidence?: NonNullable<StudioModelCapabilityEntry['evidence']>[number]
}

export function studioAssessCapability(
  entry: StudioModelCapabilityEntry | undefined,
  input: {
    now?: number
    maxAgeMs?: number
    requiredReferences?: number
    width?: number
    height?: number
    seconds?: number
  } = {}
): StudioCapabilityAssessment {
  const now = input.now ?? Date.now()
  const maxAge = input.maxAgeMs ?? 10 * 60 * 1000
  const reasons: StudioCapabilityAssessment['reasons'] = []
  const support = entry?.support ?? 'unknown'
  let readiness: StudioCapabilityAssessment['readiness'] =
    entry?.readiness ?? 'unknown'
  if (support === 'unknown') reasons.push('support_unknown')
  if (support === 'unsupported') reasons.push('unsupported')
  if (readiness === 'unknown') reasons.push('readiness_unknown')
  if (readiness === 'unavailable') reasons.push('unavailable')
  const checkedAt = Date.parse(entry?.checkedAt || '')
  if (
    readiness === 'ready' &&
    (!Number.isFinite(checkedAt) ||
      checkedAt > now + 60_000 ||
      now - checkedAt > maxAge)
  ) {
    readiness = 'stale'
    reasons.push('readiness_stale')
  }
  const limits = entry?.constraints
  const references = input.requiredReferences
  const invalidReferences =
    references !== undefined &&
    (!Number.isInteger(references) || references < 0)
  const invalidDimensions = [input.width, input.height].some(
    (value) => value !== undefined && (!Number.isInteger(value) || value <= 0)
  )
  const incompleteDimensions =
    (input.width === undefined) !== (input.height === undefined)
  const invalidDuration =
    input.seconds !== undefined &&
    (!Number.isFinite(input.seconds) || input.seconds <= 0)
  if (
    invalidReferences ||
    invalidDimensions ||
    incompleteDimensions ||
    invalidDuration
  ) {
    reasons.push('invalid_input')
  }
  if (
    references !== undefined &&
    !invalidReferences &&
    ((limits?.minReferences !== undefined &&
      references < limits.minReferences) ||
      (limits?.maxReferences !== undefined &&
        references > limits.maxReferences))
  ) {
    reasons.push('references_out_of_range')
  }
  if (
    input.width !== undefined &&
    input.height !== undefined &&
    limits?.resolutions?.length &&
    !limits.resolutions.some(
      (size) => size.width === input.width && size.height === input.height
    )
  ) {
    reasons.push('resolution_unsupported')
  }
  if (
    input.seconds !== undefined &&
    !invalidDuration &&
    ((limits?.minSeconds !== undefined && input.seconds < limits.minSeconds) ||
      (limits?.maxSeconds !== undefined && input.seconds > limits.maxSeconds))
  ) {
    reasons.push('duration_out_of_range')
  }
  const evidence = entry?.evidence
    ?.filter(
      (item) =>
        item.modelId === entry.modelId &&
        item.action === entry.action &&
        /^[a-f0-9]{64}$/.test(entry.configurationDigest || '') &&
        item.configurationDigest === entry.configurationDigest &&
        Number.isFinite(Date.parse(item.testedAt)) &&
        Date.parse(item.testedAt) <= now + 60_000
    )
    .sort((a, b) => Date.parse(b.testedAt) - Date.parse(a.testedAt))[0]
  let verification: StudioCapabilityAssessment['verification'] = 'unknown'
  if (evidence?.outcome === 'passed' && evidence.artifactUrl) {
    verification = 'verified'
  } else if (evidence?.outcome === 'failed') {
    verification = 'failed'
  } else if (evidence?.outcome === 'blocked') {
    verification = 'blocked'
  }
  return {
    canStart: reasons.length === 0,
    support,
    readiness,
    verification,
    reasons,
    ...(evidence ? { evidence } : {}),
  }
}
