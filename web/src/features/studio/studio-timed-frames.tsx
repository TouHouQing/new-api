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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Field,
  FieldLabel,
  FieldContent,
  FieldDescription,
  FieldError,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { useStudioProductionContext } from './studio-production-context'
import { updateStudioNode } from './workspace'

export function StudioTimedFrames() {
  const { t } = useTranslation()
  const { props, writable } = useStudioProductionContext()
  const videos = props.project.nodes.filter(
    (node) => node.data.kind === 'video' && node.data.purpose !== 'assembly'
  )
  const images = props.project.nodes.filter(
    (node) => node.data.kind === 'image' && node.data.mediaId
  )
  const [targetId, setTargetId] = useState(
    props.selectedNodeId || videos[0]?.id || ''
  )
  const [sourceId, setSourceId] = useState('')
  const [time, setTime] = useState('1')
  const target = videos.find((node) => node.id === targetId)
  const source = images.find((node) => node.id === sourceId)
  const keys = target?.data.videoKeyframes || []
  let metadata: Record<string, unknown> | undefined
  try {
    const value: unknown = JSON.parse(target?.data.metadataJson || '{}')
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      metadata = value as Record<string, unknown>
    }
  } catch {
    /* The draft JSON remains editable in node settings. */
  }
  const editable =
    writable &&
    metadata &&
    target &&
    !target.data.locked &&
    !['submitting', 'queued', 'processing'].includes(target.data.status || '')
  const update = (patch: {
    videoKeyframes?: { mediaId: string; time: number }[]
    seconds?: number
    model?: string
    resolution?: string
  }) => {
    if (!editable) return
    let metadataJson = target.data.metadataJson
    if (patch.seconds !== undefined && metadataJson) {
      const metadata: Record<string, unknown> = JSON.parse(metadataJson)
      delete metadata.frames
      metadataJson = JSON.stringify(metadata)
    }
    props.onUpdate(
      updateStudioNode(props.project, targetId, { ...patch, metadataJson })
    )
  }
  return (
    <Collapsible className='space-y-3'>
      <CollapsibleTrigger render={<Button variant='outline' />}>
        {t('Timed keyframes and long shots')}
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-3'>
        {target?.data.model === 'wan2.1-vace-1.3b' && (
          <Field orientation='horizontal'>
            <Checkbox
              id={`${target.id}-preserve-keyframes`}
              disabled={!editable}
              checked={metadata?.preserve_keyframes !== false}
              onCheckedChange={(checked) => {
                if (!editable) return
                props.onUpdate(
                  updateStudioNode(props.project, targetId, {
                    metadataJson: JSON.stringify({
                      ...metadata,
                      preserve_keyframes: checked === true,
                    }),
                  })
                )
              }}
            />
            <FieldContent>
              <FieldLabel htmlFor={`${target.id}-preserve-keyframes`}>
                {t('Keep the supplied reference frames at their exact times')}
              </FieldLabel>
              <FieldDescription>
                {t(
                  'The local model generates the motion between references. Reference images are fitted to the video and blended briefly at their specified times; turn this off for approximate style control.'
                )}
              </FieldDescription>
              {!metadata && (
                <FieldError>
                  {t('Correct the task metadata JSON before editing keyframes')}
                </FieldError>
              )}
            </FieldContent>
          </Field>
        )}
        <p className='text-muted-foreground text-sm'>
          {t(
            'Place stored images at exact times in one generated shot. First and last frame inputs must use different times. Long local shots use 384×224 or 224×384 before delivery scaling.'
          )}
        </p>
        <Field>
          <FieldLabel>{t('Video output')}</FieldLabel>
          <Select
            value={targetId}
            onValueChange={(value) => setTargetId(value || '')}
          >
            <SelectTrigger aria-label={t('Video output')}>
              <SelectValue>
                {target?.data.title || t('Choose an output node')}
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
        {target && target.data.model !== 'wan2.1-vace-1.3b' && (
          <Button
            variant='outline'
            disabled={!editable}
            onClick={() =>
              update({
                model: 'wan2.1-vace-1.3b',
                seconds: Math.min(30, target.data.seconds || 5),
                resolution:
                  (target.data.seconds || 5) > 10 ? '384x224' : '640x384',
              })
            }
          >
            {t('Use the local model for timed frame control')}
          </Button>
        )}
        {target?.data.model === 'wan2.1-vace-1.3b' && (
          <>
            <Field>
              <FieldLabel>{t('Shot duration in seconds')}</FieldLabel>
              <Input
                aria-label={t('Shot duration in seconds')}
                type='number'
                min={1}
                max={30}
                step={1}
                disabled={!editable}
                value={target.data.seconds || 5}
                onChange={(event) => {
                  const seconds = Number(event.target.value)
                  if (
                    !Number.isInteger(seconds) ||
                    seconds < 1 ||
                    seconds > 30 ||
                    keys.some((key) => key.time > seconds)
                  ) {
                    return
                  }
                  update({
                    seconds,
                    resolution:
                      seconds > 10 ? '384x224' : target.data.resolution,
                  })
                }}
              />
            </Field>
            <div className='grid gap-3 sm:grid-cols-2'>
              <Field>
                <FieldLabel>{t('Keyframe image')}</FieldLabel>
                <Select
                  value={sourceId}
                  onValueChange={(value) => setSourceId(value || '')}
                  disabled={!editable}
                >
                  <SelectTrigger aria-label={t('Keyframe image')}>
                    <SelectValue>
                      {source?.data.title || t('Choose a stored image')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {images.map((node) => (
                      <SelectItem key={node.id} value={node.id}>
                        {node.data.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t('Keyframe time in seconds')}</FieldLabel>
                <Input
                  aria-label={t('Keyframe time in seconds')}
                  type='number'
                  step={0.0625}
                  min={0}
                  max={target.data.seconds || 5}
                  disabled={!editable}
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                />
              </Field>
            </div>
            <Button
              variant='outline'
              disabled={
                !editable ||
                !source?.data.mediaId ||
                keys.length >= 8 ||
                !time.trim() ||
                !Number.isFinite(Number(time)) ||
                Number(time) < 0 ||
                Number(time) > (target.data.seconds || 5) ||
                keys.some(
                  (key) =>
                    Math.round(key.time * 16) === Math.round(Number(time) * 16)
                )
              }
              onClick={() => {
                if (source?.data.mediaId) {
                  update({
                    videoKeyframes: [
                      ...keys,
                      { mediaId: source.data.mediaId, time: Number(time) },
                    ].sort((a, b) => a.time - b.time),
                  })
                }
              }}
            >
              {t('Add timed keyframe')}
            </Button>
            {keys.map((key) => (
              <div
                key={key.time}
                className='flex items-center justify-between gap-2 text-sm'
              >
                <span>
                  {t('At {{seconds}} seconds', { seconds: key.time })} ·{' '}
                  {images.find((node) => node.data.mediaId === key.mediaId)
                    ?.data.title || t('Stored keyframe image')}
                </span>
                <Button
                  variant='ghost'
                  size='sm'
                  disabled={!editable}
                  onClick={() =>
                    update({
                      videoKeyframes: keys.filter((item) => item !== key),
                    })
                  }
                >
                  {t('Remove keyframe')}
                </Button>
              </div>
            ))}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
