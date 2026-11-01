/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { studioProductionSchema } from '../studio-production'
import { useStudioProductionContext } from '../studio-production-context'
import { StudioStoryPlanner } from '../studio-story-planner'
import { addStudioNode, createStudioProject } from '../workspace'

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { text: ['local-text'] }, isPending: false }),
}))
vi.mock('../studio-production-context', () => ({
  useStudioProductionContext: vi.fn(),
}))

function mount(writable = true) {
  const project = addStudioNode(
    createStudioProject('Recovery', 'film'),
    'text',
    'plan'
  )
  project.production = studioProductionSchema.parse({
    brief: 'A plant',
    targetDuration: 5,
  })
  project.nodes[0].data.assistantSkillId = 'screenplay-draft'
  project.nodes[0].data.outputText = '{broken model response'
  const onUpdate = vi.fn()
  vi.mocked(useStudioProductionContext).mockReturnValue({
    props: { project, userId: 13, onUpdate },
    writable,
    path: '/projects/film',
    budget: '1',
    capabilities: {
      data: { quota_per_unit: 500000, generation_credit_available: true },
    },
    jobs: { data: [] },
    mutate: { isPending: false },
  } as unknown as ReturnType<typeof useStudioProductionContext>)
  render(<StudioStoryPlanner />)
  return { project, onUpdate }
}

test('a malformed model response can be corrected in place without rerunning a model or modifying its original Take', () => {
  const { project, onUpdate } = mount()
  const original = structuredClone(project.nodes[0])
  fireEvent.click(screen.getByRole('button', { name: 'Review AI shot draft' }))
  const editor = screen.getByRole('textbox', { name: 'AI draft text' })
  expect(editor).toHaveValue('{broken model response')
  const corrected = JSON.stringify({
    title: 'A plant',
    brief: 'A plant',
    characters: [],
    scenes: [],
    props: [],
    shots: [
      {
        id: 'shot_1',
        title: 'Opening',
        text: 'Morning light',
        imagePrompt: 'A plant',
        videoPrompt: 'Static camera',
        seconds: 5,
      },
    ],
  })
  fireEvent.change(editor, { target: { value: corrected } })
  fireEvent.click(
    screen.getByRole('button', { name: 'Validate and review this draft' })
  )
  expect(onUpdate).toHaveBeenCalledTimes(1)
  const updated = onUpdate.mock.calls[0][0]
  expect(updated.production.guide.step).toBe('shots')
  expect(JSON.parse(updated.production.screenplayDraft).shots[0].text).toBe(
    'Morning light'
  )
  expect(project.nodes[0]).toEqual(original)
  expect(updated.nodes[0]).toEqual(original)
})

test('a read-only collaborator cannot apply or edit the generated draft', () => {
  const { onUpdate } = mount(false)
  expect(
    screen.getByRole('button', { name: 'Review AI shot draft' })
  ).toBeDisabled()
  fireEvent.click(
    screen.getByRole('button', { name: 'Edit the AI draft text' })
  )
  expect(screen.getByRole('textbox', { name: 'AI draft text' })).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Validate and review this draft' })
  ).toBeDisabled()
  expect(onUpdate).not.toHaveBeenCalled()
})
