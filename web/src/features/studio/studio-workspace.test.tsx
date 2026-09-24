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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import {
  createStudioVideo,
  fetchStudioProviderConfigs,
  fetchStudioAttempts,
  fetchStudioProviderModels,
  generateStudioImage,
  generateStudioText,
  getStudioVideoContentUrl,
  getStudioVideoTask,
} from './api'
import type { StudioCanvasNode } from './canvas-flow'
import { Studio } from './index'
import { saveStudioProjects, studioProjectsKey } from './local-projects'
import {
  addStudioNode,
  addStudioShot,
  createStudioProject,
  ensureStudioFinalVideo,
  updateStudioNode,
} from './workspace'

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
  fetchStudioModels: async () => ['MiniMax-H3', '会员套餐甲'],
  fetchStudioProviderConfigs: vi.fn(async () => ({})),
  fetchStudioAttempts: vi.fn(async () => []),
  fetchStudioProviderModels: vi.fn(),
  saveStudioProviderConfig: vi.fn(),
  deleteStudioProviderConfig: vi.fn(),
  generateStudioText: vi.fn(),
  generateStudioImage: vi.fn(),
  createStudioVideo: vi.fn(),
  getStudioVideoTask: vi.fn(),
  getStudioVideoContentUrl: vi.fn(),
}))
const storedMedia = new Map<string, Blob>()
vi.mock('./media-store', () => ({
  studioMediaStore: () => ({
    get: async (userId: number, mediaId: string) =>
      storedMedia.get(`${userId}:${mediaId}`) || null,
    put: async (userId: number, mediaId: string, blob: Blob) => {
      storedMedia.set(`${userId}:${mediaId}`, blob)
    },
    delete: async (userId: number, mediaId: string) => {
      storedMedia.delete(`${userId}:${mediaId}`)
    },
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
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
      await screen.findByRole('button', { name: 'studio.shot.generateFinal' })
    )
    await waitFor(() =>
      expect(createStudioVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            content: [
              {
                type: 'video_url',
                video_url: { url: 'https://cdn.example/task-1.mp4' },
              },
              {
                type: 'video_url',
                video_url: { url: 'https://cdn.example/task-2.mp4' },
              },
            ],
          }),
        }),
        'default'
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
        'default'
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
        'default'
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
      await screen.findByRole('button', { name: 'studio.shot.createFinal' })
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
        'default'
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
        expect.objectContaining({ images: ['https://cdn.example/new.png'] }),
        'default'
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
        'default'
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
                video_url: {
                  url: 'https://new.thqllm.com/api/task/first/content?sig=abc',
                },
              },
            ],
          }),
        }),
        'default'
      )
    )
    expect(getStudioVideoContentUrl).toHaveBeenCalledWith('task-first')
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
    vi.mocked(generateStudioText).mockResolvedValue('A woman at dusk')
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
          images: ['https://cdn.example/shot.png'],
        }),
        'default'
      )
    )
    expect(generateStudioText).toHaveBeenCalledWith(
      'text-model',
      'Describe the heroine'
    )
    expect(generateStudioImage).toHaveBeenCalledWith(
      'image-model',
      'A woman at dusk'
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
    let finishText: (value: string) => void = () => undefined
    vi.mocked(generateStudioText).mockImplementation(
      () =>
        new Promise<string>((resolve) => {
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
            data: { ...node.data, model: 'text-model', prompt: 'Describe her' },
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
    finishText('A beautiful woman')
    await waitFor(() =>
      expect(createStudioVideo).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'A beautiful woman' }),
        'default'
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
        'default'
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
        '特价sd'
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

  test('keeps the first account canvas when another account signs in', async () => {
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
    await waitFor(() =>
      expect(screen.getByTestId('canvas-nodes').textContent).toBe('')
    )
    expect(
      localStorage.getItem('newapi:studio:projects:v1:user:13')
    ).not.toContain('Video 1')
    expect(localStorage.getItem('newapi:studio:projects:v1:user:12')).toContain(
      'Video 1'
    )
  })
})
