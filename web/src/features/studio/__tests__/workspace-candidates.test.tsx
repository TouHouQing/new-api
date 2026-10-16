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
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'

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

function Host() {
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
    return project
  })
  context = {
    props: {
      project,
      selectedNodeId: 'shot',
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
