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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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

import type { StudioEditableScreenplay } from './studio-creation'

type Shot = StudioEditableScreenplay['shots'][number]
type Props = {
  shot: Shot
  draft: StudioEditableScreenplay
  index: number
  disabled: boolean
  onChange: (patch: Partial<Shot>) => void
  onMove: (direction: number) => void
  onRemove: () => void
  onDurationValidityChange?: (id: string, valid: boolean) => void
}
export function StudioScreenplayShot(props: Props) {
  const { t } = useTranslation()
  const [duration, setDuration] = useState(String(props.shot.seconds))
  useEffect(() => setDuration(String(props.shot.seconds)), [props.shot.seconds])
  const durationValid =
    Number.isInteger(Number(duration)) &&
    Number(duration) >= 1 &&
    Number(duration) <= 3600
  const shotId = props.shot.id
  const onDurationValidityChange = props.onDurationValidityChange
  useEffect(() => {
    onDurationValidityChange?.(shotId, durationValid)
    return () => onDurationValidityChange?.(shotId, true)
  }, [shotId, durationValid, onDurationValidityChange])
  return (
    <article className='space-y-4 rounded-xl border p-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-muted-foreground text-sm'>{props.index + 1}</span>
        <Input
          aria-label={t('Shot title')}
          className='min-w-32 flex-1'
          value={props.shot.title}
          maxLength={200}
          required
          aria-invalid={!props.shot.title.trim()}
          disabled={props.disabled}
          onChange={(event) => props.onChange({ title: event.target.value })}
        />
        <Button
          size='xs'
          variant='outline'
          disabled={props.disabled || props.index === 0}
          onClick={() => props.onMove(-1)}
        >
          {t('Move up')}
        </Button>
        <Button
          size='xs'
          variant='outline'
          disabled={
            props.disabled || props.index === props.draft.shots.length - 1
          }
          onClick={() => props.onMove(1)}
        >
          {t('Move down')}
        </Button>
        <Button
          size='xs'
          variant='ghost'
          disabled={props.disabled || props.draft.shots.length === 1}
          onClick={props.onRemove}
        >
          {t('Remove from draft')}
        </Button>
      </div>
      <div className='grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]'>
        <Field>
          <FieldLabel>{t('What happens in this shot?')}</FieldLabel>
          <Textarea
            aria-label={t('What happens in this shot?')}
            value={props.shot.text}
            maxLength={30000}
            disabled={props.disabled}
            onChange={(event) => props.onChange({ text: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel>{t('Duration in seconds')}</FieldLabel>
          <Input
            type='number'
            required
            aria-label={t('Duration in seconds')}
            min={1}
            max={3600}
            value={duration}
            aria-invalid={!durationValid}
            disabled={props.disabled}
            onChange={(event) => {
              setDuration(event.target.value)
              const seconds = Number(event.target.value)
              if (
                Number.isInteger(seconds) &&
                seconds >= 1 &&
                seconds <= 3600
              ) {
                props.onChange({ seconds })
              }
            }}
          />
          {!durationValid && (
            <p role='alert' className='text-destructive text-xs'>
              {t('Use a whole number from 1 to 3600 seconds')}
            </p>
          )}
        </Field>
      </div>
      <Field>
        <FieldLabel>{t('Dialogue or narration')}</FieldLabel>
        <Textarea
          value={props.shot.dialogue}
          aria-label={t('Dialogue or narration')}
          maxLength={30000}
          disabled={props.disabled}
          onChange={(event) => props.onChange({ dialogue: event.target.value })}
        />
      </Field>
      <Select
        disabled={props.disabled}
        value={props.shot.sceneId || 'none'}
        onValueChange={(value) =>
          props.onChange({
            sceneId: value && value !== 'none' ? value : undefined,
          })
        }
        items={[
          { value: 'none', label: t('No scene reference yet') },
          ...props.draft.scenes.map((scene) => ({
            value: scene.id,
            label: scene.title,
          })),
        ]}
      >
        <SelectTrigger aria-label={t('Scene reference')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value='none'>{t('No scene reference yet')}</SelectItem>
            {props.draft.scenes.map((scene) => (
              <SelectItem value={scene.id} key={scene.id}>
                {scene.title}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <div className='flex flex-wrap gap-3'>
        {props.draft.characters.map((character) => (
          <Field key={character.id} orientation='horizontal'>
            <Checkbox
              id={`${props.shot.id}-${character.id}`}
              disabled={props.disabled}
              checked={props.shot.characterIds.includes(character.id)}
              onCheckedChange={(checked) =>
                props.onChange({
                  characterIds: checked
                    ? [...props.shot.characterIds, character.id]
                    : props.shot.characterIds.filter(
                        (id) => id !== character.id
                      ),
                })
              }
            />
            <FieldLabel htmlFor={`${props.shot.id}-${character.id}`}>
              {character.title}
            </FieldLabel>
          </Field>
        ))}
      </div>
      <Collapsible>
        <CollapsibleTrigger render={<Button size='sm' variant='ghost' />}>
          {t('Advanced shot directions')}
        </CollapsibleTrigger>
        <CollapsibleContent className='grid gap-3 pt-3 sm:grid-cols-2'>
          {(['imagePrompt', 'videoPrompt', 'camera', 'shotType'] as const).map(
            (key) => (
              <Field key={key}>
                <FieldLabel>{t(`studio.creation.${key}`)}</FieldLabel>
                <Textarea
                  aria-label={t(`studio.creation.${key}`)}
                  disabled={props.disabled}
                  value={props.shot[key]}
                  maxLength={
                    {
                      imagePrompt: 30000,
                      videoPrompt: 30000,
                      camera: 2000,
                      shotType: 200,
                    }[key]
                  }
                  onChange={(event) =>
                    props.onChange({ [key]: event.target.value })
                  }
                />
              </Field>
            )
          )}
        </CollapsibleContent>
      </Collapsible>
    </article>
  )
}
