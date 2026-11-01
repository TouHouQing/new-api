/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { expect, test } from 'vitest'

import { studioProductionSchema } from '../studio-production'

test('legacy production loads without inventing analysis results', () => {
  const value = studioProductionSchema.parse({ brief: 'Keep my story' })
  expect(value.documentVersion).toBe(1)
  expect(value.brief).toBe('Keep my story')
  expect(value.analysisRefs).toBeUndefined()
})

test('versioned narrative survives validation and invalid future data is rejected', () => {
  const value = studioProductionSchema.parse({
    documentVersion: 2,
    shotNarrative: {
      shot: { purpose: 'opening', information: 'Introduce the cafe' },
    },
  })
  expect(value.shotNarrative?.shot.information).toBe('Introduce the cafe')
  expect(studioProductionSchema.safeParse({ documentVersion: 3 }).success).toBe(
    false
  )
  expect(
    studioProductionSchema.safeParse({ analysisRefs: [{ id: 'bad' }] }).success
  ).toBe(false)
})
