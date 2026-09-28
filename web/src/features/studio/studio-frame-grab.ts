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
*/

/** Extracts a PNG close to the end while keeping browser media resources local. */
export function captureStudioLastFrame(
  blob: Blob,
  signal?: AbortSignal
): Promise<Blob> {
  if (signal?.aborted) {
    return Promise.reject(
      new DOMException('Frame capture cancelled', 'AbortError')
    )
  }
  return new Promise<Blob>((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    const url = URL.createObjectURL(blob)
    let settled = false
    let timer = 0
    const cleanup = () => {
      window.clearTimeout(timer)
      video.removeEventListener('loadedmetadata', onMetadata)
      video.removeEventListener('loadeddata', onFrame)
      video.removeEventListener('seeked', onFrame)
      video.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
      video.pause()
      video.removeAttribute('src')
      URL.revokeObjectURL(url)
    }
    const finish = (output?: Blob, error?: Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (output) resolve(output)
      else reject(error || new Error('Video frame is unavailable'))
    }
    const onAbort = () =>
      finish(
        undefined,
        new DOMException('Frame capture cancelled', 'AbortError')
      )
    const onError = () =>
      finish(undefined, new Error('Video could not be decoded'))
    const onFrame = () => {
      if (settled) return
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas is unavailable')
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((frame) => {
          if (frame) finish(frame)
          else finish(undefined, new Error('Video frame is unavailable'))
        }, 'image/png')
      } catch (error) {
        finish(
          undefined,
          error instanceof Error ? error : new Error(String(error))
        )
      }
    }
    const onMetadata = () => {
      if (
        !Number.isFinite(video.duration) ||
        video.duration <= 0 ||
        video.videoWidth <= 0 ||
        video.videoHeight <= 0
      ) {
        finish(undefined, new Error('Video has no readable frame'))
        return
      }
      const frameTime = Math.max(
        0,
        video.duration - Math.min(0.1, video.duration / 2)
      )
      if (frameTime === 0) {
        video.addEventListener('loadeddata', onFrame, { once: true })
      } else {
        video.addEventListener('seeked', onFrame, { once: true })
        video.currentTime = frameTime
      }
    }
    video.addEventListener('loadedmetadata', onMetadata, { once: true })
    video.addEventListener('error', onError, { once: true })
    signal?.addEventListener('abort', onAbort, { once: true })
    timer = window.setTimeout(
      () => finish(undefined, new Error('Video frame capture timed out')),
      30_000
    )
    video.src = url
    video.load()
  })
}
