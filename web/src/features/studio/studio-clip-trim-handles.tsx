/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { StudioTimelineClip } from './studio-production'

export function StudioClipTrimHandles(props: {
  clip: StudioTimelineClip
  available: number
  filmSeconds: number
  onTrim: (patch: { trimStart: number; trimEnd: number }) => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState<number | null>(null)
  const drag = useRef<{
    x: number
    source: number
    pixels: number
    edge: 'start' | 'end'
    pending: number
  } | null>(null)
  const end = props.clip.trimEnd ?? props.available
  const bounded = (edge: 'start' | 'end', next: number) =>
    edge === 'start'
      ? Math.max(0, Math.min(end - 0.04, next))
      : Math.max(props.clip.trimStart + 0.04, Math.min(props.available, next))
  const commit = (edge: 'start' | 'end', next: number) =>
    props.onTrim({
      trimStart: edge === 'start' ? next : props.clip.trimStart,
      trimEnd: edge === 'end' ? next : end,
    })
  return (
    <>
      {(['start', 'end'] as const).map((edge) => (
        <Button
          key={edge}
          role='slider'
          aria-label={t(edge === 'start' ? 'Drag clip start' : 'Drag clip end')}
          aria-valuemin={edge === 'start' ? 0 : props.clip.trimStart + 0.04}
          aria-valuemax={edge === 'start' ? end - 0.04 : props.available}
          aria-valuenow={
            value ?? (edge === 'start' ? props.clip.trimStart : end)
          }
          variant='secondary'
          className={`absolute top-1 z-10 h-10 w-3 touch-none rounded-none px-0 ${edge === 'start' ? 'left-0 cursor-ew-resize' : 'right-0 cursor-ew-resize'}`}
          onPointerDown={(event) => {
            event.stopPropagation()
            const width =
              event.currentTarget
                .closest('[data-video-track]')
                ?.getBoundingClientRect().width || 1
            const source = edge === 'start' ? props.clip.trimStart : end
            drag.current = {
              x: event.clientX,
              source,
              pixels: width,
              edge,
              pending: source,
            }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            const current = drag.current
            if (!current || current.edge !== edge) return
            current.pending = bounded(
              edge,
              current.source +
                ((event.clientX - current.x) / current.pixels) *
                  props.filmSeconds *
                  props.clip.speed
            )
            setValue(current.pending)
          }}
          onPointerUp={(event) => {
            if (!drag.current) return
            const current = drag.current
            drag.current = null
            event.currentTarget.releasePointerCapture(event.pointerId)
            commit(edge, current.pending)
            setValue(null)
          }}
          onPointerCancel={() => {
            drag.current = null
            setValue(null)
          }}
          onKeyDown={(event) => {
            if (
              !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
            ) {
              return
            }
            event.preventDefault()
            const current = edge === 'start' ? props.clip.trimStart : end
            let next =
              current +
              (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 1 : 0.1)
            if (event.key === 'Home') next = 0
            if (event.key === 'End') next = props.available
            commit(edge, bounded(edge, next))
          }}
        >
          {value === null ? '│' : value.toFixed(1)}
        </Button>
      ))}
    </>
  )
}
