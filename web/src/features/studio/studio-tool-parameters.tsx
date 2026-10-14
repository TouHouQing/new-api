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
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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

import { studioSongDuration } from './studio-song-duration'

export type StudioToolOptions = {
  panel_prompts?: string[]
  redo_panel?: number
  outpaint_mode?: 'strict' | 'natural'
  mask_source?: 'automatic' | 'second_reference'
  background_prompt?: string
  repair_start?: number
  repair_end?: number
  candidate_start?: number
  candidate_end?: number
  music_mode?: 'instrumental' | 'song'
  lyrics?: string
  bpm?: number
  seed?: number
  width: number
  height: number
  scale: number
  rows: number
  columns: number
  speed: number
  pitch: number
  pause: number
  expression: number
  translation: string
}
const fields = {
  width: [16, 2048, 16],
  height: [16, 2048, 16],
  scale: [1, 4, 1],
  rows: [1, 4, 1],
  columns: [1, 4, 1],
  speed: [0.5, 2, 0.05],
  pitch: [-12, 12, 0.5],
  pause: [0, 3, 0.1],
  expression: [0, 2, 0.1],
} as const
const languages = {
  en: 'English',
  zh: 'Chinese',
  ja: 'Japanese',
  fr: 'French',
  ru: 'Russian',
  es: 'Spanish',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ko: 'Korean',
  ar: 'Arabic',
  hi: 'Hindi',
}
export function StudioToolParameters(props: {
  action: string
  value: StudioToolOptions
  onChange: (value: StudioToolOptions) => void
  language: string
  onLanguage: (value: string) => void
  disabled: boolean
  seconds?: number
  onSeconds?: (seconds: number) => void
}) {
  const { t } = useTranslation()
  const songSeconds = studioSongDuration(props.value.lyrics || '')
  let selected: (keyof typeof fields)[] = []
  if (props.action === 'image_upscale') selected = ['scale']
  if (props.action === 'image_outpaint') selected = ['width', 'height']
  if (props.action === 'video_depth') selected = ['width', 'height']
  if (props.action === 'image_grid') {
    selected = ['width', 'height', 'rows', 'columns']
  }
  if (
    ['voice_speech', 'voice_clone', 'audio_translate'].includes(props.action)
  ) {
    selected = ['speed', 'pitch', 'pause', 'expression']
  }
  return (
    <div className='grid gap-3 sm:grid-cols-2'>
      {props.action === 'audio_separate' && (
        <div className='space-y-3 sm:col-span-2'>
          <label className='flex items-center gap-2'>
            <Checkbox
              disabled={props.disabled}
              checked={props.value.repair_end !== undefined}
              onCheckedChange={(checked) => {
                const next = { ...props.value }
                if (checked) {
                  next.repair_start = 0
                  next.repair_end = 4
                  next.candidate_start = 0
                  next.candidate_end = 4
                } else {
                  delete next.repair_start
                  delete next.repair_end
                  delete next.candidate_start
                  delete next.candidate_end
                }
                props.onChange(next)
              }}
            />
            {t(
              'Preserve accompaniment and replace vocals from a chosen candidate'
            )}
          </label>
          {props.value.repair_end !== undefined && (
            <>
              <p>
                {t(
                  'Choose original audio first and candidate audio second. Confirm both intervals before applying to a new version.'
                )}
              </p>
              <div className='grid gap-3 sm:grid-cols-2'>
                {(
                  [
                    'repair_start',
                    'repair_end',
                    'candidate_start',
                    'candidate_end',
                  ] as const
                ).map((key) => (
                  <Field key={key}>
                    <FieldLabel>{t(`Audio selection ${key}`)}</FieldLabel>
                    <Input
                      aria-label={t(`Audio selection ${key}`)}
                      disabled={props.disabled}
                      type='number'
                      min={0}
                      max={600}
                      step={0.1}
                      value={props.value[key] ?? ''}
                      onChange={(e) =>
                        props.onChange({
                          ...props.value,
                          [key]: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
              <p role='status'>
                {t(
                  'Only vocal separation and composition run. Processing covers {{seconds}} seconds across the two source files.',
                  { seconds: props.seconds }
                )}
              </p>
            </>
          )}
        </div>
      )}
      {props.action === 'image_grid' && (
        <div className='flex flex-col gap-3 sm:col-span-2'>
          <p role='status'>
            {t(
              'Generates {{count}} images. Each panel is a separate model operation.',
              {
                count: props.value.redo_panel
                  ? 1
                  : props.value.rows * props.value.columns,
              }
            )}
          </p>
          {Array.from(
            { length: props.value.rows * props.value.columns },
            (_, index) => (
              <Field key={index}>
                <FieldLabel>
                  {t('Panel {{number}}: action and framing', {
                    number: index + 1,
                  })}
                </FieldLabel>
                <Textarea
                  aria-label={t('Panel {{number}}: action and framing', {
                    number: index + 1,
                  })}
                  disabled={props.disabled}
                  maxLength={3000}
                  value={props.value.panel_prompts?.[index] || ''}
                  placeholder={t(
                    [
                      'Wide establishing shot: introduce the location',
                      'Medium shot: the character takes action',
                      'Close-up: show a reaction or important detail',
                      'Wide closing shot: reveal the outcome',
                    ][index % 4]
                  )}
                  onChange={(event) => {
                    const panels = Array.from(
                      { length: props.value.rows * props.value.columns },
                      (_, i) => props.value.panel_prompts?.[i] || ''
                    )
                    panels[index] = event.target.value
                    props.onChange({ ...props.value, panel_prompts: panels })
                  }}
                />
              </Field>
            )
          )}
        </div>
      )}
      {props.action === 'image_outpaint' && (
        <Field className='sm:col-span-2'>
          <FieldLabel>{t('Original image preservation')}</FieldLabel>
          <Select
            value={props.value.outpaint_mode || 'strict'}
            disabled={props.disabled}
            onValueChange={(value) =>
              props.onChange({
                ...props.value,
                outpaint_mode: value === 'natural' ? 'natural' : 'strict',
              })
            }
          >
            <SelectTrigger aria-label={t('Original image preservation')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='strict'>
                {t('Keep every original pixel')}
              </SelectItem>
              <SelectItem value='natural'>
                {t('Blend the boundary naturally')}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Natural blending changes up to 32 pixels at the source boundary. Strict mode keeps the entire source exact.'
            )}
          </p>
        </Field>
      )}
      {props.action === 'image_layers' && (
        <>
          <Field>
            <FieldLabel>{t('Removal mask')}</FieldLabel>
            <Select
              value={props.value.mask_source || 'automatic'}
              disabled={props.disabled}
              onValueChange={(value) =>
                props.onChange({
                  ...props.value,
                  mask_source:
                    value === 'second_reference'
                      ? 'second_reference'
                      : 'automatic',
                })
              }
            >
              <SelectTrigger aria-label={t('Removal mask')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='automatic'>
                  {t('Automatic foreground')}
                </SelectItem>
                <SelectItem value='second_reference'>
                  {t('Second reference: white removal mask')}
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{t('Background description only')}</FieldLabel>
            <Textarea
              aria-label={t('Background description only')}
              maxLength={2000}
              disabled={props.disabled}
              value={props.value.background_prompt || ''}
              onChange={(event) =>
                props.onChange({
                  ...props.value,
                  background_prompt: event.target.value,
                })
              }
            />
          </Field>
          <p className='text-muted-foreground text-xs sm:col-span-2'>
            {t(
              'Select the source first, then an optional same-size mask. White removes; black keeps. Describe the empty environment, without the foreground character.'
            )}
          </p>
        </>
      )}
      {props.action === 'music' && (
        <>
          <Field>
            <FieldLabel>{t('Music mode')}</FieldLabel>
            <Select
              value={props.value.music_mode || 'instrumental'}
              onValueChange={(value) => {
                const next = {
                  ...props.value,
                  music_mode:
                    value === 'song'
                      ? ('song' as const)
                      : ('instrumental' as const),
                }
                if (value !== 'song') {
                  delete next.lyrics
                  delete next.repair_start
                  delete next.repair_end
                }
                props.onChange(next)
              }}
            >
              <SelectTrigger aria-label={t('Music mode')}>
                <SelectValue>
                  {t(
                    props.value.music_mode === 'song'
                      ? 'Song with lyrics'
                      : 'Instrumental music'
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='instrumental'>
                  {t('Instrumental music')}
                </SelectItem>
                <SelectItem value='song'>{t('Song with lyrics')}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {props.value.music_mode === 'song' && (
            <div className='flex flex-col gap-2 sm:col-span-2'>
              <p role='status'>
                {t(
                  'Allow about {{seconds}} seconds for these lyrics, including an intro and ending.',
                  {
                    seconds: songSeconds,
                  }
                )}
              </p>
              <Button
                variant='outline'
                size='sm'
                disabled={
                  props.disabled ||
                  props.value.repair_end !== undefined ||
                  songSeconds > 30
                }
                onClick={() => props.onSeconds?.(songSeconds)}
              >
                {t('Use the recommended song duration')}
              </Button>
              {songSeconds > 30 && (
                <p role='alert'>
                  {t(
                    'These lyrics exceed a 30-second song. Split them into shorter sections before generating.'
                  )}
                </p>
              )}
              {props.value.repair_end !== undefined && (
                <div>
                  <p>
                    {t(
                      'Vocal repair: {{start}}–{{end}} seconds. The original accompaniment and other intervals are retained.',
                      {
                        start: props.value.repair_start,
                        end: props.value.repair_end,
                      }
                    )}
                  </p>
                  <p>
                    {t(
                      'Generates {{seconds}} seconds to locate the phrase, then replaces only the chosen interval.',
                      { seconds: props.seconds }
                    )}
                  </p>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={props.disabled}
                    onClick={() => {
                      const next = { ...props.value }
                      delete next.repair_start
                      delete next.repair_end
                      props.onChange(next)
                      props.onSeconds?.(Math.min(30, songSeconds))
                    }}
                  >
                    {t('Create a new full song instead')}
                  </Button>
                </div>
              )}
            </div>
          )}
          <Field>
            <FieldLabel>{t('Music tempo')}</FieldLabel>
            <Input
              aria-label={t('Music tempo')}
              type='number'
              min={30}
              max={240}
              step={1}
              value={props.value.bpm ?? 90}
              disabled={props.disabled}
              onChange={(event) =>
                props.onChange({
                  ...props.value,
                  bpm: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel>{t('Music seed')}</FieldLabel>
            <Input
              aria-label={t('Music seed')}
              type='number'
              min={0}
              max={2147483647}
              step={1}
              value={props.value.seed ?? 0}
              disabled={props.disabled}
              onChange={(event) =>
                props.onChange({
                  ...props.value,
                  seed: Number(event.target.value),
                })
              }
            />
          </Field>
          {props.value.music_mode === 'song' && (
            <Field className='sm:col-span-2'>
              <FieldLabel>{t('Lyrics')}</FieldLabel>
              <Textarea
                aria-label={t('Lyrics')}
                value={props.value.lyrics || ''}
                maxLength={3000}
                disabled={props.disabled}
                onChange={(event) =>
                  props.onChange({ ...props.value, lyrics: event.target.value })
                }
              />
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Write your own lyrics. Local song drafts are limited to 30 seconds; audition vocals before delivery.'
                )}
              </p>
            </Field>
          )}
        </>
      )}
      {selected.includes('expression') && (
        <div className='flex flex-wrap gap-2 sm:col-span-2'>
          {[
            {
              name: 'Calm delivery',
              speed: 0.95,
              pitch: -1,
              pause: 0.3,
              expression: 0.3,
            },
            {
              name: 'Clear narration',
              speed: 1,
              pitch: 0,
              pause: 0.2,
              expression: 0.5,
            },
            {
              name: 'Excited delivery',
              speed: 1.1,
              pitch: 1,
              pause: 0.1,
              expression: 1,
            },
          ].map(({ name, ...options }) => (
            <Button
              key={name}
              size='sm'
              variant='outline'
              disabled={props.disabled}
              onClick={() => props.onChange({ ...props.value, ...options })}
            >
              {t(name)}
            </Button>
          ))}
        </div>
      )}
      {selected.map((key) => (
        <Field key={key}>
          <FieldLabel>{t(`Tool parameter ${key}`)}</FieldLabel>
          <Input
            aria-label={t(`Tool parameter ${key}`)}
            type='number'
            disabled={props.disabled}
            min={fields[key][0]}
            max={fields[key][1]}
            step={fields[key][2]}
            value={props.value[key]}
            onChange={(event) =>
              props.onChange({
                ...props.value,
                [key]: Number(event.target.value),
              })
            }
          />
        </Field>
      ))}
      {['music', 'voice_speech', 'voice_clone', 'audio_translate'].includes(
        props.action
      ) && (
        <Field>
          <FieldLabel>
            {t(props.action === 'music' ? 'Song language' : 'Voice language')}
          </FieldLabel>
          <Select
            value={props.language}
            disabled={props.disabled}
            onValueChange={(value) => props.onLanguage(value || 'en')}
          >
            <SelectTrigger
              aria-label={t(
                props.action === 'music' ? 'Song language' : 'Voice language'
              )}
            >
              <SelectValue>
                {t(
                  languages[props.language as keyof typeof languages] ||
                    props.language
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(languages).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {t(label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      {props.action === 'audio_translate' && (
        <Field className='sm:col-span-2'>
          <FieldLabel>{t('Corrected translation (optional)')}</FieldLabel>
          <Textarea
            aria-label={t('Corrected translation (optional)')}
            disabled={props.disabled}
            value={props.value.translation}
            maxLength={3000}
            onChange={(event) =>
              props.onChange({
                ...props.value,
                translation: event.target.value,
              })
            }
          />
          <p className='text-muted-foreground text-xs'>
            {t(
              'Leave empty to transcribe and translate the source. Provide your own text to revise the dubbing.'
            )}
          </p>
        </Field>
      )}
      {selected.includes('pause') && (
        <p className='text-muted-foreground text-xs sm:col-span-2'>
          {t(
            'Pause adds silence before and after this dialogue segment. Use separate dialogue cues for pauses between sentences.'
          )}
        </p>
      )}
      {props.action === 'image_layers' && (
        <p className='text-muted-foreground text-xs sm:col-span-2'>
          {t(
            'Separate the foreground and reconstruct the hidden background. Review both layers before using the result.'
          )}
        </p>
      )}
      {props.action === 'audio_separate' && (
        <p className='text-muted-foreground text-xs sm:col-span-2'>
          {t(
            'Creates vocals, instrumental, drums, bass and other tracks. Preview the separation before delivery.'
          )}
        </p>
      )}
      {props.action === 'video_depth' && (
        <p className='text-muted-foreground text-xs sm:col-span-2'>
          {t(
            'Extract relative depth from the source video for VACE motion control. Use 384x224 or 224x384 for clips longer than ten seconds; maximum thirty seconds.'
          )}
        </p>
      )}
    </div>
  )
}
