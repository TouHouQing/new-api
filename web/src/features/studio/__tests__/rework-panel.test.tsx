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
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'

import { studioProductionSchema } from '../studio-production'
import { prepareStudioRework } from '../studio-rework'
import { StudioReworkPanel } from '../studio-rework-panel'
import { StudioWorkspaceShot } from '../studio-workspace-shot'
import {
  addStudioNode,
  addStudioShot,
  createStudioProject,
  updateStudioNode,
} from '../workspace'

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  request: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}))
vi.mock('../studio-production-context', () => ({
  useStudioProductionContext: () => mocks.context(),
}))
vi.mock('../studio-cloud', () => ({
  studioCloudRequest: (...args: unknown[]) => mocks.request(...args),
}))
vi.mock('../studio-timeline-preview', () => ({
  StudioTimelinePreview: () => null,
}))
vi.mock('../studio-media-thumbnail', () => ({
  StudioMediaThumbnail: (props: { mediaId: string }) => (
    <span>{props.mediaId}</span>
  ),
}))
vi.mock('../studio-media-import', () => ({
  StudioMediaImport: () => null,
}))

function fixture() {
  const project = updateStudioNode(
    addStudioNode(
      createStudioProject('Rework film', 'rework-film'),
      'video',
      'source'
    ),
    'source',
    {
      title: 'Original shot',
      model: 'wan2.2-ti2v-5b',
      seconds: 5,
      sourceMode: 'upload',
    }
  )
  return updateStudioNode(project, 'source', {
    status: 'completed',
    mediaId: 'original-media',
    selectedTakeId: 'original-take',
    takes: [
      {
        id: 'original-take',
        status: 'completed',
        mediaId: 'original-media',
        prompt: '',
        createdAt: '2026-10-18T00:00:00Z',
      },
    ],
  })
}

function Harness(props: { writable?: boolean }) {
  const [project, setProject] = useState(fixture)
  const [selected, setSelected] = useState('source')
  mocks.context.mockReturnValue({
    props: {
      project,
      selectedNodeId: selected,
      onUpdate: (next: typeof project) => {
        mocks.update(next)
        setProject(next)
      },
      onSelectNode: (id: string) => {
        mocks.select(id)
        setSelected(id)
      },
    },
    writable: props.writable ?? true,
    setSelectedNodes: vi.fn(),
    setConfirm: vi.fn(),
    mutate: { isPending: false },
    path: '/projects/rework-film',
  })
  return (
    <>
      <p role='status'>
        {project.nodes.find((node) => node.id === selected)?.data.title}
      </p>
      <StudioReworkPanel />
      <button type='button' onClick={() => setSelected('source')}>
        Return to original shot
      </button>
    </>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

test('preparing rework focuses the new candidate and can return to the unchanged original without inference', () => {
  const original = fixture()
  render(<Harness />)
  fireEvent.click(
    screen.getByRole('button', { name: 'Rework one part of a shot' })
  )
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Describe the requested change' }),
    { target: { value: 'Turn the head gently' } }
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Prepare rework and review its budget' })
  )
  expect(screen.queryByRole('alert')).toBeNull()
  expect(mocks.update).toHaveBeenCalledTimes(1)
  const next = mocks.update.mock.calls[0][0] as typeof original
  const candidate = next.nodes.at(-1)
  if (!candidate) throw new Error('Prepared candidate is missing')
  expect(mocks.select).toHaveBeenCalledWith(candidate.id)
  expect(screen.getByRole('status')).toHaveTextContent(candidate.data.title)
  expect(next.nodes[0]).toEqual(original.nodes[0])
  expect(next.production?.timeline).toEqual(original.production?.timeline)
  expect(mocks.request).not.toHaveBeenCalled()
  fireEvent.click(
    screen.getByRole('button', { name: 'Return to original shot' })
  )
  expect(screen.getByRole('status')).toHaveTextContent('Original shot')
})

test('a read-only project cannot create or focus a rework candidate', () => {
  render(<Harness writable={false} />)
  fireEvent.click(
    screen.getByRole('button', { name: 'Rework one part of a shot' })
  )
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Describe the requested change' }),
    { target: { value: 'Change the light' } }
  )
  expect(
    screen.getByRole('button', { name: 'Prepare rework and review its budget' })
  ).toBeDisabled()
  expect(mocks.update).not.toHaveBeenCalled()
  expect(mocks.select).not.toHaveBeenCalled()
  expect(mocks.request).not.toHaveBeenCalled()
})

