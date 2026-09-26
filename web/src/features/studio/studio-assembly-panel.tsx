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
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

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
  voiceoverUrl?: string
  voiceoverVolume?: number
  onUploadVoiceover?: (file: File) => void
  onRemoveVoiceover?: () => void
  onVoiceoverVolumeChange?: (volume: number) => void
  captionsText?: string
  onCaptionsChange?: (value: string) => void
  preflight?: { totalDuration: number; estimatedOutputBytes: number }
  onUploadSoundtrack?: (file: File) => void
  onRemoveSoundtrack?: () => void
  onSoundtrackVolumeChange?: (volume: number) => void
}

export function StudioAssemblyPanel(props: Props) {
  const { t } = useTranslation()
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
          <Button size='sm' disabled={props.busy} onClick={props.onAssemble}>
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
