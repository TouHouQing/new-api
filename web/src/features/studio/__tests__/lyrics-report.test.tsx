/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { studioCloudMedia } from '../studio-cloud'
import { StudioLyricsReport } from '../studio-lyrics-report'

vi.mock('../studio-cloud', () => ({ studioCloudMedia: vi.fn() }))
afterEach(() => vi.clearAllMocks())
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <StudioLyricsReport projectId='film' mediaId='report' />
    </QueryClientProvider>
  )
}
test('missing lyrics remain visibly flagged with the independent transcript', async () => {
  vi.mocked(studioCloudMedia).mockResolvedValue({
    text: async () =>
      JSON.stringify({
        status: 'review_required',
        transcript: 'We walk together',
        lines: [
          { text: 'Hello my friend', matched: false },
          { text: 'We walk together', matched: true },
        ],
      }),
  } as Blob)
  show()
  expect(await screen.findByText('Some lyric lines need review')).toBeVisible()
  expect(screen.getByText('Not recognized · Hello my friend')).toBeVisible()
  expect(screen.getByText('Recognized lyrics: We walk together')).toBeVisible()
  expect(
    screen.queryByText('All lyric lines were recognized in order')
  ).not.toBeInTheDocument()
})
test('a matched report still asks the user to audition before delivery', async () => {
  vi.mocked(studioCloudMedia).mockResolvedValue({
    text: async () =>
      JSON.stringify({
        status: 'matched',
        transcript: 'Hello',
        lines: [{ text: 'Hello', matched: true }],
      }),
  } as Blob)
  show()
  expect(
    await screen.findByText('All lyric lines were recognized in order')
  ).toBeVisible()
  expect(screen.getByText(/Recognition is a review aid/)).toBeVisible()
})
test('an unavailable report keeps a clear audition instruction', async () => {
  vi.mocked(studioCloudMedia).mockRejectedValue(new Error('Unavailable'))
  show()
  expect(
    await screen.findByText(
      'Lyrics check is unavailable. Listen to the song before delivery.'
    )
  ).toBeVisible()
})
