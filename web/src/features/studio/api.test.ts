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
import { describe, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import {
  buildStudioImageRequest,
  createStudioVideo,
  fetchStudioAttemptByRequest,
  generateStudioText,
  parseStudioGroups,
  parseStudioAttempts,
  parseStudioImageResponse,
  parseStudioProviderConfigs,
  parseStudioProviderModels,
  parseStudioTaskResponse,
  parseStudioTextResponse,
  parseStudioVideoResponse,
} from './api'

describe('Studio relay responses', () => {
  test('parses submission attempts without exposing unexpected response fields', () => {
    expect(
      parseStudioAttempts({
        success: true,
        data: [
          {
            id: 'attempt-1',
            model: '轮换渠道-会员视频',
            group: '特价sd',
            stage: 'rejected_after_channel',
            http_status: 400,
            error_code: 'upstream_rejected',
            channel_id: 73,
            created_at: '2026-09-25T00:00:00Z',
            api_key: 'sk-private',
          },
        ],
      })
    ).toEqual([
      {
        id: 'attempt-1',
        model: '轮换渠道-会员视频',
        group: '特价sd',
        stage: 'rejected_after_channel',
        httpStatus: 400,
        errorCode: 'upstream_rejected',
        channelId: 73,
        taskId: '',
        createdAt: '2026-09-25T00:00:00Z',
      },
    ])
  })
  test('sends Unicode group IDs as URL parameters instead of HTTP headers', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { id: 'task-1' } })
    const request = {
      model: '特价seedance-2.5-720p',
      prompt: 'forest',
      seconds: '30',
      metadata: { resolution: '720p', ratio: '16:9' },
    }
    try {
      expect(await createStudioVideo(request, '特价sd')).toBe('task-1')
      expect(post).toHaveBeenCalledWith('/pg/studio/videos', request, {
        params: { studio_group: '特价sd' },
      })
    } finally {
      post.mockRestore()
    }
  })
  test('uses a stable client request ID and can recover its task from an attempt', async () => {
    const request = {
      model: 'alias',
      prompt: 'scene',
      seconds: '5',
      metadata: {},
    }
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { id: 'task-1' } })
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 'attempt-1',
          request_id: 'c3943135-fc77-4ca2-9378-d53fb5d8385b',
          stage: 'submitted',
          task_id: 'task-1',
          http_status: 200,
        },
      },
    })
    try {
      expect(
        await createStudioVideo(
          request,
          'default',
          'c3943135-fc77-4ca2-9378-d53fb5d8385b'
        )
      ).toBe('task-1')
      expect(post).toHaveBeenCalledWith('/pg/studio/videos', request, {
        params: { studio_group: 'default' },
        headers: {
          'X-Studio-Request-ID': 'c3943135-fc77-4ca2-9378-d53fb5d8385b',
        },
      })
      expect(
        await fetchStudioAttemptByRequest(
          'c3943135-fc77-4ca2-9378-d53fb5d8385b'
        )
      ).toMatchObject({
        id: 'attempt-1',
        taskId: 'task-1',
        stage: 'submitted',
      })
    } finally {
      post.mockRestore()
      get.mockRestore()
    }
  })
  test('reads settled task quota and channel for a completed video', () => {
    expect(
      parseStudioTaskResponse(
        {
          success: true,
          data: {
            items: [
              {
                task_id: 'task-1',
                status: 'SUCCESS',
                progress: '100%',
                quota: 350000,
                channel_id: 14,
              },
            ],
          },
        },
        'task-1'
      )
    ).toEqual({
      status: 'completed',
      progress: 100,
      chargedQuota: 350000,
      channelId: 14,
    })
  })
  test('includes the submission ID when the video relay rejects before a task exists', async () => {
    const post = vi.spyOn(api, 'post').mockRejectedValue({
      message: 'duration unsupported',
      response: { headers: { 'x-studio-attempt-id': 'attempt-123' } },
    })
    try {
      const submission = createStudioVideo(
        {
          model: 'rotating-alias',
          prompt: 'scene',
          seconds: '30',
          metadata: {},
        },
        'default'
      )
      await expect(submission).rejects.toThrow('duration unsupported')
      expect(post).toHaveBeenCalledTimes(1)
      const lastError: unknown = await submission.catch(
        (error: unknown) => error
      )
      expect(lastError).toBeInstanceOf(Error)
      expect((lastError as Error).message).toContain('attempt-123')
    } finally {
      post.mockRestore()
    }
  })
  test('lists selectable account groups and excludes automatic routing', () => {
    expect(
      parseStudioGroups({
        success: true,
        data: {
          premium: { desc: 'Premium', ratio: 2 },
          auto: { desc: 'Auto', ratio: 'auto' },
          default: { desc: 'Default', ratio: 1 },
        },
      })
    ).toEqual([
      { id: 'default', description: 'Default' },
      { id: 'premium', description: 'Premium' },
    ])
  })

  test('parses external provider settings without retaining a returned key', () => {
    expect(
      parseStudioProviderConfigs({
        success: true,
        data: [
          {
            kind: 'text',
            base_url: 'https://api.example.com/v1',
            has_key: true,
            api_key: 'should-not-survive',
          },
        ],
      })
    ).toEqual({
      text: {
        kind: 'text',
        baseUrl: 'https://api.example.com/v1',
        hasKey: true,
      },
    })
    expect(
      parseStudioProviderModels({ success: true, data: ['model-a', 'model-b'] })
    ).toEqual(['model-a', 'model-b'])
  })

  test('parses the server-proxied text and image result', () => {
    expect(
      parseStudioTextResponse({
        success: true,
        data: {
          text: 'scene one',
          image_prompt: 'a still frame of scene one',
          video_prompt: 'the camera moves through scene one',
        },
      })
    ).toEqual({
      text: 'scene one',
      imagePrompt: 'a still frame of scene one',
      videoPrompt: 'the camera moves through scene one',
    })
    expect(
      parseStudioImageResponse({
        success: true,
        data: { url: 'https://cdn.example/frame.png' },
      })
    ).toEqual({ url: 'https://cdn.example/frame.png' })
  })
  test('plain text mode sends an explicit mode and supplies connected prompts', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: { text: 'A woman walks into the frame.' } },
    })
    try {
      expect(
        await generateStudioText('writer', 'Describe a woman', 'plain')
      ).toEqual({
        text: 'A woman walks into the frame.',
        imagePrompt: 'A woman walks into the frame.',
        videoPrompt: 'A woman walks into the frame.',
      })
      expect(post).toHaveBeenCalledWith('/api/studio/providers/text/generate', {
        model: 'writer',
        prompt: 'Describe a woman',
        mode: 'plain',
      })
    } finally {
      post.mockRestore()
    }
  })

  test('lets each image model choose its own default output size', () => {
    expect(
      buildStudioImageRequest('doubao-seedream-5-0-lite-260128', 'forest')
    ).toEqual({ model: 'doubao-seedream-5-0-lite-260128', prompt: 'forest' })
  })
  test('sends model-specific image options and retains returned variants', () => {
    expect(
      buildStudioImageRequest('image-model', 'forest', {
        size: '1536x1024',
        quality: 'high',
        n: 2,
        image: 'data:image/png;base64,AAAA',
      })
    ).toEqual({
      model: 'image-model',
      prompt: 'forest',
      size: '1536x1024',
      quality: 'high',
      n: 2,
      image: 'data:image/png;base64,AAAA',
    })
    expect(
      parseStudioImageResponse({
        success: true,
        data: {
          url: 'https://cdn.example/1.png',
          urls: ['https://cdn.example/1.png', 'https://cdn.example/2.png'],
        },
      })
    ).toEqual({
      url: 'https://cdn.example/1.png',
      urls: ['https://cdn.example/1.png', 'https://cdn.example/2.png'],
    })
    expect(
      buildStudioImageRequest('image-model', 'scene', {
        images: ['data:image/png;base64,AAAA', 'data:image/png;base64,BBBB'],
      })
    ).toEqual({
      model: 'image-model',
      prompt: 'scene',
      images: ['data:image/png;base64,AAAA', 'data:image/png;base64,BBBB'],
    })
  })
  test('accepts the image URL returned by the OpenAI image contract', () => {
    expect(
      parseStudioImageResponse({
        data: [{ url: 'https://cdn.example/result.png' }],
      })
    ).toEqual({
      url: 'https://cdn.example/result.png',
    })
  })

  test('accepts inline image bytes when a provider returns them', () => {
    expect(
      parseStudioImageResponse({ data: [{ b64_json: 'aGVsbG8=' }] })
    ).toEqual({
      url: 'data:image/png;base64,aGVsbG8=',
    })
  })

  test('rejects an image response without media', () => {
    expect(() =>
      parseStudioImageResponse({ data: [{ revised_prompt: 'cat' }] })
    ).toThrow('image')
  })

  test('reads a video task ID without relying on the upstream private ID', () => {
    expect(
      parseStudioVideoResponse({ id: 'task_public', status: 'queued' })
    ).toBe('task_public')
    expect(() => parseStudioVideoResponse({ status: 'queued' })).toThrow(
      'task ID'
    )
  })

  test('rejects text results without both downstream prompts', () => {
    expect(() =>
      parseStudioTextResponse({ success: true, data: { text: 'chat reply' } })
    ).toThrow('text')
  })

  test('maps the owning user task response into visible progress', () => {
    expect(
      parseStudioTaskResponse(
        {
          success: true,
          data: {
            items: [
              {
                task_id: 'task_public',
                status: 'IN_PROGRESS',
                progress: '65%',
              },
            ],
          },
        },
        'task_public'
      )
    ).toEqual({
      status: 'processing',
      progress: 65,
    })
    expect(
      parseStudioTaskResponse(
        {
          success: true,
          data: {
            items: [
              { task_id: 'task_public', status: 'SUCCESS', progress: '100%' },
            ],
          },
        },
        'task_public'
      )
    ).toEqual({
      status: 'completed',
      progress: 100,
    })
  })

  test('refuses a task record that belongs to a different ID', () => {
    expect(() =>
      parseStudioTaskResponse(
        {
          success: true,
          data: { items: [{ task_id: 'other', status: 'SUCCESS' }] },
        },
        'task_public'
      )
    ).toThrow('task')
  })
})
