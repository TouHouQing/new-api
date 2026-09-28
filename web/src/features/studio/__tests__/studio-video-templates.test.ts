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
import { expect, test } from 'vitest'

import {
  createStudioVideoTemplateDraft,
  loadStudioVideoTemplates,
  saveStudioVideoTemplate,
} from '../studio-video-templates'

test('a successful request template keeps editable settings without media or secrets', () => {
  const draft = createStudioVideoTemplateDraft({
    model: 'rotating-alias',
    group: 'special',
    seconds: 12,
    resolution: '720p',
    ratio: '9:16',
    metadataJson:
      '{"aigc_watermark":false,"reference":"https://private.example/frame?token=secret","apiKey":"hidden-key","user_text":"secret scene"}',
    payloadPatchJson:
      '{"mode":"standard","images":["https://private.example/frame"],"metadata":{"camera_fixed":true,"prompt":"secret scene"}}',
  })
  const raw = JSON.stringify(draft)
  expect(raw).toContain('camera_fixed')
  expect(raw).not.toContain('private.example')
  expect(raw).not.toContain('secret')
  expect(draft).toMatchObject({
    model: 'rotating-alias',
    group: 'special',
    seconds: 12,
  })
})

test('templates are scoped to one account and retain the latest successful channel', () => {
  const storage = new Map<string, string>()
  const adapter = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
  }
  const draft = createStudioVideoTemplateDraft({
    model: 'alias',
    group: 'default',
    seconds: 5,
    resolution: '720p',
    ratio: '16:9',
  })
  saveStudioVideoTemplate(adapter, 12, {
    ...draft,
    channelId: 4,
    savedAt: '2026-09-27T00:00:00Z',
  })
  saveStudioVideoTemplate(adapter, 12, {
    ...draft,
    channelId: 9,
    savedAt: '2026-09-27T01:00:00Z',
  })
  expect(
    loadStudioVideoTemplates(adapter, 12).map((item) => item.channelId)
  ).toEqual([9, 4])
  expect(loadStudioVideoTemplates(adapter, 13)).toEqual([])
})

test('a large metadata draft still fits the project take snapshot limit', () => {
  const metadata = Object.fromEntries(
    Array.from({ length: 80 }, (_, index) => [
      `setting_${index}`,
      'x'.repeat(500),
    ])
  )
  const draft = createStudioVideoTemplateDraft({
    model: 'alias',
    group: 'default',
    seconds: 5,
    resolution: '720p',
    ratio: '16:9',
    metadataJson: JSON.stringify(metadata),
  })
  expect(JSON.stringify(draft).length).toBeLessThanOrEqual(16_384)
  expect(draft.model).toBe('alias')
})
