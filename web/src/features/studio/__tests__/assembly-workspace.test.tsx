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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { Studio } from '../index'
import { saveStudioProjects, studioProjectsKey } from '../local-projects'
import { stitchStudioVideos } from '../studio-mp4'
import {
  addStudioShot,
  createStudioProject,
  updateStudioNode,
} from '../workspace'

const stored = vi.hoisted(() => new Map<string, Blob>())
const getMedia = vi.hoisted(() =>
  vi.fn(
    async (userId: number, mediaId: string) =>
      stored.get(`${userId}:${mediaId}`) || null
  )
)
const deleteMedia = vi.hoisted(() =>
  vi.fn(async (userId: number, mediaId: string) => {
    stored.delete(`${userId}:${mediaId}`)
  })
)
const putMedia = vi.hoisted(() =>
  vi.fn(async (userId: number, mediaId: string, blob: Blob) => {
    stored.set(`${userId}:${mediaId}`, blob)
  })
)

vi.mock('@/components/ai-elements/canvas', () => ({ Canvas: () => <div /> }))
vi.mock('../api', () => ({
  fetchStudioGroups: async () => [{ id: 'default', description: 'Default' }],
  fetchStudioModels: async () => ['video-model'],
  fetchStudioProviderConfigs: async () => ({}),
  fetchStudioProviderModels: async () => [],
  fetchStudioAttempts: async () => [],
  getStudioVideoContentUrl: async () => '',
}))
vi.mock('../media-store', () => ({
  studioMediaStore: () => ({
    get: getMedia,
    put: putMedia,
    delete: deleteMedia,
  }),
}))
vi.mock('../studio-mp4', () => ({ stitchStudioVideos: vi.fn() }))

beforeEach(() => {
  localStorage.clear()
  stored.clear()
  vi.clearAllMocks()
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:assembled')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  useAuthStore.setState((state) => ({
    auth: {
      ...state.auth,
      user: { id: 12, username: 'one', role: 1, group: 'default' },
    },
  }))
})

test('clicking assemble exports ordered local clips and saves the MP4 for another visit', async () => {
  const first = new Blob(['first'], { type: 'video/mp4' })
  const second = new Blob(['second'], { type: 'video/mp4' })
  const output = new Blob(['joined'], { type: 'video/mp4' })
  stored.set('12:clip-1', first)
  stored.set('12:clip-2', second)
  vi.mocked(stitchStudioVideos).mockResolvedValue(output)
  let project = createStudioProject('Drama', 'p1')
  project = addStudioShot(
    project,
    's1',
    { text: 't1', image: 'i1', video: 'v1' },
    'Opening'
  )
  project = addStudioShot(
    project,
    's2',
    { text: 't2', image: 'i2', video: 'v2' },
    'Arrival'
  )
  project = updateStudioNode(project, 'v1', {
    status: 'completed',
    mediaId: 'clip-1',
  })
  project = updateStudioNode(project, 'v2', {
    status: 'completed',
    mediaId: 'clip-2',
  })
  saveStudioProjects(localStorage, 12, [project])

  render(<Studio />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'studio.assembly.create' })
  )

  await waitFor(() =>
    expect(stitchStudioVideos).toHaveBeenCalledWith(
      [first, second],
      expect.any(Function),
      expect.any(AbortSignal)
    )
  )
  await waitFor(() => {
    const saved = JSON.parse(
      localStorage.getItem(studioProjectsKey(12)) || '{}'
    )
    const mediaId = saved.projects?.[0]?.assembledMediaId
    expect(mediaId).toBeTruthy()
    expect(stored.get(`12:${mediaId}`)).toBe(output)
  })
  expect(
    screen.getByRole('button', { name: 'studio.assembly.download' })
  ).toBeTruthy()
})

test('an unfinished shot blocks MP4 assembly with a visible shot error', async () => {
  const project = addStudioShot(
    createStudioProject('Drama', 'p1'),
    's1',
    {
      text: 't1',
      image: 'i1',
      video: 'v1',
    },
    'Opening'
  )
  saveStudioProjects(localStorage, 12, [project])

  render(<Studio />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'studio.assembly.create' })
  )

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'studio.assembly.error.unfinished'
  )
  expect(stitchStudioVideos).not.toHaveBeenCalled()
})

