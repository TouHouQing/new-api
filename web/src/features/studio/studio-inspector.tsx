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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

import type { StudioCanvasNode, StudioCanvasNodeData } from './canvas-flow'
import { selectStudioVideoModels } from './model-profiles'

type Props = {
  node: StudioCanvasNode
  models: string[]
  previewUrl?: string
  onChange: (patch: Partial<StudioCanvasNodeData>) => void
  onGenerate: () => void
  onDelete: () => void
  onRetryMedia?: () => void
}

const RATIOS = ['16:9', '9:16', '1:1', '21:9', '4:3', '3:4', 'adaptive']

export function StudioInspector(props: Props) {
  const { t } = useTranslation()
  const videoModels = useMemo(
    () => selectStudioVideoModels(props.models),
    [props.models]
  )
  const choices =
    props.node.data.kind === 'video'
      ? videoModels.map((model) => model.id)
      : props.models.filter(
          (id) => !videoModels.some((video) => video.id === id)
        )
  const model = videoModels.find(
    (profile) => profile.id === props.node.data.model
  )
  const busy =
    props.node.data.status === 'submitting' ||
    props.node.data.status === 'queued' ||
    props.node.data.status === 'processing'

  return (
    <Card className='min-h-[560px] rounded-none border-0 ring-0 lg:h-full lg:min-h-0'>
      <CardHeader className='border-b'>
        <CardTitle>{t('studio.inspector.title')}</CardTitle>
        <p className='text-muted-foreground text-xs'>
          {t('studio.inspector.description')}
        </p>
      </CardHeader>
      <CardContent className='flex flex-1 flex-col gap-4 pb-4 lg:min-h-0 lg:overflow-y-auto'>
        <Field>
          <FieldLabel htmlFor='studio-node-title'>
            {t('studio.node.title')}
          </FieldLabel>
          <Input
            id='studio-node-title'
            value={props.node.data.title}
            onChange={(event) => props.onChange({ title: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel>{t('studio.model')}</FieldLabel>
          <Select
            value={props.node.data.model || null}
            onValueChange={(value) => {
              const next = videoModels.find((profile) => profile.id === value)
              props.onChange({
                model: value || undefined,
                resolution: next?.resolutions[0],
                seconds: 5,
                ratio: '16:9',
              })
            }}
            items={choices.map((id) => ({ value: id, label: id }))}
          >
            <SelectTrigger className='w-full' aria-label={t('studio.model')}>
              <SelectValue placeholder={t('studio.model.select')} />
            </SelectTrigger>
            <SelectContent>
              {choices.map((id) => (
                <SelectItem key={id} value={id}>
                  {id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {choices.length === 0 && (
            <p className='text-muted-foreground text-xs'>
              {t('studio.model.empty')}
            </p>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor='studio-prompt'>{t('studio.prompt')}</FieldLabel>
          <Textarea
            id='studio-prompt'
            className='min-h-32'
            value={props.node.data.prompt}
            onChange={(event) => props.onChange({ prompt: event.target.value })}
            placeholder={t('studio.prompt.placeholder')}
          />
        </Field>
        {props.node.data.kind === 'video' && model && (
          <>
            <Field>
              <FieldLabel htmlFor='studio-seconds'>
                {t('studio.duration')}
              </FieldLabel>
              <Input
                id='studio-seconds'
                type='number'
                min={model.minSeconds}
                max={model.maxSeconds}
                step={1}
                value={props.node.data.seconds ?? 5}
                onChange={(event) =>
                  props.onChange({ seconds: Number(event.target.value) })
                }
              />
              <p className='text-muted-foreground text-xs'>
                {model.minSeconds}–{model.maxSeconds} {t('studio.seconds')}
              </p>
            </Field>
            <Field>
              <FieldLabel>{t('studio.resolution')}</FieldLabel>
              <div className='flex flex-wrap gap-2'>
                {model.resolutions.map((resolution) => (
                  <Button
                    key={resolution}
                    size='sm'
                    variant={
                      props.node.data.resolution === resolution
                        ? 'secondary'
                        : 'outline'
                    }
                    onClick={() => props.onChange({ resolution })}
                  >
                    {resolution}
                  </Button>
                ))}
              </div>
            </Field>
            <Field>
              <FieldLabel>{t('studio.ratio')}</FieldLabel>
              <div className='flex flex-wrap gap-2'>
                {RATIOS.map((ratio) => (
                  <Button
                    key={ratio}
                    size='sm'
                    variant={
                      props.node.data.ratio === ratio ? 'secondary' : 'outline'
                    }
                    onClick={() => props.onChange({ ratio })}
                  >
                    {ratio}
                  </Button>
                ))}
              </div>
              <p className='text-muted-foreground text-xs'>
                {t('studio.ratio.adaptiveHint')}
              </p>
            </Field>
          </>
        )}
        <div className='flex gap-2'>
          <Button
            className='flex-1'
            disabled={
              busy || !props.node.data.model || !props.node.data.prompt.trim()
            }
            onClick={props.onGenerate}
          >
            {busy ? t('studio.generating') : t('studio.generate')}
          </Button>
          <Button variant='outline' onClick={props.onDelete}>
            {t('studio.deleteNode')}
          </Button>
        </div>
        {props.node.data.status && props.node.data.status !== 'idle' && (
          <p className='text-muted-foreground text-xs' role='status'>
            {t(`studio.status.${props.node.data.status}`)}{' '}
            {typeof props.node.data.progress === 'number'
              ? `${props.node.data.progress}%`
              : ''}
          </p>
        )}
        {props.node.data.error && (
          <p className='text-destructive text-sm' role='alert'>
            {props.node.data.error}
          </p>
        )}
        {props.node.data.kind === 'text' && props.node.data.outputText && (
          <pre className='bg-muted max-h-64 overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap'>
            {props.node.data.outputText}
          </pre>
        )}
        {props.node.data.kind === 'image' && props.previewUrl && (
          <img
            className='max-h-72 w-full rounded-lg object-contain'
            src={props.previewUrl}
            alt={props.node.data.title}
          />
        )}
        {props.node.data.kind === 'video' && props.previewUrl && (
          <video
            className='max-h-72 w-full rounded-lg'
            src={props.previewUrl}
            controls
            preload='metadata'
          />
        )}
        {props.node.data.kind !== 'text' &&
          props.node.data.status === 'completed' &&
          !props.previewUrl && (
            <p className='text-muted-foreground text-sm'>
              {t('studio.media.missing')}
            </p>
          )}
        {props.node.data.kind !== 'text' &&
          props.node.data.status === 'completed' &&
          !props.node.data.mediaId &&
          props.onRetryMedia && (
            <Button variant='outline' onClick={props.onRetryMedia}>
              {t('studio.media.retry')}
            </Button>
          )}
      </CardContent>
    </Card>
  )
}
