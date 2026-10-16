/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { expect, test } from 'vitest'

import {
  studioSetDraftStage,
  studioTakeSizeLabel,
} from '../studio-draft-profile'
import { addStudioNode, createStudioProject } from '../workspace'

test('a real local draft profile keeps duration, references and the existing result when restored to final', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'video'
  )
  Object.assign(project.nodes[0].data, {
    model: 'wan2.2-ti2v-5b',
    prompt: 'A slow camera move',
    seconds: 3,
    resolution: '384x640',
    ratio: '9:16',
    mediaId: 'old-result',
    metadataJson: '{"seed":123}',
  })
  const draft = studioSetDraftStage(project, 'video', 'draft')
  expect(draft.nodes[0].data).toMatchObject({
    resolution: '224x384',
    seconds: 3,
    mediaId: 'old-result',
    prompt: 'A slow camera move',
    metadataJson: '{"seed":123}',
  })
  expect(
    studioSetDraftStage(draft, 'video', 'final').nodes[0].data.resolution
  ).toBe('384x640')
  expect(project.nodes[0].data.resolution).toBe('384x640')
})

test('unsupported models and custom payloads cannot pretend to use a draft profile', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'video'
  )
  project.nodes[0].data.model = 'other-model'
  expect(() => studioSetDraftStage(project, 'video', 'draft')).toThrow(
    /no configured draft/
  )
  project.nodes[0].data.model = 'wan2.2-ti2v-5b'
  project.nodes[0].data.payloadPatchJson = '{"metadata":{"width":640}}'
  expect(() => studioSetDraftStage(project, 'video', 'draft')).toThrow(
    /custom request/
  )
})

test('Take labels come from the completed request, without guessing from edited settings', () => {
  expect(
    studioTakeSizeLabel('{"model":"wan2.2-ti2v-5b","size":"384x224"}')
  ).toBe('Draft size')
  expect(
    studioTakeSizeLabel('{"model":"wan2.2-ti2v-5b","size":"640x384"}')
  ).toBe('Final size')
  expect(
    studioTakeSizeLabel('{"model":"other","size":"384x224"}')
  ).toBeUndefined()
  expect(studioTakeSizeLabel(undefined)).toBeUndefined()
})