test('a full browser store still lets the user download the completed MP4', async () => {
  stored.set('12:clip-1', new Blob(['clip'], { type: 'video/mp4' }))
  vi.mocked(stitchStudioVideos).mockResolvedValue(
    new Blob(['joined'], { type: 'video/mp4' })
  )
  putMedia.mockRejectedValueOnce(new Error('QuotaExceededError'))
  let project = addStudioShot(
    createStudioProject('Drama', 'p1'),
    's1',
    {
      text: 't1',
      image: 'i1',
      video: 'v1',
    },
    'Opening'
  )
  project = updateStudioNode(project, 'v1', {
    status: 'completed',
    mediaId: 'clip-1',
  })
  saveStudioProjects(localStorage, 12, [project])

  render(<Studio />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'studio.assembly.create' })
  )

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'studio.assembly.error.saveFailed'
  )
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled()
  const saved = JSON.parse(localStorage.getItem(studioProjectsKey(12)) || '{}')
  expect(saved.projects?.[0]?.assembledMediaId).toBeUndefined()
})

test('reordering shots invalidates the old assembled MP4 and removes its local blob', async () => {
  stored.set('12:clip-1', new Blob(['first'], { type: 'video/mp4' }))
  stored.set('12:clip-2', new Blob(['second'], { type: 'video/mp4' }))
  stored.set('12:assembled', new Blob(['joined'], { type: 'video/mp4' }))
  let project = createStudioProject('Drama', 'p1')
  project = addStudioShot(
    project,
    's1',
    { text: 't1', image: 'i1', video: 'v1' },
    'Opening'
  )
  project = addStudioShot(
    project,
    's2',
    { text: 't2', image: 'i2', video: 'v2' },
    'Arrival'
  )
  project = updateStudioNode(project, 'v1', {
    status: 'completed',
    mediaId: 'clip-1',
  })
  project = updateStudioNode(project, 'v2', {
    status: 'completed',
    mediaId: 'clip-2',
  })
  saveStudioProjects(localStorage, 12, [
    { ...project, assembledMediaId: 'assembled' },
  ])

  render(<Studio />)
  fireEvent.click(
    (await screen.findAllByRole('button', { name: 'studio.shot.up' }))[1]
  )

  await waitFor(() => {
    const saved = JSON.parse(
      localStorage.getItem(studioProjectsKey(12)) || '{}'
    )
    expect(saved.projects?.[0]?.assembledMediaId).toBeUndefined()
    expect(deleteMedia).toHaveBeenCalledWith(12, 'assembled')
  })
})

test('reopening a project restores the assembled MP4 preview from browser storage', async () => {
  stored.set('12:assembled', new Blob(['joined'], { type: 'video/mp4' }))
  let project = addStudioShot(
    createStudioProject('Drama', 'p1'),
    's1',
    {
      text: 't1',
      image: 'i1',
      video: 'v1',
    },
    'Opening'
  )
  project = updateStudioNode(project, 'v1', {
    status: 'completed',
    taskId: 'task-1',
  })
  saveStudioProjects(localStorage, 12, [
    { ...project, assembledMediaId: 'assembled' },
  ])

  render(<Studio />)

  expect(
    await screen.findByLabelText('studio.assembly.preview')
  ).toHaveAttribute('src', 'blob:assembled')
  expect(
    screen.getByRole('button', { name: 'studio.assembly.download' })
  ).toBeTruthy()
})

test('assembling again replaces the saved MP4 and removes the previous blob', async () => {
  stored.set('12:clip-1', new Blob(['clip'], { type: 'video/mp4' }))
  stored.set('12:old-assembly', new Blob(['old'], { type: 'video/mp4' }))
  vi.mocked(stitchStudioVideos).mockResolvedValue(
    new Blob(['new'], { type: 'video/mp4' })
  )
  let project = addStudioShot(
    createStudioProject('Drama', 'p1'),
    's1',
    {
      text: 't1',
      image: 'i1',
      video: 'v1',
    },
    'Opening'
  )
  project = updateStudioNode(project, 'v1', {
    status: 'completed',
    mediaId: 'clip-1',
  })
  saveStudioProjects(localStorage, 12, [
    { ...project, assembledMediaId: 'old-assembly' },
  ])

  render(<Studio />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'studio.assembly.create' })
  )

  await waitFor(() =>
    expect(deleteMedia).toHaveBeenCalledWith(12, 'old-assembly')
  )
  const saved = JSON.parse(localStorage.getItem(studioProjectsKey(12)) || '{}')
  expect(saved.projects?.[0]?.assembledMediaId).not.toBe('old-assembly')
  expect(stored.has('12:old-assembly')).toBe(false)
})

