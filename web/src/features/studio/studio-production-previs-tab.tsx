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
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { TabsContent } from '@/components/ui/tabs'

import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import {
  drawStudioPrevis,
  studioPrevisSchema,
  type StudioPrevis,
} from './studio-previs'
import {
  removeStudioPrevisObject,
  resizeStudioPrevisDuration,
} from './studio-previs-keyframes'
import { studioProductionSchema } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'

const AdvancedPrevis = lazy(() =>
  import('./studio-previs-3d').then((module) => ({
    default: module.StudioPrevis3D,
  }))
)

export function StudioProductionPrevisTab() {
  const { t } = useTranslation()
  const { props, path, writable, mutate } = useStudioProductionContext()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [seconds, setSeconds] = useState(0)
  const timeAccess = useRef(seconds)
  timeAccess.current = seconds
  const [playing, setPlaying] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [targetId, setTargetId] = useState('')
  const scene = props.project.production?.previs || studioPrevisSchema.parse({})
  const snapshot = useRef(scene)
  snapshot.current = scene
  useEffect(() => {
    setSeconds((current) => Math.min(current, scene.duration))
  }, [scene.duration])
  useEffect(() => {
    if (canvas.current) drawStudioPrevis(canvas.current, scene, seconds)
  }, [scene, seconds])
  useEffect(() => {
    if (!playing) return
    let frame = 0
    const started = performance.now() - timeAccess.current * 1000
    const animate = (now: number): void => {
      const time = ((now - started) / 1000) % snapshot.current.duration
      setSeconds(time)
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [playing])
  const update = (next: StudioPrevis): void =>
    props.onUpdate({
      ...props.project,
      production: {
        ...(props.project.production || studioProductionSchema.parse({})),
        previs: next,
      },
      updatedAt: new Date().toISOString(),
    })
  return (
    <TabsContent value='previs' className='space-y-4'>
      <p className='text-sm'>
        {t(
          'Start from a stage template. This replaces the stage layout and keeps film media and Takes.'
        )}
      </p>
      <div className='flex flex-wrap gap-2'>
        {(['dialogue', 'walking', 'product'] as const).map((kind) => (
          <Button
            key={kind}
            variant='outline'
            disabled={!writable}
            onClick={() => {
              const actors = [
                {
                  id: 'template-actor',
                  title: t('Actor'),
                  x: -1,
                  z: 0,
                  endX: kind === 'walking' ? 2 : -1,
                  endZ: 0,
                  pose: kind === 'walking' ? 'walk' : 'sit',
                  color: '#8ab4f8',
                },
              ]
              if (kind === 'dialogue') {
                actors.push({
                  id: 'template-partner',
                  title: t('Partner'),
                  x: 1,
                  z: 0,
                  endX: 1,
                  endZ: 0,
                  pose: 'sit',
                  color: '#e6ad72',
                })
              }
              update(
                studioPrevisSchema.parse({
                  duration: 5,
                  camera: {
                    yaw: 20,
                    endYaw: kind === 'product' ? 120 : 20,
                    pitch: 20,
                    distance: 7,
                    fov: 50,
                  },
                  actors: kind === 'product' ? [] : actors,
                  advanced:
                    kind === 'walking'
                      ? { followId: 'template-actor' }
                      : undefined,
                  props:
                    kind === 'product'
                      ? [
                          {
                            id: 'template-product',
                            title: t('Product'),
                            x: 0,
                            z: 0,
                            width: 1,
                            height: 1,
                            depth: 1,
                            color: '#e6ad72',
                          },
                        ]
                      : [],
                })
              )
            }}
          >
            {t(`studio.stage.template.${kind}`)}
          </Button>
        ))}
      </div>
      <Collapsible
        open={advancedOpen}
        onOpenChange={(open) => {
          setAdvancedOpen(open)
          setPlaying(false)
        }}
      >
        <CollapsibleTrigger render={<Button variant='outline' />}>
          {t('Advanced 3D assets and animation')}
        </CollapsibleTrigger>
        <CollapsibleContent className='pt-4'>
          <Suspense fallback={<Skeleton className='h-60 w-full' />}>
            <AdvancedPrevis time={seconds} onTimeChange={setSeconds} />
          </Suspense>
        </CollapsibleContent>
      </Collapsible>
      {!advancedOpen && (
        <>
          <p className='text-muted-foreground text-sm'>
            {t('studio.production.previsHelp')}
          </p>
          <canvas
            ref={canvas}
            width={640}
            height={360}
            aria-label={t('studio.production.previs')}
            className='aspect-video w-full rounded-lg bg-black'
          />
          <div className='flex gap-3'>
            <Button variant='outline' onClick={() => setPlaying(!playing)}>
              {t(
                playing ? 'studio.production.pause' : 'studio.production.play'
              )}
            </Button>
            <Input
              type='range'
              min={0}
              max={scene.duration}
              step={0.05}
              value={seconds}
              aria-label={t('studio.production.playhead')}
              onChange={(event) => {
                setPlaying(false)
                setSeconds(Number(event.target.value))
              }}
            />
          </div>
        </>
      )}
      <div className='grid gap-3 sm:grid-cols-3'>
        <Field>
          <FieldLabel>{t('studio.production.mediaSeconds')}</FieldLabel>
          <Input
            aria-label={t('studio.production.mediaSeconds')}
            type='number'
            min={1}
            max={30}
            disabled={!writable}
            value={scene.duration}
            onChange={(event) =>
              update(
                resizeStudioPrevisDuration(
                  scene,
                  Math.max(1, Math.min(30, Number(event.target.value)))
                )
              )
            }
          />
        </Field>
        {(Object.keys(scene.camera) as (keyof StudioPrevis['camera'])[]).map(
          (key) => (
            <Field key={key}>
              <FieldLabel>{t(`studio.production.camera.${key}`)}</FieldLabel>
              <Input
                aria-label={t(`studio.production.camera.${key}`)}
                type='number'
                disabled={!writable}
                value={scene.camera[key]}
                onChange={(event) => {
                  const next = studioPrevisSchema.safeParse({
                    ...scene,
                    camera: {
                      ...scene.camera,
                      [key]: Number(event.target.value),
                    },
                  })
                  if (next.success) update(next.data)
                }}
              />
            </Field>
          )
        )}
      </div>
      <div className='flex flex-wrap gap-2'>
        <Button
          variant='outline'
          disabled={!writable || scene.actors.length >= 12}
          onClick={() =>
            update({
              ...scene,
              actors: [
                ...scene.actors,
                {
                  id: crypto.randomUUID(),
                  title: t('studio.production.actor'),
                  x: 0,
                  z: 0,
                  endX: 0,
                  endZ: 0,
                  yaw: 0,
                  pose: 'stand',
                  color: '#8ab4f8',
                },
              ],
            })
          }
        >
          {t('studio.production.addActor')}
        </Button>
        <Button
          variant='outline'
          disabled={!writable || scene.props.length >= 20}
          onClick={() =>
            update({
              ...scene,
              props: [
                ...scene.props,
                {
                  id: crypto.randomUUID(),
                  title: t('studio.production.prop'),
                  x: 2,
                  z: 0,
                  width: 1,
                  height: 1,
                  depth: 1,
                  color: '#e6ad72',
                },
              ],
            })
          }
        >
          {t('studio.production.addProp')}
        </Button>
      </div>
      {scene.actors.map((actor) => (
        <div
          key={actor.id}
          className='grid gap-3 rounded-lg border p-3 sm:grid-cols-4'
        >
          <Input
            aria-label={t('studio.production.actor')}
            disabled={!writable}
            value={actor.title}
            maxLength={200}
            onChange={(event) =>
              update({
                ...scene,
                actors: scene.actors.map((item) =>
                  item.id === actor.id
                    ? { ...item, title: event.target.value }
                    : item
                ),
              })
            }
          />
          <Select
            value={actor.pose}
            items={['stand', 'walk', 'wave', 'point', 'sit'].map((pose) => ({
              value: pose,
              label: t(`studio.production.pose.${pose}`),
            }))}
            onValueChange={(pose) => {
              if (pose) {
                update(
                  studioPrevisSchema.parse({
                    ...scene,
                    actors: scene.actors.map((item) =>
                      item.id === actor.id ? { ...item, pose } : item
                    ),
                  })
                )
              }
            }}
            disabled={!writable}
          >
            <SelectTrigger aria-label={t('studio.production.pose')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['stand', 'walk', 'wave', 'point', 'sit'].map((pose) => (
                <SelectItem key={pose} value={pose}>
                  {t(`studio.production.pose.${pose}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label={t('studio.production.color')}
            type='color'
            disabled={!writable}
            value={actor.color}
            onChange={(event) =>
              update({
                ...scene,
                actors: scene.actors.map((item) =>
                  item.id === actor.id
                    ? { ...item, color: event.target.value }
                    : item
                ),
              })
            }
          />
          <Button
            variant='ghost'
            disabled={!writable}
            onClick={() => update(removeStudioPrevisObject(scene, actor.id))}
          >
            {t('studio.production.remove')}
          </Button>
          {(['x', 'z', 'endX', 'endZ', 'yaw'] as const).map((key) => (
            <Field key={key}>
              <FieldLabel>{t(`studio.production.position.${key}`)}</FieldLabel>
              <Input
                aria-label={`${actor.title} ${t(`studio.production.position.${key}`)}`}
                type='number'
                min={key === 'yaw' ? -180 : -10}
                max={key === 'yaw' ? 180 : 10}
                step={0.1}
                disabled={!writable}
                value={actor[key]}
                onChange={(event) => {
                  const next = studioPrevisSchema.safeParse({
                    ...scene,
                    actors: scene.actors.map((item) =>
                      item.id === actor.id
                        ? { ...item, [key]: Number(event.target.value) }
                        : item
                    ),
                  })
                  if (next.success) update(next.data)
                }}
              />
            </Field>
          ))}
        </div>
      ))}
      {scene.props.map((prop) => (
        <div
          key={prop.id}
          className='grid gap-3 rounded-lg border p-3 sm:grid-cols-4'
        >
          <Input
            aria-label={t('studio.production.prop')}
            disabled={!writable}
            value={prop.title}
            onChange={(event) =>
              update({
                ...scene,
                props: scene.props.map((item) =>
                  item.id === prop.id
                    ? { ...item, title: event.target.value }
                    : item
                ),
              })
            }
          />
          {(['x', 'z', 'width', 'height', 'depth'] as const).map((key) => (
            <Field key={key}>
              <FieldLabel>{t(`studio.production.position.${key}`)}</FieldLabel>
              <Input
                aria-label={`${prop.title} ${t(`studio.production.position.${key}`)}`}
                type='number'
                step={0.1}
                disabled={!writable}
                value={prop[key]}
                onChange={(event) => {
                  const next = studioPrevisSchema.safeParse({
                    ...scene,
                    props: scene.props.map((item) =>
                      item.id === prop.id
                        ? { ...item, [key]: Number(event.target.value) }
                        : item
                    ),
                  })
                  if (next.success) update(next.data)
                }}
              />
            </Field>
          ))}
          <Button
            variant='ghost'
            disabled={!writable}
            onClick={() => update(removeStudioPrevisObject(scene, prop.id))}
          >
            {t('studio.production.remove')}
          </Button>
        </div>
      ))}
      <Field>
        <FieldLabel>{t('studio.production.mediaTarget')}</FieldLabel>
        <Select
          value={targetId}
          items={props.project.nodes
            .filter(
              (node) =>
                ['image', 'video'].includes(node.data.kind) &&
                node.data.purpose !== 'assembly'
            )
            .map((node) => ({ value: node.id, label: node.data.title }))}
          onValueChange={(value) => setTargetId(value || '')}
        >
          <SelectTrigger aria-label={t('studio.production.mediaTarget')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {props.project.nodes
              .filter(
                (node) =>
                  ['image', 'video'].includes(node.data.kind) &&
                  node.data.purpose !== 'assembly'
              )
              .map((node) => (
                <SelectItem key={node.id} value={node.id}>
                  {node.data.title}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </Field>
      <Button
        disabled={!writable || !targetId || mutate.isPending}
        onClick={() =>
          mutate.mutate(async () => {
            if (!props.project.production?.previs) update(scene)
            await props.onSave()
            const current = await studioCloudRequest<StudioCloudProject>(path)
            if (!current.document.production?.previs) {
              const document = {
                ...current.document,
                production: {
                  ...(current.document.production ||
                    studioProductionSchema.parse({})),
                  previs: scene,
                },
              }
              await studioCloudRequest(path, 'PUT', {
                document,
                revision: current.revision,
              })
              current.revision++
            }
            const node = current.document.nodes.find(
              (node) => node.id === targetId
            )
            await studioCloudRequest(`${path}/jobs`, 'POST', {
              request_id: crypto.randomUUID(),
              revision: current.revision,
              kind: 'previs',
              operation: {
                node_id: targetId,
                action:
                  node?.data.kind === 'video'
                    ? 'previs_animation'
                    : 'previs_frame',
                seconds: Math.min(scene.duration, seconds),
              },
            })
          })
        }
      >
        {t('studio.production.exportPrevis')}
      </Button>
    </TabsContent>
  )
}
