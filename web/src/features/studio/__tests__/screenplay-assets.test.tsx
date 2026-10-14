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
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { expect, test } from 'vitest'

import { resources } from '@/i18n/config'

import { studioPlanStoryDraft } from '../studio-creation'
import { StudioScreenplayAssets } from '../studio-screenplay-assets'
import { createStudioProject } from '../workspace'

test.each(['en', 'zhCN', 'zhTW', 'fr', 'ru', 'ja', 'vi'])(
  'asset section headings resolve the actual %s resources instead of internal keys',
  async (language) => {
    const i18n = createInstance()
    await i18n.init({
      lng: language,
      resources,
      keySeparator: false,
      nsSeparator: false,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
    })
    const draft = studioPlanStoryDraft(
      createStudioProject('Story', 'story'),
      'A fox finds a lantern.',
      6
    )
    render(
      <I18nextProvider i18n={i18n}>
        <StudioScreenplayAssets draft={draft} disabled onChange={() => {}} />
      </I18nextProvider>
    )
    for (const kind of ['characters', 'scenes', 'props']) {
      const key = `studio.production.${kind}`
      const title = i18n.t(key)
      expect(title).not.toBe(key)
      expect(screen.getByRole('heading', { name: title })).toBeVisible()
    }
  }
)
