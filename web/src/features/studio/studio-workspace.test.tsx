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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render as testingRender,
  screen,
  waitFor,
} from '@testing-library/react'
import { useEffect, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import {
  createStudioVideo,
  fetchStudioProviderConfigs,
  fetchStudioAttempts,
  fetchStudioAttemptByRequest,
  fetchStudioProviderModels,
  fetchStudioModels,
  generateStudioImage,
  generateStudioText,
  getStudioVideoContentUrl,
  getStudioVideoTask,
} from './api'
import type { StudioCanvasNode } from './canvas-flow'
import { Studio } from './index'
import {
  loadStudioProjects,
  saveStudioProjects,
  studioProjectsKey,
} from './local-projects'
import { studioNodeInputFingerprint } from './studio-execution'
import { captureStudioLastFrame } from './studio-frame-grab'
import { importStudioProjectBundle } from './studio-project-bundle'
import {
  addStudioNode,
  addStudioShot,
  createStudioProject,
  ensureStudioFinalVideo,
  recordStudioTake,
  updateStudioNode,
} from './workspace'

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return testingRender(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  )
}

const preflightTestState = vi.hoisted(() => ({ autoConfirm: true }))

vi.mock('./studio-video-preflight', () => ({
  StudioVideoPreflight: ({
    data,
    onConfirm,
    onCancel,
  }: {
    data: { kind: 'video' | 'batch' }
    onConfirm: () => void
    onCancel: () => void
  }) => {
    useEffect(() => {
      if (preflightTestState.autoConfirm) onConfirm()
    }, [onConfirm])
    return preflightTestState.autoConfirm ? null : (
      <div role='dialog' aria-label={data.kind}>
        <button type='button' onClick={onConfirm}>
          studio.preflight.confirm
        </button>
        <button type='button' onClick={onCancel}>
          studio.preflight.cancel
        </button>
      </div>
    )
  },
}))

vi.mock('@/components/ai-elements/canvas', () => ({
  Canvas: ({
    nodes,
    onNodeClick,
  }: {
    nodes: StudioCanvasNode[]
    onNodeClick?: (event: unknown, node: StudioCanvasNode) => void
  }) => (
    <div data-testid='canvas-nodes'>
      {nodes.map((node) => (
        <button
          type='button'
          key={node.id}
          onClick={() => onNodeClick?.({}, node)}
        >
          {node.data.title}
        </button>
      ))}
    </div>
  ),
}))
vi.mock('./api', () => ({
  fetchStudioGroups: async () => [
    { id: 'default', description: 'Default' },
    { id: '特价sd', description: '所有sd模型都在这' },
  ],
  fetchStudioModels: vi.fn(async () => ['MiniMax-H3', '会员套餐甲']),
  fetchStudioProviderConfigs: vi.fn(async () => ({})),
  fetchStudioAttempts: vi.fn(async () => []),
  fetchStudioAttemptByRequest: vi.fn(async () => null),
  fetchStudioProviderModels: vi.fn(),
  saveStudioProviderConfig: vi.fn(),
  deleteStudioProviderConfig: vi.fn(),
  generateStudioText: vi.fn(),
  generateStudioStoryboard: vi.fn(),
  generateStudioImage: vi.fn(),
  createStudioVideo: vi.fn(),
  getStudioVideoTask: vi.fn(),
  getStudioVideoContentUrl: vi.fn(),
}))
const storedMedia = new Map<string, Blob>()
let rejectNextMediaPut = false
vi.mock('./media-store', () => ({
  studioMediaStore: () => ({
    get: async (userId: number, mediaId: string) =>
      storedMedia.get(`${userId}:${mediaId}`) || null,
    put: async (userId: number, mediaId: string, blob: Blob) => {
      if (rejectNextMediaPut) {
        rejectNextMediaPut = false
        throw new Error('image storage unavailable')
      }
      storedMedia.set(`${userId}:${mediaId}`, blob)
    },
    delete: async (userId: number, mediaId: string) => {
      storedMedia.delete(`${userId}:${mediaId}`)
    },
  }),
}))
vi.mock('./studio-frame-grab', () => ({ captureStudioLastFrame: vi.fn() }))
vi.mock('./studio-project-bundle', () => ({
  exportStudioProjectBundle: vi.fn(),
  importStudioProjectBundle: vi.fn(),
}))

