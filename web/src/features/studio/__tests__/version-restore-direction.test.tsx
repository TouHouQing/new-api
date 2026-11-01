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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { StudioProductionVersionsTab } from '../studio-production-versions-tab'
import { addStudioNode, createStudioProject } from '../workspace'

const state = vi.hoisted(() => ({ context: vi.fn(), request: vi.fn() }))
vi.mock('../studio-production-context', () => ({
  useStudioProductionContext: () => state.context(),
}))
vi.mock('../studio-cloud', () => ({
  studioCloudRequest: (...args: unknown[]) => state.request(...args),
}))
vi.mock('../studio-series-panel', () => ({ StudioSeriesPanel: () => null }))
vi.mock('../studio-media-thumbnail', () => ({
  StudioMediaThumbnail: () => null,
}))
vi.mock('@/components/ui/tabs', () => ({
  TabsContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}))

test('restoration preview describes the current project before and the selected snapshot after', async () => {
  const old = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'shot'
  )
  old.nodes[0].data.title = 'Shot'
  old.nodes[0].data.prompt = 'Original description'
  const current = structuredClone(old)
  current.nodes[0].data.prompt = 'Updated description'
  state.request.mockImplementation(async (path: string) =>
    path === '/trash' ? [] : { document: old }
  )
  state.context.mockReturnValue({
    props: { project: current, getMedia: async () => null },
    path: '/projects/film',
    versions: { data: [{ revision: 1, created_at: '2026-10-18T00:00:00Z' }] },
    writable: true,
    mutate: { isPending: false, mutate: vi.fn() },
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <StudioProductionVersionsTab />
    </QueryClientProvider>
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.production.previewVersion' })
  )
  expect(
    await screen.findByText(
      'Before: Updated description → After: Original description'
    )
  ).toBeVisible()
})
