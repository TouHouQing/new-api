/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
For commercial licensing, please contact support@quantumnous.com
*/
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { StudioTimedFrames } from '../studio-timed-frames'
import { addStudioNode, createStudioProject } from '../workspace'

const state = {
  project: addStudioNode(
    createStudioProject('Film', 'frames'),
    'video',
    'video'
  ),
  writable: true,
  onUpdate: vi.fn(),
}
vi.mock('../studio-production-context', () => ({
  useStudioProductionContext: () => ({
    props: {
      project: state.project,
      selectedNodeId: 'video',
      onUpdate: state.onUpdate,
    },
    writable: state.writable,
  }),
}))
function prepare(metadataJson = '{"seed":42}', writable = true) {
  state.project = addStudioNode(
    createStudioProject('Film', 'frames'),
    'video',
    'video'
  )
  state.project.nodes[0].data.model = 'wan2.1-vace-1.3b'
  state.project.nodes[0].data.metadataJson = metadataJson
  state.writable = writable
  state.onUpdate.mockClear()
}
test('reference preservation can be explicitly disabled without losing other metadata', async () => {
  prepare()
  const user = userEvent.setup()
  const view = render(<StudioTimedFrames />)
  await user.click(
    screen.getByRole('button', { name: 'Timed keyframes and long shots' })
  )
  const toggle = screen.getByRole('checkbox', {
    name: 'Keep the supplied reference frames at their exact times',
  })
  expect(toggle).toBeChecked()
  await user.click(toggle)
  const updated = state.onUpdate.mock.calls[0][0]
  expect(JSON.parse(updated.nodes[0].data.metadataJson)).toEqual({
    seed: 42,
    preserve_keyframes: false,
  })
  state.project = updated
  view.rerender(<StudioTimedFrames />)
  expect(toggle).not.toBeChecked()
})
test('invalid metadata is shown as a field error instead of crashing the editor', async () => {
  prepare('{')
  const user = userEvent.setup()
  render(<StudioTimedFrames />)
  await user.click(
    screen.getByRole('button', { name: 'Timed keyframes and long shots' })
  )
  expect(
    screen.getByRole('checkbox', {
      name: 'Keep the supplied reference frames at their exact times',
    })
  ).toHaveAttribute('aria-disabled', 'true')
  expect(
    screen.getByText('Correct the task metadata JSON before editing keyframes')
  ).toBeVisible()
  expect(state.onUpdate).not.toHaveBeenCalled()
})
test('viewers cannot change frame preservation on a shared project', async () => {
  prepare(undefined, false)
  const user = userEvent.setup()
  render(<StudioTimedFrames />)
  await user.click(
    screen.getByRole('button', { name: 'Timed keyframes and long shots' })
  )
  expect(
    screen.getByRole('checkbox', {
      name: 'Keep the supplied reference frames at their exact times',
    })
  ).toHaveAttribute('aria-disabled', 'true')
  expect(state.onUpdate).not.toHaveBeenCalled()
})
