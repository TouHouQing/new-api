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

import { afterEach, expect, test, vi } from 'vitest'

import { captureStudioLastFrame } from './studio-frame-grab'

afterEach(() => vi.restoreAllMocks())

test('captures a near-final PNG frame and releases the video object URL', async () => {
  const video = new EventTarget() as HTMLVideoElement
  Object.assign(video, {
    duration: 4,
    videoWidth: 1280,
    videoHeight: 720,
    pause: vi.fn(),
    load: () =>
      queueMicrotask(() => video.dispatchEvent(new Event('loadedmetadata'))),
    removeAttribute: vi.fn(),
  })
  Object.defineProperty(video, 'currentTime', {
    set(value: number) {
      expect(value).toBeGreaterThan(3)
      queueMicrotask(() => video.dispatchEvent(new Event('seeked')))
    },
  })
  const drawImage = vi.fn()
  const canvas = {
    getContext: () => ({ drawImage }),
    toBlob: (callback: BlobCallback) =>
      callback(new Blob(['png'], { type: 'image/png' })),
  } as unknown as HTMLCanvasElement
  const originalCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
    if (tag === 'video') {
      return video
    }
    if (tag === 'canvas') {
      return canvas
    }
    return originalCreate(tag, options)
  })
  const createUrl = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:frame-test')
  const revokeUrl = vi
    .spyOn(URL, 'revokeObjectURL')
    .mockImplementation(() => {})

  const result = await captureStudioLastFrame(
    new Blob(['video'], { type: 'video/mp4' })
  )

  expect(result.type).toBe('image/png')
  expect(drawImage).toHaveBeenCalledOnce()
  expect(createUrl).toHaveBeenCalledOnce()
  expect(revokeUrl).toHaveBeenCalledWith('blob:frame-test')
})

test('rejects invalid metadata and releases the source', async () => {
  const video = new EventTarget() as HTMLVideoElement
  Object.assign(video, {
    duration: Number.NaN,
    videoWidth: 0,
    videoHeight: 0,
    pause: vi.fn(),
    load: () =>
      queueMicrotask(() => video.dispatchEvent(new Event('loadedmetadata'))),
    removeAttribute: vi.fn(),
  })
  const originalCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag, options) =>
    tag === 'video' ? video : originalCreate(tag, options)
  )
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:invalid')
  const revokeUrl = vi
    .spyOn(URL, 'revokeObjectURL')
    .mockImplementation(() => {})
  await expect(captureStudioLastFrame(new Blob(['invalid']))).rejects.toThrow()
  expect(revokeUrl).toHaveBeenCalledWith('blob:invalid')
})

test('an aborted capture does not allocate a video object URL', async () => {
  const controller = new AbortController()
  controller.abort()
  const createUrl = vi.spyOn(URL, 'createObjectURL')
  await expect(
    captureStudioLastFrame(new Blob(['video']), controller.signal)
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(createUrl).not.toHaveBeenCalled()
})
