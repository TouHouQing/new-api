/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
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

import type { StudioShot } from './local-projects'

export type StudioTimelineShot = Pick<
  StudioShot,
  'id' | 'title' | 'trimStart' | 'trimEnd' | 'transition' | 'transitionSeconds'
> & {
  plannedDurationSeconds?: number
  status?:
    | 'idle'
    | 'submitting'
    | 'queued'
    | 'processing'
    | 'completed'
    | 'failed'
}

type Props = {
  busy: boolean
  progress: number
  previewUrl?: string
  error?: string
  onAssemble: () => void
  onCancel: () => void
  onDownload: () => void
  soundtrackUrl?: string
  soundtrackVolume?: number
  soundtrackOffsetSeconds?: number
  onSoundtrackOffsetChange?: (seconds: number) => void
  voiceoverUrl?: string
  voiceoverVolume?: number
  voiceoverOffsetSeconds?: number
  onVoiceoverOffsetChange?: (seconds: number) => void
  onUploadVoiceover?: (file: File) => void
  onRemoveVoiceover?: () => void
  onVoiceoverVolumeChange?: (volume: number) => void
  captionsText?: string
  captionOffsetSeconds?: number
  onCaptionOffsetChange?: (seconds: number) => void
  onCaptionsChange?: (value: string) => void
  preflight?: { totalDuration: number; estimatedOutputBytes: number }
  onUploadSoundtrack?: (file: File) => void
  onRemoveSoundtrack?: () => void
  onSoundtrackVolumeChange?: (volume: number) => void
  timelineShots?: StudioTimelineShot[]
  onSelectTimelineShot?: (shotId: string) => void
  onMoveTimelineShot?: (shotId: string, direction: 'up' | 'down') => void
  onUpdateTimelineShotEdit?: (
    shotId: string,
    patch: Pick<
      StudioShot,
      'trimStart' | 'trimEnd' | 'transition' | 'transitionSeconds'
    >
  ) => void
}

