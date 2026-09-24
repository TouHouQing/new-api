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
import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { fetchStudioAttempts } from './api'
import { StudioAttempts } from './studio-attempts'

vi.mock('./api', () => ({ fetchStudioAttempts: vi.fn() }))

test('shows a rejected video submission with its channel and safe error code', async () => {
  vi.mocked(fetchStudioAttempts).mockResolvedValue([
    {
      id: 'attempt-1',
      group: '特价sd',
      model: '轮换渠道-会员视频',
      stage: 'rejected_after_channel',
      httpStatus: 400,
      errorCode: 'upstream_rejected',
      channelId: 73,
      taskId: '',
      createdAt: '2026-09-25T00:00:00Z',
    },
  ])
  render(<StudioAttempts open onOpenChange={vi.fn()} userId={12} />)
  expect(await screen.findByText('轮换渠道-会员视频')).toBeTruthy()
  expect(screen.getByText('upstream_rejected')).toBeTruthy()
  expect(screen.getByText(/studio\.attempt\.channel 73/)).toBeTruthy()
  expect(screen.queryByText(/sk-private/)).toBeNull()
})
