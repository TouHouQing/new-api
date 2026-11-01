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
import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { studioProductionSchema } from '../studio-production'
import type { useStudioProductionContext } from '../studio-production-context'
import { StudioWorkspaceShot } from '../studio-workspace-shot'
import {
  addStudioNode,
  createStudioProject,
  recordStudioTake,
} from '../workspace'

type ProductionContext = ReturnType<typeof useStudioProductionContext>
let context: Pick<ProductionContext, 'writable' | 'setSelectedNodes'> & {
  props: Pick<
    ProductionContext['props'],
    'project' | 'selectedNodeId' | 'onUpdate' | 'onSave' | 'getMedia'
  >
  mutate: Pick<ProductionContext['mutate'], 'isPending'>
}
vi.mock('../studio-production-context', () => ({
  useStudioProductionContext: () => context,
}))
vi.mock('../studio-media-thumbnail', () => ({
  StudioMediaThumbnail: ({ mediaId }: { mediaId: string }) => (
    <output data-testid='candidate-media'>{mediaId}</output>
  ),
}))
vi.mock('@/lib/api', () => ({
  api: { put: vi.fn(async () => ({ data: { success: true } })) },
}))

function Host(options: { reference?: 'valid' | 'missing' } = {}) {
  const [project, setProject] = useState(() => {
    let project = addStudioNode(
      createStudioProject('Film', 'film'),
      'video',
      'shot'
    )
    for (const id of ['old', 'new']) {
      project = recordStudioTake(project, 'shot', {
        id,
        mediaId: `${id}-media`,
        status: 'completed',
        createdAt: '2026-10-16T00:00:00Z',
        prompt: id,
      })
    }
    project.production = studioProductionSchema.parse({
      timelineEdited: true,
      timeline: [
        {
          id: 'pinned',
          nodeId: 'shot',
          takeId: 'old',
          trimStart: 0,
          trimEnd: 2,
        },
      ],
    })
    if (options.reference) {
      project = addStudioNode(
        addStudioNode(
          addStudioNode(project, 'text', 'text'),
          'image',
          'target-image'
        ),
        'image',
        'reference-image'
      )
      for (const id of ['reference-old', 'reference-new']) {
        project = recordStudioTake(project, 'reference-image', {
          id,
          mediaId: `${id}-media`,
          createdAt: '2026-10-19T00:00:00Z',
          prompt: '',
          status: 'completed',
        })
      }
      project.shots = [
        {
          id: 'shot-1',
          title: 'Target shot',
          textNodeId: 'text',
          imageNodeId: 'target-image',
          videoNodeId: 'shot',
        },
      ]
      project.edges = [
        {
          id: 'reference-edge',
          source: 'reference-image',
          target: 'target-image',
          targetHandle: 'reference_image',
          data: {
            sourceTakeId:
              options.reference === 'valid' ? 'reference-old' : 'missing-take',
          },
        },
      ]
    }
    return project
  })
  context = {
    props: {
      project,
      selectedNodeId: options.reference ? 'target-image' : 'shot',
      onUpdate: setProject,
      onSave: async () => {},
      getMedia: async () => null,
    },
    writable: true,
    setSelectedNodes: vi.fn(),
    mutate: { isPending: false },
  }
  return (
    <>
      <output data-testid='selected'>
        {project.nodes[0].data.selectedTakeId}
      </output>
      <StudioWorkspaceShot onTool={() => {}} />
    </>
  )
}

test('candidate comparison remains usable when switching back and forth between Takes', () => {
  render(<Host />)
  fireEvent.click(screen.getByRole('button', { name: 'Compare candidates' }))
  for (const expected of ['old', 'new']) {
    const choices = screen.getAllByRole('button', { name: 'Use this version' })
    expect(choices).toHaveLength(2)
    const other = choices.find((button) => !button.hasAttribute('disabled'))
    expect(other).toBeDefined()
    if (!other) throw new Error('No alternate candidate is selectable')
    fireEvent.click(other)
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Continue',
      })
    )
    expect(screen.getByTestId('selected')).toHaveTextContent(expected)
    expect(
      screen.getAllByRole('button', { name: 'Use this version' })
    ).toHaveLength(2)
    expect(
      screen.getByRole('combobox', { name: 'Compare with candidate' })
    ).not.toHaveTextContent('-media')
  }
})

test('guided shot references count actual connected media and preview the pinned source Take as a planned input', () => {
  render(<Host reference='valid' />)
  fireEvent.click(
    screen.getByRole('button', { name: 'References for this shot · 1' })
  )
  const inputs = within(
    screen.getByRole('region', { name: 'Connected media inputs' })
  )
  expect(inputs.getByText('reference-old-media')).toBeVisible()
  expect(inputs.queryByText('reference-new-media')).toBeNull()
  expect(
    screen.getByText(
      'Planned inputs. The submitted references are recorded with each generated version.'
    )
  ).toBeVisible()
})

test('a missing pinned reference is shown as unavailable and never silently replaced with the latest source version', () => {
  render(<Host reference='missing' />)
  fireEvent.click(
    screen.getByRole('button', { name: 'References for this shot · 1' })
  )
  expect(
    within(
      screen.getByRole('region', { name: 'Connected media inputs' })
    ).getByRole('alert')
  ).toHaveTextContent(
    'This connected reference version is unavailable. Reconnect or choose an existing version before generating.'
  )
  expect(screen.queryByText('reference-new-media')).toBeNull()
})

test('a guided video upload adds a Take to the current shot and preserves pinned timeline versions', async () => {
  render(<Host />)
  fireEvent.change(screen.getByLabelText('Upload a new version of this shot'), {
    target: {
      files: [
        new File(['local upload fixture'], 'replacement.mp4', {
          type: 'video/mp4',
        }),
      ],
    },
  })
  await waitFor(() =>
    expect(context.props.project.nodes[0].data.takes).toHaveLength(3)
  )
  expect(context.props.project.nodes).toHaveLength(1)
  expect(context.props.project.production?.timeline[0].takeId).toBe('old')
  expect(
    context.props.project.nodes[0].data.takes?.map((take) => take.mediaId)
  ).toEqual(expect.arrayContaining(['old-media', 'new-media']))
  expect(context.props.project.nodes[0].data.selectedTakeId).not.toBe('new')
  expect(api.put).toHaveBeenCalledWith(
    expect.stringContaining('?project_id=film'),
    expect.any(File),
    expect.objectContaining({ headers: { 'Content-Type': 'video/mp4' } })
  )
})
