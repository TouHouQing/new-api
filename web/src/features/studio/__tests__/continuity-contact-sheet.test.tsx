/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'

import { studioProjectSchema, type StudioProject } from '../local-projects'
import { studioProductionSchema } from '../studio-production'
import { StudioProductionContext } from '../studio-production-context'
import { StudioProductionContinuity } from '../studio-production-continuity'
import type { useStudioProductionController } from '../studio-production-controller'
import { addStudioShot, createStudioProject } from '../workspace'

function example() {
  const project = addStudioShot(
    createStudioProject('Film', 'film'),
    'shot',
    { text: 'text', image: 'image', video: 'video' },
    'Opening'
  )
  project.assets = [
    {
      id: 'actor',
      kind: 'character',
      title: 'Fox',
      prompt: 'Red fox',
      mediaId: 'standard',
      versions: [
        {
          id: 'standard-v1',
          prompt: 'Red fox',
          mediaId: 'standard',
          createdAt: '2026-10-18T09:00:00Z',
        },
      ],
    },
  ]
  project.production = studioProductionSchema.parse({})
  project.nodes = project.nodes.map((node) =>
    node.id !== 'video'
      ? node
      : {
          ...node,
          data: {
            ...node.data,
            assetIds: ['actor'],
            selectedTakeId: 'selected',
            mediaId: 'newest-video',
            takes: [
              {
                id: 'selected',
                createdAt: '2026-10-18T09:00:00Z',
                prompt: 'Fox',
                status: 'completed',
                mediaId: 'selected-video',
                requestSnapshot: JSON.stringify({
                  assets: [
                    {
                      id: 'actor',
                      mediaId: 'submitted-standard',
                      versionId: 'submitted-v1',
                    },
                  ],
                }),
              },
              {
                id: 'newest',
                createdAt: '2026-10-18T09:10:00Z',
                prompt: 'Fox',
                status: 'completed',
                mediaId: 'newest-video',
              },
            ],
          },
        }
  )
  return project
}

function mount(project: StudioProject, writable = true) {
  let latest = project
  const getMedia = vi.fn(async () => null)
  function Host() {
    const [document, setDocument] = useState(project)
    const context: Pick<
      ReturnType<typeof useStudioProductionController>,
      'props' | 'writable'
    > = {
      writable,
      props: {
        project: document,
        getMedia,
        userId: 1,
        open: true,
        selectedNodeId: null,
        onSave: async () => {},
        onRefresh: async () => {},
        onOpenChange: () => {},
        onUpdate: (next: StudioProject) => {
          latest = next
          setDocument(next)
        },
      },
    }
    return (
      <StudioProductionContext.Provider
        value={context as ReturnType<typeof useStudioProductionController>}
      >
        <button
          type='button'
          onClick={() => {
            const next = {
              ...document,
              nodes: document.nodes.map((node) =>
                node.id === 'video'
                  ? {
                      ...node,
                      data: { ...node.data, selectedTakeId: 'newest' },
                    }
                  : node
              ),
            }
            latest = next
            setDocument(next)
          }}
        >
          Switch selected Take
        </button>
        <button
          type='button'
          onClick={() => {
            const next = {
              ...document,
              assets: document.assets?.map((asset) => ({
                ...asset,
                mediaId: 'changed-standard',
              })),
            }
            latest = next
            setDocument(next)
          }}
        >
          Change standard reference
        </button>
        <StudioProductionContinuity />
      </StudioProductionContext.Provider>
    )
  }
  render(<Host />)
  fireEvent.click(
    screen.getByRole('button', { name: 'Continuity contact sheet' })
  )
  return { latest: () => latest, getMedia }
}

test('the contact sheet displays the selected result and its submitted reference instead of the newest result or draft binding', async () => {
  const { getMedia } = mount(example())
  const sheet = screen.getByRole('region', {
    name: 'Continuity contact sheet',
  })
  expect(within(sheet).getByText('selected')).toBeVisible()
  expect(within(sheet).getByText('submitted-v1')).toBeVisible()
  expect(getMedia).toHaveBeenCalledWith('selected-video')
  expect(getMedia).toHaveBeenCalledWith('standard')
  expect(getMedia).toHaveBeenCalledWith('submitted-standard')
  expect(getMedia).not.toHaveBeenCalledWith('newest-video')
})

