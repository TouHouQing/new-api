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
import { StudioAssemblyError, type StudioAssemblyClip } from './assembly-plan'

type ContentResponse = {
  ok: boolean
  status?: number
  blob(): Promise<Blob>
}

export async function loadStudioAssemblyBlobs(
  clips: StudioAssemblyClip[],
  userId: number,
  store: { get(userId: number, mediaId: string): Promise<Blob | null> },
  getContentUrl: (taskId: string) => Promise<string>,
  fetchContent: (
    url: string,
    init: { credentials: 'same-origin'; signal?: AbortSignal }
  ) => Promise<ContentResponse>,
  signal?: AbortSignal
): Promise<Blob[]> {
  const blobs: Blob[] = []
  for (const clip of clips) {
    if (signal?.aborted) throw new DOMException('Export canceled', 'AbortError')
    let blob = clip.mediaId ? await store.get(userId, clip.mediaId) : null
    if (!blob && clip.taskId) {
      const url = await getContentUrl(clip.taskId)
      if (signal?.aborted) {
        throw new DOMException('Export canceled', 'AbortError')
      }
      const response = await fetchContent(url, {
        credentials: 'same-origin',
        ...(signal ? { signal } : {}),
      })
      if (!response.ok) {
        throw new StudioAssemblyError('download_failed', clip.title)
      }
      blob = await response.blob()
      if (signal?.aborted) {
        throw new DOMException('Export canceled', 'AbortError')
      }
    }
    if (!blob || blob.size === 0) {
      throw new StudioAssemblyError('missing_media', clip.title)
    }
    blobs.push(blob)
  }
  return blobs
}