test('an old account export cannot overwrite a newer account export state', async () => {
  stored.set('12:clip-a', new Blob(['A'], { type: 'video/mp4' }))
  stored.set('13:clip-b', new Blob(['B'], { type: 'video/mp4' }))
  let oldReject: (reason: Error) => void = () => {}
  let newResolve: (blob: Blob) => void = () => {}
  const oldExport = new Promise<Blob>((_resolve, reject) => {
    oldReject = reject
  })
  const newExport = new Promise<Blob>((resolve) => {
    newResolve = resolve
  })
  vi.mocked(stitchStudioVideos)
    .mockImplementationOnce(async () => oldExport)
    .mockImplementationOnce(async () => newExport)
  let first = addStudioShot(
    createStudioProject('First', 'p1'),
    's1',
    {
      text: 't1',
      image: 'i1',
      video: 'v1',
    },
    'Secret first shot'
  )
  first = updateStudioNode(first, 'v1', {
    status: 'completed',
    mediaId: 'clip-a',
  })
  let second = addStudioShot(
    createStudioProject('Second', 'p2'),
    's2',
    {
      text: 't2',
      image: 'i2',
      video: 'v2',
    },
    'Second shot'
  )
  second = updateStudioNode(second, 'v2', {
    status: 'completed',
    mediaId: 'clip-b',
  })
  saveStudioProjects(localStorage, 12, [first])
  saveStudioProjects(localStorage, 13, [second])

  render(<Studio />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'studio.assembly.create' })
  )
  await waitFor(() => expect(stitchStudioVideos).toHaveBeenCalledTimes(1))
  await act(async () => {
    useAuthStore.setState((state) => ({
      auth: {
        ...state.auth,
        user: { id: 13, username: 'two', role: 1, group: 'default' },
      },
    }))
  })
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: 'studio.project.name' })
    ).toHaveValue('Second')
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.assembly.create' })
  )
  await waitFor(() => expect(stitchStudioVideos).toHaveBeenCalledTimes(2))

  await act(async () => {
    oldReject(new Error('Secret first shot failed'))
  })
  expect(
    screen.getByRole('button', { name: 'studio.assembly.working' })
  ).toBeDisabled()
  expect(screen.queryByText('Secret first shot failed')).toBeNull()

  await act(async () => {
    newResolve(new Blob(['joined'], { type: 'video/mp4' }))
  })
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'studio.assembly.download' })
    ).toBeTruthy()
  )
})

test('a node named assembly cannot replace the assembled MP4 preview', async () => {
  stored.set('12:image-1', new Blob(['image'], { type: 'image/png' }))
  stored.set('12:assembled', new Blob(['video'], { type: 'video/mp4' }))
  vi.mocked(URL.createObjectURL).mockImplementation((object) =>
    object instanceof Blob && object.type.startsWith('image/')
      ? 'blob:image'
      : 'blob:assembled'
  )
  let project = addStudioShot(
    createStudioProject('Drama', 'p1'),
    's1',
    {
      text: 't1',
      image: 'assembly',
      video: 'v1',
    },
    'Opening'
  )
  project = updateStudioNode(project, 'assembly', {
    status: 'completed',
    mediaId: 'image-1',
  })
  project = updateStudioNode(project, 'v1', {
    status: 'completed',
    taskId: 'task-1',
  })
  saveStudioProjects(localStorage, 12, [
    { ...project, assembledMediaId: 'assembled' },
  ])

  render(<Studio />)

  expect(await screen.findByRole('img', { name: 'Opening' })).toHaveAttribute(
    'src',
    'blob:image'
  )
  expect(
    await screen.findByLabelText('studio.assembly.preview')
  ).toHaveAttribute('src', 'blob:assembled')
})