test('manual approval persists the precise result and reference standard and becomes stale after switching Take', () => {
  const { latest } = mount(example())
  fireEvent.click(
    screen.getByRole('button', { name: 'Approve continuity of this Take' })
  )
  const reopened = studioProjectSchema.parse(
    JSON.parse(JSON.stringify(latest()))
  )
  expect(reopened.production?.continuityReviews?.[0]).toMatchObject({
    shotId: 'shot',
    assetId: 'actor',
    nodeId: 'video',
    takeId: 'selected',
    mediaId: 'selected-video',
    status: 'approved',
    referenceMediaIds: ['standard'],
  })
  fireEvent.click(screen.getByRole('button', { name: 'Switch selected Take' }))
  expect(screen.getByText('Previous decision is out of date')).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Withdraw continuity decision' })
  ).toBeDisabled()
})

test('changing the reference standard also invalidates an approval without changing the selected Take', () => {
  mount(example())
  fireEvent.click(
    screen.getByRole('button', { name: 'Approve continuity of this Take' })
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Change standard reference' })
  )
  expect(screen.getByText('Previous decision is out of date')).toBeVisible()
})

test('changing a wardrobe requirement invalidates the previous visual decision', () => {
  mount(example())
  fireEvent.click(
    screen.getByRole('button', { name: 'Approve continuity of this Take' })
  )
  fireEvent.change(screen.getByLabelText('studio.production.wardrobe'), {
    target: { value: 'Blue jacket' },
  })
  expect(screen.getByText('Previous decision is out of date')).toBeVisible()
})

test('marking a continuity problem creates a correction only for that actual shot and can be withdrawn', () => {
  const { latest } = mount(example())
  fireEvent.click(
    screen.getByRole('button', { name: 'Mark continuity for correction' })
  )
  expect(latest().production?.changes).toEqual([
    expect.objectContaining({
      nodeIds: ['video'],
      takeId: 'selected',
      status: 'pending',
    }),
  ])
  fireEvent.click(
    screen.getByRole('button', { name: 'Withdraw continuity decision' })
  )
  expect(latest().production?.continuityReviews?.at(-1)?.status).toBe(
    'unreviewed'
  )
  expect(latest().production?.changes[0].status).toBe('resolved')
})

test('a missing selected Take cannot silently fall back to another video or be approved', () => {
  const project = example()
  project.nodes = project.nodes.map((node) =>
    node.id === 'video'
      ? { ...node, data: { ...node.data, selectedTakeId: 'missing' } }
      : node
  )
  const { getMedia } = mount(project)
  expect(
    screen.getByRole('button', { name: 'Approve continuity of this Take' })
  ).toBeDisabled()
  expect(screen.getByText(/No completed selected video/)).toBeVisible()
  expect(getMedia).not.toHaveBeenCalledWith('newest-video')
})

test('a shot without a completed result shows no historical result or submission-receipt claims', () => {
  const project = example()
  project.nodes = project.nodes.map((node) =>
    node.id === 'video'
      ? {
          ...node,
          data: {
            ...node.data,
            mediaId: undefined,
            selectedTakeId: undefined,
            takes: [],
            status: 'idle',
          },
        }
      : node
  )
  mount(project)
  const sheet = screen.getByRole('region', {
    name: 'Continuity contact sheet',
  })
  expect(within(sheet).getByText(/No completed selected video/)).toBeVisible()
  expect(
    within(sheet).queryByText('Legacy result without a Take ID')
  ).toBeNull()
  expect(within(sheet).queryByText('Submitted reference')).toBeNull()
  expect(
    within(sheet).queryByText(
      'The submitted reference is not recorded for this result. Verify the visual output before approving.'
    )
  ).toBeNull()
  expect(
    within(sheet).getByRole('button', {
      name: 'Approve continuity of this Take',
    })
  ).toBeDisabled()
  expect(
    within(sheet).getByRole('button', {
      name: 'Mark continuity for correction',
    })
  ).toBeDisabled()
})

