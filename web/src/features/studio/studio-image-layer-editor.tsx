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

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import type { StudioCanvasNode } from './canvas-flow'
import {
  createStudioImageLayers,
  changeStudioImageLayer,
  exportStudioImageLayers,
  fitStudioImageLayer,
  renderStudioImageLayers,
  studioImageLayersSchema,
  type StudioImageLayer,
  type StudioImageLayers,
} from './studio-image-layers'

export function StudioImageLayerEditor(props: {
  node: StudioCanvasNode
  nodes: StudioCanvasNode[]
  disabled?: boolean
  getMedia: (id: string) => Promise<Blob | null>
  onSave: (document: StudioImageLayers, blob: Blob) => Promise<void>
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [discard, setDiscard] = useState(false)
  const [document, setDocument] = useState<StudioImageLayers>()
  const [selected, setSelected] = useState('')
  const [past, setPast] = useState<StudioImageLayers[]>([])
  const [future, setFuture] = useState<StudioImageLayers[]>([])
  const [sourceId, setSourceId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState('')
  const [ready, setReady] = useState(false)
  const [loadedMediaIds, setLoadedMediaIds] = useState('')
  const baseline = useRef('')
  const drag = useRef<{
    id: string
    x: number
    y: number
    layerX: number
    layerY: number
    document: StudioImageLayers
  } | null>(null)
  const images = useRef(new Map<string, ImageBitmap>())
  const sourceAccess = useRef(props.getMedia)
  sourceAccess.current = props.getMedia
  const layer = document?.layers.find((layer) => layer.id === selected)
  const mediaIds = [
    ...new Set(
      document?.layers
        .map((layer) => layer.mediaId)
        .filter((id): id is string => !!id) || []
    ),
  ].join('\n')
  const sourcesReady = ready && loadedMediaIds === mediaIds
  const load = async (): Promise<void> => {
    if (props.disabled || !props.node.data.mediaId) return
    setBusy(true)
    setError('')
    setOpen(true)
    try {
      let restored = props.node.data.imageLayers
      if (!restored) {
        const blob = await props.getMedia(props.node.data.mediaId)
        if (!blob) throw new Error(t('Image layer source is unavailable'))
        const image = await createImageBitmap(blob)
        const scale = Math.min(1, 2048 / image.width, 2048 / image.height)
        restored = createStudioImageLayers(
          props.node.data.mediaId,
          Math.max(16, Math.round(image.width * scale)),
          Math.max(16, Math.round(image.height * scale)),
          props.node.data.title
        )
        image.close()
      }
      restored = studioImageLayersSchema.parse(restored)
      baseline.current = JSON.stringify(restored)
      setDocument(restored)
      setSelected(restored.layers.at(-1)?.id || '')
      setPast([])
      setFuture([])
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : t('Image editor could not open')
      )
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (!open || !mediaIds) return
    let disposed = false
    const owned = new Map<string, ImageBitmap>()
    setReady(false)
    void Promise.all(
      mediaIds.split('\n').map(async (id) => {
        const blob = await sourceAccess.current(id)
        if (!blob) throw new Error('Image layer source is unavailable')
        const image = await createImageBitmap(blob)
        if (disposed) image.close()
        else owned.set(id, image)
      })
    )
      .then(() => {
        if (!disposed) {
          images.current = owned
          setLoadedMediaIds(mediaIds)
          setReady(true)
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setError(error instanceof Error ? error.message : String(error))
        }
      })
    return () => {
      disposed = true
      setReady(false)
      for (const image of owned.values()) image.close()
      if (images.current === owned) images.current = new Map()
    }
  }, [open, mediaIds])
  useEffect(() => {
    if (!open || !sourcesReady || !document) return
    try {
      setPreview(
        renderStudioImageLayers(document, images.current).toDataURL('image/png')
      )
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    }
  }, [open, sourcesReady, document])
  const commit = (next: StudioImageLayers): boolean => {
    if (!document || props.disabled || busy) return false
    const result = studioImageLayersSchema.safeParse(next)
    if (!result.success) {
      setError(t('Check image layer dimensions and required fields'))
      return false
    }
    const validated = result.data
    setPast((past) => [...past, document].slice(-30))
    setFuture([])
    setDocument(validated)
    setError('')
    return true
  }
  const patch = (change: Partial<StudioImageLayer>): void => {
    if (!document || !layer) return
    try {
      commit(changeStudioImageLayer(document, layer.id, change))
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    }
  }
  const undo = (): void => {
    const previous = past.at(-1)
    if (!previous || !document || busy || props.disabled) return
    setFuture((future) => [document, ...future].slice(0, 30))
    setPast(past.slice(0, -1))
    setDocument(previous)
    if (!previous.layers.some((layer) => layer.id === selected)) {
      setSelected(previous.layers.at(-1)?.id || '')
    }
  }
  const redo = (): void => {
    const next = future[0]
    if (!next || !document || busy || props.disabled) return
    setPast((past) => [...past, document].slice(-30))
    setFuture(future.slice(1))
    setDocument(next)
    if (!next.layers.some((layer) => layer.id === selected)) {
      setSelected(next.layers.at(-1)?.id || '')
    }
  }
  const add = async (
    kind: StudioImageLayer['kind'],
    mediaId?: string
  ): Promise<void> => {
    if (!document || busy || props.disabled) return
    let bounds = {
      x: 24,
      y: 24,
      width: Math.max(16, document.width - 48),
      height: kind === 'text' ? 80 : Math.max(16, document.height / 3),
    }
    if (kind === 'image') {
      if (!mediaId) return
      setBusy(true)
      try {
        const blob = await props.getMedia(mediaId)
        if (!blob) throw new Error(t('Image layer source is unavailable'))
        const image = await createImageBitmap(blob)
        try {
          bounds = fitStudioImageLayer(document, image)
        } finally {
          image.close()
        }
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : t('Image editor could not open')
        )
        return
      } finally {
        setBusy(false)
      }
    }
    const next = {
      id: crypto.randomUUID(),
      name: t('New {{kind}} layer', { kind: t(`Layer type: ${kind}`) }),
      kind,
      mediaId,
      text: kind === 'text' ? t('Your title') : '',
      ...bounds,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      color: '#ffffff',
      fontSize: 48,
      bold: false,
    }
    if (commit({ ...document, layers: [...document.layers, next] })) {
      setSelected(next.id)
    }
  }
  const exportFile = async (
    format: 'png' | 'jpg' | 'psd',
    save = false
  ): Promise<void> => {
    if (!document || !sourcesReady || busy) return
    setBusy(true)
    setError('')
    try {
      const blob = await exportStudioImageLayers(
        document,
        images.current,
        format
      )
      if (save) {
        await props.onSave(document, blob)
        baseline.current = JSON.stringify(document)
        setOpen(false)
      } else {
        const url = URL.createObjectURL(blob)
        const link = window.document.createElement('a')
        link.href = url
        link.download = `${props.node.data.title}.${format}`
        link.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 10000)
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button
        size='sm'
        variant='outline'
        disabled={props.disabled || !props.node.data.mediaId}
        onClick={() => void load()}
      >
        {t('Edit image layers')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (busy) return
          if (
            !value &&
            document &&
            JSON.stringify(document) !== baseline.current
          ) {
            setDiscard(true)
          } else setOpen(value)
        }}
        title={t('Image layer editor')}
        description={t(
          'Add text, shapes and stored images. Save an editable copy while keeping the original.'
        )}
        contentClassName='sm:max-w-5xl'
        footer={
          <div className='flex flex-wrap gap-2'>
            {(['png', 'jpg', 'psd'] as const).map((format) => (
              <Button
                key={format}
                variant='outline'
                disabled={!sourcesReady || busy}
                onClick={() => void exportFile(format)}
              >
                {t('Export {{format}}', { format: format.toUpperCase() })}
              </Button>
            ))}
            <Button
              disabled={!sourcesReady || busy || props.disabled}
              onClick={() => void exportFile('png', true)}
            >
              {t('Save editable image copy')}
            </Button>
          </div>
        }
      >
        {error && (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {busy && <p role='status'>{t('Preparing image layers')}</p>}
        {document && (
          <div className='grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_300px]'>
            <div className='flex min-w-0 flex-col gap-3'>
              <div className='flex flex-wrap gap-2'>
                <Button
                  variant='outline'
                  disabled={!past.length || busy || props.disabled}
                  onClick={undo}
                >
                  {t('Undo')}
                </Button>
                <Button
                  variant='outline'
                  disabled={!future.length || busy || props.disabled}
                  onClick={redo}
                >
                  {t('Redo')}
                </Button>
                {(['text', 'rectangle', 'ellipse'] as const).map((kind) => (
                  <Button
                    key={kind}
                    variant='outline'
                    disabled={
                      document.layers.length >= 50 || busy || props.disabled
                    }
                    onClick={() => add(kind)}
                  >
                    {t('Add {{kind}} layer', {
                      kind: t(`Layer type: ${kind}`),
                    })}
                  </Button>
                ))}
              </div>
              {preview && (
                <img
                  src={preview}
                  draggable={false}
                  tabIndex={0}
                  alt={t('Composited image preview')}
                  className='max-h-[60vh] max-w-full rounded-lg border'
                  onKeyDown={(event) => {
                    if (
                      (event.ctrlKey || event.metaKey) &&
                      event.key.toLowerCase() === 'z'
                    ) {
                      event.preventDefault()
                      event.stopPropagation()
                      if (event.shiftKey) redo()
                      else undo()
                      return
                    }
                    if (!layer || layer.locked || busy || props.disabled) return
                    const step = event.shiftKey ? 10 : 1
                    const directions: Record<string, [number, number]> = {
                      ArrowLeft: [-step, 0],
                      ArrowRight: [step, 0],
                      ArrowUp: [0, -step],
                      ArrowDown: [0, step],
                    }
                    const direction = directions[event.key]
                    if (direction) {
                      event.preventDefault()
                      event.stopPropagation()
                      patch({
                        x: layer.x + direction[0],
                        y: layer.y + direction[1],
                      })
                    }
                  }}
                  onPointerDown={(event) => {
                    if (busy || props.disabled || event.button !== 0) return
                    const bounds = event.currentTarget.getBoundingClientRect()
                    const x =
                      ((event.clientX - bounds.left) * document.width) /
                      bounds.width
                    const y =
                      ((event.clientY - bounds.top) * document.height) /
                      bounds.height
                    const target = [...document.layers]
                      .reverse()
                      .find((layer) => {
                        if (!layer.visible || layer.locked) return false
                        const angle = (-layer.rotation * Math.PI) / 180
                        const dx = x - layer.x - layer.width / 2,
                          dy = y - layer.y - layer.height / 2
                        const localX =
                          dx * Math.cos(angle) -
                          dy * Math.sin(angle) +
                          layer.width / 2
                        const localY =
                          dx * Math.sin(angle) +
                          dy * Math.cos(angle) +
                          layer.height / 2
                        return (
                          localX >= 0 &&
                          localX <= layer.width &&
                          localY >= 0 &&
                          localY <= layer.height
                        )
                      })
                    if (!target) return
                    setSelected(target.id)
                    drag.current = {
                      id: target.id,
                      x: event.clientX,
                      y: event.clientY,
                      layerX: target.x,
                      layerY: target.y,
                      document,
                    }
                    event.currentTarget.setPointerCapture(event.pointerId)
                  }}
                  onPointerMove={(event) => {
                    const moving = drag.current
                    if (!moving || props.disabled || busy) return
                    const bounds = event.currentTarget.getBoundingClientRect()
                    try {
                      setDocument(
                        changeStudioImageLayer(document, moving.id, {
                          x: Math.round(
                            moving.layerX +
                              ((event.clientX - moving.x) * document.width) /
                                bounds.width
                          ),
                          y: Math.round(
                            moving.layerY +
                              ((event.clientY - moving.y) * document.height) /
                                bounds.height
                          ),
                        })
                      )
                    } catch {
                      setError(
                        t('Keep image layers within the supported workspace')
                      )
                    }
                  }}
                  onPointerUp={() => {
                    const completed = drag.current
                    if (
                      completed &&
                      JSON.stringify(document) !==
                        JSON.stringify(completed.document)
                    ) {
                      setPast((past) =>
                        [...past, completed.document].slice(-30)
                      )
                      setFuture([])
                    }
                    drag.current = null
                  }}
                  onPointerCancel={() => {
                    if (drag.current) setDocument(drag.current.document)
                    drag.current = null
                  }}
                />
              )}
              <FieldGroup className='grid grid-cols-2 gap-3'>
                {(['width', 'height'] as const).map((key) => (
                  <Field key={key}>
                    <FieldLabel>{t(`Image canvas ${key}`)}</FieldLabel>
                    <Input
                      type='number'
                      min={16}
                      max={2048}
                      value={document[key]}
                      disabled={busy || props.disabled}
                      aria-label={t(`Image canvas ${key}`)}
                      onChange={(event) => {
                        const value = Number(event.target.value)
                        if (
                          Number.isInteger(value) &&
                          value >= 16 &&
                          value <= 2048
                        ) {
                          commit({ ...document, [key]: value })
                        }
                      }}
                    />
                  </Field>
                ))}
              </FieldGroup>
              <Select
                value={sourceId}
                onValueChange={(value) => setSourceId(value || '')}
              >
                <SelectTrigger aria-label={t('Image source for new layer')}>
                  <SelectValue>
                    {
                      props.nodes.find((node) => node.id === sourceId)?.data
                        .title
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {props.nodes
                      .filter(
                        (node) =>
                          node.data.kind === 'image' && node.data.mediaId
                      )
                      .map((node) => (
                        <SelectItem key={node.id} value={node.id}>
                          {node.data.title}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                variant='outline'
                disabled={
                  !sourceId ||
                  document.layers.length >= 50 ||
                  busy ||
                  props.disabled
                }
                onClick={() =>
                  void add(
                    'image',
                    props.nodes.find((node) => node.id === sourceId)?.data
                      .mediaId
                  )
                }
              >
                {t('Add stored image layer')}
              </Button>
            </div>
            <div className='flex min-w-0 flex-col gap-3'>
              <Select
                value={selected}
                onValueChange={(value) => setSelected(value || '')}
              >
                <SelectTrigger aria-label={t('Selected image layer')}>
                  <SelectValue>{layer?.name}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {[...document.layers].reverse().map((layer) => (
                      <SelectItem key={layer.id} value={layer.id}>
                        {layer.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {layer && (
                <FieldGroup>
                  <Field>
                    <FieldLabel>{t('Layer name')}</FieldLabel>
                    <Input
                      aria-label={t('Layer name')}
                      value={layer.name}
                      maxLength={200}
                      disabled={layer.locked || busy || props.disabled}
                      onChange={(event) => patch({ name: event.target.value })}
                    />
                  </Field>
                  {layer.kind === 'text' && (
                    <Field>
                      <FieldLabel>{t('Layer text')}</FieldLabel>
                      <Textarea
                        aria-label={t('Layer text')}
                        value={layer.text}
                        maxLength={3000}
                        disabled={layer.locked || busy || props.disabled}
                        onChange={(event) =>
                          patch({ text: event.target.value })
                        }
                      />
                    </Field>
                  )}
                  <div className='grid grid-cols-2 gap-3'>
                    {(
                      [
                        'x',
                        'y',
                        'width',
                        'height',
                        'rotation',
                        'opacity',
                        'fontSize',
                      ] as const
                    ).map((key) => (
                      <Field key={key}>
                        <FieldLabel>{t(`Layer ${key}`)}</FieldLabel>
                        <Input
                          aria-label={t(`Layer ${key}`)}
                          type='number'
                          step={key === 'opacity' ? 0.1 : 1}
                          value={layer[key]}
                          disabled={layer.locked || busy || props.disabled}
                          onChange={(event) => {
                            const value = Number(event.target.value)
                            if (Number.isFinite(value)) patch({ [key]: value })
                          }}
                        />
                      </Field>
                    ))}
                  </div>
                  <Field>
                    <FieldLabel>{t('Layer color')}</FieldLabel>
                    <Input
                      type='color'
                      aria-label={t('Layer color')}
                      value={layer.color}
                      disabled={layer.locked || busy || props.disabled}
                      onChange={(event) => patch({ color: event.target.value })}
                    />
                  </Field>
                  {(['visible', 'locked', 'bold'] as const).map((key) => (
                    <Field key={key} orientation='horizontal'>
                      <Checkbox
                        aria-label={t(`Layer ${key}`)}
                        checked={layer[key]}
                        disabled={
                          busy ||
                          props.disabled ||
                          (layer.locked && key !== 'locked')
                        }
                        onCheckedChange={(checked) =>
                          patch({ [key]: checked === true })
                        }
                      />
                      <FieldLabel>{t(`Layer ${key}`)}</FieldLabel>
                    </Field>
                  ))}
                  <div className='flex flex-wrap gap-2'>
                    {[-1, 1].map((direction) => {
                      const index = document.layers.findIndex(
                        (item) => item.id === layer.id
                      )
                      return (
                        <Button
                          key={direction}
                          variant='outline'
                          disabled={
                            busy ||
                            props.disabled ||
                            layer.locked ||
                            index + direction < 0 ||
                            index + direction >= document.layers.length
                          }
                          onClick={() => {
                            const layers = [...document.layers]
                            ;[layers[index], layers[index + direction]] = [
                              layers[index + direction],
                              layers[index],
                            ]
                            commit({ ...document, layers })
                          }}
                        >
                          {t(
                            direction === 1
                              ? 'Move layer up'
                              : 'Move layer down'
                          )}
                        </Button>
                      )
                    })}
                  </div>
                  <Button
                    variant='outline'
                    disabled={
                      busy ||
                      props.disabled ||
                      layer.locked ||
                      document.layers.length <= 1
                    }
                    onClick={() => {
                      const layers = document.layers.filter(
                        (item) => item.id !== layer.id
                      )
                      commit({ ...document, layers })
                      setSelected(layers.at(-1)?.id || '')
                    }}
                  >
                    {t('Remove selected layer')}
                  </Button>
                </FieldGroup>
              )}
            </div>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={discard}
        onOpenChange={setDiscard}
        title={t('Discard image layer changes?')}
        desc={t('Save an editable image copy to keep your layer changes.')}
        confirmText={t('Discard changes')}
        destructive
        handleConfirm={() => {
          setDiscard(false)
          setOpen(false)
        }}
      />
    </>
  )
}
