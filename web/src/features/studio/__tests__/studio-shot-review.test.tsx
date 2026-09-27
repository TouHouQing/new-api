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
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { expect, test, vi } from 'vitest'

import type { StudioProject } from '../local-projects'
import { StudioStoryboard } from '../studio-storyboard'
import {
  addStudioShot,
  createStudioProject,
  setStudioShotAssets,
  updateStudioNode,
} from '../workspace'

type ReviewCallbacks = Partial<
  Pick<
    ComponentProps<typeof StudioStoryboard>,
    | 'onGenerateVideo'
    | 'onUpdateShotReview'
    | 'onUpdateShotDetails'
    | 'onSelectTake'
    | 'onSetShotAssets'
    | 'onPinShotAssetVersion'
    | 'onReusePreviousShotReferences'
  >
>

function renderReview(project: StudioProject, callbacks: ReviewCallbacks) {
  return render(
    <StudioStoryboard
      project={project}
      previews={{}}
      onSelectNode={vi.fn()}
      onGenerateVideo={callbacks.onGenerateVideo || vi.fn()}
      onGenerateAll={vi.fn()}
      onCreateFinalVideo={vi.fn()}
      onAddShot={vi.fn()}
      onMoveShot={vi.fn()}
      onRenameShot={vi.fn()}
      onDeleteShot={vi.fn()}
      onUpdateShotReview={callbacks.onUpdateShotReview}
      onUpdateShotDetails={callbacks.onUpdateShotDetails}
      onSelectTake={callbacks.onSelectTake}
      onSetShotAssets={callbacks.onSetShotAssets}
      onPinShotAssetVersion={callbacks.onPinShotAssetVersion}
      onReusePreviousShotReferences={callbacks.onReusePreviousShotReferences}
      assembly={{
        busy: false,
        progress: 0,
        onAssemble: vi.fn(),
        onCancel: vi.fn(),
        onDownload: vi.fn(),
      }}
    />
  )
}

test('review controls send explicit approval and note changes without generating', () => {
  const project = addStudioShot(
    createStudioProject('Review', 'p-review'),
    'shot-1',
    { text: 't1', image: 'i1', video: 'v1' },
    'Opening'
  )
  const onUpdateShotReview = vi.fn()
  const onGenerateVideo = vi.fn()
  renderReview(project, { onUpdateShotReview, onGenerateVideo })
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.shot.showDetails' })
  )

  fireEvent.click(
    screen.getByRole('button', { name: 'studio.review.approved' })
  )
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Opening studio.review.note' }),
    {
      target: { value: 'Keep this performance' },
    }
  )

  expect(onUpdateShotReview).toHaveBeenCalledWith('shot-1', {
    reviewStatus: 'approved',
  })
  expect(onUpdateShotReview).toHaveBeenCalledWith('shot-1', {
    reviewNote: 'Keep this performance',
  })
  expect(onGenerateVideo).not.toHaveBeenCalled()
})

test('candidate gallery shows recent completed takes and requires an explicit choice', () => {
  let project = addStudioShot(
    createStudioProject('Review', 'p-takes'),
    'shot-1',
    { text: 't1', image: 'i1', video: 'v1' },
    'Opening'
  )
  project = updateStudioNode(project, 'v1', {
    selectedTakeId: 'take-1',
    takes: Array.from({ length: 7 }, (_, index) => ({
      id: `take-${index + 1}`,
      createdAt: '2026-09-26T00:00:00Z',
      prompt: `Camera ${index + 1}`,
      status: 'completed' as const,
      outputUrl: `https://example.test/take-${index + 1}.mp4`,
    })),
  })
  const onSelectTake = vi.fn()
  const onGenerateVideo = vi.fn()
  renderReview(project, { onSelectTake, onGenerateVideo })
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.shot.showDetails' })
  )

  expect(
    screen.getByRole('button', { name: 'studio.review.chooseTake 7' })
  ).toBeTruthy()
  expect(
    screen.queryByRole('button', { name: 'studio.review.chooseTake 1' })
  ).toBeNull()
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.review.chooseTake 7' })
  )

  expect(onSelectTake).toHaveBeenCalledWith('v1', 'take-7')
  expect(onGenerateVideo).not.toHaveBeenCalled()
})

test('shot references can be selected, pinned, and reused from the previous shot', () => {
  let project = addStudioShot(
    createStudioProject('Review', 'p-references'),
    'shot-1',
    { text: 't1', image: 'i1', video: 'v1' },
    'Opening'
  )
  project = addStudioShot(
    project,
    'shot-2',
    { text: 't2', image: 'i2', video: 'v2' },
    'Closeup'
  )
  project.assets = [
    {
      id: 'hero',
      kind: 'character',
      title: 'Mira',
      prompt: 'Current look',
      versions: [
        {
          id: 'hero-v1',
          createdAt: '2026-09-26T00:00:00Z',
          prompt: 'Red scarf',
        },
      ],
    },
  ]
  const onSetShotAssets = vi.fn()
  const onPinShotAssetVersion = vi.fn()
  const onReusePreviousShotReferences = vi.fn()
  renderReview(project, {
    onSetShotAssets,
    onPinShotAssetVersion,
    onReusePreviousShotReferences,
  })

  fireEvent.click(
    screen.getAllByRole('button', { name: 'studio.shot.showDetails' })[0]
  )
  fireEvent.click(screen.getByRole('checkbox', { name: /Opening Mira/ }))
  expect(onSetShotAssets).toHaveBeenCalledWith('shot-1', ['hero'])
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.shot.showDetails' })
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Closeup studio.shot.reusePrevious' })
  )
  expect(onReusePreviousShotReferences).toHaveBeenCalledWith('shot-2', 'shot-1')
})

test('a selected shot reference can pin a saved version without generating', async () => {
  let project = addStudioShot(
    createStudioProject('Review', 'p-pin'),
    'shot-1',
    { text: 't1', image: 'i1', video: 'v1' },
    'Opening'
  )
  project.assets = [
    {
      id: 'hero',
      kind: 'character',
      title: 'Mira',
      prompt: 'Current look',
      versions: [
        {
          id: 'hero-v1',
          createdAt: '2026-09-26T00:00:00Z',
          prompt: 'Red scarf',
        },
      ],
    },
  ]
  project = setStudioShotAssets(project, 'shot-1', ['hero'])
  const onPinShotAssetVersion = vi.fn()
  const onGenerateVideo = vi.fn()
  renderReview(project, { onPinShotAssetVersion, onGenerateVideo })

  const user = userEvent.setup()
  await user.click(
    screen.getByRole('button', { name: 'studio.shot.showDetails' })
  )
  await user.click(
    screen.getByRole('combobox', { name: 'Opening Mira studio.asset.version' })
  )
  await user.click(
    screen.getByRole('option', { name: 'studio.asset.version 1' })
  )

  expect(onPinShotAssetVersion).toHaveBeenCalledWith(
    'shot-1',
    'hero',
    'hero-v1'
  )
  expect(onGenerateVideo).not.toHaveBeenCalled()
})