test('an uploaded Take never borrows a generation model from the current draft', () => {
  const project = example()
  project.nodes = project.nodes.map((node) =>
    node.id === 'video'
      ? {
          ...node,
          data: {
            ...node.data,
            model: 'next-draft-model',
            takes: node.data.takes?.map((take) => ({
              ...take,
              model: undefined,
              sourceMode: 'upload' as const,
            })),
          },
        }
      : node
  )
  mount(project)
  const sheet = screen.getByRole('region', { name: 'Continuity contact sheet' })
  expect(
    within(sheet).getByText('Uploaded media; generation model not recorded')
  ).toBeVisible()
  expect(within(sheet).queryByText('next-draft-model')).toBeNull()
})

test('a legacy result without model provenance stays unknown even when the next model is selected', () => {
  const project = example()
  project.nodes = project.nodes.map((node) =>
    node.id === 'video'
      ? {
          ...node,
          data: {
            ...node.data,
            model: 'next-draft-model',
            selectedTakeId: undefined,
            takes: [],
          },
        }
      : node
  )
  mount(project)
  const sheet = screen.getByRole('region', { name: 'Continuity contact sheet' })
  expect(within(sheet).getByText('Generation model not recorded')).toBeVisible()
  expect(within(sheet).queryByText('next-draft-model')).toBeNull()
})

test('viewers cannot change requirements or approve and locked shots protect requirement edits', () => {
  const project = example()
  project.nodes = project.nodes.map((node) => ({
    ...node,
    data: { ...node.data, locked: true },
  }))
  mount(project, false)
  expect(
    screen.getByRole('button', { name: 'Approve continuity of this Take' })
  ).toBeDisabled()
  expect(screen.getByLabelText('studio.production.wardrobe')).toBeDisabled()
})

test('continuity defaults to the external current shot, preserves manual selection on refetch, and follows a new external scope', async () => {
  const project = addStudioShot(
    example(),
    'closing',
    { text: 'text2', image: 'image2', video: 'video2' },
    'Closing'
  )
  const baseProps = {
    project,
    getMedia: async () => null,
    userId: 1,
    open: true,
    selectedNodeId: 'image2',
    onSave: async () => {},
    onRefresh: async () => {},
    onOpenChange: () => {},
    onUpdate: vi.fn(),
  }
  function View({
    document = project,
    selectedNodeId = 'image2',
  }: {
    document?: StudioProject
    selectedNodeId?: string
  }) {
    const context: Pick<
      ReturnType<typeof useStudioProductionController>,
      'props' | 'writable'
    > = {
      writable: true,
      props: { ...baseProps, project: document, selectedNodeId },
    }
    return (
      <StudioProductionContext.Provider
        value={context as ReturnType<typeof useStudioProductionController>}
      >
        <StudioProductionContinuity />
      </StudioProductionContext.Provider>
    )
  }
  const view = render(<View />)
  expect(
    screen.getByRole('combobox', { name: 'studio.production.shot' })
  ).toHaveTextContent('Closing')
  await userEvent.click(
    screen.getByRole('combobox', { name: 'studio.production.shot' })
  )
  await userEvent.click(screen.getByRole('option', { name: 'Opening' }))
  expect(
    screen.getByRole('combobox', { name: 'studio.production.shot' })
  ).toHaveTextContent('Opening')
  view.rerender(
    <View document={{ ...project, updatedAt: new Date().toISOString() }} />
  )
  expect(
    screen.getByRole('combobox', { name: 'studio.production.shot' })
  ).toHaveTextContent('Opening')
  view.rerender(<View selectedNodeId='video2' />)
  expect(
    screen.getByRole('combobox', { name: 'studio.production.shot' })
  ).toHaveTextContent('Closing')
  await userEvent.click(
    screen.getByRole('combobox', { name: 'studio.production.shot' })
  )
  await userEvent.click(screen.getByRole('option', { name: 'Opening' }))
  view.rerender(
    <View
      document={{ ...project, id: 'other-project' }}
      selectedNodeId='video2'
    />
  )
  expect(
    screen.getByRole('combobox', { name: 'studio.production.shot' })
  ).toHaveTextContent('Closing')
  view.rerender(<View selectedNodeId='not-a-shot-node' />)
  expect(
    screen.getByRole('combobox', { name: 'studio.production.shot' })
  ).toHaveTextContent('Opening')
})

