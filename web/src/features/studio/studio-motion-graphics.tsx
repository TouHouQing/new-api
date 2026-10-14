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
import { useState } from 'react'
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

import { StudioMotionPreview } from './studio-motion-preview'
import {
  studioMotionGraphicSchema,
  studioProductionSchema,
} from './studio-production'
import { useStudioProductionContext } from './studio-production-context'

export function StudioMotionGraphics(options: { versionId?: string } = {}) {
  const { t } = useTranslation()
  const { props, writable } = useStudioProductionContext()
  const production =
    props.project.production || studioProductionSchema.parse({})
  const version = production.regionalVersions.find(
    (item) => item.id === options.versionId
  )
  const graphics = version ? version.motionGraphics : production.motionGraphics
  const save = (items: typeof graphics) => {
    if (!writable) return
    const next = version
      ? {
          ...production,
          regionalVersions: production.regionalVersions.map((item) =>
            item.id === version.id ? { ...item, motionGraphics: items } : item
          ),
        }
      : { ...production, motionGraphics: items }
    props.onUpdate({ ...props.project, production: next })
  }
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [undo, setUndo] = useState<{ id: string; x: number; y: number }[]>([])
  const item = graphics.find((item) => item.id === selected)
  const update = (patch: Partial<NonNullable<typeof item>>) => {
    if (!item || !writable) return
    const parsed = studioMotionGraphicSchema.safeParse({ ...item, ...patch })
    if (!parsed.success) {
      setError(t('Use valid timing, position, size and tempo for the graphic'))
      return
    }
    setError('')
    save(
      graphics.map((current) =>
        current.id === selected ? parsed.data : current
      )
    )
  }
  const place = (
    id: string,
    x: number,
    y: number,
    phase: 'start' | 'move' | 'end'
  ) => {
    const graphic = graphics.find((entry) => entry.id === id)
    if (!graphic || !writable) return
    if (phase === 'start') {
      setUndo((items) => [
        ...items.slice(-19),
        { id, x: graphic.x, y: graphic.y },
      ])
      return
    }
    save(
      graphics.map((entry) => (entry.id === id ? { ...entry, x, y } : entry))
    )
  }
  return (
    <Collapsible className='space-y-3'>
      <CollapsibleTrigger render={<Button variant='outline' />}>
        {t('Animated titles and beat effects')}
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-3'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Create fade, slide, pulse or bounce graphics at exact timeline times. Tempo controls repeated beats. Graphics appear in the film and its editing package without calling a model.'
          )}
        </p>
        <Button
          variant='outline'
          disabled={!writable || graphics.length >= 50}
          onClick={() => {
            const id = crypto.randomUUID()
            save([
              ...graphics,
              studioMotionGraphicSchema.parse({
                id,
                text: t('Your title'),
                start: 0,
                end: 2,
                x: 0.5,
                y: 0.5,
                font_size: 48,
                color: '#ffffff',
                animation: 'fade',
                bpm: 120,
              }),
            ])
            setSelected(id)
          }}
        >
          {t('Add animated title')}
        </Button>
        <Select
          value={selected}
          onValueChange={(value) => setSelected(value || '')}
        >
          <SelectTrigger aria-label={t('Animated graphic')}>
            <SelectValue>
              {item?.text || t('Choose an animated graphic')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {graphics.map((graphic) => (
              <SelectItem key={graphic.id} value={graphic.id}>
                {graphic.text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <StudioMotionPreview
          versionId={options.versionId}
          selectedId={selected}
          onSelect={setSelected}
          onMove={place}
        />
        {item && (
          <>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Drag a graphic in the preview, or select its button and use arrow keys. Placement can be undone.'
              )}
            </p>
            <div className='flex flex-wrap gap-2'>
              {(
                [
                  ['Center title', 0.5, 0.5, 64],
                  ['Lower third', 0.5, 0.82, 36],
                  ['Left title', 0.25, 0.5, 48],
                ] as const
              ).map(([label, x, y, size]) => (
                <Button
                  key={label}
                  size='sm'
                  variant='outline'
                  disabled={!writable}
                  onClick={() => {
                    place(item.id, item.x, item.y, 'start')
                    update({ x, y, font_size: size })
                  }}
                >
                  {t(label)}
                </Button>
              ))}
              <Button
                size='sm'
                variant='ghost'
                disabled={!writable || !undo.length}
                onClick={() => {
                  const previous = undo.at(-1)
                  if (!previous) return
                  save(
                    graphics.map((entry) =>
                      entry.id === previous.id
                        ? { ...entry, x: previous.x, y: previous.y }
                        : entry
                    )
                  )
                  setUndo((items) => items.slice(0, -1))
                }}
              >
                {t('Undo graphic placement')}
              </Button>
            </div>
            <div className='flex flex-wrap gap-2'>
              {(['Opening 2 seconds', 'Full planned duration'] as const).map(
                (label) => (
                  <Button
                    size='sm'
                    variant='outline'
                    key={label}
                    disabled={!writable}
                    onClick={() =>
                      update({
                        start: 0,
                        end:
                          label === 'Opening 2 seconds'
                            ? 2
                            : Math.min(3600, production.targetDuration || 30),
                      })
                    }
                  >
                    {t(label)}
                  </Button>
                )
              )}
            </div>
            <Select
              value={item.kind}
              disabled={!writable}
              onValueChange={(value) => {
                if (['text', 'icon', 'shape', 'image'].includes(value || '')) {
                  update({
                    kind: value as typeof item.kind,
                    animation:
                      item.animation === 'morph' && value !== 'shape'
                        ? 'fade'
                        : item.animation,
                  })
                }
              }}
            >
              <SelectTrigger aria-label={t('Graphic type')}>
                <SelectValue>{t(`Graphic type ${item.kind}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(['text', 'icon', 'shape', 'image'] as const).map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {t(`Graphic type ${kind}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {item.kind === 'icon' && (
              <Select
                value={item.icon}
                disabled={!writable}
                onValueChange={(value) => {
                  if (
                    ['spark', 'play', 'heart', 'check', 'arrow'].includes(
                      value || ''
                    )
                  ) {
                    update({ icon: value as typeof item.icon })
                  }
                }}
              >
                <SelectTrigger aria-label={t('Graphic icon')}>
                  <SelectValue>{t(`Graphic icon ${item.icon}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(['spark', 'play', 'heart', 'check', 'arrow'] as const).map(
                    (icon) => (
                      <SelectItem key={icon} value={icon}>
                        {t(`Graphic icon ${icon}`)}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            )}
            {item.kind === 'shape' && (
              <Select
                value={item.shape}
                disabled={!writable}
                onValueChange={(value) => {
                  if (value === 'square' || value === 'circle') {
                    update({ shape: value })
                  }
                }}
              >
                <SelectTrigger aria-label={t('Graphic shape')}>
                  <SelectValue>{t(`Graphic shape ${item.shape}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='square'>
                    {t('Graphic shape square')}
                  </SelectItem>
                  <SelectItem value='circle'>
                    {t('Graphic shape circle')}
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
            {item.kind === 'image' && (
              <Select
                value={item.imageMediaId || null}
                disabled={!writable}
                onValueChange={(value) =>
                  update({ imageMediaId: value || undefined })
                }
              >
                <SelectTrigger aria-label={t('Graphic image')}>
                  <SelectValue>
                    {props.project.nodes.find(
                      (node) => node.data.mediaId === item.imageMediaId
                    )?.data.title || t('Choose an image')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {props.project.nodes
                    .filter(
                      (node) => node.data.kind === 'image' && node.data.mediaId
                    )
                    .map((node) => (
                      <SelectItem key={node.id} value={node.data.mediaId || ''}>
                        {node.data.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
            <Field>
              <FieldLabel>{t('Graphic text')}</FieldLabel>
              <Textarea
                aria-label={t('Graphic text')}
                maxLength={2000}
                value={item.text}
                disabled={!writable}
                onChange={(event) => update({ text: event.target.value })}
              />
            </Field>
            <Collapsible>
              <CollapsibleTrigger
                render={<Button variant='outline' size='sm' />}
              >
                {t('Advanced graphic timing and coordinates')}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className='grid gap-2 sm:grid-cols-3'>
                  {(
                    ['start', 'end', 'x', 'y', 'font_size', 'bpm'] as const
                  ).map((key) => (
                    <Field key={key}>
                      <FieldLabel>{t(`Graphic ${key}`)}</FieldLabel>
                      <Input
                        aria-label={t(`Graphic ${key}`)}
                        type='number'
                        step={key === 'x' || key === 'y' ? 0.05 : 1}
                        value={item[key]}
                        disabled={!writable}
                        onChange={(event) =>
                          update({ [key]: Number(event.target.value) })
                        }
                      />
                    </Field>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
            <Field>
              <FieldLabel>{t('Graphic color')}</FieldLabel>
              <Input
                aria-label={t('Graphic color')}
                type='color'
                value={item.color}
                disabled={!writable}
                onChange={(event) => update({ color: event.target.value })}
              />
            </Field>
            <Select
              value={item.animation}
              disabled={!writable}
              onValueChange={(value) => {
                if (
                  [
                    'fade',
                    'slide',
                    'pulse',
                    'bounce',
                    'rotate',
                    'morph',
                  ].includes(value || '')
                ) {
                  update({ animation: value as typeof item.animation })
                }
              }}
            >
              <SelectTrigger aria-label={t('Graphic animation')}>
                <SelectValue>
                  {t(`Graphic animation ${item.animation}`)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(
                  [
                    'fade',
                    'slide',
                    'pulse',
                    'bounce',
                    'rotate',
                    'morph',
                  ] as const
                )
                  .filter(
                    (animation) =>
                      animation !== 'morph' || item.kind === 'shape'
                  )
                  .map((animation) => (
                    <SelectItem key={animation} value={animation}>
                      {t(`Graphic animation ${animation}`)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              variant='outline'
              disabled={!writable}
              onClick={() => {
                save(graphics.filter((graphic) => graphic.id !== selected))
                setSelected('')
              }}
            >
              {t('Remove animated graphic')}
            </Button>
          </>
        )}
        {error && (
          <p role='alert' className='text-destructive text-sm'>
            {error}
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
