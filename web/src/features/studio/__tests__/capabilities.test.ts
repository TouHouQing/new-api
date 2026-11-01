/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { expect, test } from 'vitest'

import {
  studioAssessCapability,
  type StudioModelCapabilityEntry,
} from '../studio-capabilities'

const now = Date.parse('2026-10-18T10:00:00Z')
const ready: StudioModelCapabilityEntry = {
  modelId: 'local-video',
  action: 'video',
  configurationDigest: 'a'.repeat(64),
  support: 'supported',
  readiness: 'ready',
  checkedAt: '2026-10-18T09:59:00Z',
  constraints: {
    maxReferences: 1,
    resolutions: [{ width: 640, height: 384 }],
    minSeconds: 1,
    maxSeconds: 10,
  },
}

test('an unknown catalogue entry cannot be treated as a ready model', () => {
  expect(studioAssessCapability(undefined, { now })).toMatchObject({
    canStart: false,
    support: 'unknown',
    readiness: 'unknown',
    verification: 'unknown',
    reasons: ['support_unknown', 'readiness_unknown'],
  })
})

test('declared support without a fresh readiness check stays blocked', () => {
  expect(
    studioAssessCapability({ ...ready, checkedAt: undefined }, { now })
  ).toMatchObject({
    canStart: false,
    readiness: 'stale',
    reasons: ['readiness_stale'],
  })
  expect(
    studioAssessCapability(
      { ...ready, checkedAt: '2026-10-18T09:00:00Z' },
      { now }
    ).readiness
  ).toBe('stale')
})

test('an unavailable engine remains blocked even when an old quality example passed', () => {
  const entry: StudioModelCapabilityEntry = {
    ...ready,
    readiness: 'unavailable',
    evidence: [
      {
        id: 'proof',
        configurationDigest: 'a'.repeat(64),
        modelId: 'local-video',
        action: 'video',
        outcome: 'passed',
        testedAt: '2026-10-18T09:00:00Z',
        artifactUrl: '/proof/video.mp4',
      },
    ],
  }
  expect(studioAssessCapability(entry, { now })).toMatchObject({
    canStart: false,
    readiness: 'unavailable',
    verification: 'verified',
    reasons: ['unavailable'],
  })
})

test('a ready supported engine can run without claiming an untested result passed', () => {
  expect(
    studioAssessCapability(ready, {
      now,
      requiredReferences: 1,
      width: 640,
      height: 384,
      seconds: 5,
    })
  ).toMatchObject({
    canStart: true,
    verification: 'unknown',
    reasons: [],
  })
})

test('reference count, resolution and duration limits block incompatible inputs', () => {
  expect(
    studioAssessCapability(ready, {
      now,
      requiredReferences: 2,
      width: 1920,
      height: 1080,
      seconds: 15,
    }).reasons
  ).toEqual([
    'references_out_of_range',
    'resolution_unsupported',
    'duration_out_of_range',
  ])
})

test('invalid or partial numeric inputs cannot pass compatibility', () => {
  expect(
    studioAssessCapability(ready, {
      now,
      requiredReferences: -1,
      width: 640,
      seconds: Number.NaN,
    }).reasons
  ).toContain('invalid_input')
})

test('evidence for another model or action and an unlinked claim do not verify this operation', () => {
  const entry: StudioModelCapabilityEntry = {
    ...ready,
    evidence: [
      {
        id: 'wrong',
        modelId: 'other-video',
        action: 'video',
        outcome: 'passed',
        testedAt: '2026-10-18T09:20:00Z',
        artifactUrl: '/proof/other.mp4',
      },
      {
        id: 'unlinked',
        modelId: 'local-video',
        action: 'video',
        outcome: 'passed',
        testedAt: '2026-10-18T09:00:00Z',
      },
    ],
  }
  expect(studioAssessCapability(entry, { now }).verification).toBe('unknown')
})

test('the latest matching failure supersedes a previous passed sample without reordering stored evidence', () => {
  const entry: StudioModelCapabilityEntry = {
    ...ready,
    evidence: [
      {
        id: 'old',
        configurationDigest: 'a'.repeat(64),
        modelId: 'local-video',
        action: 'video',
        outcome: 'passed',
        testedAt: '2026-10-18T08:00:00Z',
        artifactUrl: '/proof/old.mp4',
      },
      {
        id: 'new',
        configurationDigest: 'a'.repeat(64),
        modelId: 'local-video',
        action: 'video',
        outcome: 'failed',
        testedAt: '2026-10-18T09:00:00Z',
      },
    ],
  }
  expect(studioAssessCapability(entry, { now })).toMatchObject({
    verification: 'failed',
    evidence: { id: 'new' },
  })
  expect(entry.evidence?.map((item) => item.id)).toEqual(['old', 'new'])
  expect(
    studioAssessCapability(
      { ...entry, configurationDigest: 'b'.repeat(64) },
      { now }
    ).verification
  ).toBe('unknown')
})
