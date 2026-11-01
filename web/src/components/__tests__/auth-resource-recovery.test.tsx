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
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

import { GeneralError } from '@/features/errors/general-error'
import { isPageResourceError } from '@/lib/page-resource-recovery'

import { AuthRecovery } from '../auth-recovery'

const state = vi.hoisted(() => ({ reload: vi.fn(), invalidate: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate: state.invalidate }),
  useNavigate: () => vi.fn(),
}))
vi.mock('@/lib/page-resource-recovery', async (original) => ({
  ...(await original<typeof import('@/lib/page-resource-recovery')>()),
  reloadCurrentPage: state.reload,
}))
beforeEach(() => vi.clearAllMocks())

test('a failed chunk offers an explicit page reload and does not loop automatically', () => {
  const error = Object.assign(new Error('Loading chunk 53227 failed.'), {
    name: 'ChunkLoadError',
  })
  render(<AuthRecovery error={error} reset={vi.fn()} />)
  expect(screen.getByText('Page resources could not load')).toBeVisible()
  expect(state.reload).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Reload this page' }))
  expect(state.reload).toHaveBeenCalledOnce()
  expect(state.invalidate).not.toHaveBeenCalled()
})

test('ordinary route failures retain route retry rather than reloading the page', () => {
  render(
    <AuthRecovery
      error={new Error('Ordinary operation failure')}
      reset={vi.fn()}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(state.invalidate).toHaveBeenCalledOnce()
  expect(state.reload).not.toHaveBeenCalled()
})

test('recognizes supported JS and CSS asset errors without classifying ordinary fetch failures', () => {
  expect(isPageResourceError({ code: 'CSS_CHUNK_LOAD_FAILED' })).toBe(true)
  expect(
    isPageResourceError({
      cause: new TypeError(
        'Failed to fetch dynamically imported module: /static/js/async/a.js'
      ),
    })
  ).toBe(true)
  expect(isPageResourceError(new TypeError('Failed to fetch'))).toBe(false)
})

test('resource failures before authenticated layout loads offer the same explicit reload', () => {
  render(
    <GeneralError
      error={Object.assign(new Error('Loading chunk 2860 failed.'), {
        name: 'ChunkLoadError',
      })}
    />
  )
  expect(screen.queryByRole('heading', { name: '500' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reload this page' }))
  expect(state.reload).toHaveBeenCalledOnce()
  expect(state.invalidate).not.toHaveBeenCalled()
})
