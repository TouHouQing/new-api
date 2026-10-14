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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import type { StudioAsset, StudioAssetProfile } from './local-projects'

type Props = {
  asset: StudioAsset
  onChange: (profile: StudioAssetProfile) => void
  onReference?: (
    mode: 'portrait' | 'turnaround' | 'expressions' | 'locationAngles'
  ) => void
  defaultOpen?: boolean
  disabled?: boolean
}
export function StudioAssetProfileEditor(props: Props) {
  const { t } = useTranslation()
  const fields: Array<keyof StudioAssetProfile> = []
  const subjectType =
    props.asset.profile?.subjectType ||
    (/狐|兔|猫|狗|fox|rabbit|cat|dog/i.test(props.asset.title)
      ? 'animal'
      : 'human')
  const basic = new Set([
    'appearance',
    'voice',
    'continuity',
    'avoid',
    'wardrobe',
    'palette',
    'lighting',
    'atmosphere',
    'timeOfDay',
  ])
  if (props.asset.kind === 'character') {
    fields.push(
      'appearance',
      'age',
      'body',
      'face',
      'hair',
      'eyes',
      'makeup',
      'wardrobe',
      'accessories',
      'personality',
      'voice'
    )
  }
  if (props.asset.kind === 'location') {
    fields.push('timeOfDay', 'atmosphere', 'lighting')
  }
  if (props.asset.kind === 'style') {
    fields.push('palette', 'lighting', 'atmosphere')
  }
  fields.push('continuity', 'avoid')
  const renderField = (field: keyof StudioAssetProfile) => (
    <Field key={field}>
      <FieldLabel htmlFor={`studio-asset-${props.asset.id}-${field}`}>
        {t(`studio.asset.profile.${field}`)}
      </FieldLabel>
      <Textarea
        id={`studio-asset-${props.asset.id}-${field}`}
        disabled={props.disabled}
        maxLength={2000}
        rows={2}
        value={props.asset.profile?.[field] || ''}
        onChange={(event) =>
          props.onChange({
            ...props.asset.profile,
            [field]: event.target.value,
          })
        }
      />
    </Field>
  )
  return (
    <Collapsible
      defaultOpen={props.defaultOpen}
      className='flex flex-col gap-2'
    >
      <CollapsibleTrigger
        render={
          <Button
            size='sm'
            variant='outline'
            className='w-full justify-start'
          />
        }
      >
        {t('studio.asset.profile')}
      </CollapsibleTrigger>
      <CollapsibleContent className='flex flex-col gap-3'>
        <p className='text-muted-foreground text-xs'>
          {t('studio.asset.profileHint')}
        </p>
        {props.asset.kind === 'character' && (
          <Select
            value={subjectType}
            items={[
              { value: 'human', label: t('Human') },
              { value: 'animal', label: t('Animal or creature') },
              { value: 'object', label: t('Object or product') },
            ]}
            disabled={props.disabled}
            onValueChange={(value) => {
              if (
                value === 'human' ||
                value === 'animal' ||
                value === 'object'
              ) {
                props.onChange({ ...props.asset.profile, subjectType: value })
              }
            }}
          >
            <SelectTrigger aria-label={t('Character type')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='human'>{t('Human')}</SelectItem>
              <SelectItem value='animal'>{t('Animal or creature')}</SelectItem>
              <SelectItem value='object'>{t('Object or product')}</SelectItem>
            </SelectContent>
          </Select>
        )}
        {fields.filter((field) => basic.has(field)).map(renderField)}
        <Collapsible>
          <CollapsibleTrigger render={<Button size='sm' variant='outline' />}>
            {t('Detailed character design')}
          </CollapsibleTrigger>
          <CollapsibleContent className='space-y-3 pt-3'>
            {fields
              .filter(
                (field) =>
                  !basic.has(field) &&
                  (subjectType === 'human' ||
                    !['age', 'makeup', 'face'].includes(field))
              )
              .map(renderField)}
          </CollapsibleContent>
        </Collapsible>
        {props.onReference && props.asset.kind !== 'style' && (
          <div className='flex flex-wrap gap-1'>
            {(props.asset.kind === 'character'
              ? (['portrait', 'turnaround', 'expressions'] as const)
              : (['locationAngles'] as const)
            ).map((mode) => (
              <Button
                key={mode}
                size='xs'
                variant='secondary'
                disabled={props.disabled}
                onClick={() => props.onReference?.(mode)}
              >
                {t(`studio.reference.${mode}`)}
              </Button>
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
