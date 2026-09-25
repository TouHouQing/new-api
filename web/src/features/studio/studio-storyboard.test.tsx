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
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { StudioStoryboard } from './studio-storyboard'
import {
  addStudioShot,
  createStudioProject,
  ensureStudioFinalVideo,
  updateStudioNode,
} from './workspace'

test('creates a final video and can select and generate it from the storyboard', () => {
  let project = addStudioShot(
    createStudioProject('Drama', 'p1'),
    'shot-1',
    {
      text: 't1',
      image: 'i1',
      video: 'v1',
    },
    'Opening'
  )
  project = ensureStudioFinalVideo(project, 'final')
  project = updateStudioNode(project, 'final', {
    model: '会员套餐甲',
    prompt: 'assemble story',
  })
  const onSelectNode = vi.fn()
  const onGenerateVideo = vi.fn()
  render(
    <StudioStoryboard
      project={project}
      previews={{}}
      onSelectNode={onSelectNode}
      onGenerateVideo={onGenerateVideo}
      onGenerateAll={vi.fn()}
      onCreateFinalVideo={vi.fn()}
      onAddShot={vi.fn()}
      onMoveShot={vi.fn()}
      onRenameShot={vi.fn()}
      onDeleteShot={vi.fn()}
      assembly={{
        busy: false,
        progress: 0,
        onAssemble: vi.fn(),
        onCancel: vi.fn(),
        onDownload: vi.fn(),
      }}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'studio.shot.editFinal' }))
  expect(onSelectNode).toHaveBeenCalledWith('final')
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.final.aiGenerate' })
  )
  expect(onGenerateVideo).toHaveBeenCalledWith('final')
})

test('a storyboard shot selects source nodes and generates through its video node', () => {
  let project = addStudioShot(
    createStudioProject('Drama', 'p1'),
    'shot-1',
    {
      text: 'text-1',
      image: 'image-1',
      video: 'video-1',
    },
    'Opening'
  )
  project = updateStudioNode(project, 'text-1', { prompt: 'A city at dawn' })
  project = updateStudioNode(project, 'video-1', {
    model: '会员套餐甲',
    prompt: 'camera pans',
  })
  const onSelectNode = vi.fn()
  const onGenerateVideo = vi.fn()
  const onGenerateAll = vi.fn()
  const onDeleteShot = vi.fn()
  render(
    <StudioStoryboard
      project={project}
      previews={{}}
      onSelectNode={onSelectNode}
      onGenerateVideo={onGenerateVideo}
      onGenerateAll={onGenerateAll}
      onCreateFinalVideo={vi.fn()}
      onAddShot={vi.fn()}
      onMoveShot={vi.fn()}
      onRenameShot={vi.fn()}
      onDeleteShot={onDeleteShot}
      assembly={{
        busy: false,
        progress: 0,
        onAssemble: vi.fn(),
        onCancel: vi.fn(),
        onDownload: vi.fn(),
      }}
    />
  )
  expect(screen.getByText('Opening')).toBeTruthy()
  expect(screen.getByText('A city at dawn')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'studio.shot.editImage' }))
  expect(onSelectNode).toHaveBeenCalledWith('image-1')
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.shot.generateVideo' })
  )
  expect(onGenerateVideo).toHaveBeenCalledWith('video-1')
  fireEvent.click(screen.getByRole('button', { name: 'studio.shot.delete' }))
  expect(onDeleteShot).toHaveBeenCalledWith('shot-1')
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.shot.generateAll' })
  )
  expect(onGenerateAll).toHaveBeenCalledOnce()
})

test('offers previous-shot last frame only when the previous video is completed', () => {
  let project = addStudioShot(
    createStudioProject('Continuity', 'p-continuity'),
    'shot-1',
    { text: 't1', image: 'i1', video: 'v1' },
    'Opening'
  )
  project = addStudioShot(
    project,
    'shot-2',
    { text: 't2', image: 'i2', video: 'v2' },
    'Next'
  )
  project = updateStudioNode(project, 'v1', {
    status: 'completed',
    mediaId: 'clip-1',
  })
  const onUsePreviousFrame = vi.fn()
  render(
    <StudioStoryboard
      project={project}
      previews={{}}
      onSelectNode={vi.fn()}
      onGenerateVideo={vi.fn()}
      onGenerateAll={vi.fn()}
      onCreateFinalVideo={vi.fn()}
      onAddShot={vi.fn()}
      onMoveShot={vi.fn()}
      onRenameShot={vi.fn()}
      onDeleteShot={vi.fn()}
      onUsePreviousFrame={onUsePreviousFrame}
      assembly={{
        busy: false,
        progress: 0,
        onAssemble: vi.fn(),
        onCancel: vi.fn(),
        onDownload: vi.fn(),
      }}
    />
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.shot.usePreviousFrame' })
  )
  expect(onUsePreviousFrame).toHaveBeenCalledWith('shot-2')
})
