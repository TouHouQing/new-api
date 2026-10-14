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
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { StudioNativeEditParameters } from './studio-native-edits'

export function StudioCropRegion(props: {
  width: number
  height: number
  value: StudioNativeEditParameters
  disabled: boolean
  children: React.ReactNode
  onChange: (patch: Partial<StudioNativeEditParameters>) => void
}) {
  const { t } = useTranslation()
  const [ratioLock, setRatioLock] = useState<number | undefined>(undefined)
  const origin = useRef<{ x: number; y: number } | undefined>(undefined)
  const width = Math.max(2, props.width || 640),
    height = Math.max(2, props.height || 360)
  const point = (
    event: React.PointerEvent<SVGSVGElement>
  ): { x: number; y: number } => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(
        0,
        Math.min(
          width - 2,
          Math.round(((event.clientX - rect.left) * width) / rect.width)
        )
      ),
      y: Math.max(
        0,
        Math.min(
          height - 2,
          Math.round(((event.clientY - rect.top) * height) / rect.height)
        )
      ),
    }
  }
  return (
    <div className='space-y-2'>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Drag a crop rectangle on the source. Only the new edited version is cropped.'
        )}
      </p>
      <div
        className='relative mx-auto w-full'
        style={{
          aspectRatio: width / height,
          maxWidth: `calc(55vh * ${width / height})`,
        }}
      >
        {props.children}
        <svg
          className='absolute inset-0 h-full w-full touch-none'
          viewBox={`0 0 ${width} ${height}`}
          role='img'
          aria-label={t('Crop region preview')}
          onPointerDown={(event) => {
            if (props.disabled) return
            origin.current = point(event)
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            if (!origin.current || props.disabled) return
            const end = point(event)
            let cropWidth = Math.max(2, Math.abs(end.x - origin.current.x))
            let cropHeight = Math.max(2, Math.abs(end.y - origin.current.y))
            if (ratioLock) {
              const availableWidth =
                end.x >= origin.current.x
                  ? width - origin.current.x
                  : origin.current.x
              const availableHeight =
                end.y >= origin.current.y
                  ? height - origin.current.y
                  : origin.current.y
              cropWidth = Math.max(
                2,
                Math.floor(
                  Math.min(
                    Math.max(cropWidth, cropHeight * ratioLock),
                    availableWidth,
                    availableHeight * ratioLock
                  )
                )
              )
              cropHeight = Math.max(2, Math.floor(cropWidth / ratioLock))
            }
            props.onChange({
              x: Math.max(
                0,
                Math.min(
                  width - cropWidth,
                  end.x >= origin.current.x
                    ? origin.current.x
                    : origin.current.x - cropWidth
                )
              ),
              y: Math.max(
                0,
                Math.min(
                  height - cropHeight,
                  end.y >= origin.current.y
                    ? origin.current.y
                    : origin.current.y - cropHeight
                )
              ),
              width: cropWidth,
              height: cropHeight,
            })
          }}
          onPointerUp={() => {
            origin.current = undefined
          }}
          onPointerCancel={() => {
            origin.current = undefined
          }}
        >
          <rect width={width} height={height} fill='rgba(0,0,0,.16)' />
          <rect
            x={props.value.x || 0}
            y={props.value.y || 0}
            width={props.value.width || width}
            height={props.value.height || height}
            fill='transparent'
            stroke='white'
            strokeWidth={Math.max(2, width / 250)}
          />
          <rect
            x={(props.value.x || 0) + (props.value.width || width) * 0.05}
            y={(props.value.y || 0) + (props.value.height || height) * 0.05}
            width={(props.value.width || width) * 0.9}
            height={(props.value.height || height) * 0.9}
            fill='none'
            stroke='white'
            strokeDasharray='6 4'
            pointerEvents='none'
            aria-label={t('Crop safe area')}
          />
        </svg>
      </div>
      <div className='flex flex-wrap gap-2'>
        <Button
          size='sm'
          variant='outline'
          disabled={props.disabled}
          aria-pressed={ratioLock === undefined}
          onClick={() => setRatioLock(undefined)}
        >
          {t('Free crop')}
        </Button>
        {[
          ['16:9', 16 / 9],
          ['9:16', 9 / 16],
          ['1:1', 1],
        ].map(([label, ratio]) => (
          <Button
            key={label}
            size='sm'
            variant='outline'
            disabled={props.disabled}
            aria-pressed={ratioLock === Number(ratio)}
            onClick={() => {
              setRatioLock(Number(ratio))
              const w = Math.min(width, height * Number(ratio)),
                h = w / Number(ratio)
              props.onChange({
                x: Math.round((width - w) / 2),
                y: Math.round((height - h) / 2),
                width: Math.floor(w),
                height: Math.floor(h),
              })
            }}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  )
}
