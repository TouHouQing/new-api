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
import { ChevronDown } from 'lucide-react'
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type { StudioGroup } from './api'
import type { StudioProjectDefaults } from './local-projects'
import {
  inferStudioVideoFamily,
  type StudioVideoFamily,
} from './model-profiles'
import { StudioVideoModelPicker } from './studio-video-model-picker'

type Props = {
  value: StudioProjectDefaults
  groups: StudioGroup[]
  userGroup: string
  textModels: string[]
  imageModels: string[]
  onChange: (patch: Partial<StudioProjectDefaults>) => void
}

export function StudioShotDefaults(props: Props) {
  const { t } = useTranslation()
  const group = props.value.videoGroup || props.userGroup
  return (
    <Collapsible className='rounded-lg border'>
      <CollapsibleTrigger
        render={
          <Button
            type='button'
            variant='ghost'
            className='w-full justify-between rounded-lg px-3 py-2'
          />
        }
      >
        {t('studio.defaults.title')}
        <ChevronDown aria-hidden='true' />
      </CollapsibleTrigger>
      <CollapsibleContent className='border-t p-3'>
        <p className='text-muted-foreground mb-3 text-xs'>
          {t('studio.defaults.hint')}
        </p>
        <div className='grid gap-3 sm:grid-cols-2'>
          <Field>
            <FieldLabel>{t('studio.kind.text')}</FieldLabel>
            <Select
              value={props.value.textModel || null}
              onValueChange={(value) =>
                props.onChange({ textModel: value || undefined })
              }
              items={props.textModels.map((id) => ({ value: id, label: id }))}
            >
              <SelectTrigger aria-label={t('studio.defaults.textModel')}>
                <SelectValue placeholder={t('studio.source.manual')} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {props.textModels.map((id) => (
                    <SelectItem key={id} value={id}>
                      {id}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {props.value.textModel && (
              <Button
                type='button'
                size='xs'
                variant='ghost'
                onClick={() => props.onChange({ textModel: undefined })}
              >
                {t('studio.source.manual')}
              </Button>
            )}
          </Field>
          <Field>
            <FieldLabel>{t('studio.kind.image')}</FieldLabel>
            <Select
              value={props.value.imageModel || null}
              onValueChange={(value) =>
                props.onChange({ imageModel: value || undefined })
              }
              items={props.imageModels.map((id) => ({ value: id, label: id }))}
            >
              <SelectTrigger aria-label={t('studio.defaults.imageModel')}>
                <SelectValue placeholder={t('studio.source.manual')} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {props.imageModels.map((id) => (
                    <SelectItem key={id} value={id}>
                      {id}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {props.value.imageModel && (
              <Button
                type='button'
                size='xs'
                variant='ghost'
                onClick={() => props.onChange({ imageModel: undefined })}
              >
                {t('studio.source.manual')}
              </Button>
            )}
          </Field>
          <Field>
            <FieldLabel>{t('studio.video.group')}</FieldLabel>
            <Select
              value={group || null}
              onValueChange={(value) =>
                props.onChange({
                  videoGroup: value || undefined,
                  videoModel: undefined,
                  videoFamily: undefined,
                })
              }
              items={props.groups.map((item) => ({
                value: item.id,
                label: item.description || item.id,
              }))}
            >
              <SelectTrigger aria-label={t('studio.video.group')}>
                <SelectValue placeholder={t('studio.video.group.select')} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {props.groups.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.description || item.id}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{t('studio.kind.video')}</FieldLabel>
            <StudioVideoModelPicker
              group={group}
              selectedModel={props.value.videoModel || ''}
              durationSeconds={props.value.seconds ?? 5}
              onSelect={(id) =>
                props.onChange({
                  videoGroup: group,
                  videoModel: id,
                  videoFamily: inferStudioVideoFamily(id),
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel>{t('studio.video.family')}</FieldLabel>
            <Select
              value={props.value.videoFamily || 'generic'}
              onValueChange={(value) =>
                props.onChange({ videoFamily: value as StudioVideoFamily })
              }
              items={[
                { value: 'generic', label: t('studio.video.family.generic') },
                {
                  value: 'seedance-2',
                  label: t('studio.video.family.seedance'),
                },
                {
                  value: 'seedance-2.5',
                  label: t('studio.video.family.seedance25'),
                },
                {
                  value: 'minimax-h3',
                  label: t('studio.video.family.minimax'),
                },
              ]}
            >
              <SelectTrigger aria-label={t('studio.video.family')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='generic'>
                    {t('studio.video.family.generic')}
                  </SelectItem>
                  <SelectItem value='seedance-2'>
                    {t('studio.video.family.seedance')}
                  </SelectItem>
                  <SelectItem value='seedance-2.5'>
                    {t('studio.video.family.seedance25')}
                  </SelectItem>
                  <SelectItem value='minimax-h3'>
                    {t('studio.video.family.minimax')}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor='studio-default-seconds'>
              {t('studio.duration')}
            </FieldLabel>
            <Input
              id='studio-default-seconds'
              type='number'
              min={1}
              max={3600}
              value={props.value.seconds ?? 5}
              onChange={(event) => {
                const value = Number(event.target.value)
                if (Number.isInteger(value) && value >= 1 && value <= 3600) {
                  props.onChange({ seconds: value })
                }
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='studio-default-resolution'>
              {t('studio.resolution')}
            </FieldLabel>
            <Input
              id='studio-default-resolution'
              value={props.value.resolution || ''}
              maxLength={100}
              onChange={(event) =>
                props.onChange({ resolution: event.target.value })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='studio-default-ratio'>
              {t('studio.ratio')}
            </FieldLabel>
            <Input
              id='studio-default-ratio'
              value={props.value.ratio || ''}
              maxLength={40}
              onChange={(event) =>
                props.onChange({ ratio: event.target.value })
              }
            />
          </Field>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