export function StudioAssemblyPanel(props: Props) {
  const { t } = useTranslation()
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
  const timelineShots = props.timelineShots || []
  const selectedShot =
    timelineShots.find((shot) => shot.id === selectedShotId) || timelineShots[0]
  const selectedShotIndex = timelineShots.findIndex(
    (shot) => shot.id === selectedShot?.id
  )
  const invalidTrim = timelineShots.find(
    (shot) =>
      shot.trimEnd !== undefined && shot.trimEnd <= (shot.trimStart ?? 0)
  )

  return (
    <Card className='gap-3 py-3'>
      <CardHeader className='px-4'>
        <CardTitle className='text-sm'>
          {t('studio.final.localTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-3 px-4'>
        <p className='text-muted-foreground text-xs'>
          {t('studio.final.localDescription')}
        </p>
        <p className='text-muted-foreground text-xs'>
          {t('studio.final.localNoApi')}
        </p>
        {timelineShots.length > 0 && (
          <div className='flex flex-col gap-3 rounded-md border p-3'>
            <div>
              <p className='text-sm font-medium'>
                {t('studio.timeline.overview')}
              </p>
              <p className='text-muted-foreground text-xs'>
                {t('studio.timeline.overviewHint')}
              </p>
            </div>
            <div
              role='region'
              aria-label={t('studio.timeline.overview')}
              tabIndex={0}
              className='focus-visible:outline-ring overflow-x-auto rounded-sm focus-visible:outline-2'
            >
              <div className='flex min-w-max flex-col gap-2 pb-3'>
                <div
                  role='group'
                  aria-label={t('studio.timeline.shotTrack')}
                  className='flex gap-1'
                >
                  {timelineShots.map((shot, index) => {
                    const plannedSeconds =
                      shot.trimEnd ?? shot.plannedDurationSeconds
                    const estimatedDuration =
                      plannedSeconds !== undefined &&
                      Number.isFinite(plannedSeconds)
                        ? Math.max(0, plannedSeconds - (shot.trimStart ?? 0))
                        : undefined
                    return (
                      <Fragment key={shot.id}>
                        <div className='flex w-40 shrink-0 flex-col gap-1'>
                          <Button
                            variant='outline'
                            aria-label={`${t('studio.timeline.selectShot')}: ${shot.title}`}
                            aria-pressed={selectedShot?.id === shot.id}
                            className='aria-pressed:border-primary h-auto w-full flex-col items-start whitespace-normal'
                            disabled={props.busy}
                            onClick={() => {
                              setSelectedShotId(shot.id)
                              props.onSelectTimelineShot?.(shot.id)
                            }}
                          >
                            <span className='text-muted-foreground text-xs'>
                              {index + 1}
                            </span>
                            <span className='w-full truncate text-left'>
                              {shot.title}
                            </span>
                            {estimatedDuration !== undefined && (
                              <span className='text-muted-foreground text-xs'>
                                {t('studio.timeline.estimatedDuration', {
                                  seconds: Number(estimatedDuration.toFixed(1)),
                                })}
                              </span>
                            )}
                            {(shot.trimStart !== undefined ||
                              shot.trimEnd !== undefined) && (
                              <span className='text-muted-foreground text-xs'>
                                {t('studio.timeline.cropRange', {
                                  start: shot.trimStart ?? 0,
                                  end:
                                    shot.trimEnd ??
                                    t('studio.timeline.fullClip'),
                                })}
                              </span>
                            )}
                            {shot.status && shot.status !== 'idle' && (
                              <span className='text-muted-foreground text-xs'>
                                {t(`studio.status.${shot.status}`)}
                              </span>
                            )}
                          </Button>
                          {props.onMoveTimelineShot && (
                            <div className='flex gap-1'>
                              <Button
                                size='xs'
                                variant='outline'
                                aria-label={`${shot.title} ${t('studio.timeline.moveEarlier')}`}
                                disabled={props.busy || index === 0}
                                onClick={() =>
                                  props.onMoveTimelineShot?.(shot.id, 'up')
                                }
                              >
                                ←
                              </Button>
                              <Button
                                size='xs'
                                variant='outline'
                                aria-label={`${shot.title} ${t('studio.timeline.moveLater')}`}
                                disabled={
                                  props.busy ||
                                  index === timelineShots.length - 1
                                }
                                onClick={() =>
                                  props.onMoveTimelineShot?.(shot.id, 'down')
                                }
                              >
                                →
                              </Button>
                            </div>
                          )}
                        </div>
                        {index < timelineShots.length - 1 && (
                          <span className='text-muted-foreground flex shrink-0 items-center text-xs'>
                            {shot.transition === 'fade'
                              ? t('studio.timeline.fadeDuration', {
                                  seconds: shot.transitionSeconds ?? 0.5,
                                })
                              : t('studio.timeline.cut')}
                          </span>
                        )}
                      </Fragment>
                    )
                  })}
                </div>
                {(
                  [
                    {
                      key: 'studio.timeline.soundtrack',
                      active: Boolean(props.soundtrackUrl),
                      offset: props.soundtrackOffsetSeconds ?? 0,
                      onChange: props.onSoundtrackOffsetChange,
                    },
                    {
                      key: 'studio.timeline.voiceover',
                      active: Boolean(props.voiceoverUrl),
                      offset: props.voiceoverOffsetSeconds ?? 0,
                      onChange: props.onVoiceoverOffsetChange,
                    },
                    {
                      key: 'studio.timeline.captions',
                      active: Boolean(props.captionsText?.trim()),
                      offset: props.captionOffsetSeconds ?? 0,
                      onChange: props.onCaptionOffsetChange,
                    },
                  ] as const
                ).map((lane) => (
                  <div
                    key={lane.key}
                    role='group'
                    aria-label={t(lane.key)}
                    className='bg-muted/50 flex min-h-9 items-center gap-2 rounded-md px-2 text-xs'
                  >
                    <span className='w-24 shrink-0 font-medium'>
                      {t(lane.key)}
                    </span>
                    {lane.active ? (
                      <>
                        <span className='bg-secondary text-secondary-foreground rounded px-2 py-1'>
                          {lane.offset === 0
                            ? t('studio.timeline.startsAtZero')
                            : t('studio.timeline.startsAt', {
                                seconds: lane.offset,
                              })}
                        </span>
                        {lane.onChange && (
                          <label className='text-muted-foreground flex items-center gap-1'>
                            {t('studio.timeline.startOffset')}
                            <Input
                              type='number'
                              aria-label={`${t(lane.key)} ${t('studio.timeline.startOffset')}`}
                              min={0}
                              max={3600}
                              step={0.1}
                              className='w-20'
                              disabled={props.busy}
                              value={lane.offset}
                              onChange={(event) => {
                                const value = Number(event.target.value)
                                if (
                                  Number.isFinite(value) &&
                                  value >= 0 &&
                                  value <= 3600
                                ) {
                                  lane.onChange?.(value)
                                }
                              }}
                            />
                          </label>
                        )}
                      </>
                    ) : (
                      <span className='text-muted-foreground'>
                        {t('studio.timeline.emptyLane')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {selectedShot && props.onUpdateTimelineShotEdit && (
              <div className='flex flex-wrap items-end gap-3 border-t pt-3'>
                <p className='w-full text-sm font-medium'>
                  {selectedShot.title}
                </p>
                <Field className='w-auto'>
                  <FieldLabel htmlFor='studio-timeline-trim-start'>
                    {t('studio.timeline.trimStart')}
                  </FieldLabel>
                  <Input
                    id='studio-timeline-trim-start'
                    aria-label={`${selectedShot.title} ${t('studio.timeline.trimStart')}`}
                    type='number'
                    min={0}
                    max={3600}
                    step={0.1}
                    className='w-24'
                    disabled={props.busy}
                    value={selectedShot.trimStart ?? 0}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      if (value >= 0 && value <= 3600) {
                        props.onUpdateTimelineShotEdit?.(selectedShot.id, {
                          trimStart: value,
                        })
                      }
                    }}
                  />
                </Field>
                <Field className='w-auto'>
                  <FieldLabel htmlFor='studio-timeline-trim-end'>
                    {t('studio.timeline.trimEnd')}
                  </FieldLabel>
                  <Input
                    id='studio-timeline-trim-end'
                    aria-label={`${selectedShot.title} ${t('studio.timeline.trimEnd')}`}
                    type='number'
                    min={0}
                    max={3600}
                    step={0.1}
                    className='w-24'
                    disabled={props.busy}
                    value={selectedShot.trimEnd ?? ''}
                    placeholder={t('studio.timeline.fullClip')}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      if (
                        event.target.value === '' ||
                        (value >= 0 && value <= 3600)
                      ) {
                        props.onUpdateTimelineShotEdit?.(selectedShot.id, {
                          trimEnd:
                            event.target.value === '' ? undefined : value,
                        })
                      }
                    }}
                  />
                </Field>
                {selectedShotIndex < timelineShots.length - 1 && (
                  <Field className='w-auto'>
                    <FieldLabel>{t('studio.timeline.transition')}</FieldLabel>
                    <Select
                      value={selectedShot.transition || 'cut'}
                      disabled={props.busy}
                      onValueChange={(value) =>
                        props.onUpdateTimelineShotEdit?.(selectedShot.id, {
                          transition: value as 'cut' | 'fade',
                        })
                      }
                    >
                      <SelectTrigger
                        aria-label={`${selectedShot.title} ${t('studio.timeline.transition')}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value='cut'>
                            {t('studio.timeline.cut')}
                          </SelectItem>
                          <SelectItem value='fade'>
                            {t('studio.timeline.fade')}
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {selectedShotIndex < timelineShots.length - 1 &&
                  selectedShot.transition === 'fade' && (
                    <Field className='w-auto'>
                      <FieldLabel htmlFor='studio-timeline-transition-seconds'>
                        {t('studio.timeline.transitionSeconds')}
                      </FieldLabel>
                      <Input
                        id='studio-timeline-transition-seconds'
                        aria-label={`${selectedShot.title} ${t('studio.timeline.transitionSeconds')}`}
                        type='number'
                        min={0.1}
                        max={3}
                        step={0.1}
                        className='w-24'
                        disabled={props.busy}
                        value={selectedShot.transitionSeconds ?? 0.5}
                        onChange={(event) => {
                          const value = Number(event.target.value)
                          if (value >= 0.1 && value <= 3) {
                            props.onUpdateTimelineShotEdit?.(selectedShot.id, {
                              transitionSeconds: value,
                            })
                          }
                        }}
                      />
                    </Field>
                  )}
              </div>
            )}
          </div>
        )}
        {invalidTrim && (
          <p role='alert' className='text-destructive text-xs'>
            {t('studio.timeline.invalidTrim', { shot: invalidTrim.title })}
          </p>
        )}
        <div className='space-y-2 rounded-md border p-3'>
          <p className='text-sm font-medium'>
            {t('studio.timeline.soundtrack')}
          </p>
          <Input
            type='file'
            accept='audio/*'
            aria-label={t('studio.timeline.soundtrack')}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) props.onUploadSoundtrack?.(file)
              event.target.value = ''
            }}
          />
          {props.soundtrackUrl && (
            <div className='space-y-2'>
              <audio src={props.soundtrackUrl} controls className='w-full' />
              <label className='text-muted-foreground flex items-center gap-2 text-xs'>
                {t('studio.timeline.volume')}
                <Input
                  type='number'
                  min={0}
                  max={1}
                  step={0.1}
                  className='w-24'
                  value={props.soundtrackVolume ?? 1}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (value >= 0 && value <= 1) {
                      props.onSoundtrackVolumeChange?.(value)
                    }
                  }}
                />
              </label>
              <Button
                size='xs'
                variant='outline'
                onClick={props.onRemoveSoundtrack}
              >
                {t('studio.timeline.removeSoundtrack')}
              </Button>
            </div>
          )}
        </div>
        <div className='space-y-2 rounded-md border p-3'>
          <p className='text-sm font-medium'>
            {t('studio.timeline.voiceover')}
          </p>
          <Input
            type='file'
            accept='audio/*'
            aria-label={t('studio.timeline.voiceover')}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) props.onUploadVoiceover?.(file)
              event.target.value = ''
            }}
          />
          {props.voiceoverUrl && (
            <div className='space-y-2'>
              <audio src={props.voiceoverUrl} controls className='w-full' />
              <label className='text-muted-foreground flex items-center gap-2 text-xs'>
                {t('studio.timeline.voiceoverVolume')}
                <Input
                  type='number'
                  min={0}
                  max={1}
                  step={0.1}
                  className='w-24'
                  value={props.voiceoverVolume ?? 1}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (value >= 0 && value <= 1) {
                      props.onVoiceoverVolumeChange?.(value)
                    }
                  }}
                />
              </label>
              <Button
                size='xs'
                variant='outline'
                onClick={props.onRemoveVoiceover}
              >
                {t('studio.timeline.removeVoiceover')}
              </Button>
            </div>
          )}
        </div>
        <Field>
          <FieldLabel htmlFor='studio-captions'>
            {t('studio.timeline.captions')}
          </FieldLabel>
          <Textarea
            id='studio-captions'
            value={props.captionsText || ''}
            maxLength={100_000}
            rows={5}
            placeholder='1\n00:00:00,000 --> 00:00:02,000\n...'
            disabled={props.busy}
            onChange={(event) => props.onCaptionsChange?.(event.target.value)}
          />
          <FieldDescription>
            {t('studio.timeline.captionsHint')}
          </FieldDescription>
        </Field>
        {props.preflight && (
          <p className='text-muted-foreground text-xs' role='status'>
            {t('studio.timeline.preflight', {
              seconds: Math.round(props.preflight.totalDuration),
              megabytes: Math.ceil(
                props.preflight.estimatedOutputBytes / 1_000_000
              ),
            })}
          </p>
        )}
        {props.previewUrl && (
          <video
            aria-label={t('studio.assembly.preview')}
            src={props.previewUrl}
            controls
            preload='metadata'
            className='aspect-video max-h-64 w-full rounded object-contain'
          />
        )}
        {props.busy && (
          <progress
            aria-label={t('studio.assembly.progress')}
            value={props.progress}
            max={100}
            className='h-2 w-full'
          />
        )}
        {props.error && (
          <p role='alert' className='text-destructive text-xs'>
            {props.error}
          </p>
        )}
        <div className='flex flex-wrap gap-2'>
          <Button
            size='sm'
            disabled={props.busy || Boolean(invalidTrim)}
            onClick={props.onAssemble}
          >
            {props.busy
              ? t('studio.assembly.working')
              : t('studio.assembly.create')}
          </Button>
          {props.busy && (
            <Button size='sm' variant='outline' onClick={props.onCancel}>
              {t('studio.assembly.cancel')}
            </Button>
          )}
          {props.previewUrl && !props.busy && (
            <Button size='sm' variant='outline' onClick={props.onDownload}>
              {t('studio.assembly.download')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