function StoryboardHarness() {
  const [project] = useState(() => {
    let value = addStudioShot(
      createStudioProject('Storyboard', 'storyboard-rework'),
      'original-shot',
      { text: 'text', image: 'key-image', video: 'source' },
      'Original storyboard shot'
    )
    value = updateStudioNode(value, 'source', {
      model: 'wan2.2-ti2v-5b',
      seconds: 5,
      title: 'Original shot',
    })
    value = updateStudioNode(value, 'source', {
      mediaId: 'original-media',
      selectedTakeId: 'original-take',
      takes: [
        {
          id: 'original-take',
          mediaId: 'original-media',
          createdAt: '2026-10-18T00:00:00Z',
          prompt: '',
          status: 'completed',
        },
      ],
      status: 'completed',
    })
    value = updateStudioNode(value, 'key-image', {
      mediaId: 'key-image-media',
      status: 'completed',
    })
    value = prepareStudioRework(
      value,
      'source',
      'replacement',
      'Gentle head turn',
      'range',
      { start: 1, end: 3, x: 0, y: 0, width: 100, height: 100 }
    )
    value.production = studioProductionSchema.parse({
      ...value.production,
      timelineEdited: true,
      timeline: [
        {
          id: 'opaque-original-main',
          nodeId: 'source',
          takeId: 'original-take',
          trimStart: 0,
          trimEnd: 4,
          speed: 2,
        },
      ],
    })
    return updateStudioNode(value, 'replacement', {
      title: 'New replacement candidate',
      mediaId: 'replacement-media',
      status: 'completed',
    })
  })
  const [selected, setSelected] = useState('replacement')
  mocks.context.mockReturnValue({
    props: {
      project,
      selectedNodeId: selected,
      onSelectNode: setSelected,
      onUpdate: mocks.update,
      onSave: vi.fn().mockResolvedValue(undefined),
      getMedia: vi.fn(),
    },
    writable: true,
    setSelectedNodes: vi.fn(),
    setConfirm: vi.fn(),
    mutate: { isPending: false },
    path: '/projects/storyboard-rework',
  })
  return (
    <>
      <StudioWorkspaceShot onTool={vi.fn()} />
      <button type='button' onClick={() => setSelected('source')}>
        Return to original storyboard shot
      </button>
      <button type='button' onClick={() => setSelected('replacement')}>
        Return to replacement
      </button>
    </>
  )
}

test('an explicit rework candidate stays selected in a storyboard and original image/video switching and comparison remain available', () => {
  render(<StoryboardHarness />)
  expect(
    screen.getByRole('heading', { name: 'New replacement candidate' })
  ).toBeInTheDocument()
  expect(screen.getByText('replacement-media')).toBeInTheDocument()
  expect(screen.queryByText('original-media')).not.toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', { name: 'Return to original storyboard shot' })
  )
  expect(
    screen.getByRole('heading', { name: 'Original storyboard shot' })
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^Key image$/ }))
  expect(screen.getByText('key-image-media')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^Video$/ }))
  expect(screen.getByText('original-media')).toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', { name: 'Rework one part of a shot' })
  )
  expect(
    screen.getByRole('button', { name: 'Preview replacement in the timeline' })
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Return to replacement' }))
  expect(
    screen.getByRole('heading', { name: 'New replacement candidate' })
  ).toBeInTheDocument()
  expect(mocks.request).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
})

test('the selected replacement occurrence keeps its readable shot, source interval and speed in the closed selector', () => {
  render(<StoryboardHarness />)
  fireEvent.click(
    screen.getByRole('button', { name: 'Rework one part of a shot' })
  )
  const selector = screen.getByRole('combobox', {
    name: 'Replacement timeline occurrence: New replacement candidate',
  })
  fireEvent.click(selector)
  fireEvent.click(
    screen.getByRole('option', { name: '1. Original shot · 0.00–4.00 s · 2×' })
  )
  expect(selector).toHaveTextContent('1. Original shot · 0.00–4.00 s · 2×')
  expect(selector).not.toHaveTextContent('opaque-original-main')
  expect(mocks.request).not.toHaveBeenCalled()
})
