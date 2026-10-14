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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import type { StudioCanvasNodeData } from './canvas-flow'
import {
  studioImageParameters,
  studioImageModelPatch,
} from './studio-image-parameters'

export function StudioImageSettings(props: {
  data: StudioCanvasNodeData
  disabled?: boolean
  onChange: (patch: Partial<StudioCanvasNodeData>) => void
}) {
  const { t } = useTranslation()
  const parameters = studioImageParameters(props.data.model || '')
  return (
    <div className='space-y-2'>
      <NativeSelect
        aria-label={t('studio.image.size')}
        value={
          parameters.sizes.includes(props.data.imageSize || '')
            ? props.data.imageSize
            : ''
        }
        disabled={props.disabled}
        onChange={(event) =>
          props.onChange({ imageSize: event.target.value || undefined })
        }
      >
        <NativeSelectOption value=''>
          {t('Automatic image dimensions')}
        </NativeSelectOption>
        {parameters.sizes.map((size) => (
          <NativeSelectOption key={size} value={size}>
            {size}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <p className='text-muted-foreground text-xs'>
        {t(
          parameters.sizes.length
            ? 'This local image model generates one image per task. Select a supported size; quality is controlled by the model.'
            : 'This service has no declared image parameter choices. Automatic dimensions and one image are used; configure provider-specific parameters in advanced settings.'
        )}
      </p>
      {(props.data.imageSize &&
        !parameters.sizes.includes(props.data.imageSize)) ||
      props.data.imageQuality ||
      (props.data.imageCount || 1) > parameters.count ? (
        <Button
          size='sm'
          variant='outline'
          onClick={() =>
            props.onChange(studioImageModelPatch(props.data, props.data.model))
          }
          disabled={props.disabled}
        >
          {t('Reset unsupported image parameters')}
        </Button>
      ) : null}
    </div>
  )
}
