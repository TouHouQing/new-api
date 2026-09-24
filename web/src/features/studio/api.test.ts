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
  buildStudioImageRequest,
  parseStudioGroups,
  parseStudioImageResponse,
  parseStudioProviderConfigs,
  parseStudioProviderModels,
  parseStudioTaskResponse,
  parseStudioTextResponse,
  parseStudioVideoResponse,
} from './api'

describe('Studio relay responses', () => {
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
      parseStudioTextResponse({ success: true, data: { text: 'scene one' } })
    ).toBe('scene one')
    expect(
      parseStudioImageResponse({
        success: true,
        data: { url: 'https://cdn.example/frame.png' },
      })
    ).toEqual({ url: 'https://cdn.example/frame.png' })
  })

  test('lets each image model choose its own default output size', () => {
    expect(
      buildStudioImageRequest('doubao-seedream-5-0-lite-260128', 'forest')
    ).toEqual({ model: 'doubao-seedream-5-0-lite-260128', prompt: 'forest' })
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

  test('extracts text from a Chat Completions response', () => {
    expect(
      parseStudioTextResponse({
        choices: [{ message: { content: 'scene one' } }],
      })
    ).toBe('scene one')
    expect(() => parseStudioTextResponse({ choices: [] })).toThrow('text')
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