beforeEach(() => {
  rejectNextMediaPut = false
  preflightTestState.autoConfirm = true
  vi.clearAllMocks()
  vi.mocked(fetchStudioModels).mockResolvedValue(['MiniMax-H3', '会员套餐甲'])
  vi.mocked(fetchStudioAttemptByRequest).mockResolvedValue(null)
  storedMedia.clear()
  localStorage.clear()
  useAuthStore.setState((state) => ({
    auth: {
      ...state.auth,
      user: { id: 12, username: 'one', role: 1, group: 'default' },
    },
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Studio account isolation', () => {
  test('keeps the previous manual image when its replacement cannot be stored', async () => {
    storedMedia.set(
      '12:original-image',
      new Blob(['original'], { type: 'image/png' })
    )
    let project = addStudioNode(
      createStudioProject('Manual', 'manual-project'),
      'image',
      'image'
    )
    project = updateStudioNode(project, 'image', {
      mediaId: 'original-image',
      status: 'completed',
    })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Image 1' }))
    rejectNextMediaPut = true
    fireEvent.change(screen.getByLabelText('studio.image.local'), {
      target: {
        files: [new File(['replacement'], 'new.png', { type: 'image/png' })],
      },
    })
    await screen.findByText('image storage unavailable')
    expect(storedMedia.get('12:original-image')).toBeTruthy()
    const saved = loadStudioProjects(localStorage, 12)[0]
    expect(saved.nodes[0].data.mediaId).toBe('original-image')
  })
  test('retrying media storage repairs the selected image take for portable export', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Blob(['portrait'], { type: 'image/png' }), {
            status: 200,
          })
      )
    )
    let project = addStudioNode(
      createStudioProject('Variants', 'p-variants'),
      'image',
      'image'
    )
    project = recordStudioTake(project, 'image', {
      id: 'take-remote',
      createdAt: '2026-09-26T00:00:00Z',
      prompt: 'portrait',
      status: 'completed',
      outputUrl: 'https://images.example/portrait.png',
    })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Image 1' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.media.retry' })
    )
    await waitFor(() => {
      const node = loadStudioProjects(localStorage, 12)[0].nodes[0]
      expect(node.data.mediaId).toBeTruthy()
      expect(node.data.takes?.[0].mediaId).toBe(node.data.mediaId)
    })
  })
  test('plain text mode asks the external model for an ordinary visual prompt', async () => {
    vi.mocked(fetchStudioProviderConfigs).mockResolvedValue({
      text: { kind: 'text', baseUrl: 'https://text.example/v1', hasKey: true },
    })
    vi.mocked(fetchStudioProviderModels).mockResolvedValue(['writer'])
    vi.mocked(generateStudioText).mockResolvedValue({
      text: 'A woman in a white dress',
      imagePrompt: 'A woman in a white dress',
      videoPrompt: 'A woman in a white dress',
    })
    let project = addStudioNode(
      createStudioProject('Plain', 'p-plain'),
      'text',
      'text'
    )
    project = updateStudioNode(project, 'text', {
      model: 'writer',
      textMode: 'plain',
      prompt: 'Describe a woman',
    })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Text 1' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.generate' })
    )
    await waitFor(() =>
      expect(generateStudioText).toHaveBeenCalledWith(
        'writer',
        'Describe a woman',
        'plain'
      )
    )
  })
  test('a new empty project opens the guided storyboard first', async () => {
    render(<Studio />)
    expect(await screen.findByText('studio.shot.title')).toBeVisible()
  })
  test('an ambiguous video timeout keeps its request ID and blocks a new submission', async () => {
    vi.mocked(createStudioVideo).mockRejectedValue(new Error('522 timeout'))
    let project = addStudioNode(
      createStudioProject('Uncertain', 'p-uncertain'),
      'video',
      'video'
    )
    project = updateStudioNode(project, 'video', {
      model: '会员套餐甲',
      prompt: 'Night street',
    })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Video 1' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.generate' })
    )
    expect(await screen.findByText('studio.submission.uncertain')).toBeTruthy()
    expect(createStudioVideo).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      const saved = JSON.parse(
        localStorage.getItem(studioProjectsKey(12)) || '{}'
      )
      expect(saved.projects[0].nodes[0].data.pendingRequestId).toMatch(
        /^[0-9a-f-]{36}$/
      )
    })
    expect(
      screen.getByRole('button', { name: 'studio.generate' })
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'studio.submission.reconcile' })
    ).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'studio.submission.abandon' })
    )
    expect(screen.getByText('studio.submission.abandonWarning')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'studio.submission.abandonConfirm' })
    )
    await waitFor(() => {
      const saved = JSON.parse(
        localStorage.getItem(studioProjectsKey(12)) || '{}'
      )
      expect(saved.projects[0].nodes[0].data.pendingRequestId).toBeUndefined()
    })
  })
  test('a timed-out response with a recorded task resumes the original video', async () => {
    vi.mocked(createStudioVideo).mockRejectedValue(new Error('522 timeout'))
    vi.mocked(fetchStudioAttemptByRequest).mockImplementation(
      async (requestId) => ({
        id: 'attempt-1',
        requestId,
        group: 'default',
        model: '会员套餐甲',
        stage: 'submitted',
        httpStatus: 200,
        errorCode: '',
        channelId: 4,
        taskId: 'task-from-attempt',
        createdAt: '2026-09-26T00:00:00Z',
      })
    )
    let project = addStudioNode(
      createStudioProject('Recovered', 'p-recovered'),
      'video',
      'video'
    )
    project = updateStudioNode(project, 'video', {
      model: '会员套餐甲',
      prompt: 'Night street',
    })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Video 1' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.generate' })
    )
    await waitFor(() => {
      const saved = JSON.parse(
        localStorage.getItem(studioProjectsKey(12)) || '{}'
      )
      const node = saved.projects[0].nodes[0]
      expect(node.data.taskId).toBe('task-from-attempt')
      expect(node.data.pendingRequestId).toBeUndefined()
      expect(node.data.takes[0].clientRequestId).toMatch(/^[0-9a-f-]{36}$/)
    })
    expect(createStudioVideo).toHaveBeenCalledTimes(1)
  })
  test('reconciliation retains an old task without activating it after input edits', async () => {
    const requestId = 'c3943135-fc77-4ca2-9378-d53fb5d8385b'
    vi.mocked(fetchStudioAttemptByRequest).mockResolvedValue({
      id: 'attempt-old',
      requestId,
      group: 'default',
      model: '会员套餐甲',
      stage: 'submitted',
      httpStatus: 200,
      errorCode: '',
      channelId: 4,
      taskId: 'task-old-input',
      createdAt: '2026-09-26T00:00:00Z',
    })
    let project = addStudioNode(
      createStudioProject('Edited', 'p-edited'),
      'video',
      'video'
    )
    project = updateStudioNode(project, 'video', {
      model: '会员套餐甲',
      prompt: 'Old scene',
    })
    const oldFingerprint = studioNodeInputFingerprint(project, 'video')
    project.nodes[0].data = {
      ...project.nodes[0].data,
      pendingRequestId: requestId,
      pendingRequestFingerprint: oldFingerprint,
      pendingRequestPrompt: 'Old scene',
      pendingRequestGroup: 'default',
      pendingRequestModel: '会员套餐甲',
      status: 'failed',
    }
    project = updateStudioNode(project, 'video', { prompt: 'New scene' })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Video 1' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'studio.submission.reconcile' })
    )
    await waitFor(() => {
      const saved = JSON.parse(
        localStorage.getItem(studioProjectsKey(12)) || '{}'
      )
      const node = saved.projects[0].nodes[0]
      expect(node.data.prompt).toBe('New scene')
      expect(node.data.selectedTakeId).toBeUndefined()
      expect(node.data.taskId).toBeUndefined()
      expect(node.data.takes[0].taskId).toBe('task-old-input')
      expect(node.data.pendingRequestId).toBeUndefined()
    })
  })
  test('manual reconciliation retries a missing attempt with the same request ID', async () => {
    vi.mocked(createStudioVideo)
      .mockRejectedValueOnce(new Error('522 timeout'))
      .mockResolvedValueOnce('task-safe-retry')
    let project = addStudioNode(
      createStudioProject('Safe retry', 'p-safe-retry'),
      'video',
      'video'
    )
    project = updateStudioNode(project, 'video', {
      model: '会员套餐甲',
      prompt: 'Night street',
    })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Video 1' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.generate' })
    )
    await screen.findByText('studio.submission.uncertain')
    fireEvent.click(
      screen.getByRole('button', { name: 'studio.submission.reconcile' })
    )
    await waitFor(() => expect(createStudioVideo).toHaveBeenCalledTimes(2))
    expect(vi.mocked(createStudioVideo).mock.calls[0][2]).toBe(
      vi.mocked(createStudioVideo).mock.calls[1][2]
    )
  })
  test('an uncertain upstream video blocks dependent work before text generation', async () => {
    vi.mocked(fetchStudioProviderConfigs).mockResolvedValue({
      text: { kind: 'text', baseUrl: 'https://text.example/v1', hasKey: true },
    })
    vi.mocked(fetchStudioProviderModels).mockResolvedValue(['writer'])
    let project = createStudioProject('Blocked', 'p-blocked')
    project = addStudioNode(project, 'text', 'text')
    project = addStudioNode(project, 'video', 'source')
    project = addStudioNode(project, 'video', 'target')
    project = updateStudioNode(project, 'text', {
      model: 'writer',
      prompt: 'Scene',
    })
    project = updateStudioNode(project, 'source', {
      model: '会员套餐甲',
      prompt: 'First clip',
      status: 'failed',
      pendingRequestId: 'c3943135-fc77-4ca2-9378-d53fb5d8385b',
    })
    project = updateStudioNode(project, 'target', {
      model: '会员套餐甲',
      prompt: 'Second clip',
    })
    project.edges = [
      { id: 'text-source', source: 'text', target: 'source' },
      { id: 'source-target', source: 'source', target: 'target' },
    ]
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Video 3' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.generate' })
    )
    expect(await screen.findByText('studio.submission.uncertain')).toBeTruthy()
    expect(generateStudioText).not.toHaveBeenCalled()
    expect(createStudioVideo).not.toHaveBeenCalled()
  })
  test('a removed video model gives a reselect message before any billable request', async () => {
    vi.mocked(fetchStudioModels).mockResolvedValue(['other-model'])
    let project = addStudioNode(
      createStudioProject('Changing channels', 'p-model-change'),
      'video',
      'video'
    )
    project = updateStudioNode(project, 'video', {
      model: '会员套餐甲',
      prompt: 'walking',
    })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Video 1' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.generate' })
    )
    expect(
      await screen.findByText('studio.model.noLongerAvailable')
    ).toBeTruthy()
    expect(createStudioVideo).not.toHaveBeenCalled()
  })
  test('never overwrites unreadable local project data with a blank project', async () => {
    localStorage.setItem(studioProjectsKey(12), '{broken project data')
    render(<Studio />)
    expect(await screen.findByText('studio.project.recoveryTitle')).toBeTruthy()
    expect(localStorage.getItem(studioProjectsKey(12))).toBe(
      '{broken project data'
    )
    expect(
      screen.getByRole('button', { name: 'studio.project.resetInvalid' })
    ).toBeDisabled()
  })
  test('rejects an empty asset name before it can invalidate saved projects', async () => {
    render(<Studio />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.asset.title' })
    )
    fireEvent.change(screen.getByLabelText('studio.asset.name'), {
      target: { value: 'Lead' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'studio.asset.add' }))
    fireEvent.change(screen.getByLabelText('Lead studio.asset.name'), {
      target: { value: '' },
    })
    await waitFor(() => {
      const saved = JSON.parse(
        localStorage.getItem(studioProjectsKey(12)) || '{}'
      )
      expect(saved.projects[0].assets[0].title).toBe('Lead')
    })
  })

  test('does not import another account’s ZIP after an account switch', async () => {
    let finishImport!: (project: ReturnType<typeof createStudioProject>) => void
    vi.mocked(importStudioProjectBundle).mockImplementation(
      () => new Promise((resolve) => (finishImport = resolve))
    )
    storedMedia.set(
      '12:imported-media',
      new Blob(['private'], { type: 'image/png' })
    )
    render(<Studio />)
    fireEvent.change(await screen.findByLabelText('studio.import'), {
      target: {
        files: [
          new File(['bundle'], 'project.zip', { type: 'application/zip' }),
        ],
      },
    })
    await waitFor(() =>
      expect(importStudioProjectBundle).toHaveBeenCalledOnce()
    )
    useAuthStore.setState((state) => ({
      auth: {
        ...state.auth,
        user: { id: 13, username: 'two', role: 1, group: 'default' },
      },
    }))
    const imported = addStudioNode(
      createStudioProject('Private project', 'imported'),
      'image',
      'image'
    )
    imported.nodes[0].data.mediaId = 'imported-media'
    finishImport(imported)
    await waitFor(() =>
      expect(storedMedia.has('12:imported-media')).toBe(false)
    )
    expect(localStorage.getItem(studioProjectsKey(13))).not.toContain(
      'Private project'
    )
  })
  test('stores image variants as selectable takes', async () => {
    vi.mocked(fetchStudioProviderConfigs).mockResolvedValue({
      image: {
        kind: 'image',
        baseUrl: 'https://image.example/v1',
        hasKey: true,
      },
    })
    vi.mocked(fetchStudioProviderModels).mockResolvedValue(['image-model'])
    vi.mocked(generateStudioImage).mockResolvedValue({
      url: 'https://cdn.example/one.png',
      urls: ['https://cdn.example/one.png', 'https://cdn.example/two.png'],
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['image'], { type: 'image/png' }),
      })
    )
    let project = addStudioNode(
      createStudioProject('Variants', 'variants'),
      'image',
      'image'
    )
    project = updateStudioNode(project, 'image', {
      model: 'image-model',
      prompt: 'a woman',
      imageCount: 2,
    })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Image 1' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.generate' })
    )
    await waitFor(() => {
      const saved = JSON.parse(
        localStorage.getItem(studioProjectsKey(12)) || '{}'
      )
      const node = saved.projects[0].nodes[0]
      expect(node.data.takes).toHaveLength(2)
      expect(node.data.takes[0].mediaId).toBeTruthy()
      expect(node.data.takes[1].mediaId).toBeTruthy()
      expect(node.data.selectedTakeId).toBe(node.data.takes[0].id)
    })
    expect(generateStudioImage).toHaveBeenCalledWith('image-model', 'a woman', {
      n: 2,
    })
  })

  test('sends a connected image as an external image edit reference', async () => {
    vi.mocked(fetchStudioProviderConfigs).mockResolvedValue({
      image: {
        kind: 'image',
        baseUrl: 'https://image.example/v1',
        hasKey: true,
      },
    })
    vi.mocked(fetchStudioProviderModels).mockResolvedValue(['image-model'])
    vi.mocked(generateStudioImage).mockResolvedValue({
      url: 'https://cdn.example/edited.png',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['result'], { type: 'image/png' }),
      })
    )
    storedMedia.set(
      '12:source-media',
      new Blob(['reference'], { type: 'image/png' })
    )
    let project = addStudioNode(
      createStudioProject('Edit', 'edit'),
      'image',
      'source'
    )
    project = addStudioNode(project, 'image', 'target')
    project = updateStudioNode(project, 'source', {
      mediaId: 'source-media',
      status: 'completed',
    })
    project = updateStudioNode(project, 'target', {
      model: 'image-model',
      prompt: 'change the lighting',
    })
    project.edges = [
      {
        id: 'ref',
        source: 'source',
        target: 'target',
        sourceHandle: 'image',
        targetHandle: 'reference_image',
      },
    ]
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Image 2' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.generate' })
    )
    await waitFor(() =>
      expect(generateStudioImage).toHaveBeenCalledWith(
        'image-model',
        'change the lighting',
        expect.objectContaining({
          image: expect.stringMatching(/^data:image\/png;base64,/),
        })
      )
    )
  })
  test('submits two connected images as external image edit references', async () => {
    vi.mocked(fetchStudioProviderConfigs).mockResolvedValue({
      image: {
        kind: 'image',
        baseUrl: 'https://image.example/v1',
        hasKey: true,
      },
    })
    vi.mocked(fetchStudioProviderModels).mockResolvedValue(['image-model'])
    vi.mocked(generateStudioImage).mockResolvedValue({
      url: 'https://cdn.example/edited.png',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['result'], { type: 'image/png' }),
      })
    )
    storedMedia.set(
      '12:reference-one',
      new Blob(['one'], { type: 'image/png' })
    )
    storedMedia.set(
      '12:reference-two',
      new Blob(['two'], { type: 'image/png' })
    )
    let project = createStudioProject('Two references', 'two-references')
    project = addStudioNode(project, 'image', 'first')
    project = addStudioNode(project, 'image', 'second')
    project = addStudioNode(project, 'image', 'target')
    project = updateStudioNode(project, 'first', {
      mediaId: 'reference-one',
      status: 'completed',
    })
    project = updateStudioNode(project, 'second', {
      mediaId: 'reference-two',
      status: 'completed',
    })
    project = updateStudioNode(project, 'target', {
      model: 'image-model',
      prompt: 'change the lighting',
    })
    project.edges = [
      { id: 'first-reference', source: 'first', target: 'target' },
      { id: 'second-reference', source: 'second', target: 'target' },
    ]
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Image 3' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.generate' })
    )
    await waitFor(() =>
      expect(generateStudioImage).toHaveBeenCalledWith(
        'image-model',
        'change the lighting',
        expect.objectContaining({
          images: [
            expect.stringMatching(/^data:image\/png;base64,/),
            expect.stringMatching(/^data:image\/png;base64,/),
          ],
        })
      )
    )
  })
  test('shares one in-flight text request across two downstream video nodes', async () => {
    vi.mocked(fetchStudioProviderConfigs).mockResolvedValue({
      text: { kind: 'text', baseUrl: 'https://text.example/v1', hasKey: true },
    })
    vi.mocked(fetchStudioProviderModels).mockResolvedValue(['text-model'])
    let finishText!: (value: {
      text: string
      imagePrompt: string
      videoPrompt: string
    }) => void
    vi.mocked(generateStudioText).mockImplementation(
      () => new Promise((resolve) => (finishText = resolve))
    )
    vi.mocked(createStudioVideo).mockResolvedValue('task-shared')
    vi.mocked(getStudioVideoTask).mockResolvedValue({
      status: 'queued',
      progress: 0,
    })
    let project = createStudioProject('Shared', 'shared')
    project = addStudioNode(project, 'text', 'text')
    project = addStudioNode(project, 'video', 'video-a')
    project = addStudioNode(project, 'video', 'video-b')
    project = updateStudioNode(project, 'text', {
      model: 'text-model',
      prompt: 'A woman enters',
    })
    project = updateStudioNode(project, 'video-a', {
      model: '会员套餐甲',
      prompt: 'angle A',
    })
    project = updateStudioNode(project, 'video-b', {
      model: '会员套餐甲',
      prompt: 'angle B',
    })
    project.edges = [
      { id: 'a', source: 'text', target: 'video-a' },
      { id: 'b', source: 'text', target: 'video-b' },
    ]
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Video 2' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.generate' })
    )
    await waitFor(() => expect(generateStudioText).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Video 3' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.generate' })
    )
    expect(generateStudioText).toHaveBeenCalledOnce()
    finishText({
      text: 'A woman enters',
      imagePrompt: 'A still of a woman entering',
      videoPrompt: 'Camera follows her',
    })
    await waitFor(() => expect(createStudioVideo).toHaveBeenCalledTimes(2))
    expect(generateStudioText).toHaveBeenCalledOnce()
  })

  test('discards a late text response after its prompt changes', async () => {
    vi.mocked(fetchStudioProviderConfigs).mockResolvedValue({
      text: { kind: 'text', baseUrl: 'https://text.example/v1', hasKey: true },
    })
    vi.mocked(fetchStudioProviderModels).mockResolvedValue(['text-model'])
    let finishText!: (value: {
      text: string
      imagePrompt: string
      videoPrompt: string
    }) => void
    vi.mocked(generateStudioText).mockImplementation(
      () => new Promise((resolve) => (finishText = resolve))
    )
    let project = addStudioNode(
      createStudioProject('Stale', 'stale'),
      'text',
      'text'
    )
    project = updateStudioNode(project, 'text', {
      model: 'text-model',
      prompt: 'old prompt',
    })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Text 1' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.generate' })
    )
    await waitFor(() => expect(generateStudioText).toHaveBeenCalledOnce())
    fireEvent.change(screen.getByLabelText('studio.prompt'), {
      target: { value: 'new prompt' },
    })
    finishText({
      text: 'obsolete',
      imagePrompt: 'obsolete image',
      videoPrompt: 'obsolete video',
    })
    await waitFor(() => {
      const saved = JSON.parse(
        localStorage.getItem(studioProjectsKey(12)) || '{}'
      )
      expect(saved.projects[0].nodes[0].data.prompt).toBe('new prompt')
      expect(saved.projects[0].nodes[0].data.outputText).toBeUndefined()
      expect(saved.projects[0].nodes[0].data.takes).toBeUndefined()
    })
  })

  test('starts a fresh request for a changed prompt while the old call is pending', async () => {
    vi.mocked(fetchStudioProviderConfigs).mockResolvedValue({
      text: { kind: 'text', baseUrl: 'https://text.example/v1', hasKey: true },
    })
    vi.mocked(fetchStudioProviderModels).mockResolvedValue(['text-model'])
    const finishes: Array<
      (value: {
        text: string
        imagePrompt: string
        videoPrompt: string
      }) => void
    > = []
    vi.mocked(generateStudioText).mockImplementation(
      () => new Promise((resolve) => finishes.push(resolve))
    )
    let project = addStudioNode(
      createStudioProject('Edit', 'edit-text'),
      'text',
      'text'
    )
    project = updateStudioNode(project, 'text', {
      model: 'text-model',
      prompt: 'old brief',
    })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Text 1' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.generate' })
    )
    await waitFor(() => expect(generateStudioText).toHaveBeenCalledOnce())
    fireEvent.change(screen.getByLabelText('studio.prompt'), {
      target: { value: 'new brief' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'studio.generate' }))
    await waitFor(() => expect(generateStudioText).toHaveBeenCalledTimes(2))
    finishes[1]({
      text: 'new scene',
      imagePrompt: 'new image',
      videoPrompt: 'new video',
    })
    finishes[0]({
      text: 'old scene',
      imagePrompt: 'old image',
      videoPrompt: 'old video',
    })
    await waitFor(() => {
      const saved = JSON.parse(
        localStorage.getItem(studioProjectsKey(12)) || '{}'
      )
      expect(saved.projects[0].nodes[0].data.outputText).toBe('new scene')
      expect(saved.projects[0].nodes[0].data.takes).toHaveLength(1)
    })
  })

  test('recovers an unselected pending video take after project reload', async () => {
    vi.mocked(fetchStudioAttemptByRequest).mockResolvedValue({
      id: 'attempt-old',
      requestId: 'c3943135-fc77-4ca2-9378-d53fb5d8385b',
      group: 'default',
      model: '会员套餐甲',
      stage: 'submitted',
      httpStatus: 200,
      errorCode: '',
      channelId: 9,
      taskId: 'task-old',
      createdAt: '2026-09-26T00:00:00Z',
    })
    vi.mocked(getStudioVideoTask).mockResolvedValue({
      status: 'completed',
      progress: 100,
    })
    vi.mocked(getStudioVideoContentUrl).mockResolvedValue(
      'https://cdn.example/recovered.mp4'
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['video'], { type: 'video/mp4' }),
      })
    )
    let project = addStudioNode(
      createStudioProject('Recover', 'recover'),
      'video',
      'video'
    )
    project = updateStudioNode(project, 'video', {
      model: '会员套餐甲',
      prompt: 'a scene',
      status: 'idle',
      takes: [
        {
          id: 'pending',
          createdAt: 'now',
          model: '会员套餐甲',
          prompt: 'old scene',
          status: 'queued',
          taskId: 'task-old',
          clientRequestId: 'c3943135-fc77-4ca2-9378-d53fb5d8385b',
        },
      ],
    })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    await waitFor(() =>
      expect(getStudioVideoTask).toHaveBeenCalledWith('task-old')
    )
    await waitFor(() => {
      const saved = JSON.parse(
        localStorage.getItem(studioProjectsKey(12)) || '{}'
      )
      const node = saved.projects[0].nodes[0]
      expect(node.data.status).toBe('idle')
      expect(node.data.takes[0].status).toBe('completed')
      expect(node.data.takes[0].mediaId).toBeTruthy()
      expect(node.data.takes[0].channelId).toBe(9)
    })
  })

  test('requires explicit confirmation before creating a billable video task', async () => {
    preflightTestState.autoConfirm = false
    vi.mocked(createStudioVideo).mockResolvedValue('task-confirmed')
    vi.mocked(getStudioVideoTask).mockResolvedValue({
      status: 'queued',
      progress: 0,
    })
    let project = addStudioNode(
      createStudioProject('Confirm', 'confirm'),
      'video',
      'video'
    )
    project = updateStudioNode(project, 'video', {
      model: '会员套餐甲',
      prompt: 'A walking subject',
    })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Video 1' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.generate' })
    )
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(createStudioVideo).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: 'studio.preflight.cancel' })
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(createStudioVideo).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'studio.generate' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.preflight.confirm' })
    )
    await waitFor(() => expect(createStudioVideo).toHaveBeenCalledOnce())
  })

  test('a partial saved text revision stays authoritative for downstream video', async () => {
    vi.mocked(createStudioVideo).mockResolvedValue('task-revision')
    vi.mocked(getStudioVideoTask).mockResolvedValue({
      status: 'queued',
      progress: 0,
    })
    let project = addStudioShot(
      createStudioProject('Revision', 'p-revision'),
      'shot-1',
      { text: 'text', image: 'image', video: 'video' },
      'Opening'
    )
    project = updateStudioNode(project, 'text', {
      model: 'writer-model',
      prompt: 'Original brief',
    })
    project = recordStudioTake(project, 'text', {
      id: 'manual-revision',
      createdAt: '2026-09-26T00:00:00Z',
      prompt: 'Original brief',
      status: 'completed',
      outputText: 'Revised scene',
      outputImagePrompt: '',
      outputVideoPrompt: '',
    })
    project = updateStudioNode(project, 'video', { model: '会员套餐甲' })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.shot.generateVideo' })
    )
    await waitFor(() => expect(createStudioVideo).toHaveBeenCalledOnce())
    expect(generateStudioText).not.toHaveBeenCalled()
    expect(createStudioVideo).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Revised scene' }),
      'default',
      expect.any(String)
    )
  })

  test('copies a completed previous shot frame into the next manual image node', async () => {
    vi.mocked(captureStudioLastFrame).mockResolvedValue(
      new Blob(['png'], { type: 'image/png' })
    )
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:qa-frame')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    storedMedia.set(
      '12:previous-clip',
      new Blob(['video'], { type: 'video/mp4' })
    )
    let project = addStudioShot(
      createStudioProject('Continue', 'p-continue'),
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
      mediaId: 'previous-clip',
    })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'studio.shot.usePreviousFrame',
      })
    )
    await waitFor(() => {
      const saved = JSON.parse(
        localStorage.getItem(studioProjectsKey(12)) || '{}'
      )
      const image = saved.projects[0].nodes.find(
        (node: StudioCanvasNode) => node.id === 'i2'
      )
      expect(image.data).toMatchObject({ status: 'completed' })
      expect(image.data.model).toBeUndefined()
      expect(image.data.mediaId).toBeTruthy()
      expect(storedMedia.get(`12:${image.data.mediaId}`)?.type).toBe(
        'image/png'
      )
    })
    expect(captureStudioLastFrame).toHaveBeenCalledWith(expect.any(Blob))
  })

  test('keeps a video task discoverable if the prompt changes during submission', async () => {
    let finishSubmit!: (taskId: string) => void
    vi.mocked(createStudioVideo).mockImplementation(
      () => new Promise((resolve) => (finishSubmit = resolve))
    )
    vi.mocked(getStudioVideoTask).mockResolvedValue({
      status: 'queued',
      progress: 0,
    })
    let project = addStudioNode(
      createStudioProject('Pending', 'pending'),
      'video',
      'video'
    )
    project = updateStudioNode(project, 'video', {
      model: '会员套餐甲',
      prompt: 'old camera move',
    })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Video 1' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.generate' })
    )
    await waitFor(() => expect(createStudioVideo).toHaveBeenCalledOnce())
    fireEvent.change(screen.getByLabelText('studio.prompt'), {
      target: { value: 'new camera move' },
    })
    finishSubmit('task-old-input')
    await waitFor(() => {
      const saved = JSON.parse(
        localStorage.getItem(studioProjectsKey(12)) || '{}'
      )
      const node = saved.projects[0].nodes[0]
      expect(node.data.prompt).toBe('new camera move')
      expect(node.data.selectedTakeId).toBeUndefined()
      expect(node.data.takes[0].taskId).toBe('task-old-input')
      expect(node.data.pendingRequestId).toBeUndefined()
    })
  })
  test('clears an old final video when a source shot is regenerated', async () => {
    vi.mocked(createStudioVideo).mockResolvedValue('task-new')
    let project = addStudioShot(
      createStudioProject('Drama', 'p1'),
      'shot-1',
      { text: 't1', image: 'i1', video: 'v1' },
      'Opening'
    )
    project = ensureStudioFinalVideo(project, 'final')
    project = updateStudioNode(project, 'v1', {
      model: '会员套餐甲',
      prompt: 'New view',
    })
    project = updateStudioNode(project, 'final', {
      model: '会员套餐甲',
      prompt: 'Join',
    })
    project = updateStudioNode(project, 'final', {
      status: 'completed',
      taskId: 'old-final',
    })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.shot.generateVideo' })
    )
    await waitFor(() => expect(createStudioVideo).toHaveBeenCalledOnce())
    await waitFor(() => {
      const saved = JSON.parse(
        localStorage.getItem(studioProjectsKey(12)) || '{}'
      )
      const finalNode = saved.projects?.[0]?.nodes?.find(
        (node: StudioCanvasNode) => node.id === 'final'
      )
      expect(finalNode?.data.status).toBe('idle')
      expect(finalNode?.data.taskId).toBeUndefined()
    })
  })
  test('keeps a queued upstream video alive after a local dependent wait deadline', async () => {
    vi.mocked(getStudioVideoTask).mockResolvedValue({
      status: 'queued',
      progress: 15,
    })
    let project = addStudioShot(
      createStudioProject('Waiting', 'p-wait'),
      'shot-1',
      { text: 'text', image: 'image', video: 'shot-video' },
      'Opening'
    )
    project = ensureStudioFinalVideo(project, 'final')
    project = updateStudioNode(project, 'shot-video', {
      model: '会员套餐甲',
      prompt: 'Previous shot',
    })
    project = updateStudioNode(project, 'shot-video', {
      status: 'queued',
      taskId: 'running-task',
    })
    project = updateStudioNode(project, 'final', {
      model: '会员套餐甲',
      prompt: 'Continue',
    })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    let tick = 0
    vi.spyOn(Date, 'now').mockImplementation(() => {
      tick += 21 * 60_000
      return tick
    })
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.final.aiGenerate' })
    )
    await waitFor(() => {
      const saved = JSON.parse(
        localStorage.getItem(studioProjectsKey(12)) || '{}'
      )
      const upstream = saved.projects[0].nodes.find(
        (node: StudioCanvasNode) => node.id === 'shot-video'
      )
      const final = saved.projects[0].nodes.find(
        (node: StudioCanvasNode) => node.id === 'final'
      )
      expect(upstream.data).toMatchObject({
        taskId: 'running-task',
        status: 'queued',
      })
      expect(final.data).toMatchObject({
        status: 'idle',
        error: 'studio.video.upstreamTimeout',
      })
    })
    expect(createStudioVideo).not.toHaveBeenCalled()
  })
  test('submits completed storyboard videos to the final model in shot order', async () => {
    vi.mocked(getStudioVideoContentUrl).mockImplementation(
      async (taskId) => `https://cdn.example/${taskId}.mp4`
    )
    vi.mocked(createStudioVideo).mockResolvedValue('task-final')
    let project = createStudioProject('Drama', 'p-drama')
    project = addStudioShot(
      project,
      'shot-1',
      { text: 't1', image: 'i1', video: 'v1' },
      'Opening'
    )
    project = addStudioShot(
      project,
      'shot-2',
      { text: 't2', image: 'i2', video: 'v2' },
      'Arrival'
    )
    project = ensureStudioFinalVideo(project, 'final')
    project = updateStudioNode(project, 'v1', {
      taskId: 'task-1',
      status: 'completed',
    })
    project = updateStudioNode(project, 'v2', {
      taskId: 'task-2',
      status: 'completed',
    })
    project = updateStudioNode(project, 'final', {
      model: '会员套餐甲',
      prompt: 'Connect the scenes',
    })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.final.aiGenerate' })
    )
    await waitFor(() =>
      expect(createStudioVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            content: [
              {
                type: 'video_url',
                role: 'reference_video',
                video_url: { url: 'https://cdn.example/task-1.mp4' },
              },
              {
                type: 'video_url',
                role: 'reference_video',
                video_url: { url: 'https://cdn.example/task-2.mp4' },
              },
            ],
          }),
        }),
        'default',
        expect.any(String)
      )
    )
  })
  test('generates a storyboard video from manual text without requiring an image', async () => {
    vi.mocked(createStudioVideo).mockResolvedValue('task-text-only')
    let project = addStudioShot(
      createStudioProject('Text scene', 'p-text'),
      'shot-1',
      { text: 't1', image: 'i1', video: 'v1' },
      'Text scene'
    )
    project = updateStudioNode(project, 't1', { prompt: 'A quiet village' })
    project = updateStudioNode(project, 'v1', { model: '会员套餐甲' })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.shot.generateVideo' })
    )
    await waitFor(() =>
      expect(createStudioVideo).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'A quiet village' }),
        'default',
        expect.any(String)
      )
    )
    expect(generateStudioImage).not.toHaveBeenCalled()
  })

  test('generates a storyboard video from an uploaded image without requiring text', async () => {
    vi.mocked(createStudioVideo).mockResolvedValue('task-image-only')
    storedMedia.set('12:upload-1', new Blob(['image'], { type: 'image/png' }))
    let project = addStudioShot(
      createStudioProject('Image scene', 'p-image'),
      'shot-1',
      { text: 't1', image: 'i1', video: 'v1' },
      'Image scene'
    )
    project = updateStudioNode(project, 'i1', {
      mediaId: 'upload-1',
      status: 'completed',
    })
    project = updateStudioNode(project, 'v1', {
      model: '会员套餐甲',
      prompt: 'Slow camera pan',
    })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.shot.generateVideo' })
    )
    await waitFor(() =>
      expect(createStudioVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Slow camera pan',
          images: [expect.stringMatching(/^data:image\/png;base64,/)],
        }),
        'default',
        expect.any(String)
      )
    )
    expect(generateStudioText).not.toHaveBeenCalled()
  })
  test('adds a final video connected to storyboard shots', async () => {
    let project = createStudioProject('Drama', 'p-drama')
    project = addStudioShot(
      project,
      'shot-1',
      { text: 't1', image: 'i1', video: 'v1' },
      'Opening'
    )
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.final.aiCreate' })
    )
    await waitFor(() => {
      const saved = JSON.parse(
        localStorage.getItem(studioProjectsKey(12)) || '{}'
      )
      const finalId = saved.projects?.[0]?.finalVideoNodeId
      expect(finalId).toBeTruthy()
      expect(
        saved.projects[0].edges.some(
          (edge: { source: string; target: string }) =>
            edge.source === 'v1' && edge.target === finalId
        )
      ).toBe(true)
    })
    expect(
      screen.getByRole('button', { name: 'studio.shot.editFinal' })
    ).toBeTruthy()
  })
  test('submits missing storyboard videos in shot order', async () => {
    vi.mocked(fetchStudioProviderConfigs).mockResolvedValue({
      image: {
        kind: 'image',
        baseUrl: 'https://image.example/v1',
        hasKey: true,
      },
    })
    vi.mocked(fetchStudioProviderModels).mockResolvedValue(['image-model'])
    vi.mocked(generateStudioImage).mockResolvedValue({
      url: 'https://cdn.example/frame.png',
    })
    vi.mocked(createStudioVideo)
      .mockResolvedValueOnce('task-1')
      .mockResolvedValueOnce('task-2')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['image'], { type: 'image/png' }),
      })
    )
    let project = createStudioProject('Drama', 'p-drama')
    project = addStudioShot(
      project,
      'shot-1',
      { text: 't1', image: 'i1', video: 'v1' },
      'Opening'
    )
    project = addStudioShot(
      project,
      'shot-2',
      { text: 't2', image: 'i2', video: 'v2' },
      'Arrival'
    )
    project = updateStudioNode(project, 't1', { prompt: 'Scene one' })
    project = updateStudioNode(project, 't2', { prompt: 'Scene two' })
    project = updateStudioNode(project, 'i1', { model: 'image-model' })
    project = updateStudioNode(project, 'i2', { model: 'image-model' })
    project = updateStudioNode(project, 'v1', {
      model: '会员套餐甲',
      prompt: 'camera moves',
    })
    project = updateStudioNode(project, 'v2', {
      model: '会员套餐甲',
      prompt: 'camera follows',
    })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.shot.generateAll' })
    )
    await waitFor(() => expect(createStudioVideo).toHaveBeenCalledTimes(2))
    expect(generateStudioImage).toHaveBeenCalledTimes(2)
  })
  test('honors the editable batch submission limit', async () => {
    vi.mocked(createStudioVideo).mockResolvedValue('task-batch')
    vi.mocked(getStudioVideoTask).mockResolvedValue({
      status: 'queued',
      progress: 0,
    })
    let project = createStudioProject('Capped', 'capped')
    project = addStudioShot(
      project,
      'shot-1',
      { text: 't1', image: 'i1', video: 'v1' },
      'First'
    )
    project = addStudioShot(
      project,
      'shot-2',
      { text: 't2', image: 'i2', video: 'v2' },
      'Second'
    )
    project = updateStudioNode(project, 't1', { prompt: 'scene one' })
    project = updateStudioNode(project, 't2', { prompt: 'scene two' })
    project = updateStudioNode(project, 'v1', {
      model: '会员套餐甲',
      prompt: 'camera one',
    })
    project = updateStudioNode(project, 'v2', {
      model: '会员套餐甲',
      prompt: 'camera two',
    })
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.change(await screen.findByLabelText('studio.batch.limit'), {
      target: { value: '1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'studio.shot.generateAll' })
    )
    await waitFor(() => expect(createStudioVideo).toHaveBeenCalledOnce())
  })

  test('batch overview still confirms each exact billable request and stops on cancel', async () => {
    preflightTestState.autoConfirm = false
    vi.mocked(createStudioVideo).mockResolvedValue('task-batch-confirmed')
    vi.mocked(getStudioVideoTask).mockResolvedValue({
      status: 'queued',
      progress: 0,
    })
    let project = createStudioProject('Batch confirmations', 'p-batch-confirm')
    for (const number of [1, 2, 3]) {
      project = addStudioShot(
        project,
        `shot-${number}`,
        {
          text: `text-${number}`,
          image: `image-${number}`,
          video: `video-${number}`,
        },
        `Shot ${number}`
      )
      project = updateStudioNode(project, `video-${number}`, {
        model: '会员套餐甲',
        prompt: `Scene ${number}`,
      })
    }
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.shot.generateAll' })
    )
    expect(await screen.findByRole('dialog', { name: 'batch' })).toBeTruthy()
    expect(createStudioVideo).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: 'studio.preflight.confirm' })
    )
    expect(await screen.findByRole('dialog', { name: 'video' })).toBeTruthy()
    expect(createStudioVideo).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: 'studio.preflight.confirm' })
    )
    await waitFor(() => expect(createStudioVideo).toHaveBeenCalledOnce())
    expect(await screen.findByRole('dialog', { name: 'video' })).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'studio.preflight.cancel' })
    )
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(
        screen.getByRole('button', { name: 'studio.shot.generateAll' })
      ).toBeTruthy()
    })
    expect(createStudioVideo).toHaveBeenCalledOnce()
  })
  test('creates a storyboard shot within the current New API project', async () => {
    render(<Studio />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.shot.add' })
    )
    expect(await screen.findByText('studio.shot.title')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'studio.shot.editImage' })
    ).toBeTruthy()
    await waitFor(() =>
      expect(localStorage.getItem(studioProjectsKey(12))).toContain(
        'textNodeId'
      )
    )
  })
  test('opens the account submission history from the workbench', async () => {
    vi.mocked(fetchStudioAttempts).mockResolvedValue([
      {
        id: 'attempt-1',
        group: 'default',
        model: '会员套餐甲',
        stage: 'rejected_after_channel',
        httpStatus: 400,
        errorCode: 'upstream_rejected',
        channelId: 7,
        taskId: '',
        createdAt: '2026-09-25T00:00:00Z',
      },
    ])
    render(<Studio />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.attempt.title' })
    )
    expect(await screen.findByText('upstream_rejected')).toBeTruthy()
  })
  test('submits an unknown alias with editable parameters and metadata', async () => {
    let project = addStudioNode(
      createStudioProject('Custom', 'p-custom'),
      'video',
      'v-custom'
    )
    project = updateStudioNode(project, 'v-custom', {
      model: '会员套餐甲',
      prompt: 'a cinematic city',
      seconds: 30,
      resolution: 'custom-1536',
      ratio: '2:3',
      metadataJson: '{"aigc_watermark":false}',
    })
    saveStudioProjects(localStorage, 12, [project])
    vi.mocked(createStudioVideo).mockResolvedValue('task-custom')
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Video 1' }))
    const button = await screen.findByRole('button', {
      name: 'studio.generate',
    })
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false)
    )
    fireEvent.click(button)
    await waitFor(() =>
      expect(createStudioVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          model: '会员套餐甲',
          seconds: '30',
          metadata: expect.objectContaining({
            resolution: 'custom-1536',
            ratio: '2:3',
            aigc_watermark: false,
          }),
        }),
        'default',
        expect.any(String)
      )
    )
  })
  test('regenerates an image after its upstream manual text changes', async () => {
    vi.mocked(fetchStudioProviderConfigs).mockResolvedValue({
      image: {
        kind: 'image',
        baseUrl: 'https://image.example/v1',
        hasKey: true,
      },
    })
    vi.mocked(fetchStudioProviderModels).mockResolvedValue(['image-model'])
    vi.mocked(generateStudioImage).mockResolvedValue({
      url: 'https://cdn.example/new.png',
    })
    vi.mocked(createStudioVideo).mockResolvedValue('task-refreshed')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['new image'], { type: 'image/png' }),
      })
    )
    let project = createStudioProject('Refresh', 'project-refresh')
    project = addStudioNode(project, 'text', 'text-1')
    project = addStudioNode(project, 'image', 'image-1')
    project = addStudioNode(project, 'video', 'video-1')
    project = updateStudioNode(project, 'text-1', { prompt: 'Old scene' })
    project = updateStudioNode(project, 'image-1', { model: 'image-model' })
    project = updateStudioNode(project, 'image-1', {
      status: 'completed',
      outputUrl: 'https://cdn.example/old.png',
    })
    project = updateStudioNode(project, 'video-1', {
      model: '会员套餐甲',
      videoFamily: 'seedance-2',
      resolution: '720p',
      prompt: 'slow camera move',
    })
    project.edges = [
      { id: 'ti', source: 'text-1', target: 'image-1' },
      { id: 'iv', source: 'image-1', target: 'video-1' },
    ]
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Text 1' }))
    fireEvent.change(screen.getByLabelText('studio.prompt'), {
      target: { value: 'New scene' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Video 3' }))
    const button = screen.getByRole('button', { name: 'studio.generate' })
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false)
    )
    fireEvent.click(button)
    await waitFor(() =>
      expect(generateStudioImage).toHaveBeenCalledWith(
        'image-model',
        'New scene'
      )
    )
    await waitFor(() =>
      expect(createStudioVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          images: [expect.stringMatching(/^data:image\/png;base64,/)],
        }),
        'default',
        expect.any(String)
      )
    )
  })

  test('uses a manual text prompt and an uploaded local image without external models', async () => {
    vi.mocked(createStudioVideo).mockResolvedValue('task-manual')
    let project = createStudioProject('Manual sources', 'project-manual')
    project = addStudioNode(project, 'text', 'text-manual')
    project = addStudioNode(project, 'image', 'image-manual')
    project = addStudioNode(project, 'video', 'video-manual')
    project = updateStudioNode(project, 'text-manual', {
      prompt: 'A quiet village',
    })
    project = updateStudioNode(project, 'video-manual', {
      model: '会员套餐甲',
      videoFamily: 'seedance-2',
      resolution: '720p',
    })
    project.edges = [
      { id: 'text-video', source: 'text-manual', target: 'video-manual' },
      { id: 'image-video', source: 'image-manual', target: 'video-manual' },
    ]
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Image 2' }))
    const image = new File(['image bytes'], 'frame.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('studio.image.local'), {
      target: { files: [image] },
    })
    await waitFor(() => expect(storedMedia.size).toBe(1))
    fireEvent.click(screen.getByRole('button', { name: 'Video 3' }))
    const button = await screen.findByRole('button', {
      name: 'studio.generate',
    })
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false)
    )
    fireEvent.click(button)
    await waitFor(() =>
      expect(createStudioVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'A quiet village',
          images: [expect.stringMatching(/^data:image\/png;base64,/)],
        }),
        'default',
        expect.any(String)
      )
    )
    expect(generateStudioText).not.toHaveBeenCalled()
    expect(generateStudioImage).not.toHaveBeenCalled()
  })

  test('passes a completed upstream video into the final video request', async () => {
    vi.mocked(getStudioVideoContentUrl).mockResolvedValue(
      'https://new.thqllm.com/api/task/first/content?sig=abc'
    )
    vi.mocked(createStudioVideo).mockResolvedValue('task-final')
    let project = createStudioProject('Sequence', 'project-sequence')
    project = addStudioNode(project, 'video', 'video-first')
    project = addStudioNode(project, 'video', 'video-final')
    project = updateStudioNode(project, 'video-first', {
      prompt: 'establishing shot',
    })
    project = updateStudioNode(project, 'video-first', {
      taskId: 'task-first',
      status: 'completed',
    })
    project = updateStudioNode(project, 'video-final', {
      model: '会员套餐甲',
      videoFamily: 'seedance-2',
      resolution: '720p',
      prompt: 'continue the scene',
    })
    project.edges = [
      { id: 'video-video', source: 'video-first', target: 'video-final' },
    ]
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Video 2' }))
    const button = await screen.findByRole('button', {
      name: 'studio.generate',
    })
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false)
    )
    fireEvent.click(button)
    await waitFor(() =>
      expect(createStudioVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            content: [
              {
                type: 'video_url',
                role: 'reference_video',
                video_url: {
                  url: 'https://new.thqllm.com/api/task/first/content?sig=abc',
                },
              },
            ],
          }),
        }),
        'default',
        expect.any(String)
      )
    )
    expect(getStudioVideoContentUrl).toHaveBeenCalledWith('task-first')
  })

  test('an extend-video connection submits the previous last frame as a first frame', async () => {
    vi.mocked(captureStudioLastFrame).mockResolvedValue(
      new Blob(['png'], { type: 'image/png' })
    )
    vi.mocked(getStudioVideoContentUrl).mockResolvedValue(
      'https://new.thqllm.com/api/task/first/content?sig=abc'
    )
    vi.mocked(createStudioVideo).mockResolvedValue('task-next')
    storedMedia.set(
      '12:previous-clip',
      new Blob(['video'], { type: 'video/mp4' })
    )
    let project = createStudioProject('Continuation', 'p-extend')
    project = addStudioNode(project, 'video', 'first')
    project = addStudioNode(project, 'video', 'next')
    project = updateStudioNode(project, 'first', {
      status: 'completed',
      taskId: 'task-first',
      mediaId: 'previous-clip',
    })
    project = updateStudioNode(project, 'next', {
      model: '会员套餐甲',
      prompt: 'continue walking',
    })
    project.edges = [
      {
        id: 'continue',
        source: 'first',
        sourceHandle: 'video',
        target: 'next',
        targetHandle: 'extend_video',
      },
    ]
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Video 2' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.generate' })
    )
    await waitFor(() =>
      expect(createStudioVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          images: [expect.stringMatching(/^data:image\/png;base64,/)],
          metadata: expect.not.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({ type: 'video_url' }),
            ]),
          }),
        }),
        'default',
        expect.any(String)
      )
    )
    expect(captureStudioLastFrame).toHaveBeenCalledWith(expect.any(Blob))
  })

  test('a native extension connection sends the source clip and an extend request', async () => {
    vi.mocked(getStudioVideoContentUrl).mockResolvedValue(
      'https://new.thqllm.com/api/task/first/content?sig=abc'
    )
    vi.mocked(createStudioVideo).mockResolvedValue('task-next')
    let project = createStudioProject('Native extension', 'p-native-extend')
    project = addStudioNode(project, 'video', 'first')
    project = addStudioNode(project, 'video', 'next')
    project = updateStudioNode(project, 'first', {
      status: 'completed',
      taskId: 'task-first',
    })
    project = updateStudioNode(project, 'next', {
      model: '会员套餐甲',
      prompt: 'continue walking',
    })
    project.edges = [
      {
        id: 'native',
        source: 'first',
        sourceHandle: 'video',
        target: 'next',
        targetHandle: 'native_extend',
      },
    ]
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Video 2' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.generate' })
    )
    await waitFor(() =>
      expect(createStudioVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'extend',
          metadata: expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'video_url',
                video_url: {
                  url: 'https://new.thqllm.com/api/task/first/content?sig=abc',
                },
              }),
            ]),
          }),
        }),
        'default',
        expect.any(String)
      )
    )
    expect(captureStudioLastFrame).not.toHaveBeenCalled()
  })

  test('a pinned image connection sends its version while another take is selected', async () => {
    vi.mocked(createStudioVideo).mockResolvedValue('task-pinned')
    storedMedia.set('12:old-image', new Blob(['old'], { type: 'image/png' }))
    storedMedia.set('12:new-image', new Blob(['new'], { type: 'image/png' }))
    let project = createStudioProject('Pinned branch', 'p-pinned-branch')
    project = addStudioNode(project, 'image', 'image')
    project = addStudioNode(project, 'video', 'video')
    project = recordStudioTake(project, 'image', {
      id: 'old',
      createdAt: '2026-09-26T00:00:00Z',
      prompt: 'portrait',
      status: 'completed',
      mediaId: 'old-image',
    })
    project = recordStudioTake(project, 'image', {
      id: 'new',
      createdAt: '2026-09-26T00:01:00Z',
      prompt: 'portrait',
      status: 'completed',
      mediaId: 'new-image',
    })
    project = updateStudioNode(project, 'video', {
      model: '会员套餐甲',
      prompt: 'camera push',
    })
    project.edges = [
      {
        id: 'pinned-image',
        source: 'image',
        target: 'video',
        data: { sourceTakeId: 'old' },
      },
    ]
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Video 2' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.generate' })
    )
    await waitFor(() =>
      expect(createStudioVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          images: ['data:image/png;base64,b2xk'],
        }),
        'default',
        expect.any(String)
      )
    )
  })

  test('a pinned video connection refreshes that take’s content URL before submission', async () => {
    vi.mocked(getStudioVideoContentUrl).mockImplementation(
      async (taskId) => `https://new.thqllm.com/task/${taskId}?fresh=1`
    )
    vi.mocked(createStudioVideo).mockResolvedValue('task-next')
    let project = createStudioProject('Pinned clips', 'p-pinned-clips')
    project = addStudioNode(project, 'video', 'source')
    project = addStudioNode(project, 'video', 'target')
    project = recordStudioTake(project, 'source', {
      id: 'old',
      createdAt: '2026-09-26T00:00:00Z',
      prompt: 'opening',
      status: 'completed',
      taskId: 'task-old',
      outputUrl: 'https://new.thqllm.com/task/task-old?expired=1',
    })
    project = recordStudioTake(project, 'source', {
      id: 'new',
      createdAt: '2026-09-26T00:01:00Z',
      prompt: 'opening',
      status: 'completed',
      taskId: 'task-new',
      outputUrl: 'https://new.thqllm.com/task/task-new?fresh=1',
    })
    project = updateStudioNode(project, 'target', {
      model: '会员套餐甲',
      prompt: 'continuation',
    })
    project.edges = [
      {
        id: 'pinned-video',
        source: 'source',
        target: 'target',
        data: { sourceTakeId: 'old' },
      },
    ]
    saveStudioProjects(localStorage, 12, [project])
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Video 2' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.generate' })
    )
    await waitFor(() =>
      expect(createStudioVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            content: [
              expect.objectContaining({
                video_url: {
                  url: 'https://new.thqllm.com/task/task-old?fresh=1',
                },
              }),
            ],
          }),
        }),
        'default',
        expect.any(String)
      )
    )
    expect(getStudioVideoContentUrl).toHaveBeenCalledWith('task-old')
  })

  test('runs text and image ancestors before submitting the connected video', async () => {
    vi.mocked(fetchStudioProviderConfigs).mockResolvedValue({
      text: { kind: 'text', baseUrl: 'https://text.example/v1', hasKey: true },
      image: {
        kind: 'image',
        baseUrl: 'https://image.example/v1',
        hasKey: true,
      },
    })
    vi.mocked(fetchStudioProviderModels).mockImplementation(async (kind) =>
      kind === 'text' ? ['text-model'] : ['image-model']
    )
    vi.mocked(generateStudioText).mockResolvedValue({
      text: 'A woman at dusk',
      imagePrompt: 'A cinematic still of a woman at dusk',
      videoPrompt: 'She turns as the camera moves closer',
    })
    vi.mocked(generateStudioImage).mockResolvedValue({
      url: 'https://cdn.example/shot.png',
    })
    vi.mocked(createStudioVideo).mockResolvedValue('task-shot')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['image'], { type: 'image/png' }),
      })
    )
    let project = createStudioProject('Shot', 'project-shot')
    project = addStudioNode(project, 'text', 'text-1')
    project = addStudioNode(project, 'image', 'image-1')
    project = addStudioNode(project, 'video', 'video-1')
    project = updateStudioNode(project, 'text-1', {
      model: 'text-model',
      prompt: 'Describe the heroine',
    })
    project = updateStudioNode(project, 'image-1', {
      model: 'image-model',
      prompt: '',
    })
    project = updateStudioNode(project, 'video-1', {
      model: '会员套餐甲',
      videoFamily: 'seedance-2',
      resolution: '720p',
      prompt: 'camera pushes in',
    })
    project.edges = [
      { id: 'text-image', source: 'text-1', target: 'image-1' },
      { id: 'image-video', source: 'image-1', target: 'video-1' },
    ]
    saveStudioProjects(localStorage, 12, [project])

    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Video 3' }))
    const generateButton = await screen.findByRole('button', {
      name: 'studio.generate',
    })
    await waitFor(() =>
      expect((generateButton as HTMLButtonElement).disabled).toBe(false)
    )
    fireEvent.click(generateButton)
    await waitFor(() =>
      expect(createStudioVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'camera pushes in',
          images: [expect.stringMatching(/^data:image\/png;base64,/)],
        }),
        'default',
        expect.any(String)
      )
    )
    expect(generateStudioText).toHaveBeenCalledWith(
      'text-model',
      'Describe the heroine'
    )
    expect(generateStudioImage).toHaveBeenCalledWith(
      'image-model',
      'A cinematic still of a woman at dusk'
    )
    expect(
      vi.mocked(generateStudioText).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(generateStudioImage).mock.invocationCallOrder[0])
    expect(
      vi.mocked(generateStudioImage).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(createStudioVideo).mock.invocationCallOrder[0])
  })

  test('runs a connected text model before submitting a video with its result', async () => {
    vi.mocked(fetchStudioProviderConfigs).mockResolvedValue({
      text: { kind: 'text', baseUrl: 'https://text.example/v1', hasKey: true },
    })
    vi.mocked(fetchStudioProviderModels).mockResolvedValue(['text-model'])
    let finishText: (value: {
      text: string
      imagePrompt: string
      videoPrompt: string
    }) => void = () => undefined
    vi.mocked(generateStudioText).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishText = resolve
        })
    )
    vi.mocked(createStudioVideo).mockResolvedValue('task-connected')
    const text = addStudioNode(
      createStudioProject('Connected text', 'project-connected'),
      'text',
      'text-1'
    )
    const withVideo = addStudioNode(text, 'video', 'video-1')
    const project = {
      ...withVideo,
      edges: [{ id: 'text-video', source: 'text-1', target: 'video-1' }],
      nodes: withVideo.nodes.map((node) => {
        if (node.id === 'text-1') {
          return {
            ...node,
            data: {
              ...node.data,
              model: 'text-model',
              prompt: 'Describe her',
              outputText: '我先查看当前工作区',
              status: 'completed' as const,
            },
          }
        }
        return {
          ...node,
          data: {
            ...node.data,
            model: '会员套餐甲',
            videoFamily: 'seedance-2' as const,
            resolution: '720p',
            prompt: '',
          },
        }
      }),
    }
    saveStudioProjects(localStorage, 12, [project])

    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Video 2' }))
    const generateButton = await screen.findByRole('button', {
      name: 'studio.generate',
    })
    await waitFor(() =>
      expect((generateButton as HTMLButtonElement).disabled).toBe(false)
    )
    fireEvent.click(generateButton)
    await waitFor(() => expect(generateStudioText).toHaveBeenCalled())
    expect(createStudioVideo).not.toHaveBeenCalled()
    finishText({
      text: 'A beautiful woman',
      imagePrompt: 'A cinematic still of a beautiful woman',
      videoPrompt: 'She turns toward the camera',
    })
    await waitFor(() =>
      expect(createStudioVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'A beautiful woman\n\nShe turns toward the camera',
        }),
        'default',
        expect.any(String)
      )
    )
    expect(generateStudioText).toHaveBeenCalledWith(
      'text-model',
      'Describe her'
    )
    expect(
      vi.mocked(generateStudioText).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(createStudioVideo).mock.invocationCallOrder[0])
  })

  test('submits an arbitrary saved thirty-second alias without a name-based cap', async () => {
    const base = addStudioNode(
      createStudioProject('Thirty seconds', 'project-30'),
      'video',
      'video-30'
    )
    const project = updateStudioNode(base, 'video-30', {
      title: 'Thirty-second shot',
      model: '会员套餐甲',
      videoFamily: 'seedance-2',
      seconds: 30,
      resolution: '720p',
      prompt: 'a forest at sunrise',
    })
    localStorage.setItem(
      studioProjectsKey(12),
      JSON.stringify({ version: 1, projects: [project] })
    )
    vi.mocked(createStudioVideo).mockResolvedValue('task-30')
    vi.mocked(getStudioVideoTask).mockResolvedValue({
      status: 'queued',
      progress: 0,
    })
    render(<Studio />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Thirty-second shot' })
    )
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: 'studio.generate',
          }) as HTMLButtonElement
        ).disabled
      ).toBe(false)
    )
    fireEvent.click(screen.getByRole('button', { name: 'studio.generate' }))
    await waitFor(() =>
      expect(createStudioVideo).toHaveBeenCalledWith(
        expect.objectContaining({ model: '会员套餐甲', seconds: '30' }),
        'default',
        expect.any(String)
      )
    )
  })

  test('sends the selected Unicode group ID instead of its display label', async () => {
    const base = addStudioNode(
      createStudioProject('Group check', 'project-group'),
      'video',
      'video-group'
    )
    const project = updateStudioNode(base, 'video-group', {
      title: 'Grouped shot',
      group: '特价sd',
      model: '会员套餐甲',
      videoFamily: 'seedance-2.5',
      seconds: 30,
      resolution: '720p',
      prompt: 'a forest at sunrise',
    })
    localStorage.setItem(
      studioProjectsKey(12),
      JSON.stringify({ version: 1, projects: [project] })
    )
    vi.mocked(createStudioVideo).mockResolvedValue('task-group')
    vi.mocked(getStudioVideoTask).mockResolvedValue({
      status: 'queued',
      progress: 0,
    })
    render(<Studio />)
    fireEvent.click(await screen.findByRole('button', { name: 'Grouped shot' }))
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: 'studio.generate',
          }) as HTMLButtonElement
        ).disabled
      ).toBe(false)
    )
    fireEvent.click(screen.getByRole('button', { name: 'studio.generate' }))
    await waitFor(() =>
      expect(createStudioVideo).toHaveBeenCalledWith(
        expect.objectContaining({ model: '会员套餐甲', seconds: '30' }),
        '特价sd',
        expect.any(String)
      )
    )
  })

  test('polls a processing video on the schedule instead of every render', async () => {
    const base = addStudioNode(
      createStudioProject('Film', 'project-1'),
      'video',
      'video-1'
    )
    saveStudioProjects(localStorage, 12, [
      updateStudioNode(base, 'video-1', {
        taskId: 'task-1',
        status: 'processing',
      }),
    ])
    vi.mocked(getStudioVideoTask).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return { status: 'processing', progress: 5 }
    })
    const view = render(<Studio />)
    await waitFor(() => expect(getStudioVideoTask).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 140))
    const calls = vi.mocked(getStudioVideoTask).mock.calls.length
    view.unmount()
    expect(calls).toBeLessThanOrEqual(2)
  })

  test('explains that the project is unsaved when browser storage is full', async () => {
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
      function (this: Storage, key, value) {
        if (key.startsWith('newapi:studio:projects')) {
          throw new DOMException('Quota exceeded', 'QuotaExceededError')
        }
        return original.call(this, key, value)
      }
    )
    render(<Studio />)
    expect((await screen.findByRole('alert')).textContent).toContain(
      'studio.project.saveFailed'
    )
  })

  test('keeps the first account project separate when another account signs in', async () => {
    render(<Studio />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'studio.add.video' })
    )
    expect(screen.getByTestId('canvas-nodes').textContent).toContain('Video 1')
    await waitFor(() =>
      expect(
        localStorage.getItem('newapi:studio:projects:v1:user:12')
      ).toContain('Video 1')
    )

    useAuthStore.setState((state) => ({
      auth: {
        ...state.auth,
        user: { id: 13, username: 'two', role: 1, group: 'default' },
      },
    }))
    await screen.findByText('studio.shot.title')
    expect(screen.queryByText('Video 1')).toBeNull()
    expect(
      localStorage.getItem('newapi:studio:projects:v1:user:13')
    ).not.toContain('Video 1')
    expect(localStorage.getItem('newapi:studio:projects:v1:user:12')).toContain(
      'Video 1'
    )
  })
})
