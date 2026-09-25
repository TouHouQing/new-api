/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { StudioShotPlanner } from '../studio-shot-planner'

test('manual brief stays as a reviewed draft until the user creates shots', () => {
  const onConfirm = vi.fn()
  const onPlan = vi.fn()
  render(
    <StudioShotPlanner
      scopeKey='owner:project'
      models={[]}
      onPlan={onPlan}
      onConfirm={onConfirm}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'studio.planner.title' }))
  fireEvent.change(screen.getByLabelText('studio.planner.brief'), {
    target: { value: 'Woman enters a station.' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.planner.preview' })
  )
  expect(onConfirm).not.toHaveBeenCalled()
  expect(onPlan).not.toHaveBeenCalled()
  expect(
    screen.getAllByDisplayValue('Woman enters a station.').length
  ).toBeGreaterThan(1)
  fireEvent.click(screen.getByRole('button', { name: 'studio.planner.create' }))
  expect(onConfirm).toHaveBeenCalledWith(
    [
      {
        title: 'Shot 1',
        text: 'Woman enters a station.',
        imagePrompt: 'Woman enters a station.',
        videoPrompt: 'Woman enters a station.',
      },
    ],
    'Woman enters a station.',
    undefined
  )
})

test('AI shot drafts can be reviewed before they enter the project', async () => {
  const onConfirm = vi.fn()
  const onPlan = vi.fn().mockResolvedValue([
    {
      title: 'Arrival',
      text: 'Generated scene',
      imagePrompt: 'Generated still',
      videoPrompt: 'Generated motion',
    },
  ])
  render(
    <StudioShotPlanner
      scopeKey='owner:project'
      models={['writer-model']}
      defaultModel='writer-model'
      onPlan={onPlan}
      onConfirm={onConfirm}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'studio.planner.title' }))
  fireEvent.change(screen.getByLabelText('studio.planner.brief'), {
    target: { value: 'A woman arrives' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.planner.preview' })
  )
  expect(await screen.findByDisplayValue('Generated still')).toBeTruthy()
  expect(onConfirm).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'studio.planner.create' }))
  expect(onPlan).toHaveBeenCalledWith('writer-model', 'A woman arrives', 3)
  expect(onConfirm).toHaveBeenCalledWith(
    [
      {
        title: 'Arrival',
        text: 'Generated scene',
        imagePrompt: 'Generated still',
        videoPrompt: 'Generated motion',
      },
    ],
    'A woman arrives',
    'writer-model'
  )
})

test('a failed planning request leaves the project without new shots', async () => {
  const onConfirm = vi.fn()
  render(
    <StudioShotPlanner
      scopeKey='owner:project'
      models={['writer-model']}
      defaultModel='writer-model'
      onPlan={vi.fn().mockRejectedValue(new Error('Provider failed'))}
      onConfirm={onConfirm}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'studio.planner.title' }))
  fireEvent.change(screen.getByLabelText('studio.planner.brief'), {
    target: { value: 'A woman arrives' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.planner.preview' })
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('Provider failed')
  expect(onConfirm).not.toHaveBeenCalled()
})

test('a newly configured project text model becomes the planning default', async () => {
  const onPlan = vi.fn().mockResolvedValue([
    {
      title: 'Shot',
      text: 'Scene',
      imagePrompt: 'Still',
      videoPrompt: 'Motion',
    },
  ])
  const onConfirm = vi.fn()
  const view = render(
    <StudioShotPlanner
      scopeKey='owner:project'
      models={['writer-model']}
      onPlan={onPlan}
      onConfirm={onConfirm}
    />
  )
  view.rerender(
    <StudioShotPlanner
      scopeKey='owner:project'
      models={['writer-model']}
      defaultModel='writer-model'
      onPlan={onPlan}
      onConfirm={onConfirm}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'studio.planner.title' }))
  fireEvent.change(screen.getByLabelText('studio.planner.brief'), {
    target: { value: 'New brief' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.planner.preview' })
  )
  expect(await screen.findByDisplayValue('Still')).toBeTruthy()
  expect(onPlan).toHaveBeenCalledWith('writer-model', 'New brief', 3)
})

test('a late planning response cannot add drafts to another project', async () => {
  let finish!: (
    shots: Array<{
      title: string
      text: string
      imagePrompt: string
      videoPrompt: string
    }>
  ) => void
  const onPlan = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const onConfirm = vi.fn()
  const props = {
    models: ['writer-model'],
    defaultModel: 'writer-model',
    onPlan,
    onConfirm,
  }
  const view = render(<StudioShotPlanner {...props} scopeKey='owner:one' />)
  fireEvent.click(screen.getByRole('button', { name: 'studio.planner.title' }))
  fireEvent.change(screen.getByLabelText('studio.planner.brief'), {
    target: { value: 'Old brief' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.planner.preview' })
  )
  expect(onPlan).toHaveBeenCalledOnce()
  view.rerender(<StudioShotPlanner {...props} scopeKey='owner:two' />)
  await act(async () => {
    finish([
      {
        title: 'Old',
        text: 'Old scene',
        imagePrompt: 'Old still',
        videoPrompt: 'Old motion',
      },
    ])
  })
  expect(screen.queryByDisplayValue('Old still')).toBeNull()
  expect(onConfirm).not.toHaveBeenCalled()
})
