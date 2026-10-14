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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { StudioToolArtifacts } from '../studio-tool-artifacts'
import {
  addStudioNode,
  createStudioProject,
  recordStudioTake,
} from '../workspace'

const state = {
  project: createStudioProject('Film', 'artifact-controls'),
  onUpdate: vi.fn(),
  onSave: vi.fn().mockResolvedValue(undefined),
}
vi.mock('../studio-production-context', () => ({
  useStudioProductionContext: () => ({
    props: {
      project: state.project,
      onUpdate: state.onUpdate,
      onSave: state.onSave,
      getMedia: async () => null,
    },
    writable: true,
    setMediaDraftNodeId: vi.fn(),
    setActiveTab: vi.fn(),
    mutate: {
      isPending: false,
      mutate: (action: () => Promise<void>) => void action(),
    },
  }),
}))

test('processed reports identify their Take and mark only the currently selected version', () => {
  let p = addStudioNode(
    createStudioProject('Film', 'artifact-versions'),
    'audio',
    'song'
  )
  p.nodes[0].data.title = 'Original song'
  for (const id of ['first', 'second']) {
    p = recordStudioTake(p, 'song', {
      id,
      createdAt: '2026-10-11T00:00:00Z',
      prompt: '',
      status: 'completed',
      auxiliary: [
        { role: 'transcript', mimeType: 'application/json', mediaId: id },
      ],
    })
  }
  state.project = p
  render(<StudioToolArtifacts />)
  expect(
    within(
      screen.getByRole('group', { name: 'Original song · Take 1' })
    ).queryByText('studio.production.currentTake')
  ).not.toBeInTheDocument()
  expect(
    within(
      screen.getByRole('group', { name: 'Original song · Take 2' })
    ).getByText('studio.production.currentTake')
  ).toBeVisible()
})

test('an unrecognized vocal candidate becomes an editable separation draft without generating another song', async () => {
  let project = addStudioNode(
    createStudioProject('Film', 'candidate-use'),
    'audio',
    'original'
  )
  project.nodes[0].data.mediaId = 'original-audio'
  project = addStudioNode(project, 'audio', 'repair')
  project.nodes[1].data.model = 'studio-music'
  project = recordStudioTake(project, 'repair', {
    id: 'repair-take',
    model: 'studio-music',
    createdAt: '2026-10-12T00:00:00Z',
    status: 'completed',
    prompt: 'Song',
    mediaId: 'retained-original',
    requestSnapshot: JSON.stringify({
      action: 'music',
      node_id: 'repair',
      model: 'studio-music',
      prompt: 'Song',
      seconds: 12,
      reference_media_ids: ['original-audio'],
      options: {
        music_mode: 'song',
        lyrics: 'Hello',
        repair_start: 2,
        repair_end: 6,
      },
    }),
    auxiliary: [
      {
        role: 'vocal_candidate',
        mimeType: 'audio/wav',
        mediaId: 'candidate-audio',
      },
    ],
  })
  state.project = project
  state.onUpdate.mockClear()
  render(<StudioToolArtifacts />)
  await userEvent.setup().click(
    screen.getByRole('button', {
      name: 'Apply this candidate after checking its interval',
    })
  )
  const updated = state.onUpdate.mock.lastCall?.[0]
  expect(updated.production.mediaDraft.action).toBe('audio_separate')
  expect(updated.production.mediaDraft.reference_media_ids).toEqual([
    'original-audio',
    'candidate-audio',
  ])
  expect(
    updated.nodes.find(
      (node: { id: string }) =>
        node.id === updated.production.mediaDraft.node_id
    ).data.model
  ).toBe('studio-audio-separate')
  expect(
    updated.nodes.find((node: { id: string }) => node.id === 'repair').data
      .mediaId
  ).toBe('retained-original')
})

test.each([
  ['application/json', 'transcript'],
  ['model/gltf-binary', 'mesh'],
  ['application/zip', 'editable_html'],
])(
  'a %s download does not offer an ineffective raster/audio canvas import',
  (mimeType, role) => {
    state.project = recordStudioTake(
      addStudioNode(createStudioProject('Film', role), 'image', 'source'),
      'source',
      {
        id: 'take',
        createdAt: '2026-10-10T00:00:00Z',
        prompt: '',
        status: 'completed',
        auxiliary: [{ role, mimeType, mediaId: 'artifact' }],
      }
    )
    render(<StudioToolArtifacts />)
    expect(
      screen.getByRole('button', {
        name: new RegExp(`^Download · Tool artifact ${role}$`),
      })
    ).toBeEnabled()
    expect(
      screen.queryByRole('button', {
        name: 'Add processed files to the canvas',
      })
    ).not.toBeInTheDocument()
    if (role === 'mesh') {
      expect(
        screen.getByRole('button', {
          name: 'Add the generated model to the 3D stage',
        })
      ).toBeEnabled()
    }
  }
)

test.each(['image/png', 'audio/wav'])(
  'a compatible %s file can be imported while retaining its source Take',
  async (mimeType) => {
    state.onUpdate.mockClear()
    state.project = recordStudioTake(
      addStudioNode(createStudioProject('Film', 'import'), 'image', 'source'),
      'source',
      {
        id: 'original',
        createdAt: '2026-10-10T00:00:00Z',
        prompt: '',
        status: 'completed',
        mediaId: 'original-media',
        auxiliary: [{ role: 'foreground', mimeType, mediaId: 'artifact' }],
      }
    )
    render(<StudioToolArtifacts />)
    await userEvent.setup().click(
      screen.getByRole('button', {
        name: 'Add processed files to the canvas',
      })
    )
    await waitFor(() => expect(state.onUpdate).toHaveBeenCalledOnce())
    const project = state.onUpdate.mock.calls[0][0] as typeof state.project
    expect(project.nodes).toHaveLength(2)
    expect(project.nodes[0].data.selectedTakeId).toBe('original')
    expect(project.nodes[1].data.mediaId).toBe('artifact')
    expect(project.nodes[1].data.kind).toBe(
      mimeType.startsWith('image/') ? 'image' : 'audio'
    )
    expect(project.nodes[1].data.derivedFrom?.takeId).toBe('original')
  }
)