test('description-only asset guidance is separated from the actual first-frame pixels and fixed source Take', () => {
  const project = example()
  const node = project.nodes.find((item) => item.id === 'video')
  if (!node?.data.takes) throw new Error('Missing example Takes')
  node.data.takes = node.data.takes.map((take) =>
    take.id !== 'selected'
      ? take
      : {
          ...take,
          requestSnapshot: JSON.stringify({
            assets: [],
            descriptionReferencesKnown: true,
            descriptionAssets: [
              {
                id: 'actor',
                versionId: 'identity-v2',
                conditioning: 'description-only',
              },
            ],
            references: [
              {
                sourceNodeId: 'image',
                sourceTakeId: 'actual-first-take',
                mediaId: 'actual-first-pixels',
                role: 'first_frame',
              },
            ],
          }),
        }
  )
  const { getMedia } = mount(project)
  expect(
    screen.getByText(
      'Description guidance only; the asset image was not submitted'
    )
  ).toBeVisible()
  expect(screen.getByText('identity-v2')).toBeVisible()
  const frames = screen.getByRole('region', {
    name: 'Actual submitted first frame',
  })
  expect(
    within(frames).getByText('Input Take: actual-first-take')
  ).toBeVisible()
  expect(within(frames).getByText('actual-first-pixels')).toBeVisible()
  expect(getMedia).toHaveBeenCalledWith('actual-first-pixels')
  expect(getMedia).not.toHaveBeenCalledWith('submitted-standard')
  expect(
    screen.queryByText(
      'This asset is not present in the saved submission receipt.'
    )
  ).toBeNull()
})

test('a known empty pixel receipt remains distinct from an unrecorded historical receipt', () => {
  const project = example()
  const node = project.nodes.find((item) => item.id === 'video')
  if (!node?.data.takes) throw new Error('Missing example Takes')
  node.data.takes = node.data.takes.map((take) =>
    take.id !== 'selected'
      ? take
      : {
          ...take,
          requestSnapshot: JSON.stringify({ assets: [], references: [] }),
        }
  )
  mount(project)
  expect(
    screen.getByText(
      'This asset is not present in the saved submission receipt.'
    )
  ).toBeVisible()
  expect(
    screen.getByText('The saved receipt contains no first-frame image input.')
  ).toBeVisible()
  expect(
    screen.queryByText(
      'Description guidance only; the asset image was not submitted'
    )
  ).toBeNull()
  expect(
    screen.queryByText(
      'The submitted reference is not recorded for this result. Verify the visual output before approving.'
    )
  ).toBeNull()
})

test('a historical parameter-only snapshot does not acquire reference proof from current bindings', () => {
  const project = example()
  const node = project.nodes.find((item) => item.id === 'video')
  if (!node?.data.takes) throw new Error('Missing example Takes')
  node.data.takes = node.data.takes.map((take) =>
    take.id !== 'selected'
      ? take
      : {
          ...take,
          requestSnapshot: JSON.stringify({
            model: 'wan2.2-ti2v-5b',
            size: '640x384',
          }),
        }
  )
  mount(project)
  expect(
    screen.getByText(
      'The submitted reference is not recorded for this result. Verify the visual output before approving.'
    )
  ).toBeVisible()
  expect(
    screen.queryByRole('region', { name: 'Actual submitted first frame' })
  ).toBeNull()
  expect(
    screen.queryByText(
      'This asset is not present in the saved submission receipt.'
    )
  ).toBeNull()
})
