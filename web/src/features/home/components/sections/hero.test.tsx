/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
For commercial licensing, please contact support@quantumnous.com
*/
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { Hero } from './hero'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string
    children: React.ReactNode
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('@/hooks/use-status', () => ({ useStatus: () => ({ status: {} }) }))
vi.mock('../hero-terminal-demo', () => ({ HeroTerminalDemo: () => null }))
test('the actual anonymous homepage exposes the creator entry and remembers its destination', async () => {
  render(<Hero />)
  const entry = screen.getByRole('button', { name: /Start creating a video/ })
  expect(entry).toHaveAttribute('href', '/sign-up')
  await userEvent.click(entry)
  expect(localStorage.getItem('preferred-workspace')).toBe('studio')
})
