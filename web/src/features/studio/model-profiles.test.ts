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
import { describe, expect, test } from 'vitest'

import {
  buildStudioVideoModel,
  buildStudioVideoRequest,
  inferStudioVideoFamily,
  selectStudioVideoModels,
} from './model-profiles'

function videoModel(id: string) {
  const model = selectStudioVideoModels([id])[0]
  if (!model) throw new Error(`missing test model ${id}`)
  return model
}

describe('Studio video models', () => {
  test('accepts thirty seconds for an arbitrary site alias without duration words', () => {
    const model = buildStudioVideoModel('会员套餐甲', 'seedance-2')
    expect(
      buildStudioVideoRequest(model, {
        prompt: 'a quiet forest',
        seconds: 30,
        resolution: '720p',
        ratio: '16:9',
      }).seconds
    ).toBe('30')
  })
  test('recognizes the site Seedance 2.5 thirty-second alias', () => {
    const id = '特价-sd2.5三十秒'
    expect(inferStudioVideoFamily(id)).toBe('seedance-2.5')
    const model = buildStudioVideoModel(id, 'seedance-2.5')
    expect(model.maxSeconds).toBe(3600)
    expect(model.defaultSeconds).toBe(5)
    expect(model.resolutions).toEqual(['480p', '720p', '1080p'])
    expect(
      buildStudioVideoRequest(model, {
        prompt: 'a forest at sunrise',
        seconds: 30,
        resolution: '720p',
        ratio: '16:9',
      }).seconds
    ).toBe('30')
    expect(() =>
      buildStudioVideoRequest(model, {
        prompt: 'a forest at sunrise',
        seconds: 3601,
        resolution: '720p',
        ratio: '16:9',
      })
    ).toThrow('duration')
  })

  test('uses a selected family for an arbitrary site model alias', () => {
    const model = buildStudioVideoModel('my-site-sd2-alias', 'seedance-2')
    expect(model.id).toBe('my-site-sd2-alias')
    expect(model.resolutions).toContain('1080p')
    expect(
      buildStudioVideoRequest(model, {
        prompt: 'camera moves',
        seconds: 8,
        resolution: '1080p',
        ratio: '16:9',
      }).model
    ).toBe('my-site-sd2-alias')
  })

  test('uses the signed-in account model IDs without inventing a video model', () => {
    expect(
      selectStudioVideoModels([
        'text-model',
        'doubao-seedance-2-0-260128',
        'doubao-seedance-2-0-fast-260128',
        'MiniMax-H3',
      ]).map((model) => [model.id, model.family, model.resolutions])
    ).toEqual([
      [
        'doubao-seedance-2-0-260128',
        'seedance-2',
        ['480p', '720p', '1080p', '4k'],
      ],
      ['doubao-seedance-2-0-fast-260128', 'seedance-2', ['480p', '720p']],
      ['MiniMax-H3', 'minimax-h3', ['768P', '2K']],
    ])
  })

  test('keeps a deployment alias from the model list unchanged', () => {
    const model = videoModel('sd2')
    expect(model?.id).toBe('sd2')
    expect(
      buildStudioVideoRequest(model, {
        prompt: 'camera pushes in',
        seconds: 5,
        resolution: '720p',
        ratio: '16:9',
      }).model
    ).toBe('sd2')
    expect(videoModel('minimaxh3').family).toBe('minimax-h3')
  })

  test('builds the Seedance 2.0 request with its resolution and optional source image', () => {
    const model = videoModel('doubao-seedance-2-0-260128')
    expect(
      buildStudioVideoRequest(model, {
        prompt: 'camera pushes in',
        seconds: 10,
        resolution: '1080p',
        ratio: '9:16',
        imageUrl: 'https://cdn.example/frame.png',
      })
    ).toEqual({
      model: 'doubao-seedance-2-0-260128',
      prompt: 'camera pushes in',
      seconds: '10',
      metadata: { resolution: '1080p', ratio: '9:16' },
      images: ['https://cdn.example/frame.png'],
    })
  })

  test('builds the MiniMax H3 request using its own resolution values', () => {
    const model = videoModel('MiniMax-H3')
    expect(
      buildStudioVideoRequest(model, {
        prompt: 'a quiet forest',
        seconds: 4,
        resolution: '2K',
        ratio: '16:9',
      })
    ).toEqual({
      model: 'MiniMax-H3',
      prompt: 'a quiet forest',
      seconds: '4',
      duration: 4,
      metadata: { resolution: '2K', ratio: '16:9' },
    })
  })

  test('passes a local image and an upstream video to a Seedance reference request', () => {
    const model = buildStudioVideoModel('任意视频别名', 'seedance-2.5')
    expect(
      buildStudioVideoRequest(model, {
        prompt: 'Continue the scene',
        seconds: 8,
        resolution: '720p',
        ratio: '16:9',
        imageUrl: 'data:image/png;base64,aGVsbG8=',
        videoUrls: [
          'https://new.thqllm.com/v1/tasks/task-1/artifacts/video/content?access=signed',
        ],
      })
    ).toMatchObject({
      model: '任意视频别名',
      images: ['data:image/png;base64,aGVsbG8='],
      metadata: {
        content: [
          {
            type: 'video_url',
            video_url: {
              url: 'https://new.thqllm.com/v1/tasks/task-1/artifacts/video/content?access=signed',
            },
          },
        ],
      },
    })
  })

  test('uses reference media roles when MiniMax H3 combines an image and video', () => {
    const model = buildStudioVideoModel('本站H3别名', 'minimax-h3')
    expect(
      buildStudioVideoRequest(model, {
        prompt: 'A new shot of the same character',
        seconds: 5,
        resolution: '768P',
        ratio: '16:9',
        imageUrl: 'https://cdn.example/character.png',
        videoUrls: ['https://cdn.example/previous.mp4'],
      })
    ).toMatchObject({
      model: '本站H3别名',
      metadata: {
        content: [
          {
            type: 'image_url',
            role: 'reference_image',
            image_url: { url: 'https://cdn.example/character.png' },
          },
          {
            type: 'video_url',
            role: 'reference_video',
            video_url: { url: 'https://cdn.example/previous.mp4' },
          },
        ],
      },
    })
  })

  test('rejects local image payloads larger than the relay request limit', () => {
    const model = buildStudioVideoModel('任意视频别名', 'seedance-2')
    expect(() =>
      buildStudioVideoRequest(model, {
        prompt: 'A village',
        seconds: 5,
        resolution: '720p',
        ratio: '16:9',
        imageUrl: `data:image/png;base64,${'A'.repeat(30_000_000)}`,
      })
    ).toThrow('request limit')
  })

  test('rejects settings outside the selected model contract', () => {
    const model = videoModel('MiniMax-H3')
    expect(() =>
      buildStudioVideoRequest(model, {
        prompt: 'a quiet forest',
        seconds: 3601,
        resolution: '2K',
        ratio: '16:9',
      })
    ).toThrow('duration')
    expect(() =>
      buildStudioVideoRequest(model, {
        prompt: 'a quiet forest',
        seconds: 5,
        resolution: '1080p',
        ratio: '16:9',
      })
    ).toThrow('resolution')
    expect(() =>
      buildStudioVideoRequest(model, {
        prompt: 'a quiet forest',
        seconds: 5,
        resolution: '768P',
        ratio: '16:9',
        imageUrl: 'blob:https://new.thqllm.com/local',
      })
    ).toThrow('public image URL')
  })
})
