/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { StudioSaveRecovery } from '../studio-save-recovery'
import { createStudioProject } from '../workspace'

function shotProject(prompt = 'Original boat', locked = false) {
  const project = createStudioProject('Concurrency', 'opt18-concurrency')
  project.nodes = [
    {
      id: 'shot-b',
      type: 'studio',
      position: { x: 0, y: 0 },
      data: {
        kind: 'video',
        title: 'Boat reaching the pier',
        prompt,
        status: 'idle',
        locked,
      },
    },
  ]
  return project
}

test('delete versus edit conflict names the shot, explains deletion and requires an explicit choice', async () => {
  const base = shotProject()
  const local = shotProject('My revised boat action')
  const remote = shotProject()
  remote.nodes = []
  const onResolve = vi.fn().mockResolvedValue(undefined)
  render(
    <StudioSaveRecovery
      error='Concurrent edit'
      conflict={{
        path: 'project.nodes[shot-b]',
        base,
        local,
        remote: { document: remote },
      }}
      onRetry={vi.fn()}
      onResolve={onResolve}
      onBackup={vi.fn()}
    />
  )
  expect(screen.getByText('Conflicting shot')).toBeInTheDocument()
  expect(screen.getByText('Boat reaching the pier')).toBeInTheDocument()
  expect(
    screen.getByText(/Boat reaching the pier · My revised boat action/)
  ).toBeInTheDocument()
  expect(screen.getByText('Shot deleted in this version')).toBeInTheDocument()
  expect(onResolve).not.toHaveBeenCalled()
  fireEvent.click(
    screen.getByRole('button', { name: 'Keep my conflicting changes' })
  )
  await waitFor(() =>
    expect(onResolve).toHaveBeenCalledExactlyOnceWith('local')
  )
})

test('competing lock changes use readable states while preserving the cloud choice contract', async () => {
  const base = shotProject()
  delete base.nodes[0].data.locked
  const onResolve = vi.fn().mockResolvedValue(undefined)
  render(
    <StudioSaveRecovery
      error='Concurrent lock edit'
      conflict={{
        path: 'project.nodes[shot-b].data.locked',
        base,
        local: shotProject('Original boat', true),
        remote: { document: shotProject('Original boat', false) },
      }}
      onRetry={vi.fn()}
      onResolve={onResolve}
      onBackup={vi.fn()}
    />
  )
  expect(screen.getByText('Shot locked')).toBeInTheDocument()
  expect(screen.getByText('Shot unlocked')).toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', { name: 'Use cloud conflicting changes' })
  )
  await waitFor(() =>
    expect(onResolve).toHaveBeenCalledExactlyOnceWith('remote')
  )
})
