/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { afterEach, expect, test, vi } from 'vitest'

import {
  studioImageDecodeError,
  validateStudioImageBlob,
} from '../studio-image-validation'

const png = () =>
  new Blob(
    [
      Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGO8JOf2n4GBgYEJRIAwACIUAjm9GWtzAAAAAElFTkSuQmCC'
        ),
        (c) => c.charCodeAt(0)
      ),
    ],
    { type: 'image/png' }
  )
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

test('plain text renamed PNG is rejected before any decoder, upload or completed Take', async () => {
  const decode = vi.fn()
  vi.stubGlobal('createImageBitmap', decode)
  await expect(
    validateStudioImageBlob(
      new Blob(['This is 51 bytes of plain text, not an encoded image.'], {
        type: 'image/png',
      })
    )
  ).rejects.toThrow('Image content does not match its declared file type.')
  expect(decode).not.toHaveBeenCalled()
})
test('a real PNG header with a truncated payload still needs a successful complete browser decode', async () => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      throw new Error('Truncated image')
    })
  )
  await expect(validateStudioImageBlob(png())).rejects.toThrow(
    studioImageDecodeError
  )
})
test('a decoded image is accepted and its bitmap is closed', async () => {
  const close = vi.fn()
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 1, height: 1, close }))
  )
  await expect(validateStudioImageBlob(png())).resolves.toBeUndefined()
  expect(close).toHaveBeenCalledTimes(1)
})
test('oversized decoded pixels reject and still release the bitmap', async () => {
  const close = vi.fn()
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 8192, height: 4320, close }))
  )
  await expect(validateStudioImageBlob(png())).rejects.toThrow(
    'Image dimensions exceed the supported image limit.'
  )
  expect(close).toHaveBeenCalledTimes(1)
})
test('a PNG cannot claim to be a different supported image format', async () => {
  const file = png()
  await expect(
    validateStudioImageBlob(new Blob([file], { type: 'image/webp' }))
  ).rejects.toThrow('Image content does not match its declared file type.')
})
test('unsupported SVG cannot enter a raster image upload', async () => {
  await expect(
    validateStudioImageBlob(new Blob(['<svg/>'], { type: 'image/svg+xml' }))
  ).rejects.toThrow('Unsupported image format.')
})
