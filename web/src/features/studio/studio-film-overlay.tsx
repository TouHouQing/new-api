/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { useEffect, useRef, useState } from 'react'

import type { StudioProject } from './local-projects'
import { studioBrandGraphics } from './studio-brand-kit'
import { studioMotionSVG } from './studio-motion-runtime'

export function StudioFilmOverlay(props: {
  project: StudioProject
  seconds: number
  total: number
  getMedia: (id: string) => Promise<Blob | null>
}) {
  const [images, setImages] = useState<Record<string, string>>({})
  const mediaAccess = useRef(props.getMedia)
  mediaAccess.current = props.getMedia
  const graphics = [
    ...(props.project.production?.motionGraphics || []),
    ...studioBrandGraphics(props.project, props.total),
  ]
  const ids = [
    ...new Set(
      graphics.flatMap((item) => (item.imageMediaId ? [item.imageMediaId] : []))
    ),
  ]
    .sort()
    .join('|')
  useEffect(() => {
    let disposed = false
    const values: Record<string, string> = {}
    void Promise.all(
      ids
        .split('|')
        .filter(Boolean)
        .map(async (id) => {
          const blob = await mediaAccess.current(id)
          if (!blob) return
          values[id] = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.addEventListener(
              'load',
              () => resolve(String(reader.result)),
              { once: true }
            )
            reader.addEventListener('error', () => reject(reader.error), {
              once: true,
            })
            reader.readAsDataURL(blob)
          })
        })
    )
      .then(() => {
        if (!disposed) setImages(values)
      })
      .catch(() => {
        if (!disposed) setImages({})
      })
    return () => {
      disposed = true
    }
  }, [ids])
  if (!graphics.length) return null
  const svg = studioMotionSVG(
    graphics,
    props.seconds,
    props.project.production?.width || 1920,
    props.project.production?.height || 1080,
    images
  )
  return (
    <img
      aria-hidden
      alt=''
      className='pointer-events-none absolute inset-0 h-full w-full'
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
    />
  )
}
