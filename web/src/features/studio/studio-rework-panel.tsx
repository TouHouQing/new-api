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
import { ALL_FORMATS, BlobSource, Input as MediaInput } from 'mediabunny'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { studioProjectTimeline } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import {
  acceptStudioReworkImage,
  applyStudioReworkRange,
  prepareStudioRework,
} from './studio-rework'

export function StudioReworkPanel() {
  const { t } = useTranslation()
  const { props, writable, setSelectedNodes, setConfirm, mutate } =
    useStudioProductionContext()
  const [sourceId, setSourceId] = useState('')
  const [mode, setMode] = useState<'angle' | 'light' | 'region' | 'range'>(
    'angle'
  )
  const [instructions, setInstructions] = useState('')
  const [values, setValues] = useState({
    start: 0,
    end: 3,
    x: 0,
    y: 0,
    width: 256,
    height: 256,
  })
  const [error, setError] = useState('')
  const sources = props.project.nodes.filter(
    (node) =>
      ['image', 'video'].includes(node.data.kind) &&
      node.data.mediaId &&
      node.data.purpose !== 'assembly'
  )
  const source = sources.find((node) => node.id === sourceId)
  let editFields: (keyof typeof values)[] = []
  if (mode === 'range') editFields = ['start', 'end']
  else if (mode === 'region') editFields = ['x', 'y', 'width', 'height']
  const choices =
    source?.data.kind === 'image'
      ? ['angle', 'light', 'region']
      : ['angle', 'light', 'range']
  const replace = async (targetId: string): Promise<void> => {
    const target = props.project.nodes.find((node) => node.id === targetId)
    const range = target?.data.reworkRange
    if (!range || !target?.data.mediaId) {
      throw new Error(t('Finish the replacement clip first'))
    }
    const describe = async (
      id: string
    ): Promise<{ duration: number; audio: boolean }> => {
      const blob = await props.getMedia(id)
      if (!blob) throw new Error(t('Stored source media is unavailable'))
      const input = new MediaInput({
        source: new BlobSource(blob),
        formats: ALL_FORMATS,
      })
      try {
        const track = await input.getPrimaryVideoTrack()
        if (!track) throw new Error('Video track is unavailable')
        return {
          duration: await track.computeDuration(),
          audio: Boolean(await input.getPrimaryAudioTrack()),
        }
      } finally {
        input.dispose()
      }
    }
    const original = await describe(range.sourceMediaId)
    const output = await describe(target.data.mediaId)
    const durations: Record<string, number> = {
      [range.sourceMediaId]: original.duration,
      [target.data.mediaId]: output.duration,
    }
    for (const clip of studioProjectTimeline(props.project)) {
      const node = props.project.nodes.find((node) => node.id === clip.nodeId)
      const mediaId = clip.takeId
        ? node?.data.takes?.find((take) => take.id === clip.takeId)?.mediaId
        : node?.data.mediaId
      if (mediaId && !durations[mediaId]) {
        durations[mediaId] = (await describe(mediaId)).duration
      }
    }
    props.onUpdate(
      applyStudioReworkRange(
        props.project,
        targetId,
        original.duration,
        output.duration,
        original.audio,
        durations
      )
    )
    await props.onSave()
  }
  return (
    <Collapsible className='rounded-lg border p-3'>
      <CollapsibleTrigger render={<Button variant='outline' />}>
        {t('Rework one part of a shot')}
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-3 pt-3'>
        <p className='text-muted-foreground text-xs'>
          {t(
            'New results keep the original Take and audio. Region edits change only the selected image rectangle. Time edits replace only the selected video interval after you review the result.'
          )}
        </p>
        <Select
          value={sourceId || null}
          onValueChange={(value) => {
            setSourceId(value || '')
            setMode('angle')
          }}
          items={sources.map((node) => ({
            value: node.id,
            label: node.data.title,
          }))}
        >
          <SelectTrigger aria-label={t('Original shot or image')}>
            <SelectValue placeholder={t('Original shot or image')} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {sources.map((node) => (
                <SelectItem key={node.id} value={node.id}>
                  {node.data.title}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          value={mode}
          onValueChange={(value) => {
            if (choices.includes(value || '')) setMode(value as typeof mode)
          }}
          items={choices.map((value) => ({
            value,
            label: t(`studio.rework.${value}`),
          }))}
        >
          <SelectTrigger aria-label={t('Rework purpose')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {choices.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`studio.rework.${value}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Textarea
          aria-label={t('Describe the requested change')}
          placeholder={t('Describe the requested change')}
          value={instructions}
          maxLength={6000}
          onChange={(event) => setInstructions(event.target.value)}
        />
        <div className='grid gap-3 sm:grid-cols-4'>
          {editFields.map((field) => (
            <Field key={field}>
              <FieldLabel>{t(`studio.edit.${field}`)}</FieldLabel>
              <Input
                type='number'
                min={0}
                max={field === 'start' || field === 'end' ? 3600 : 4096}
                step={field === 'start' || field === 'end' ? 0.1 : 1}
                value={values[field]}
                aria-label={t(`studio.edit.${field}`)}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field]: Number(event.target.value),
                  }))
                }
              />
            </Field>
          ))}
        </div>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Local Wan supports first-frame guidance. Motion transfer and whole-video region tracking need a compatible motion model; they are not enabled by this model.'
          )}
        </p>
        <Button
          disabled={!writable || !source || !instructions.trim()}
          onClick={() => {
            try {
              const id = crypto.randomUUID()
              props.onUpdate(
                prepareStudioRework(
                  props.project,
                  sourceId,
                  id,
                  instructions,
                  mode,
                  values
                )
              )
              setSelectedNodes([id])
              setConfirm(false)
              setError('')
            } catch (error) {
              setError(String(error))
            }
          }}
        >
          {t('Prepare rework and review its budget')}
        </Button>
        {props.project.nodes
          .filter(
            (node) =>
              node.data.reworkRange &&
              node.data.mediaId &&
              node.data.status === 'completed'
          )
          .map((node) => (
            <div key={node.id} className='flex items-center gap-3'>
              <span>{node.data.title}</span>
              <Button
                disabled={!writable || mutate.isPending}
                variant='outline'
                onClick={() =>
                  mutate.mutate(() => replace(node.id), {
                    onError: (error) => setError(error.message),
                  })
                }
              >
                {t('Use this result only in the selected time range')}
              </Button>
            </div>
          ))}
        {props.project.nodes
          .filter(
            (node) =>
              node.data.kind === 'image' &&
              node.data.derivedFrom &&
              node.data.mediaId &&
              node.data.status === 'completed'
          )
          .map((node) => (
            <div key={node.id} className='flex items-center gap-3'>
              <span>{node.data.title}</span>
              <Button
                disabled={!writable}
                variant='outline'
                onClick={() => {
                  try {
                    props.onUpdate(
                      acceptStudioReworkImage(props.project, node.id)
                    )
                    setError('')
                  } catch (error) {
                    setError(String(error))
                  }
                }}
              >
                {t('Use this image result as a new Take of the original')}
              </Button>
            </div>
          ))}
        {error && (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
