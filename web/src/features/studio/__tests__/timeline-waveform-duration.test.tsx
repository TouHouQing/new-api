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
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { studioProductionSchema } from '../studio-production'
import { StudioTimelineTracks } from '../studio-timeline-tracks'
import {
  addStudioNode,
  createStudioProject,
  updateStudioNode,
} from '../workspace'

const mocks = vi.hoisted(() => ({ context: vi.fn() }))
vi.mock('../studio-production-context', () => ({
  useStudioProductionContext: () => mocks.context(),
}))

afterEach(() => vi.unstubAllGlobals())

test.each(['before', 'after'])(
  'a shorter decoded waveform cannot invalidate a full video when metadata arrives %s decoding',
  async (order) => {
    let finish!: (value: unknown) => void
    const decoded = new Promise((resolve) => {
      finish = resolve
    })
    const close = vi.fn(async () => {})
    vi.stubGlobal(
      'AudioContext',
      class {
        decodeAudioData = vi.fn(() => decoded)
        close = close
      }
    )
    const project = updateStudioNode(
      addStudioNode(
        createStudioProject('Actual PCM roundoff', 'roundoff'),
        'video',
        'picture'
      ),
      'picture',
      {
        mediaId: 'source',
        title: 'Full source clip',
        seconds: 4,
        status: 'completed',
      }
    )
    project.nodes[0].data.mediaId = 'source'
    project.nodes[0].data.status = 'completed'
    project.production = studioProductionSchema.parse({
      timelineEdited: true,
      timeline: [
        { id: 'clip', nodeId: 'picture', trimStart: 0, trimEnd: 3.0625 },
      ],
      audioTracks: [
        {
          id: 'original-audio',
          mediaId: 'source',
          start: 0,
          offset: 0,
          duration: 3.0625,
        },
      ],
    })
    mocks.context.mockReturnValue({
      props: {
        project,
        getMedia: async () => ({ arrayBuffer: async () => new ArrayBuffer(1) }),
        onUpdate: vi.fn(),
      },
      timeline: project.production.timeline,
      selectedClip: 'clip',
      setSelectedClip: vi.fn(),
      writable: true,
    })
    render(<StudioTimelineTracks />)
    const metadata = () =>
      act(() => {
        window.dispatchEvent(
          new CustomEvent('studio-timeline-durations', {
            detail: { projectId: project.id, durations: { source: 3.0625 } },
          })
        )
      })
    if (order === 'before') metadata()
    await act(async () => {
      finish({
        duration: 3.0624895833333334,
        getChannelData: () => new Float32Array(96),
      })
    })
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    if (order === 'after') metadata()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Full source clip' })
    ).toBeVisible()
    // Preserve the real out-of-bounds guard; this fix only separates clocks.
    act(() => {
      window.dispatchEvent(
        new CustomEvent('studio-timeline-durations', {
          detail: { projectId: project.id, durations: { source: 2 } },
        })
      )
    })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Trim end exceeds the source duration'
    )
  }
)
