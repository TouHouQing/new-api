/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'

import type { StudioProject } from '../local-projects'
import { StudioNarrative } from '../studio-narrative'
import { studioProductionSchema } from '../studio-production'
import { StudioShotPlanner } from '../studio-shot-planner'
import { addStudioShot, createStudioProject } from '../workspace'

function example() {
  let project = createStudioProject('Story', 'story')
  for (const index of [1, 2, 3]) {
    project = addStudioShot(
      project,
      `shot-${index}`,
      { text: `t${index}`, image: `i${index}`, video: `v${index}` },
      `Shot ${index}`
    )
  }
  project.nodes = project.nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      prompt: `Original ${node.id}`,
      mediaId: `media-${node.id}`,
      selectedTakeId: `take-${node.id}`,
    },
  }))
  project.production = studioProductionSchema.parse({
    guide: { goal: 'story' },
  })
  return project
}

function mount(project: StudioProject, disabled = false) {
  let latest = project
  function Host() {
    const [document, setDocument] = useState(project)
    return (
      <StudioNarrative
        project={document}
        disabled={disabled}
        onUpdate={(next) => {
          latest = next
          setDocument(next)
        }}
      />
    )
  }
  render(<Host />)
  fireEvent.click(screen.getByText(/Shot purpose and rhythm ·/))
  return () => latest
}

test('editing the third shot purpose preserves other shots, original prompts and selected Takes', () => {
  const original = example()
  const latest = mount(original)
  fireEvent.click(screen.getByRole('button', { name: '3. Shot 3' }))
  fireEvent.change(screen.getByLabelText('New information for the viewer'), {
    target: { value: 'The lantern lights the way home.' },
  })
  expect(latest().production?.shotNarrative?.['shot-3']).toMatchObject({
    purpose: 'ending',
    information: 'The lantern lights the way home.',
  })
  expect(latest().production?.shotNarrative?.['shot-1']).toBeUndefined()
  expect(latest().nodes).toEqual(original.nodes)
  expect(latest().shots).toEqual(original.shots)
})

test('locking a shot prevents editing and applying its direction until explicitly unlocked', () => {
  const latest = mount(example())
  fireEvent.change(screen.getByLabelText('Main visual action and rhythm'), {
    target: { value: 'A slow reveal of the lantern.' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Lock this shot' }))
  expect(screen.getByLabelText('Main visual action and rhythm')).toBeDisabled()
  expect(
    screen.getByRole('button', {
      name: 'Add this visual action to this shot draft',
    })
  ).toBeDisabled()
  expect(
    latest()
      .nodes.filter((node) => ['t1', 'i1', 'v1'].includes(node.id))
      .every((node) => node.data.locked)
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Unlock this shot' }))
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Add this visual action to this shot draft',
    })
  )
  expect(latest().nodes.find((node) => node.id === 'v1')?.data).toMatchObject({
    prompt: 'Original v1\nA slow reveal of the lantern.',
    mediaId: 'media-v1',
    selectedTakeId: 'take-v1',
  })
  expect(latest().nodes.find((node) => node.id === 'v2')?.data.prompt).toBe(
    'Original v2'
  )
})

test('the missing ending suggestion applies only to the selected ending shot', () => {
  const latest = mount(example())
  fireEvent.click(screen.getByRole('button', { name: '3. Shot 3' }))
  fireEvent.click(
    screen.getByRole('button', { name: 'Make this the ending shot' })
  )
  expect(latest().production?.shotNarrative?.['shot-3']?.purpose).toBe('ending')
  expect(
    screen.queryByRole('button', { name: 'Make this the ending shot' })
  ).toBeNull()
})

test('an overlong dialogue and repeated framing show actionable suggestions without changing user text', () => {
  const project = example()
  if (!project.shots) throw new Error('Missing shots')
  project.shots[0].shotType = 'Close-up'
  project.shots[1].shotType = 'Close-up'
  project.shots[1].dialogue =
    'This line has much more information than the one second shot can comfortably hold.'
  const video = project.nodes.find((node) => node.id === 'v2')
  if (!video) throw new Error('Missing video')
  video.data.seconds = 1
  const latest = mount(project)
  fireEvent.click(screen.getByRole('button', { name: '2. Shot 2' }))
  expect(
    screen.getByText(/This framing repeats the previous shot/)
  ).toBeVisible()
  expect(screen.getByText(/The dialogue may exceed this shot/)).toBeVisible()
  expect(latest().shots?.[1].dialogue).toBe(project.shots[1].dialogue)
})

test('readonly or generating shots do not allow narrative mutations', () => {
  const project = example()
  const onUpdate = vi.fn()
  const view = render(
    <StudioNarrative project={project} disabled onUpdate={onUpdate} />
  )
  fireEvent.click(screen.getByText(/Shot purpose and rhythm ·/))
  expect(screen.getByLabelText('New information for the viewer')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Lock this shot' })).toBeDisabled()
  view.rerender(
    <StudioNarrative
      project={{
        ...project,
        nodes: project.nodes.map((node) =>
          node.id === 'v1'
            ? { ...node, data: { ...node.data, status: 'processing' } }
            : node
        ),
      }}
      onUpdate={onUpdate}
    />
  )
  expect(screen.getByLabelText('New information for the viewer')).toBeDisabled()
  expect(onUpdate).not.toHaveBeenCalled()
})

test('the existing planner exposes narrative review for an existing project while planning stays collapsed', () => {
  render(
    <StudioShotPlanner
      project={example()}
      models={[]}
      scopeKey='story'
      onPlan={vi.fn()}
      onConfirm={vi.fn()}
      onUpdate={vi.fn()}
    />
  )
  expect(
    screen.getByRole('button', { name: 'studio.planner.title' })
  ).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(screen.getByText(/Shot purpose and rhythm ·/))
  expect(screen.getByLabelText('What should this shot do?')).toBeVisible()
})
