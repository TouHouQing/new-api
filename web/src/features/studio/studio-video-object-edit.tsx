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
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import type { StudioNativeEditParameters } from './studio-native-edits'
import { useStudioProductionContext } from './studio-production-context'

export function StudioVideoObjectEdit() {
  const { t } = useTranslation()
  const { props, writable, path, mutate, budget, confirm, capabilities } =
    useStudioProductionContext()
  const videos = props.project.nodes.filter(
    (node) =>
      node.data.kind === 'video' &&
      node.data.mediaId &&
      node.data.purpose !== 'assembly'
  )
  const targets = props.project.nodes.filter(
    (node) =>
      node.data.kind === 'video' &&
      !node.data.locked &&
      node.data.purpose !== 'assembly'
  )
  const images = props.project.nodes.filter(
    (node) => node.data.kind === 'image' && node.data.mediaId
  )
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [referenceId, setReferenceId] = useState('')
  const [action, setAction] = useState<'video_remove' | 'video_replace'>(
    'video_remove'
  )
  const [prompt, setPrompt] = useState('')
  const [negative, setNegative] = useState('')
  const [url, setUrl] = useState('')
  const [bounds, setBounds] = useState({ width: 640, height: 384, duration: 0 })
  const [edit, setEdit] = useState<StudioNativeEditParameters>({
    start: 0,
    end: 1,
    x: 200,
    y: 100,
    width: 200,
    height: 200,
    rotation: 0,
    speed: 1,
  })
  const mediaAccess = useRef(props.getMedia)
  mediaAccess.current = props.getMedia
  const source = videos.find((node) => node.id === sourceId)
  const sourceMediaId = source?.data.mediaId
  const drag = useRef<{ x: number; y: number } | undefined>(undefined)
  const player = useRef<HTMLVideoElement>(null)
  const [previewTime, setPreviewTime] = useState(0)
  useEffect(() => {
    let disposed = false,
      owned = ''
    setUrl('')
    setBounds({ width: 640, height: 384, duration: 0 })
    if (sourceMediaId) {
      void mediaAccess
        .current(sourceMediaId)
        .then((blob) => {
          if (!disposed && blob) {
            owned = URL.createObjectURL(blob)
            setUrl(owned)
          }
        })
        .catch(handleServerError)
    }
    return () => {
      disposed = true
      if (owned) URL.revokeObjectURL(owned)
    }
  }, [sourceMediaId])
  const valid =
    writable &&
    capabilities.data?.generation_credit_available === true &&
    confirm &&
    !mutate.isPending &&
    sourceMediaId &&
    targets.some((node) => node.id === targetId) &&
    Number.isFinite(Number(budget)) &&
    Number(budget) > 0 &&
    Number(budget) <= 4000 &&
    Object.values(edit).every(Number.isFinite) &&
    edit.start >= 0 &&
    edit.end > edit.start &&
    edit.end <= bounds.duration &&
    edit.end - edit.start <= 30 &&
    edit.x >= 0 &&
    edit.y >= 0 &&
    edit.width >= 2 &&
    edit.height >= 2 &&
    edit.x + edit.width <= bounds.width &&
    edit.y + edit.height <= bounds.height &&
    (action !== 'video_replace' || prompt.trim())
  return (
    <Collapsible className='space-y-3'>
      <CollapsibleTrigger render={<Button variant='outline' />}>
        {t('Remove or replace a video object')}
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-3'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Draw the region containing the object throughout the selected interval. AI reconstructs that region; the original sound, unselected region and other intervals are preserved. Review the generated Take before delivery.'
          )}
        </p>
        <Field>
          <FieldLabel>{t('Source video')}</FieldLabel>
          <Select
            value={sourceId}
            onValueChange={(value) => setSourceId(value || '')}
          >
            <SelectTrigger aria-label={t('Source video')}>
              <SelectValue>
                {source?.data.title || t('Choose a stored video')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {videos.map((node) => (
                <SelectItem key={node.id} value={node.id}>
                  {node.data.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {url && (
          <div
            className='relative max-w-full'
            style={{ aspectRatio: `${bounds.width}/${bounds.height}` }}
          >
            <video
              ref={player}
              src={url}
              playsInline
              onTimeUpdate={(event) =>
                setPreviewTime(event.currentTarget.currentTime)
              }
              className='h-full w-full'
              onLoadedMetadata={(event) => {
                const video = event.currentTarget
                setBounds({
                  width: video.videoWidth,
                  height: video.videoHeight,
                  duration: video.duration,
                })
                setEdit({
                  start: 0,
                  end: Math.min(2, video.duration),
                  x: Math.floor(video.videoWidth / 4),
                  y: Math.floor(video.videoHeight / 4),
                  width: Math.floor(video.videoWidth / 2),
                  height: Math.floor(video.videoHeight / 2),
                  rotation: 0,
                  speed: 1,
                })
              }}
            />
            <svg
              viewBox={`0 0 ${bounds.width} ${bounds.height}`}
              className='absolute inset-0 h-full w-full touch-none'
              role='application'
              tabIndex={0}
              aria-label={t('Draw object edit region')}
              onPointerDown={(event) => {
                if (!writable || mutate.isPending) return
                const rect = event.currentTarget.getBoundingClientRect()
                drag.current = {
                  x: Math.max(
                    0,
                    Math.round(
                      ((event.clientX - rect.left) / rect.width) * bounds.width
                    )
                  ),
                  y: Math.max(
                    0,
                    Math.round(
                      ((event.clientY - rect.top) / rect.height) * bounds.height
                    )
                  ),
                }
                event.currentTarget.setPointerCapture(event.pointerId)
              }}
              onPointerMove={(event) => {
                if (!drag.current) return
                const rect = event.currentTarget.getBoundingClientRect(),
                  start = drag.current
                const x = Math.min(
                  bounds.width,
                  Math.max(
                    0,
                    Math.round(
                      ((event.clientX - rect.left) / rect.width) * bounds.width
                    )
                  )
                )
                const y = Math.min(
                  bounds.height,
                  Math.max(
                    0,
                    Math.round(
                      ((event.clientY - rect.top) / rect.height) * bounds.height
                    )
                  )
                )
                setEdit((current) => ({
                  ...current,
                  x: Math.min(x, start.x),
                  y: Math.min(y, start.y),
                  width: Math.abs(x - start.x),
                  height: Math.abs(y - start.y),
                }))
              }}
              onPointerUp={() => {
                drag.current = undefined
              }}
              onPointerCancel={() => {
                drag.current = undefined
              }}
              onKeyDown={(event) => {
                if (
                  !writable ||
                  !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
                    event.key
                  )
                ) {
                  return
                }
                event.preventDefault()
                setEdit((current) => ({
                  ...current,
                  x: Math.max(
                    0,
                    Math.min(
                      bounds.width - current.width,
                      current.x +
                        (event.key === 'ArrowLeft'
                          ? -1
                          : Number(event.key === 'ArrowRight'))
                    )
                  ),
                  y: Math.max(
                    0,
                    Math.min(
                      bounds.height - current.height,
                      current.y +
                        (event.key === 'ArrowUp'
                          ? -1
                          : Number(event.key === 'ArrowDown'))
                    )
                  ),
                }))
              }}
            >
              <rect
                x={edit.x}
                y={edit.y}
                width={edit.width}
                height={edit.height}
                fill='rgba(255,70,70,0.15)'
                stroke='#ff4646'
                strokeWidth={3}
              />
            </svg>
          </div>
        )}
        {url && (
          <div className='space-y-2'>
            <Button
              variant='outline'
              onClick={() => {
                const video = player.current
                if (!video) return
                if (video.paused) void video.play().catch(handleServerError)
                else video.pause()
              }}
            >
              {t('Preview source video')}
            </Button>
            <Input
              aria-label={t('Source video playhead')}
              type='range'
              min={0}
              max={bounds.duration}
              step={0.0625}
              value={previewTime}
              onChange={(event) => {
                if (player.current) {
                  player.current.currentTime = Number(event.target.value)
                }
                setPreviewTime(Number(event.target.value))
              }}
            />
          </div>
        )}
        <div className='grid gap-2 sm:grid-cols-3'>
          {(['start', 'end', 'x', 'y', 'width', 'height'] as const).map(
            (key) => (
              <Field key={key}>
                <FieldLabel>{t(`Object edit ${key}`)}</FieldLabel>
                <Input
                  aria-label={t(`Object edit ${key}`)}
                  type='number'
                  min={0}
                  step={key === 'start' || key === 'end' ? 0.0625 : 1}
                  value={edit[key]}
                  disabled={!writable || mutate.isPending}
                  onChange={(event) =>
                    setEdit({ ...edit, [key]: Number(event.target.value) })
                  }
                />
              </Field>
            )
          )}
        </div>
        <div className='flex gap-2'>
          <Button
            variant={action === 'video_remove' ? 'default' : 'outline'}
            onClick={() => setAction('video_remove')}
          >
            {t('Remove object')}
          </Button>
          <Button
            variant={action === 'video_replace' ? 'default' : 'outline'}
            onClick={() => setAction('video_replace')}
          >
            {t('Replace object')}
          </Button>
        </div>
        <Field>
          <FieldLabel>{t('Object edit description')}</FieldLabel>
          <Textarea
            aria-label={t('Object edit description')}
            value={prompt}
            maxLength={3000}
            disabled={!writable || mutate.isPending}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>{t('Avoid in the edited region (optional)')}</FieldLabel>
          <Input
            aria-label={t('Avoid in the edited region (optional)')}
            maxLength={3000}
            value={negative}
            onChange={(event) => setNegative(event.target.value)}
          />
        </Field>
        {action === 'video_replace' && (
          <Field>
            <FieldLabel>{t('Replacement image (optional)')}</FieldLabel>
            <Select
              value={referenceId || 'none'}
              onValueChange={(value) =>
                setReferenceId(value === 'none' ? '' : value || '')
              }
            >
              <SelectTrigger>
                <SelectValue>
                  {images.find((node) => node.id === referenceId)?.data.title ||
                    t('No reference image')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='none'>{t('No reference image')}</SelectItem>
                {images.map((node) => (
                  <SelectItem key={node.id} value={node.id}>
                    {node.data.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field>
          <FieldLabel>{t('Video output')}</FieldLabel>
          <Select
            value={targetId}
            onValueChange={(value) => setTargetId(value || '')}
          >
            <SelectTrigger aria-label={t('Video output')}>
              <SelectValue>
                {targets.find((node) => node.id === targetId)?.data.title ||
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
        </Field>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Uses the workflow budget and generation confirmation. Select at most thirty seconds; long edits use a smaller inference size.'
          )}
        </p>
        <Button
          disabled={!valid}
          onClick={() =>
            mutate.mutate(async () => {
              await props.onSave()
              const current = await studioCloudRequest<StudioCloudProject>(path)
              if (
                current.document.nodes.find((node) => node.id === sourceId)
                  ?.data.mediaId !== sourceMediaId
              ) {
                throw new Error(t('Source video changed; select it again'))
              }
              const image = images.find((node) => node.id === referenceId)?.data
                .mediaId
              await studioCloudRequest(`${path}/jobs`, 'POST', {
                request_id: crypto.randomUUID(),
                kind: 'media',
                revision: current.revision,
                budget: Math.round(
                  Number(budget) * (capabilities.data?.quota_per_unit || 500000)
                ),
                confirm_generation: true,
                operation: {
                  action,
                  model:
                    action === 'video_remove'
                      ? 'studio-video-remove'
                      : 'studio-video-replace',
                  node_id: targetId,
                  prompt,
                  seconds: edit.end - edit.start,
                  edit,
                  options: { negative },
                  reference_media_ids: [
                    sourceMediaId,
                    ...(image && action === 'video_replace' ? [image] : []),
                  ],
                },
              })
            })
          }
        >
          {t('Generate object edit Take')}
        </Button>
      </CollapsibleContent>
    </Collapsible>
  )
}
