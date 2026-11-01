/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { StudioProjectMedia } from '../studio-project-media'
import { createStudioProject } from '../workspace'

vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [] }) }))
vi.mock('../studio-media-search', () => ({ StudioMediaSearch: () => null }))

beforeEach(() => {
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:fixture')
      static revokeObjectURL = vi.fn()
    }
  )
})
afterEach(() => vi.unstubAllGlobals())

function fixture(id = 'gallery') {
  const project = createStudioProject('Own gallery', id)
  project.nodes = Array.from({ length: 400 }, (_, index) => ({
    id: `node-${index}`,
    type: 'studio' as const,
    position: { x: 0, y: 0 },
    data: {
      kind: 'image' as const,
      title: `Node ${String(index).padStart(4, '0')}`,
      prompt: 'Self-made fixture',
      status: 'completed' as const,
      sourceMode: 'upload' as const,
      mediaId: `media-${index}`,
      selectedTakeId: `take-${index}`,
      takes: Array.from({ length: index < 200 ? 3 : 2 }, (_, takeIndex) => ({
        id: `take-${index + takeIndex * 400}`,
        mediaId: `media-${index + takeIndex * 400}`,
        prompt: 'Self-made fixture',
        sourceMode: 'upload' as const,
        createdAt: project.createdAt,
        status: 'completed' as const,
      })),
    },
  }))
  return project
}

function props(project = fixture()) {
  return {
    project,
    readOnly: false,
    getMedia: vi.fn(
      async (mediaId: string) => new Blob([mediaId], { type: 'image/png' })
    ),
    onUpdate: vi.fn(),
    onOpen: vi.fn(),
    onAssets: vi.fn(),
  }
}

test('all1000 exact media are reachable across21 pages while only48 thumbnails mount at once', async () => {
  const p = props()
  render(<StudioProjectMedia {...p} />)
  for (let page = 1; page <= 21; page++) {
    const count = page === 21 ? 40 : 48
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(count))
    expect(screen.getByText(`Page ${page} of 21`)).toBeInTheDocument()
    if (page < 21) {
      fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    }
  }
  expect(new Set(p.getMedia.mock.calls.map((call) => call[0])).size).toBe(1000)
  expect(p.getMedia).toHaveBeenCalledTimes(1000)
  expect(screen.getByText('Showing 961–1000 of 1000 media')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(960)
})

test('search and kind filters apply to the full collection and reset the page', async () => {
  render(<StudioProjectMedia {...props()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  expect(screen.getByText('Page 2 of 21')).toBeInTheDocument()
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Find project media' }),
    { target: { value: '0399' } }
  )
  await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2))
  expect(screen.getByText('Showing 1–2 of 2 media')).toBeInTheDocument()
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Find project media' }),
    { target: { value: '' } }
  )
  expect(screen.getByText('Page 1 of 21')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Generated' }))
  expect(screen.getByText('No matching media yet')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Uploaded' }))
  expect(screen.getByText('Page 1 of 21')).toBeInTheDocument()
})

test('switching projects returns to the first page and late thumbnail reads do not survive unmount', async () => {
  const p = props(),
    view = render(<StudioProjectMedia {...p} />)
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  expect(screen.getByText('Page 2 of 21')).toBeInTheDocument()
  view.rerender(
    <StudioProjectMedia {...p} project={fixture('other-own-project')} />
  )
  expect(screen.getByText('Page 1 of 21')).toBeInTheDocument()
  await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(48))
  view.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(48)
})

test('candidate preview uses each exact media and closes its URL without selecting a global Take', async () => {
  const p = props()
  const view = render(<StudioProjectMedia {...p} />)
  await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(48))
  p.getMedia.mockClear()
  for (const [index, mediaId] of [
    [0, 'media-0'],
    [1, 'media-400'],
  ] as const) {
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Preview this version' })[index]
    )
    const dialog = await screen.findByRole('dialog')
    await waitFor(() =>
      expect(within(dialog).getByRole('img')).toBeInTheDocument()
    )
    expect(p.getMedia).toHaveBeenLastCalledWith(mediaId)
    expect(p.onUpdate).not.toHaveBeenCalled()
    expect(p.onOpen).not.toHaveBeenCalled()
    const revoked = vi.mocked(URL.revokeObjectURL).mock.calls.length
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(revoked + 1)
  }
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Preview this version' })[0]
  )
  await screen.findByRole('dialog')
  view.rerender(
    <StudioProjectMedia {...p} project={fixture('another-project')} />
  )
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  view.rerender(<StudioProjectMedia {...p} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
