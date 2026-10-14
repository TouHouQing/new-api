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

For commercial licensing, please contact support@quantumnous.com
*/
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import { studioMotionSVG } from './studio-motion-runtime'
import { useStudioProductionContext } from './studio-production-context'
import { addStudioNode } from './workspace'

export function StudioMotionPreview(
  options: {
    versionId?: string
    selectedId?: string
    onSelect?: (id: string) => void
    onMove?: (
      id: string,
      x: number,
      y: number,
      phase: 'start' | 'move' | 'end'
    ) => void
  } = {}
) {
  const { t } = useTranslation()
  const { props, writable, mutate, path } = useStudioProductionContext()
  const version = props.project.production?.regionalVersions.find(
    (item) => item.id === options.versionId
  )
  const graphics = version
    ? version.motionGraphics
    : props.project.production?.motionGraphics || []
  const width = version?.width || props.project.production?.width || 1280
  const height = version?.height || props.project.production?.height || 720
  const [time, setTime] = useState(0.8)
  const drag = useRef<{ id: string; dx: number; dy: number } | undefined>(
    undefined
  )
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState('3')
  const [kind, setKind] = useState<'image' | 'video'>('video')
  const [target, setTarget] = useState('')
  const [images, setImages] = useState<Record<string, string>>({})
  const [imageError, setImageError] = useState(false)
  const mediaAccess = useRef(props.getMedia)
  mediaAccess.current = props.getMedia
  const imageIds = [
    ...new Set(
      graphics
        .filter((item) => item.kind === 'image' && item.imageMediaId)
        .flatMap((item) => (item.imageMediaId ? [item.imageMediaId] : []))
    ),
  ]
    .sort()
    .join(',')
  const seconds = Number(duration)
  useEffect(() => {
    let disposed = false
    const load = async () => {
      const values: Record<string, string> = {}
      for (const id of imageIds.split(',').filter(Boolean)) {
        const blob = await mediaAccess.current(id)
        if (!blob) throw new Error('Graphic image is unavailable')
        values[id] = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(blob)
        })
      }
      if (!disposed) {
        setImages(values)
        setImageError(false)
      }
    }
    void load().catch(() => {
      if (!disposed) setImageError(true)
    })
    return () => {
      disposed = true
    }
  }, [imageIds])
  useEffect(() => {
    if (!playing || !Number.isFinite(seconds) || seconds <= 0 || seconds > 30) {
      return
    }
    const started = performance.now()
    let frame = 0
    const tick = () => {
      setTime(((performance.now() - started) / 1000) % seconds)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, seconds])
  const targets = props.project.nodes.filter(
    (node) =>
      node.data.kind === kind &&
      node.data.purpose !== 'assembly' &&
      !node.data.locked
  )
  return (
    <div className='space-y-3 border-t pt-3'>
      <div
        aria-label={t('Motion graphic preview')}
        role='img'
        style={{ aspectRatio: `${width}/${height}` }}
        className='relative touch-none overflow-hidden rounded bg-slate-950 [&_svg]:h-full [&_svg]:w-full'
        onPointerDown={(event) => {
          if (!writable || !options.onMove) return
          const target =
            event.target instanceof Element
              ? event.target.closest('[data-studio-graphic-id]')
              : null
          const id = target?.getAttribute('data-studio-graphic-id')
          const graphic = graphics.find((item) => item.id === id)
          if (!graphic) return
          const rect = event.currentTarget.getBoundingClientRect()
          drag.current = {
            id: graphic.id,
            dx: (event.clientX - rect.left) / rect.width - graphic.x,
            dy: (event.clientY - rect.top) / rect.height - graphic.y,
          }
          event.currentTarget.setPointerCapture(event.pointerId)
          options.onSelect?.(graphic.id)
          options.onMove(graphic.id, graphic.x, graphic.y, 'start')
        }}
        onPointerMove={(event) => {
          const moving = drag.current
          if (!moving || !writable) return
          const rect = event.currentTarget.getBoundingClientRect()
          options.onMove?.(
            moving.id,
            Math.max(
              0,
              Math.min(1, (event.clientX - rect.left) / rect.width - moving.dx)
            ),
            Math.max(
              0,
              Math.min(1, (event.clientY - rect.top) / rect.height - moving.dy)
            ),
            'move'
          )
        }}
        onPointerUp={() => {
          drag.current = undefined
        }}
        onPointerCancel={() => {
          drag.current = undefined
        }}
        dangerouslySetInnerHTML={{
          __html: studioMotionSVG(graphics, time, width, height, images),
        }}
      />
      {options.onMove && (
        <div className='flex flex-wrap gap-2'>
          {graphics.map((graphic) => (
            <Button
              key={graphic.id}
              size='sm'
              variant={
                options.selectedId === graphic.id ? 'secondary' : 'ghost'
              }
              disabled={!writable}
              aria-label={t('Move graphic {{title}} with arrow keys', {
                title: graphic.text,
              })}
              onClick={() => options.onSelect?.(graphic.id)}
              onKeyDown={(event) => {
                const moves: Record<string, [number, number]> = {
                  ArrowLeft: [-0.01, 0],
                  ArrowRight: [0.01, 0],
                  ArrowUp: [0, -0.01],
                  ArrowDown: [0, 0.01],
                }
                const delta = moves[event.key]
                if (!delta) return
                event.preventDefault()
                options.onMove?.(graphic.id, graphic.x, graphic.y, 'start')
                options.onMove?.(
                  graphic.id,
                  Math.max(0, Math.min(1, graphic.x + delta[0])),
                  Math.max(0, Math.min(1, graphic.y + delta[1])),
                  'move'
                )
              }}
            >
              {graphic.text.slice(0, 40)}
            </Button>
          ))}
        </div>
      )}
      {imageError && (
        <p role='alert' className='text-destructive text-sm'>
          {t(
            'Graphic image is unavailable. Reattach the stored image before exporting.'
          )}
        </p>
      )}
      <div className='flex items-center gap-3'>
        <Button
          variant='outline'
          onClick={() => setPlaying((value) => !value)}
          disabled={!Number.isFinite(seconds) || seconds <= 0 || seconds > 30}
        >
          {playing ? t('Pause') : t('Play')}
        </Button>
        <Input
          aria-label={t('Graphic preview time')}
          type='range'
          min={0}
          max={
            Number.isFinite(seconds) && seconds > 0 ? Math.min(30, seconds) : 3
          }
          step={0.01}
          value={time}
          onChange={(event) => {
            setPlaying(false)
            setTime(Number(event.target.value))
          }}
        />
      </div>
      <Field>
        <FieldLabel>{t('Standalone animation duration')}</FieldLabel>
        <Input
          aria-label={t('Standalone animation duration')}
          type='number'
          min={0.1}
          max={30}
          step={0.1}
          value={duration}
          onChange={(event) => {
            setPlaying(false)
            setDuration(event.target.value)
          }}
        />
      </Field>
      {!options.versionId && (
        <>
          <Select
            value={kind}
            onValueChange={(value) => {
              if (value === 'image' || value === 'video') {
                setKind(value)
                setTarget('')
              }
            }}
          >
            <SelectTrigger aria-label={t('Graphic export format')}>
              <SelectValue>
                {kind === 'video'
                  ? t('Video animation')
                  : t('Transparent PNG frame')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='video'>{t('Video animation')}</SelectItem>
              <SelectItem value='image'>
                {t('Transparent PNG frame')}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className='text-muted-foreground text-xs'>
            {t(
              'A new output copy is created automatically. Existing footage stays available.'
            )}
          </p>
          <Collapsible>
            <CollapsibleTrigger render={<Button variant='outline' size='sm' />}>
              {t('Advanced output settings')}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Select
                value={target}
                onValueChange={(value) => setTarget(value || '')}
              >
                <SelectTrigger aria-label={t('Graphic output node')}>
                  <SelectValue>
                    {targets.find((node) => node.id === target)?.data.title ||
                      t('Choose an output node')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {targets.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.data.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant='outline'
                disabled={
                  !writable ||
                  props.project.nodes.length >= 500 ||
                  mutate.isPending
                }
                onClick={() => {
                  const id = crypto.randomUUID()
                  const next = addStudioNode(props.project, kind, id)
                  const node = next.nodes.find((node) => node.id === id)
                  if (node) {
                    node.data.title = t('Standalone motion graphic')
                    node.data.sourceMode = 'upload'
                  }
                  props.onUpdate(next)
                  setTarget(id)
                }}
              >
                {t('Create a graphic output node')}
              </Button>
            </CollapsibleContent>
          </Collapsible>
          <Button
            disabled={
              !writable ||
              mutate.isPending ||
              imageError ||
              !graphics.length ||
              (target
                ? !targets.some((node) => node.id === target)
                : props.project.nodes.length >= 500) ||
              !Number.isFinite(seconds) ||
              seconds < 0.1 ||
              seconds > 30
            }
            onClick={() =>
              mutate.mutate(async () => {
                let output = target
                if (!output) {
                  output = crypto.randomUUID()
                  const next = addStudioNode(props.project, kind, output)
                  const node = next.nodes.find((node) => node.id === output)
                  if (node) node.data.title = t('Standalone motion graphic')
                  props.onUpdate(next)
                  setTarget(output)
                }
                await props.onSave()
                const record =
                  await studioCloudRequest<StudioCloudProject>(path)
                await studioCloudRequest(`${path}/jobs`, 'POST', {
                  request_id: crypto.randomUUID(),
                  revision: record.revision,
                  kind: 'graphics',
                  operation: {
                    node_id: output,
                    action:
                      kind === 'video'
                        ? 'graphics_animation'
                        : 'graphics_frame',
                    seconds: kind === 'video' ? seconds : time,
                    options: { width, height },
                  },
                })
              })
            }
          >
            {t('Export graphic and editable HTML')}
          </Button>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Export creates a normal project Take and a downloadable HTML package. Add the video Take to the timeline to reuse it; no generation model is called.'
            )}
          </p>
        </>
      )}
    </div>
  )
}
