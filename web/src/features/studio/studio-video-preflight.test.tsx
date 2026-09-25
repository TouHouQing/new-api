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

import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import type { StudioVideoRequest } from './model-profiles'
import { StudioVideoPreflight } from './studio-video-preflight'
import { inspectStudioVideoRequest } from './studio-video-request-summary'

test('preflight preserves exact patched request fields and names attached media roles', () => {
  const request: StudioVideoRequest = {
    model: 'custom-channel-alias',
    prompt: 'Walk forward',
    seconds: '30',
    duration: 30,
    metadata: {
      resolution: '720p',
      ratio: '9:16',
      content: [
        {
          type: 'image_url',
          role: 'first_frame',
          image_url: { url: 'data:image/png;base64,private' },
        },
      ],
    },
  }
  const summary = inspectStudioVideoRequest(request)
  expect(summary.duration).toBe(30)
  expect(summary.roles).toEqual(['first_frame'])
  expect(summary.payload).toContain('custom-channel-alias')
  expect(summary.payload).toContain('"duration": 30')
  expect(summary.payload).not.toContain('private')
  expect(
    inspectStudioVideoRequest({
      model: 'generic-alias',
      prompt: 'Move',
      seconds: '5',
      images: ['https://cdn.example/frame.png'],
      metadata: {},
    }).roles
  ).toEqual(['image'])
})

test('batch overview identifies custom duration and explains per-request approval', () => {
  render(
    <StudioVideoPreflight
      data={{
        kind: 'batch',
        items: [
          {
            id: 'shot-video',
            title: 'Opening',
            group: 'default',
            model: 'video-alias',
            seconds: null,
            prompt: 'Configured movement',
            payloadPatch: '{"seconds":"30","size":"720p"}',
          },
        ],
        cost: { status: 'unknown' },
      }}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />
  )
  expect(screen.getByText('studio.preflight.batchDescription')).toBeTruthy()
  expect(screen.getByText(/studio.preflight.customDuration/)).toBeTruthy()
  expect(screen.getByText(/Configured movement/)).toBeTruthy()
  expect(
    screen.getByRole('button', { name: 'studio.preflight.startBatch' })
  ).toBeTruthy()
})
