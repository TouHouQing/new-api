/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import {
  studioLipSelectionValid,
  type StudioLipSelection,
} from './studio-lip-sync'

export function StudioLipSyncEditor(props: {
  mediaId: string
  getMedia: (id: string) => Promise<Blob | null>
  edit: StudioLipSelection
  onChange: (edit: StudioLipSelection) => void
  audioStart: number
  onAudioStart: (seconds: number) => void
  videoDuration?: number
  audioDuration?: number
  disabled: boolean
  onValidation: (valid: boolean) => void
}) {
  const { t } = useTranslation()
  const onValidation = props.onValidation
  const regionLabels = {
    x: [t('Left'), t('Speaker region left')],
    y: [t('Top'), t('Speaker region top')],
    width: [t('Width'), t('Speaker region width')],
    height: [t('Height'), t('Speaker region height')],
  }
  const [url, setUrl] = useState('')
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [error, setError] = useState('')
  const video = useRef<HTMLVideoElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const access = useRef(props.getMedia)
  access.current = props.getMedia
  useEffect(() => {
    let closed = false
    let created = ''
    setUrl('')
    setError('')
    setSize({ width: 0, height: 0 })
    access
      .current(props.mediaId)
      .then((blob) => {
        if (!closed && blob) {
          created = URL.createObjectURL(blob)
          setUrl(created)
        }
      })
      .catch(() => {
        if (!closed) {
          setError(t('The selected source video could not be opened.'))
        }
      })
    return () => {
      closed = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [props.mediaId, t])
  useEffect(() => {
    if (video.current && video.current.readyState >= 1) {
      video.current.pause()
      video.current.currentTime = props.edit.start
    }
  }, [props.edit.start, url])
  const valid =
    !!size.width &&
    studioLipSelectionValid(
      props.edit,
      props.audioStart,
      props.videoDuration,
      props.audioDuration,
      size
    )
  useEffect(() => {
    onValidation(valid)
  }, [valid, onValidation])
  const patch = (change: Partial<StudioLipSelection>) =>
    props.onChange({ ...props.edit, ...change })
  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.round(
        Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) *
          size.width
      ),
      y: Math.round(
        Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) *
          size.height
      ),
    }
  }
  return (
    <section
      className='space-y-3 rounded-lg border p-3'
      aria-label={t('Choose who speaks and when')}
    >
      <p className='font-medium'>{t('Choose who speaks and when')}</p>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Output is a new candidate for this video interval. The original video is retained. Audio starts independently; missing speech or frames are never stretched or frozen.'
        )}
      </p>
      <div className='grid gap-3 sm:grid-cols-3'>
        <Field>
          <FieldLabel>{t('Source video start in seconds')}</FieldLabel>
          <Input
            aria-label={t('Source video start in seconds')}
            type='number'
            min={0}
            max={props.videoDuration}
            step={0.01}
            value={props.edit.start}
            disabled={props.disabled}
            onChange={(event) => patch({ start: Number(event.target.value) })}
          />
        </Field>
        <Field>
          <FieldLabel>{t('Source video end in seconds')}</FieldLabel>
          <Input
            aria-label={t('Source video end in seconds')}
            type='number'
            min={props.edit.start + 0.1}
            max={props.videoDuration}
            step={0.01}
            value={props.edit.end}
            disabled={props.disabled}
            onChange={(event) => patch({ end: Number(event.target.value) })}
          />
        </Field>
        <Field>
          <FieldLabel>{t('Dialogue audio start in seconds')}</FieldLabel>
          <Input
            aria-label={t('Dialogue audio start in seconds')}
            type='number'
            min={0}
            max={props.audioDuration}
            step={0.01}
            value={props.audioStart}
            disabled={props.disabled}
            onChange={(event) => props.onAudioStart(Number(event.target.value))}
          />
        </Field>
      </div>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Drag around one speaker on the source frame, or use automatic detection for a single visible person. The selected person must remain visible inside the region throughout this interval.'
        )}
      </p>
      {url && (
        <div
          className='relative max-w-xl overflow-hidden rounded border'
          style={{
            aspectRatio: size.width ? `${size.width}/${size.height}` : '16/9',
            touchAction: 'none',
          }}
          onPointerDown={(event) => {
            if (props.disabled || !size.width) return
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = point(event)
          }}
          onPointerUp={(event) => {
            if (props.disabled) {
              drag.current = null
              return
            }
            if (!drag.current) return
            const end = point(event),
              start = drag.current
            drag.current = null
            const width = Math.abs(end.x - start.x),
              height = Math.abs(end.y - start.y)
            if (width < 48 || height < 48) {
              setError(
                t('Choose a speaker region at least 48 pixels wide and high.')
              )
              return
            }
            setError('')
            patch({
              x: Math.min(start.x, end.x),
              y: Math.min(start.y, end.y),
              width,
              height,
            })
          }}
          onPointerCancel={() => {
            drag.current = null
          }}
        >
          <video
            ref={video}
            src={url}
            playsInline
            preload='metadata'
            className='pointer-events-none h-full w-full'
            aria-label={t('Speaker source preview')}
            onLoadedMetadata={(event) => {
              const target = event.currentTarget
              setSize({ width: target.videoWidth, height: target.videoHeight })
              target.currentTime = props.edit.start
            }}
            onTimeUpdate={(event) => {
              if (event.currentTarget.currentTime >= props.edit.end) {
                event.currentTarget.pause()
              }
            }}
          />
          {!!props.edit.width && !!size.width && (
            <div
              className='border-primary bg-primary/10 pointer-events-none absolute border-2'
              style={{
                left: `${(props.edit.x / size.width) * 100}%`,
                top: `${(props.edit.y / size.height) * 100}%`,
                width: `${(props.edit.width / size.width) * 100}%`,
                height: `${(props.edit.height / size.height) * 100}%`,
              }}
            />
          )}
        </div>
      )}
      <div className='flex flex-wrap gap-2'>
        <Button
          variant='outline'
          disabled={!url || !valid}
          onClick={() => {
            if (video.current) {
              video.current.currentTime = props.edit.start
              void video.current
                .play()
                .catch(() => setError(t('Use the preview play control again.')))
            }
          }}
        >
          {t('Preview selected source interval')}
        </Button>
        <Button
          variant='outline'
          disabled={props.disabled}
          onClick={() => patch({ x: 0, y: 0, width: 0, height: 0 })}
        >
          {t('Automatic detection for one person')}
        </Button>
      </div>
      <details>
        <summary className='cursor-pointer text-sm'>
          {t('Speaker region in source pixels')}
        </summary>
        <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
          {(['x', 'y', 'width', 'height'] as const).map((key) => (
            <Field key={key}>
              <FieldLabel>{regionLabels[key][0]}</FieldLabel>
              <Input
                aria-label={regionLabels[key][1]}
                type='number'
                min={0}
                max={8192}
                step={1}
                value={props.edit[key]}
                disabled={props.disabled}
                onChange={(event) =>
                  patch({ [key]: Number(event.target.value) })
                }
              />
            </Field>
          ))}
        </div>
      </details>
      {!valid && (
        <p role='status' className='text-destructive text-sm'>
          {t(
            'Choose one video and audio, a valid speaker region and an interval fully covered by both sources.'
          )}
        </p>
      )}
      {error && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
    </section>
  )
}
