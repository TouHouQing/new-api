/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { t } from 'i18next'

export const studioImageDecodeError =
  'This image cannot be decoded. Upload a valid PNG, JPEG, WebP, or GIF.'

async function imageBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      reader.result instanceof ArrayBuffer
        ? resolve(reader.result)
        : reject(new Error(t(studioImageDecodeError)))
    reader.onerror = () => reject(new Error(t(studioImageDecodeError)))
    reader.readAsArrayBuffer(blob)
  })
}

export async function validateStudioImageBlob(blob: Blob): Promise<void> {
  const type = blob.type.split(';')[0].toLowerCase()
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type)) {
    throw new Error(t('Unsupported image format. Use PNG, JPEG, WebP, or GIF.'))
  }
  const header = new Uint8Array(await imageBytes(blob.slice(0, 32)))
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...header.slice(start, end))
  let matches = false
  switch (type) {
    case 'image/png':
      matches =
        header.length >= 8 &&
        [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => header[i] === b)
      break
    case 'image/jpeg':
      matches = header[0] === 255 && header[1] === 216 && header[2] === 255
      break
    case 'image/webp':
      matches = ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
      break
    case 'image/gif':
      matches = ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a'
      break
  }
  if (!matches) {
    throw new Error(
      t(
        'Image content does not match its declared file type. Upload the original image again.'
      )
    )
  }
  let width: number, height: number
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob)
      try {
        width = bitmap.width
        height = bitmap.height
      } finally {
        bitmap.close()
      }
    } else {
      const url = URL.createObjectURL(blob)
      try {
        const image = new Image()
        const size = await new Promise<{ width: number; height: number }>(
          (resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error(t(studioImageDecodeError))),
              15000
            )
            image.onload = () => {
              clearTimeout(timer)
              resolve({
                width: image.naturalWidth,
                height: image.naturalHeight,
              })
            }
            image.onerror = () => {
              clearTimeout(timer)
              reject(new Error(t(studioImageDecodeError)))
            }
            image.src = url
          }
        )
        width = size.width
        height = size.height
      } finally {
        URL.revokeObjectURL(url)
      }
    }
  } catch (error) {
    throw new Error(t(studioImageDecodeError), { cause: error })
  }
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    throw new Error(t(studioImageDecodeError))
  }
  if (width > 16384 || height > 16384 || width * height > 32 * 1024 * 1024) {
    throw new Error(
      t(
        'Image dimensions exceed the supported image limit. Use a smaller image.'
      )
    )
  }
}
