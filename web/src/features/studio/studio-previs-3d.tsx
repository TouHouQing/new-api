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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'

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
import { api } from '@/lib/api'

import { studioPrevisSchema, type StudioPrevis } from './studio-previs'
import {
  upsertStudioPrevisKey,
  sampleStudioPrevisTrack,
  type StudioPrevisKey,
} from './studio-previs-keyframes'
import {
  captureStudioPrevisFrame,
  createStudioPrevisRuntime,
  type StudioPrevisRuntime,
} from './studio-previs-runtime'
import { studioProductionSchema } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import { addStudioNode, recordStudioTake, updateStudioNode } from './workspace'

type Runtime = StudioPrevisRuntime
export function StudioPrevis3D(
  options: { time?: number; onTimeChange?: (seconds: number) => void } = {}
) {
  const { t } = useTranslation()
  const { props, writable } = useStudioProductionContext()
  const scene = useMemo(
    () => props.project.production?.previs || studioPrevisSchema.parse({}),
    [props.project.production?.previs]
  )
  const advanced = useMemo(
    () => scene.advanced || { models: [], tracks: [], showPaths: true },
    [scene.advanced]
  )
  const mediaAccess = useRef(props.getMedia)
  mediaAccess.current = props.getMedia
  const mount = useRef<HTMLDivElement>(null)
  const runtime = useRef<Runtime | undefined>(undefined)
  const timeRef = useRef(0)
  const [localTime, setLocalTime] = useState(options.time || 0)
  const time = Math.min(scene.duration, Math.max(0, options.time ?? localTime))
  const setTime = (value: number) => {
    setLocalTime(value)
    options.onTimeChange?.(value)
  }
  const changeTime = useRef(setTime)
  changeTime.current = setTime
  useEffect(() => {
    timeRef.current = time
    runtime.current?.update(time)
  }, [time])
  const [target, setTarget] = useState('__camera__')
  const [key, setKey] = useState<StudioPrevisKey>({
    time: 0,
    x: 0,
    y: 0,
    z: 0,
    yaw: 20,
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [playing, setPlaying] = useState(false)
  const dragging = useRef<
    | {
        id: string
        x: number
        y: number
        z: number
        yaw: number
        dx: number
        dz: number
        moved: boolean
      }
    | undefined
  >(undefined)
  const [animations, setAnimations] = useState<Record<string, string[]>>({})
  const input = useRef<HTMLInputElement>(null)
  const update = (next: StudioPrevis): void =>
    props.onUpdate({
      ...props.project,
      production: {
        ...(props.project.production || studioProductionSchema.parse({})),
        previs: studioPrevisSchema.parse(next),
      },
    })
  const saveBlob = async (
    blob: Blob,
    title: string,
    kind?: 'image' | 'video'
  ): Promise<void> => {
    const id = crypto.randomUUID()
    const result = await api.put(
      `/api/studio/cloud/media/${id}?project_id=${encodeURIComponent(props.project.id)}`,
      blob,
      { headers: { 'Content-Type': blob.type } }
    )
    if (!result.data?.success) {
      throw new Error(result.data?.message || t('studio.project.saveFailed'))
    }
    if (kind) {
      const nodeId = crypto.randomUUID()
      const next = recordStudioTake(
        updateStudioNode(addStudioNode(props.project, kind, nodeId), nodeId, {
          title,
        }),
        nodeId,
        {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          prompt: title,
          sourceMode: 'upload',
          status: 'completed',
          mediaId: id,
        }
      )
      props.onUpdate(next)
      await props.onSave()
    } else {
      update({
        ...scene,
        advanced: {
          ...advanced,
          exports: [
            ...(advanced.exports || []).slice(-49),
            { modelMediaId: id, title, createdAt: new Date().toISOString() },
          ],
        },
      })
      await props.onSave()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = title
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 10000)
    }
  }
  useEffect(() => {
    const element = mount.current
    if (!element) return
    try {
      const current = createStudioPrevisRuntime(
        element,
        scene,
        (id) => mediaAccess.current(id),
        {
          translate: t,
          onError: setError,
          onAnimations: (id, names) =>
            setAnimations((previous) => ({ ...previous, [id]: names })),
        }
      )
      runtime.current = current
      current.update(timeRef.current)
      return () => {
        runtime.current = undefined
        current.dispose()
      }
    } catch (error) {
      setError(String(error))
    }
  }, [scene, advanced, t])
  useEffect(() => {
    if (!playing) return
    const started = performance.now() - timeRef.current * 1000
    let frame = 0
    const tick = (): void => {
      const value = ((performance.now() - started) / 1000) % scene.duration
      timeRef.current = value
      changeTime.current(value)
      runtime.current?.update(value)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, scene.duration])
  const targets = [
    { value: '__camera__', label: t('Camera') },
    ...[...scene.actors, ...scene.props, ...advanced.models].map((item) => ({
      value: item.id,
      label: item.title,
    })),
  ]
  const action = (operation: () => Promise<void>): void => {
    setBusy(true)
    setError('')
    void operation()
      .catch((error) => setError(String(error)))
      .finally(() => setBusy(false))
  }
  return (
    <div className='space-y-4'>
      {error && (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <p className='text-muted-foreground text-xs'>
        {t(
          'Select an object in the 3D preview and drag it on the ground. Releasing adds a position keyframe at the current playhead.'
        )}
      </p>
      <div
        ref={mount}
        className='touch-none'
        aria-label={t('Advanced 3D preview')}
        onPointerDown={(event) => {
          const current = runtime.current
          if (!current) return
          const rect = event.currentTarget.getBoundingClientRect()
          const x = (event.clientX - rect.left) / rect.width,
            y = (event.clientY - rect.top) / rect.height
          const object = current.pick(x, y)
          if (!object) return
          setTarget(object.id)
          setKey((previous) => ({
            ...previous,
            x: object.x,
            y: object.y,
            z: object.z,
          }))
          const ground = current.ground(x, y)
          if (!writable || !ground) return
          setPlaying(false)
          dragging.current = {
            ...object,
            dx: object.x - ground.x,
            dz: object.z - ground.z,
            moved: false,
          }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const moving = dragging.current,
            current = runtime.current
          if (!moving || !current) return
          const rect = event.currentTarget.getBoundingClientRect()
          const point = current.ground(
            (event.clientX - rect.left) / rect.width,
            (event.clientY - rect.top) / rect.height
          )
          if (!point) return
          moving.moved = true
          moving.x = Math.max(-100, Math.min(100, point.x + moving.dx))
          moving.z = Math.max(-100, Math.min(100, point.z + moving.dz))
          current.moveObject(moving.id, moving.x, moving.z)
        }}
        onPointerUp={() => {
          const moving = dragging.current
          dragging.current = undefined
          if (!moving || !writable || !moving.moved) return
          const previous = sampleStudioPrevisTrack(
            advanced.tracks.find((track) => track.targetId === moving.id)
              ?.keys || [],
            time,
            { ...key, time, yaw: moving.yaw }
          )
          update(
            upsertStudioPrevisKey(scene, moving.id, {
              ...previous,
              time,
              x: moving.x,
              y: moving.y,
              z: moving.z,
            })
          )
          setKey((previous) => ({
            ...previous,
            x: moving.x,
            y: moving.y,
            z: moving.z,
          }))
        }}
        onPointerCancel={() => {
          dragging.current = undefined
          runtime.current?.update(time)
        }}
      />
      <Button variant='outline' onClick={() => setPlaying(!playing)}>
        {t(playing ? 'studio.production.pause' : 'studio.production.play')}
      </Button>
      <Input
        type='range'
        min={0}
        max={scene.duration}
        step={0.05}
        value={time}
        aria-label={t('3D playhead')}
        onChange={(event) => {
          setPlaying(false)
          const value = Number(event.target.value)
          timeRef.current = value
          setTime(value)
          runtime.current?.update(value)
        }}
      />
      <div className='flex flex-wrap gap-2'>
        <Button
          disabled={!writable || busy}
          variant='outline'
          onClick={() => input.current?.click()}
        >
          {t('Import embedded GLB')}
        </Button>
        <Button
          disabled={!writable || busy}
          variant='outline'
          onClick={() =>
            action(async () => {
              const current = runtime.current
              if (!current) throw new Error('3D preview unavailable')
              await current.ready
              if (runtime.current !== current) {
                throw new Error('The 3D scene changed during export')
              }
              const blob = await new Promise<Blob>((resolve, reject) =>
                current.renderer.domElement.toBlob(
                  (blob) =>
                    blob
                      ? resolve(blob)
                      : reject(new Error('Screenshot failed')),
                  'image/png'
                )
              )
              await saveBlob(blob, t('3D screenshot'), 'image')
            })
          }
        >
          {t('Save 3D screenshot')}
        </Button>
        {(['whitebox', 'depth'] as const).map((mode) => (
          <Button
            key={mode}
            variant='outline'
            disabled={!writable || busy}
            onClick={() =>
              action(async () => {
                const current = runtime.current
                if (!current) throw new Error('3D preview unavailable')
                await current.ready
                if (runtime.current !== current) {
                  throw new Error('The 3D scene changed during export')
                }
                const url = captureStudioPrevisFrame(
                  current,
                  scene,
                  timeRef.current,
                  mode
                )
                const blob = await (await fetch(url)).blob()
                await saveBlob(
                  blob,
                  t(
                    mode === 'whitebox'
                      ? 'Whitebox camera reference'
                      : 'Depth camera reference'
                  ),
                  'image'
                )
              })
            }
          >
            {t(
              mode === 'whitebox'
                ? 'Save whitebox reference'
                : 'Save depth reference'
            )}
          </Button>
        ))}
        <Button
          disabled={!writable || busy}
          variant='outline'
          onClick={() =>
            action(async () => {
              if (!runtime.current) throw new Error('3D preview unavailable')
              const current = runtime.current
              await current.ready
              if (runtime.current !== current) {
                throw new Error('The 3D scene changed during export')
              }
              const baked = new Map<
                string,
                {
                  object: THREE.Object3D
                  positions: number[]
                  rotations: number[]
                }
              >()
              current.scene.traverse((object) => {
                if (
                  object instanceof THREE.Group ||
                  object instanceof THREE.Bone ||
                  object === current.camera
                ) {
                  baked.set(object.uuid, {
                    object,
                    positions: [],
                    rotations: [],
                  })
                }
              })
              const times = Array.from(
                { length: Math.ceil(scene.duration * 24) + 1 },
                (_, index) => Math.min(scene.duration, index / 24)
              )
              for (const seconds of times) {
                current.update(seconds)
                for (const item of baked.values()) {
                  item.positions.push(...item.object.position.toArray())
                  item.rotations.push(...item.object.quaternion.toArray())
                }
              }
              const animation = new THREE.AnimationClip(
                'Studio timeline',
                scene.duration,
                [...baked.values()].flatMap((item) => [
                  new THREE.VectorKeyframeTrack(
                    `${item.object.uuid}.position`,
                    times,
                    item.positions
                  ),
                  new THREE.QuaternionKeyframeTrack(
                    `${item.object.uuid}.quaternion`,
                    times,
                    item.rotations
                  ),
                ])
              )
              current.update(0)
              const output = await new GLTFExporter().parseAsync(
                current.scene,
                { binary: true, animations: [animation, ...current.clips] }
              )
              current.update(timeRef.current)
              if (!(output instanceof ArrayBuffer)) {
                throw new Error('GLB export failed')
              }
              await saveBlob(
                new Blob([output], { type: 'model/gltf-binary' }),
                'stage.glb'
              )
            })
          }
        >
          {t('Export GLB with animation')}
        </Button>
        <Button
          disabled={!writable || busy}
          variant='outline'
          onClick={() =>
            action(async () => {
              const current = runtime.current
              if (
                !current ||
                !window.MediaRecorder ||
                !MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
              ) {
                throw new Error('Video recording is unavailable')
              }
              await current.ready
              if (runtime.current !== current) {
                throw new Error('The 3D scene changed during export')
              }
              const stream = current.renderer.domElement.captureStream(24)
              const recorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp9',
              })
              const chunks: Blob[] = []
              recorder.ondataavailable = (event) => chunks.push(event.data)
              const finished = new Promise<Blob>((resolve, reject) => {
                recorder.onstop = () =>
                  resolve(new Blob(chunks, { type: 'video/webm' }))
                recorder.onerror = () => reject(new Error('Recording failed'))
              })
              recorder.start()
              const started = performance.now()
              await new Promise<void>((resolve) => {
                const tick = (): void => {
                  const value = (performance.now() - started) / 1000
                  current.update(Math.min(value, scene.duration))
                  if (value >= scene.duration) {
                    recorder.stop()
                    resolve()
                  } else requestAnimationFrame(tick)
                }
                tick()
              })
              try {
                await saveBlob(
                  await finished,
                  t('3D animation recording'),
                  'video'
                )
              } finally {
                stream.getTracks().forEach((track) => track.stop())
                current.update(timeRef.current)
              }
            })
          }
        >
          {t('Record 3D animation')}
        </Button>
      </div>
      <input
        hidden
        ref={input}
        type='file'
        accept='.glb'
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file) return
          action(async () => {
            if (file.size > 50 * 1024 * 1024) {
              throw new Error('GLB exceeds 50 MiB')
            }
            const data = await file.arrayBuffer()
            const header = new DataView(data)
            if (
              header.byteLength < 20 ||
              header.getUint32(0, true) !== 0x46546c67 ||
              header.getUint32(4, true) !== 2
            ) {
              throw new Error('Choose a glTF 2 binary file')
            }
            const id = crypto.randomUUID()
            const result = await api.put(
              `/api/studio/cloud/media/${id}?project_id=${encodeURIComponent(props.project.id)}`,
              new Blob([data], { type: 'model/gltf-binary' }),
              { headers: { 'Content-Type': 'model/gltf-binary' } }
            )
            if (!result.data?.success) throw new Error('3D upload failed')
            update({
              ...scene,
              advanced: {
                ...advanced,
                models: [
                  ...advanced.models,
                  {
                    id: crypto.randomUUID(),
                    title: file.name.slice(0, 200),
                    modelMediaId: id,
                    x: 0,
                    y: 0,
                    z: 0,
                    scale: 1,
                    animation: '',
                  },
                ],
              },
            })
            await props.onSave()
          })
        }}
      />
      <p className='text-muted-foreground text-xs'>
        {t(
          'GLB must embed its textures and buffers. Compressed extensions require conversion before import.'
        )}
      </p>
      {advanced.models.map((model) => (
        <div key={model.id} className='flex flex-wrap items-center gap-2'>
          <span>{model.title}</span>
          <Input
            type='number'
            min={0.01}
            max={10}
            step={0.01}
            className='w-24'
            value={model.scale}
            aria-label={t('3D model scale')}
            disabled={!writable}
            onChange={(event) => {
              const scale = Number(event.target.value)
              if (scale >= 0.01 && scale <= 10) {
                update({
                  ...scene,
                  advanced: {
                    ...advanced,
                    models: advanced.models.map((item) =>
                      item.id === model.id ? { ...item, scale } : item
                    ),
                  },
                })
              }
            }}
          />
          {(['x', 'y', 'z', 'yaw', 'pitch', 'roll'] as const).map((key) => (
            <Field key={key}>
              <FieldLabel>{t(`3D model ${key}`)}</FieldLabel>
              <Input
                aria-label={t(`3D model ${key}`)}
                type='number'
                className='w-24'
                min={['x', 'y', 'z'].includes(key) ? -10 : -180}
                max={['x', 'y', 'z'].includes(key) ? 10 : 180}
                step={['x', 'y', 'z'].includes(key) ? 0.1 : 1}
                disabled={
                  !writable ||
                  advanced.tracks.some((track) => track.targetId === model.id)
                }
                value={model[key] || 0}
                onChange={(event) => {
                  const value = Number(event.target.value),
                    limit = ['x', 'y', 'z'].includes(key) ? 10 : 180
                  if (!Number.isFinite(value) || Math.abs(value) > limit) return
                  update({
                    ...scene,
                    advanced: {
                      ...advanced,
                      models: advanced.models.map((item) =>
                        item.id === model.id ? { ...item, [key]: value } : item
                      ),
                    },
                  })
                }}
              />
            </Field>
          ))}
          {advanced.tracks.some((track) => track.targetId === model.id) && (
            <p className='text-muted-foreground text-xs'>
              {t('Edit keyframes to position an animated model.')}
            </p>
          )}
          <Select
            disabled={!writable}
            value={model.animation || animations[model.id]?.[0] || '__none__'}
            onValueChange={(animation) =>
              update({
                ...scene,
                advanced: {
                  ...advanced,
                  models: advanced.models.map((item) =>
                    item.id === model.id
                      ? { ...item, animation: animation || '' }
                      : item
                  ),
                },
              })
            }
            items={[
              { value: '__none__', label: t('Static pose') },
              ...(animations[model.id] || []).map((value) => ({
                value,
                label: value,
              })),
            ]}
          >
            <SelectTrigger aria-label={t('3D model action')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value='__none__'>{t('Static pose')}</SelectItem>
                {animations[model.id]?.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            disabled={!writable}
            variant='ghost'
            onClick={() =>
              update({
                ...scene,
                advanced: {
                  ...advanced,
                  models: advanced.models.filter(
                    (item) => item.id !== model.id
                  ),
                  tracks: advanced.tracks.filter(
                    (track) => track.targetId !== model.id
                  ),
                  followId:
                    advanced.followId === model.id
                      ? undefined
                      : advanced.followId,
                  lookAtId:
                    advanced.lookAtId === model.id
                      ? undefined
                      : advanced.lookAtId,
                },
              })
            }
          >
            {t('Remove')}
          </Button>
        </div>
      ))}
      <div className='grid gap-3 sm:grid-cols-3'>
        {(['followId', 'lookAtId'] as const).map((field) => (
          <Field key={field}>
            <FieldLabel>{t(`studio.previs.${field}`)}</FieldLabel>
            <Select
              value={advanced[field] || 'none'}
              onValueChange={(value) =>
                update({
                  ...scene,
                  advanced: {
                    ...advanced,
                    [field]: value === 'none' ? undefined : value || undefined,
                  },
                })
              }
              items={[
                { value: 'none', label: t('None') },
                ...targets.filter((item) => item.value !== '__camera__'),
              ]}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='none'>{t('None')}</SelectItem>
                  {targets
                    .filter((item) => item.value !== '__camera__')
                    .map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ))}
      </div>
      <div className='grid gap-3 sm:grid-cols-5'>
        <Select
          value={target}
          onValueChange={(value) => {
            if (value) setTarget(value)
          }}
          items={targets}
        >
          <SelectTrigger aria-label={t('Keyframe track')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {targets.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {(['x', 'y', 'z', 'yaw'] as const).map((field) => (
          <Field key={field}>
            <FieldLabel>{t(`studio.previs.axis.${field}`)}</FieldLabel>
            <Input
              disabled={!writable}
              type='number'
              aria-label={t(`studio.previs.axis.${field}`)}
              min={field === 'yaw' ? -180 : -100}
              max={field === 'yaw' ? 180 : 100}
              step={0.1}
              value={key[field]}
              onChange={(event) =>
                setKey((current) => ({
                  ...current,
                  [field]: Number(event.target.value),
                }))
              }
            />
          </Field>
        ))}
      </div>
      <Button
        disabled={!writable}
        onClick={() => {
          try {
            update(upsertStudioPrevisKey(scene, target, { ...key, time }))
          } catch (error) {
            setError(String(error))
          }
        }}
      >
        {t('Save keyframe at playhead')}
      </Button>
      <div className='space-y-2'>
        {advanced.tracks.map((track) => (
          <div
            key={track.targetId}
            className='flex flex-wrap items-center gap-2'
          >
            <span>
              {targets.find((item) => item.value === track.targetId)?.label ||
                track.targetId}
            </span>
            {track.keys.map((key) => (
              <Button
                key={key.time}
                variant='outline'
                size='sm'
                disabled={!writable}
                onClick={() => {
                  setTarget(track.targetId)
                  setKey(key)
                  setTime(key.time)
                  timeRef.current = key.time
                  runtime.current?.update(key.time)
                }}
              >
                {key.time}s
              </Button>
            ))}
            <Button
              disabled={!writable}
              variant='ghost'
              size='sm'
              onClick={() =>
                update({
                  ...scene,
                  advanced: {
                    ...advanced,
                    tracks: advanced.tracks.filter(
                      (item) => item.targetId !== track.targetId
                    ),
                  },
                })
              }
            >
              {t('Remove track')}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
