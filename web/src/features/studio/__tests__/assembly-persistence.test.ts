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
  loadStudioProjects,
  parseStudioProjectImport,
  saveStudioProjects,
  serializeStudioProjectExport,
} from '../local-projects'
import { createStudioProject } from '../workspace'

test('caption text survives local reload and portable project export', () => {
  const project = {
    ...createStudioProject('Captions', 'p-captions'),
    captionsText: '1\n00:00:00,000 --> 00:00:01,000\nHello',
    soundtrackOffsetSeconds: 1,
    voiceoverOffsetSeconds: 2,
    captionOffsetSeconds: 3,
  }
  saveStudioProjects(localStorage, 12, [project])
  expect(loadStudioProjects(localStorage, 12)[0].captionsText).toBe(
    project.captionsText
  )
  expect(
    parseStudioProjectImport(serializeStudioProjectExport(project)).captionsText
  ).toBe(project.captionsText)
  expect(loadStudioProjects(localStorage, 12)[0]).toMatchObject({
    soundtrackOffsetSeconds: 1,
    voiceoverOffsetSeconds: 2,
    captionOffsetSeconds: 3,
  })
})

test('a local assembled MP4 survives reload but is excluded from portable project export', () => {
  const project = {
    ...createStudioProject('Drama', 'p1'),
    assembledMediaId: 'local-mp4',
  }
  saveStudioProjects(localStorage, 12, [project])
  expect(loadStudioProjects(localStorage, 12)[0].assembledMediaId).toBe(
    'local-mp4'
  )
  const exported = serializeStudioProjectExport(project)
  expect(exported).not.toContain('local-mp4')
  expect(
    parseStudioProjectImport(JSON.stringify(project)).assembledMediaId
  ).toBeUndefined()
})
