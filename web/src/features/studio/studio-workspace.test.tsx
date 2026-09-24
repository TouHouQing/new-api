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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { getStudioVideoTask } from './api'
import { Studio } from './index'
import { saveStudioProjects } from './local-projects'
import {
  addStudioNode,
  createStudioProject,
  updateStudioNode,
} from './workspace'

vi.mock('@/components/ai-elements/canvas', () => ({
  Canvas: ({ nodes }: { nodes: Array<{ data: { title: string } }> }) => (
    <div data-testid='canvas-nodes'>
      {nodes.map((node) => node.data.title).join(',')}
    </div>
  ),
}))
vi.mock('./api', () => ({
  fetchStudioModels: async () => ['MiniMax-H3'],
  generateStudioText: vi.fn(),
  generateStudioImage: vi.fn(),
  createStudioVideo: vi.fn(),
  getStudioVideoTask: vi.fn(),
  getStudioVideoContentUrl: vi.fn(),
}))
vi.mock('./media-store', () => ({
  studioMediaStore: () => ({
    get: async () => null,
    put: async () => undefined,
    delete: async () => undefined,
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useAuthStore.setState((state) => ({
    auth: {
      ...state.auth,
      user: { id: 12, username: 'one', role: 1, group: 'default' },
    },
  }))
})

afterEach(() => vi.restoreAllMocks())

describe('Studio account isolation', () => {
  test('polls a processing video on the schedule instead of every render', async () => {
    const base = addStudioNode(
      createStudioProject('Film', 'project-1'),
      'video',
      'video-1'
    )
    saveStudioProjects(localStorage, 12, [
      updateStudioNode(base, 'video-1', {
        taskId: 'task-1',
        status: 'processing',
      }),
    ])
    vi.mocked(getStudioVideoTask).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return { status: 'processing', progress: 5 }
    })
    const view = render(<Studio />)
    await waitFor(() => expect(getStudioVideoTask).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 140))
    const calls = vi.mocked(getStudioVideoTask).mock.calls.length
    view.unmount()
    expect(calls).toBeLessThanOrEqual(2)
  })

  test('explains that the project is unsaved when browser storage is full', async () => {
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
      function (this: Storage, key, value) {
        if (key.startsWith('newapi:studio:projects')) {
          throw new DOMException('Quota exceeded', 'QuotaExceededError')
        }
        return original.call(this, key, value)
      }
    )
    render(<Studio />)
    expect((await screen.findByRole('alert')).textContent).toContain(
      'studio.project.saveFailed'
    )
  })

  test('keeps the first account canvas when another account signs in', async () => {
    render(<Studio />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.add.video' })
    )
    expect(screen.getByTestId('canvas-nodes').textContent).toContain('Video 1')
    await waitFor(() =>
      expect(
        localStorage.getItem('newapi:studio:projects:v1:user:12')
      ).toContain('Video 1')
    )

    useAuthStore.setState((state) => ({
      auth: {
        ...state.auth,
        user: { id: 13, username: 'two', role: 1, group: 'default' },
      },
    }))
    await waitFor(() =>
      expect(screen.getByTestId('canvas-nodes').textContent).toBe('')
    )
    expect(
      localStorage.getItem('newapi:studio:projects:v1:user:13')
    ).not.toContain('Video 1')
    expect(localStorage.getItem('newapi:studio:projects:v1:user:12')).toContain(
      'Video 1'
    )
  })
})
