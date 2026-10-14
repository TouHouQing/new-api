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
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { studioProductionSchema } from '../studio-production'
import { StudioVoicePicker } from '../studio-voice-picker'
import { createStudioProject } from '../workspace'

test('a renamed default voice is presented with the saved library name before any speech generation', () => {
  const project = createStudioProject('Film', 'voice-name')
  project.production = studioProductionSchema.parse({
    voiceLibrary: [
      {
        id: 'default',
        title: 'Forest narrator',
        language: 'zh',
        tags: ['warm'],
        favorite: true,
      },
    ],
  })
  render(
    <StudioVoicePicker
      project={project}
      value='default'
      onChange={() => {}}
      getMedia={async () => null}
    />
  )
  expect(
    screen.getByRole('combobox', { name: 'Choose a character voice' })
  ).toHaveTextContent('Forest narrator')
})
