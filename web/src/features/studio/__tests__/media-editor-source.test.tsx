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
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { StudioMediaEditor } from '../studio-media-editor'

const audioTracks = vi.hoisted(() => ({ value: [] as object[] }))
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    async getAudioTracks() {
      return audioTracks.value
    }
    dispose() {}
  },
}))

test('silent footage cannot submit audio extraction and shows an explanation before a job exists', async () => {
  audioTracks.value = []
  const onCreate = vi.fn()
  render(
    <StudioMediaEditor
      node={{
        id: 'video',
        type: 'studio',
        position: { x: 0, y: 0 },
        data: { kind: 'video', title: 'Silent', prompt: '', mediaId: 'silent' },
      }}
      projectId='film'
      previewUrl='blob:silent'
      onCreate={onCreate}
      onRefresh={async () => {}}
      onSource={() => {}}
      getMedia={async () => new Blob(['video'])}
    />
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Edit this media for free' })
  )
  expect(
    screen.queryByText(
      'This video has no audio track. Choose a video with sound or add separate audio.'
    )
  ).toBeNull()
  await userEvent.click(
    screen.getByRole('combobox', { name: 'Media operation' })
  )
  await waitFor(() =>
    expect(
      screen.getByRole('option', {
        name: /studio\.edit\.extract_audio.*No audio track/,
      })
    ).toHaveAttribute('aria-disabled', 'true')
  )
  expect(onCreate).not.toHaveBeenCalled()
})

test('source invalidation during free editing retains the draft and requires selecting a completed version', async () => {
  const onCreate = vi.fn()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const node = {
    id: 'image',
    type: 'studio' as const,
    position: { x: 0, y: 0 },
    data: {
      kind: 'image' as const,
      title: 'Image',
      prompt: '',
      mediaId: 'original-media',
    },
  }
  const props = {
    node,
    projectId: 'film',
    previewUrl: 'data:image/png;base64,aGVsbG8=',
    onCreate,
    onRefresh: async () => {},
    onSource: () => {},
    getMedia: async () => null,
  }
  const ui = (data: typeof props) => (
    <QueryClientProvider client={client}>
      <StudioMediaEditor {...data} />
    </QueryClientProvider>
  )
  const view = render(ui(props))
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Edit this media for free' }))
  const width = screen.getByLabelText('studio.edit.width')
  fireEvent.change(width, { target: { value: '256' } })
  view.rerender(
    ui({ ...props, node: { ...node, data: { ...node.data, mediaId: '' } } })
  )
  expect(
    screen.getByRole('button', { name: 'Save edited copy' })
  ).toBeDisabled()
  expect(width).toHaveValue(256)
  expect(
    screen.getByText(
      'The source changed. Close this editor, choose a completed candidate version and reopen it. Your edit parameters are retained.'
    )
  ).toBeVisible()
  expect(onCreate).not.toHaveBeenCalled()
})
