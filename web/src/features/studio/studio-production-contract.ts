/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { z } from 'zod'

const id = z.string().min(1).max(128)
export const STUDIO_DOCUMENT_VERSION = 2

export const studioAnalysisReferenceSchema = z.strictObject({
  id,
  kind: z.enum([
    'scenes',
    'transcript',
    'audio',
    'subjects',
    'continuity',
    'index',
  ]),
  sourceMediaId: id,
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  sourceTakeId: id.optional(),
  artifactMediaId: id,
  analyzerVersion: z.string().min(1).max(200),
  createdAt: z.string().max(40),
})

export const studioNarrativeSchema = z.strictObject({
  purpose: z.enum([
    'opening',
    'establish',
    'action',
    'emotion',
    'benefit',
    'ending',
  ]),
  information: z.string().max(2000).default(''),
  emotion: z.string().max(500).default(''),
  visualBeat: z.string().max(2000).default(''),
  continuityNeeds: z.string().max(2000).default(''),
})

export const studioProductionV2Fields = {
  documentVersion: z
    .number()
    .int()
    .min(1)
    .max(STUDIO_DOCUMENT_VERSION)
    .default(1),
  analysisRefs: z.array(studioAnalysisReferenceSchema).max(500).optional(),
  shotNarrative: z.record(id, studioNarrativeSchema).optional(),
  continuityReviews: z
    .array(
      z.strictObject({
        shotId: id,
        assetId: id,
        nodeId: id,
        takeId: id.optional(),
        mediaId: id,
        referenceMediaIds: z.array(id).max(12).default([]),
        referenceVersionId: id.optional(),
        requirementsKey: z.string().max(12000).optional(),
        status: z.enum(['approved', 'retake', 'unreviewed']),
        note: z.string().max(2000),
        reviewedAt: z.string().max(40),
      })
    )
    .max(1000)
    .optional(),
  appliedEditPlans: z.array(id).max(100).optional(),
  reframes: z
    .record(
      id,
      z.strictObject({
        analysisId: id,
        sourceMediaId: id,
        sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
        width: z.number().int().min(64).max(4096),
        height: z.number().int().min(64).max(4096),
      })
    )
    .optional(),
  musicVideoPlan: z
    .strictObject({
      recordId: id,
      direction: z.enum(['narrative', 'concept', 'performance']),
      analysisId: id,
      correctionId: id.optional(),
      musicMediaId: id,
      musicDigest: z.string().regex(/^[a-f0-9]{64}$/),
      start: z.number().min(0).max(3600),
      end: z.number().min(0).max(3600),
    })
    .optional(),
  finalDurations: z.record(id, z.number().min(1).max(3600)).optional(),
  templateOrigin: z
    .strictObject({
      id,
      version: z.number().int().positive(),
      inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .optional(),
}
