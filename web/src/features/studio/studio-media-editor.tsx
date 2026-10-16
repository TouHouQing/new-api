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

import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { markServerErrorHandled } from '@/lib/handle-server-error'
import { getServerErrorMessage } from '@/lib/server-error-message'

import type { StudioCanvasNode } from './canvas-flow'
import { studioCloudRequest, type StudioCloudJob } from './studio-cloud'
import { StudioCropRegion } from './studio-crop-region'
import { StudioImageGrid } from './studio-image-grid'
import { StudioImageLayerEditor } from './studio-image-layer-editor'
import type { StudioImageLayers } from './studio-image-layers'
import {
  STUDIO_NATIVE_EDITS,
  type StudioNativeEdit,
  type StudioNativeEditParameters,
} from './studio-native-edits'
import { studioWorkflowProblem } from './studio-workflow-problem'

type Props = {
  node: StudioCanvasNode
  nodes?: StudioCanvasNode[]
  previewUrl?: string
  projectId: string
  readOnly?: boolean
  onCreate: (
    action: StudioNativeEdit,
    edit: StudioNativeEditParameters,
    blob?: Blob,
    layers?: StudioImageLayers,
    resultName?: string,
    selectResult?: boolean
  ) => Promise<StudioCloudJob | void>
  onRefresh: (job?: StudioCloudJob) => Promise<void>
  onSource: (nodeId: string) => void
  getMedia: (id: string) => Promise<Blob | null>
}
export function StudioMediaEditor(props: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [compare, setCompare] = useState(false)
  const [other, setOther] = useState('')
  const [action, setAction] = useState<StudioNativeEdit>('crop')
  const [edit, setEdit] = useState<StudioNativeEditParameters>({
    start: 0,
    end: 3,
    x: 0,
    y: 0,
    width: 640,
    height: 360,
    rotation: 90,
    speed: 1,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [job, setJob] = useState<StudioCloudJob>()
  const [audioProbe, setAudioProbe] = useState<{
    id: string
    audio: boolean | null
  }>({ id: '', audio: null })
  const sourceId = props.node.data.mediaId
  const sourceKind = props.node.data.kind
  useEffect(() => {
    if (!open || sourceKind !== 'video' || !sourceId) return
    let cancelled = false
    const id = sourceId
    setAudioProbe({ id, audio: null })
    const probe = async () => {
      const blob = await mediaAccess.current(id)
      if (!blob || cancelled) return
      const {
        Input: MediaInput,
        BlobSource,
        ALL_FORMATS,
      } = await import('mediabunny')
      const input = new MediaInput({
        source: new BlobSource(blob),
        formats: ALL_FORMATS,
      })
      try {
        const tracks = await input.getAudioTracks()
        if (!cancelled) setAudioProbe({ id, audio: tracks.length > 0 })
      } finally {
        input.dispose()
      }
    }
    void probe().catch(() => {
      if (!cancelled) setAudioProbe({ id, audio: null })
    })
    return () => {
      cancelled = true
    }
  }, [open, sourceKind, sourceId])
  const refreshJob = useRef<(() => Promise<void>) | undefined>(undefined)
  useEffect(() => {
    if (
      !open ||
      !job ||
      !['queued', 'running', 'waiting'].includes(job.status)
    ) {
      return
    }
    const timer = window.setTimeout(() => void refreshJob.current?.(), 1500)
    return () => window.clearTimeout(timer)
  }, [open, job])
  const [color, setColor] = useState('#ff4040')
  const [otherUrl, setOtherUrl] = useState('')
  const originalMediaId = props.node.data.derivedFrom?.mediaId
  const originalOption = originalMediaId ? `original:${originalMediaId}` : ''
  const otherTake =
    originalOption && other === originalOption
      ? { mediaId: originalMediaId, outputUrl: undefined }
      : props.node.data.takes?.find((take) => take.id === other)
  const mediaAccess = useRef(props.getMedia)
  mediaAccess.current = props.getMedia
  useEffect(() => {
    let disposed = false
    let owned = ''
    setOtherUrl(otherTake?.outputUrl || '')
    if (otherTake?.mediaId) {
      void mediaAccess
        .current(otherTake.mediaId)
        .then((blob) => {
          if (blob && !disposed) {
            owned = URL.createObjectURL(blob)
            setOtherUrl(owned)
          }
        })
        .catch((error) => {
          if (!disposed) setError(String(error))
        })
    }
    return () => {
      disposed = true
      if (owned) URL.revokeObjectURL(owned)
    }
  }, [otherTake?.mediaId, otherTake?.outputUrl])
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const touched = useRef(false)
  const details = useRef({ width: 640, height: 360, duration: 3 })
  const kind = props.node.data.kind
  const canExtractAudio =
    audioProbe.id === props.node.data.mediaId && audioProbe.audio === true
  if (kind === 'text' || !props.previewUrl) return null
  const actions = STUDIO_NATIVE_EDITS[kind]
  const origin = props.node.data.derivedFrom
  const fields: (keyof StudioNativeEditParameters)[] = []
  if (action === 'trim') fields.push('start', 'end')
  if (action === 'frame') fields.push('start')
  if (action === 'crop') fields.push('x', 'y', 'width', 'height')
  if (action === 'resize') fields.push('width', 'height')
  if (action === 'rotate') fields.push('rotation')
  if (action === 'speed') fields.push('speed')
  const patch = (
    field: keyof StudioNativeEditParameters,
    value: number
  ): void => {
    touched.current = true
    setError('')
    setEdit((current) => ({ ...current, [field]: value }))
  }
  const submit = async (): Promise<void> => {
    if (action === 'extract_audio' && !canExtractAudio) {
      return
    }
    if (props.readOnly || props.node.data.locked || !props.node.data.mediaId) {
      return
    }
    setBusy(true)
    setError('')
    try {
      let blob: Blob | undefined
      if (action === 'annotate') {
        const target = canvas.current
        if (!target || !target.width || !target.height) {
          throw new Error(t('Image preview is not ready'))
        }
        blob = await new Promise<Blob>((resolve, reject) =>
          target.toBlob(
            (result) =>
              result
                ? resolve(result)
                : reject(new Error(t('Image export failed'))),
            'image/png'
          )
        )
      }
      const created = await props.onCreate(action, edit, blob)
      setJob(created || undefined)
      if (!created) setOpen(false)
    } catch (error) {
      markServerErrorHandled(error)
      setError(getServerErrorMessage(error, t('Image export failed')))
    } finally {
      setBusy(false)
    }
  }
  const refresh = async (): Promise<void> => {
    if (!job) return
    setBusy(true)
    setError('')
    try {
      const next = await studioCloudRequest<StudioCloudJob>(
        `/jobs/${encodeURIComponent(job.id)}`
      )
      if (!next) throw new Error(t('Task is unavailable'))
      setJob(next)
      if (next.status === 'succeeded') {
        await props.onRefresh(next)
        setOpen(false)
      }
      if (next.error) setError(next.error)
    } catch (error) {
      setError(
        error instanceof Error ? error.message : t('Task is unavailable')
      )
    } finally {
      setBusy(false)
    }
  }
  refreshJob.current = refresh
  const renderMedia = (url: string, trackDetails = true): React.ReactNode => {
    if (kind === 'image') {
      return (
        <img
          src={url}
          alt={props.node.data.title}
          className='max-h-[65vh] w-full object-contain'
          onLoad={(event) => {
            if (!trackDetails) return
            details.current.width = event.currentTarget.naturalWidth
            details.current.height = event.currentTarget.naturalHeight
            if (open && !touched.current) {
              setEdit((current) => ({
                ...current,
                width: details.current.width,
                height: details.current.height,
              }))
            }
          }}
        />
      )
    }
    if (kind === 'video') {
      return (
        <video
          src={url}
          controls
          className='max-h-[65vh] w-full'
          onLoadedMetadata={(event) => {
            if (!trackDetails) return
            const video = event.currentTarget
            details.current = {
              width: video.videoWidth,
              height: video.videoHeight,
              duration: video.duration,
            }
            if (open && !touched.current) {
              setEdit((current) => ({
                ...current,
                width: video.videoWidth,
                height: video.videoHeight,
                end: video.duration,
              }))
            }
          }}
        />
      )
    }
    return (
      <audio
        src={url}
        controls
        className='w-full'
        onLoadedMetadata={(event) => {
          if (!trackDetails) return
          details.current.duration = event.currentTarget.duration
          if (open && !touched.current) {
            setEdit((current) => ({
              ...current,
              end: event.currentTarget.duration,
            }))
          }
        }}
      />
    )
  }
  let editingPreview = renderMedia(props.previewUrl)
  if (action === 'crop' && kind !== 'audio') {
    editingPreview = (
      <StudioCropRegion
        width={details.current.width}
        height={details.current.height}
        value={edit}
        disabled={busy || !!props.readOnly}
        onChange={(patch) => {
          touched.current = true
          setEdit((current) => ({ ...current, ...patch }))
        }}
      >
        {editingPreview}
      </StudioCropRegion>
    )
  }
  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap gap-2'>
        {kind === 'image' && props.node.data.mediaId && (
          <StudioImageGrid
            key={`grid:${props.projectId}:${props.node.id}`}
            disabled={props.readOnly || props.node.data.locked}
            mediaId={props.node.data.mediaId}
            getMedia={props.getMedia}
            onCell={async (blob, index, bounds) => {
              await props.onCreate(
                'crop',
                { ...edit, ...bounds },
                blob,
                undefined,
                t('Grid cell {{number}}', { number: index }),
                false
              )
            }}
          />
        )}
        {kind === 'image' && (
          <StudioImageLayerEditor
            key={`${props.projectId}:${props.node.id}`}
            node={props.node}
            nodes={props.nodes || [props.node]}
            disabled={props.readOnly || props.node.data.locked}
            getMedia={props.getMedia}
            onSave={async (layers, blob) => {
              await props.onCreate(
                'annotate',
                { ...edit, width: layers.width, height: layers.height },
                blob,
                layers
              )
            }}
          />
        )}
        <Button size='sm' variant='outline' onClick={() => setCompare(true)}>
          {t('Enlarge and compare')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          disabled={
            props.readOnly || !props.node.data.mediaId || props.node.data.locked
          }
          onClick={() => {
            touched.current = false
            setEdit((current) => ({
              ...current,
              width: details.current.width,
              height: details.current.height,
              start: 0,
              end: details.current.duration,
            }))
            setAction(actions[0])
            setJob(undefined)
            setError('')
            setOpen(true)
          }}
        >
          {t('Edit this media for free')}
        </Button>
        {origin && (
          <Button
            size='sm'
            variant='ghost'
            onClick={() => props.onSource(origin.nodeId)}
          >
            {t('Locate original media')}
          </Button>
        )}
      </div>
      <Dialog
        open={compare}
        onOpenChange={setCompare}
        title={t('Enlarge and compare')}
        description={props.node.data.title}
        contentClassName='sm:max-w-5xl'
      >
        <div className='grid gap-4 md:grid-cols-2'>
          <div>{renderMedia(props.previewUrl)}</div>
          <div className='space-y-3'>
            <Select
              value={other || null}
              onValueChange={(value) => setOther(value || '')}
              items={[
                ...(originalOption
                  ? [
                      {
                        value: originalOption,
                        label: t('Original source version'),
                      },
                    ]
                  : []),
                ...(props.node.data.takes || [])
                  .filter(
                    (take) =>
                      take.status === 'completed' &&
                      (take.outputUrl || take.mediaId)
                  )
                  .map((take, index) => ({
                    value: take.id,
                    label: `${t('Take')} ${index + 1}`,
                  })),
              ]}
            >
              <SelectTrigger aria-label={t('Compare candidate')}>
                <SelectValue placeholder={t('Compare candidate')} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {originalOption && (
                    <SelectItem value={originalOption}>
                      {t('Original source version')}
                    </SelectItem>
                  )}
                  {props.node.data.takes
                    ?.filter(
                      (take) =>
                        take.status === 'completed' &&
                        (take.outputUrl || take.mediaId)
                    )
                    .map((take, index) => (
                      <SelectItem key={take.id} value={take.id}>
                        {t('Take')} {index + 1}
                      </SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {otherUrl && renderMedia(otherUrl, false)}
          </div>
        </div>
      </Dialog>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('Edit this media for free')}
        description={t(
          'A new result is saved with its original source. No model is called.'
        )}
      >
        <div className='space-y-4'>
          <Select
            value={action}
            onValueChange={(value) => {
              if (actions.includes(value as never)) {
                setError('')
                setAction(value as StudioNativeEdit)
              }
            }}
            items={actions.map((value) => ({
              value,
              label: t(`studio.edit.${value}`),
            }))}
          >
            <SelectTrigger aria-label={t('Media operation')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {actions.map((value) => (
                  <SelectItem
                    key={value}
                    value={value}
                    disabled={value === 'extract_audio' && !canExtractAudio}
                    title={
                      value === 'extract_audio' && !canExtractAudio
                        ? t(
                            'This video has no audio track. Choose a video with sound or add separate audio.'
                          )
                        : undefined
                    }
                  >
                    {t(`studio.edit.${value}`)}
                    {value === 'extract_audio' &&
                      !canExtractAudio &&
                      ` · ${t('No audio track')}`}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {kind === 'video' &&
            audioProbe.audio === false &&
            action === 'extract_audio' && (
              <p role='status'>
                {t(
                  'This video has no audio track. Choose a video with sound or add separate audio.'
                )}
              </p>
            )}
          {action === 'annotate' ? (
            <div className='space-y-2'>
              <Input
                type='color'
                aria-label={t('Annotation color')}
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
              <img
                hidden
                src={props.previewUrl}
                alt=''
                onLoad={(event) => {
                  const image = event.currentTarget
                  const target = canvas.current
                  if (target) {
                    if (image.naturalWidth * image.naturalHeight > 16777216) {
                      target.width = 0
                      target.height = 0
                      setError(t('Image dimensions exceed the editing limit'))
                      return
                    }
                    target.width = image.naturalWidth
                    target.height = image.naturalHeight
                    target.getContext('2d')?.drawImage(image, 0, 0)
                  }
                }}
              />
              <canvas
                ref={canvas}
                className='w-full touch-none border'
                aria-label={t('Draw annotations')}
                onPointerDown={(event) => {
                  drawing.current = true
                  event.currentTarget.setPointerCapture(event.pointerId)
                  const ctx = event.currentTarget.getContext('2d')
                  const rect = event.currentTarget.getBoundingClientRect()
                  ctx?.beginPath()
                  ctx?.moveTo(
                    ((event.clientX - rect.left) * event.currentTarget.width) /
                      rect.width,
                    ((event.clientY - rect.top) * event.currentTarget.height) /
                      rect.height
                  )
                }}
                onPointerMove={(event) => {
                  if (!drawing.current) return
                  const target = event.currentTarget
                  const ctx = target.getContext('2d')
                  if (!ctx) return
                  const rect = target.getBoundingClientRect()
                  ctx.strokeStyle = color
                  ctx.lineWidth = Math.max(2, target.width / 150)
                  ctx.lineCap = 'round'
                  ctx.lineTo(
                    ((event.clientX - rect.left) * target.width) / rect.width,
                    ((event.clientY - rect.top) * target.height) / rect.height
                  )
                  ctx.stroke()
                }}
                onPointerUp={() => {
                  drawing.current = false
                }}
                onPointerCancel={() => {
                  drawing.current = false
                }}
              />
            </div>
          ) : (
            editingPreview
          )}
          <div className='grid grid-cols-2 gap-3'>
            {fields.map((field) => (
              <Field key={field}>
                <FieldLabel>{t(`studio.edit.${field}`)}</FieldLabel>
                <Input
                  aria-label={t(`studio.edit.${field}`)}
                  disabled={busy || props.readOnly}
                  type='number'
                  value={edit[field]}
                  onChange={(event) => patch(field, Number(event.target.value))}
                  step={
                    field === 'start' || field === 'end' || field === 'speed'
                      ? 0.1
                      : 1
                  }
                />
              </Field>
            ))}
          </div>
          {!props.node.data.mediaId && (
            <p role='status'>
              {t(
                'The source changed. Close this editor, choose a completed candidate version and reopen it. Your edit parameters are retained.'
              )}
            </p>
          )}
          {error && (
            <Alert variant='destructive'>
              <AlertDescription>
                {t(studioWorkflowProblem(error))}
                <details>
                  <summary>{t('Technical details')}</summary>
                  <p className='break-all'>{error}</p>
                </details>
                {/conflict|revision|stale/i.test(error) && (
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={busy}
                    onClick={() => {
                      setBusy(true)
                      void props
                        .onRefresh()
                        .then(() => setError(''))
                        .catch((error) =>
                          setError(
                            error instanceof Error
                              ? error.message
                              : String(error)
                          )
                        )
                        .finally(() => setBusy(false))
                    }}
                  >
                    {t('Read latest version and keep my edit')}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          {job ? (
            <div className='flex flex-wrap items-center gap-3'>
              <span role='status'>
                {t(`studio.production.status.${job.status}`)} · {job.progress}%
              </span>
              <Button disabled={busy} onClick={() => void refresh()}>
                {t('Check result')}
              </Button>
              {['queued', 'running', 'waiting'].includes(job.status) && (
                <Button
                  variant='outline'
                  onClick={() =>
                    void studioCloudRequest(
                      `/jobs/${encodeURIComponent(job.id)}/control`,
                      'POST',
                      { action: 'cancel' }
                    )
                      .then(refresh)
                      .catch((error) => setError(String(error)))
                  }
                >
                  {t('Cancel')}
                </Button>
              )}
            </div>
          ) : (
            <Button
              disabled={
                busy ||
                props.readOnly ||
                !props.node.data.mediaId ||
                (action === 'extract_audio' && !canExtractAudio)
              }
              onClick={() => void submit()}
            >
              {t('Save edited copy')}
            </Button>
          )}
        </div>
      </Dialog>
    </div>
  )
}