test('returning to a project retries an IndexedDB read canceled during a project switch', async () => {
  const user = userEvent.setup()
  let releaseRead: (blob: Blob | null) => void = () => {}
  getMedia.mockImplementationOnce(
    () =>
      new Promise<Blob | null>((resolve) => {
        releaseRead = resolve
      })
  )
  let first = addStudioShot(
    createStudioProject('Drama', 'p1'),
    's1',
    {
      text: 't1',
      image: 'i1',
      video: 'v1',
    },
    'Opening'
  )
  first = updateStudioNode(first, 'v1', {
    status: 'completed',
    taskId: 'task-1',
  })
  const second = createStudioProject('Other', 'p2')
  stored.set('12:assembled', new Blob(['joined'], { type: 'video/mp4' }))
  saveStudioProjects(localStorage, 12, [
    { ...first, assembledMediaId: 'assembled' },
    second,
  ])

  render(<Studio />)
  await waitFor(() => expect(getMedia).toHaveBeenCalledTimes(1))
  await user.click(
    screen.getByRole('combobox', { name: 'studio.project.select' })
  )
  await user.click(await screen.findByRole('option', { name: 'Other' }))
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: 'studio.project.name' })
    ).toHaveValue('Other')
  )
  await act(async () => {
    releaseRead(stored.get('12:assembled') || null)
  })
  await user.click(
    screen.getByRole('combobox', { name: 'studio.project.select' })
  )
  await user.click(await screen.findByRole('option', { name: 'Drama' }))

  await waitFor(() => expect(getMedia).toHaveBeenCalledTimes(2))
  expect(
    await screen.findByLabelText('studio.assembly.preview')
  ).toHaveAttribute('src', 'blob:assembled')
})

test('a queued shot reorder cannot attach an MP4 made from the old order', async () => {
  stored.set('12:clip-1', new Blob(['first'], { type: 'video/mp4' }))
  stored.set('12:clip-2', new Blob(['second'], { type: 'video/mp4' }))
  vi.mocked(stitchStudioVideos).mockResolvedValue(
    new Blob(['joined'], { type: 'video/mp4' })
  )
  let releasePut: () => void = () => {}
  putMedia.mockImplementationOnce(
    (userId, mediaId, blob) =>
      new Promise<void>((resolve) => {
        releasePut = () => {
          stored.set(`${userId}:${mediaId}`, blob)
          resolve()
        }
      })
  )
  let project = createStudioProject('Drama', 'p1')
  project = addStudioShot(
    project,
    's1',
    { text: 't1', image: 'i1', video: 'v1' },
    'Opening'
  )
  project = addStudioShot(
    project,
    's2',
    { text: 't2', image: 'i2', video: 'v2' },
    'Arrival'
  )
  project = updateStudioNode(project, 'v1', {
    status: 'completed',
    mediaId: 'clip-1',
  })
  project = updateStudioNode(project, 'v2', {
    status: 'completed',
    mediaId: 'clip-2',
  })
  saveStudioProjects(localStorage, 12, [project])

  render(<Studio />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'studio.assembly.create' })
  )
  await waitFor(() => expect(putMedia).toHaveBeenCalledOnce())
  await act(async () => {
    screen.getAllByRole('button', { name: 'studio.shot.up' })[1].click()
    releasePut()
    await Promise.resolve()
  })

  await waitFor(() => {
    const saved = JSON.parse(
      localStorage.getItem(studioProjectsKey(12)) || '{}'
    )
    expect(saved.projects?.[0]?.shots?.[0]?.id).toBe('s2')
    expect(saved.projects?.[0]?.assembledMediaId).toBeUndefined()
    expect(deleteMedia).toHaveBeenCalledWith(12, expect.any(String))
  })
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
})

test('a queued shot reorder also blocks the storage-failure download fallback', async () => {
  stored.set('12:clip-1', new Blob(['first'], { type: 'video/mp4' }))
  stored.set('12:clip-2', new Blob(['second'], { type: 'video/mp4' }))
  vi.mocked(stitchStudioVideos).mockResolvedValue(
    new Blob(['joined'], { type: 'video/mp4' })
  )
  let rejectPut: () => void = () => {}
  putMedia.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectPut = () => reject(new Error('QuotaExceededError'))
      })
  )
  let project = createStudioProject('Drama', 'p1')
  project = addStudioShot(
    project,
    's1',
    { text: 't1', image: 'i1', video: 'v1' },
    'Opening'
  )
  project = addStudioShot(
    project,
    's2',
    { text: 't2', image: 'i2', video: 'v2' },
    'Arrival'
  )
  project = updateStudioNode(project, 'v1', {
    status: 'completed',
    mediaId: 'clip-1',
  })
  project = updateStudioNode(project, 'v2', {
    status: 'completed',
    mediaId: 'clip-2',
  })
  saveStudioProjects(localStorage, 12, [project])

  render(<Studio />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'studio.assembly.create' })
  )
  await waitFor(() => expect(putMedia).toHaveBeenCalledOnce())
  await act(async () => {
    screen.getAllByRole('button', { name: 'studio.shot.up' })[1].click()
    rejectPut()
    await Promise.resolve()
  })

  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'studio.assembly.changed'
  )
})
