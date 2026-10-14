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
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import type { StudioCanvasNodeData } from './canvas-flow'
import type { StudioProject } from './local-projects'

export function StudioNodeLabels(props: {
  data: StudioCanvasNodeData
  disabled?: boolean
  onChange: (patch: Partial<StudioCanvasNodeData>) => void
}) {
  const { t } = useTranslation()
  return (
    <div className='flex flex-wrap items-center gap-2'>
      <Input
        type='color'
        aria-label={t('Node label color')}
        className='w-12'
        value={props.data.labelColor || '#64748b'}
        disabled={props.disabled}
        onChange={(event) => props.onChange({ labelColor: event.target.value })}
      />
      <NativeSelect
        aria-label={t('Node rating')}
        value={props.data.rating || 0}
        disabled={props.disabled}
        onChange={(event) =>
          props.onChange({ rating: Number(event.target.value) })
        }
      >
        {[0, 1, 2, 3, 4, 5].map((rating) => (
          <NativeSelectOption key={rating} value={rating}>
            {rating ? '★'.repeat(rating) : t('Unrated')}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <span className='text-muted-foreground text-xs'>
        {t('Labels and ratings do not change generation inputs.')}
      </span>
    </div>
  )
}

export function StudioCanvasFilters(props: {
  canvas?: StudioProject['canvas']
  colors: string[]
  count: number
  total: number
  onChange: (value: NonNullable<StudioProject['canvas']>) => void
}) {
  const { t } = useTranslation()
  return (
    <div className='flex max-w-full flex-wrap items-center gap-2'>
      <NativeSelect
        aria-label={t('Filter by label color')}
        value={props.canvas?.colorFilter || ''}
        onChange={(event) =>
          props.onChange({
            ...props.canvas,
            colorFilter: event.target.value || undefined,
          })
        }
      >
        <NativeSelectOption value=''>
          {t('All label colors')}
        </NativeSelectOption>
        {props.colors.map((color) => (
          <NativeSelectOption key={color} value={color}>
            {color}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label={t('Minimum rating')}
        value={props.canvas?.minimumRating || 0}
        onChange={(event) =>
          props.onChange({
            ...props.canvas,
            minimumRating: Number(event.target.value),
          })
        }
      >
        {[0, 1, 2, 3, 4, 5].map((rating) => (
          <NativeSelectOption key={rating} value={rating}>
            {rating
              ? t('{{rating}} stars and above', { rating })
              : t('All ratings')}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label={t('Canvas display density')}
        value={props.canvas?.displayDensity || 'normal'}
        onChange={(event) =>
          props.onChange({
            ...props.canvas,
            displayDensity: event.target.value as
              | 'compact'
              | 'normal'
              | 'expanded',
          })
        }
      >
        {(['compact', 'normal', 'expanded'] as const).map((density) => (
          <NativeSelectOption key={density} value={density}>
            {t(`studio.canvas.density.${density}`)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Button
        size='sm'
        variant='ghost'
        onClick={() =>
          props.onChange({
            ...props.canvas,
            colorFilter: undefined,
            minimumRating: 0,
          })
        }
      >
        {t('Clear filters')}
      </Button>
      <span role='status' className='text-xs'>
        {t('{{visible}} of {{total}} nodes visible', {
          visible: props.count,
          total: props.total,
        })}
      </span>
    </div>
  )
}
