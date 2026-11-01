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
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'

import { StudioRenderProgress } from '../studio-render-progress'

const mocks = vi.hoisted(() => ({ context: vi.fn(), open: vi.fn() }))
vi.mock('../studio-production-context', () => ({
  useStudioProductionContext: () => mocks.context(),
}))

beforeEach(() => vi.clearAllMocks())

test('a failed render keeps a visible explanation and access to its task after active progress ends', async () => {
  mocks.context.mockReturnValue({
    activeRender: undefined,
    jobs: {
      data: [
        {
          id: 'render-1',
          kind: 'render',
          status: 'failed',
          error: 'resolve script and review changes before final delivery',
        },
      ],
    },
    setActiveTab: mocks.open,
  })
  render(<StudioRenderProgress />)
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Resolve pending script or review changes before exporting.'
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Open render task details' })
  )
  expect(mocks.open).toHaveBeenCalledWith('workflow')
})

test('a new render or a later successful render replaces the previous failure', () => {
  mocks.context.mockReturnValue({
    activeRender: { id: 'render-2', status: 'queued', progress: 0 },
    jobs: {
      data: [
        {
          id: 'render-1',
          kind: 'render',
          status: 'failed',
          error: 'old failure',
        },
      ],
    },
  })
  const view = render(<StudioRenderProgress />)
  expect(screen.getByRole('status')).toHaveTextContent(
    'Your video is queued for rendering.'
  )
  expect(screen.queryByRole('alert')).toBeNull()
  mocks.context.mockReturnValue({
    activeRender: undefined,
    jobs: {
      data: [
        { id: 'render-2', kind: 'render', status: 'succeeded' },
        {
          id: 'render-1',
          kind: 'render',
          status: 'failed',
          error: 'old failure',
        },
      ],
    },
  })
  view.rerender(<StudioRenderProgress />)
  expect(screen.queryByRole('alert')).toBeNull()
})
