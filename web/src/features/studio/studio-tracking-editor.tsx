/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { handleServerError } from '@/lib/handle-server-error'

import { studioCloudRequest } from './studio-cloud'
import {
  studioSampleTracking,
  type StudioTrackingPoint,
} from './studio-tracking'

type ManualCropKey = { time: number; x: number; y: number }

function validStudioManualCropKeys(
  value: unknown,
  points: StudioTrackingPoint[]
): value is ManualCropKey[] {
  const first = points[0]
  const last = points.at(-1)
  if (
    !first ||
    !last ||
    !Array.isArray(value) ||
    value.length < 2 ||
    value.length > 100
  ) {
    return false
  }
  let previous = -Infinity
  for (const key of value) {
    if (
      !key ||
      typeof key !== 'object' ||
      typeof key.time !== 'number' ||
      !Number.isFinite(key.time) ||
      typeof key.x !== 'number' ||
      !Number.isFinite(key.x) ||
      typeof key.y !== 'number' ||
      !Number.isFinite(key.y) ||
      key.time <= previous ||
      key.time < first.time ||
      key.time > last.time ||
      key.x < 0 ||
      key.y < 0 ||
      key.x + first.crop.width > 1.00001 ||
      key.y + first.crop.height > 1.00001
    ) {
      return false
    }
    previous = key.time
  }
  return true
}

function studioTrackingEditorKeys(
  points: StudioTrackingPoint[],
  manualKeys: unknown
) {
  if (manualKeys !== undefined) {
    if (!validStudioManualCropKeys(manualKeys, points)) {
      return { keys: [], invalid: true }
    }
    return {
      keys: manualKeys.map((key) => ({
        id: crypto.randomUUID(),
        time: key.time,
        x: key.x,
        y: key.y,
      })),
      invalid: false,
    }
  }
  const first = points[0]
  const last = points.at(-1)
  return {
    keys:
      first && last
        ? [first, last].map((point) => ({
            id: crypto.randomUUID(),
            time: point.time,
            x: point.crop.x,
            y: point.crop.y,
          }))
        : [],
    invalid: false,
  }
}

export function StudioTrackingEditor(props: {
  path: string
  analysisId: string
  points: StudioTrackingPoint[]
  manualKeys?: unknown
  url: string
  targetAspect?: number
  readOnly: boolean
  onCorrect: (id: string) => void
}) {
  const { t } = useTranslation()
  const first = props.points[0]
  const last = props.points.at(-1)
  const [time, setTime] = useState(first?.time || 0)
  const [confirmed, setConfirmed] = useState(false)
  const [initial] = useState(() =>
    studioTrackingEditorKeys(props.points, props.manualKeys)
  )
  const [keys, setKeys] = useState(initial.keys)
  const [savedKeysInvalid, setSavedKeysInvalid] = useState(initial.invalid)
  const initializedId = useRef(props.analysisId)
  useEffect(() => {
    if (initializedId.current === props.analysisId) return
    initializedId.current = props.analysisId
    const next = studioTrackingEditorKeys(props.points, props.manualKeys)
    setConfirmed(false)
    setTime(props.points[0]?.time || 0)
    setKeys(next.keys)
    setSavedKeysInvalid(next.invalid)
  }, [props.analysisId, props.points, props.manualKeys])
  const draftKeysInvalid = !validStudioManualCropKeys(keys, props.points)
  const crop = studioSampleTracking(props.points, time)
  const correction = useMutation({
    mutationFn: async () => {
      const record = await studioCloudRequest<{ id: string }>(
        `${props.path}/analyses/${encodeURIComponent(props.analysisId)}/tracking-corrections`,
        'POST',
        {
          request_id: crypto.randomUUID(),
          confirmed,
          keys: keys.map((key) => ({ time: key.time, x: key.x, y: key.y })),
        }
      )
      props.onCorrect(record.id)
    },
    onError: (error) => handleServerError(error),
  })
  if (!first || !last) return null
  return (
    <section
      aria-label={t('Trajectory preview and correction')}
      className='space-y-3'
    >
      <div
        className='mx-auto max-h-80 w-40 overflow-hidden rounded-md bg-black'
        style={{ aspectRatio: props.targetAspect || 9 / 16 }}
      >
        <video
          src={props.url}
          controls
          className='h-full w-full'
          aria-label={t('Portrait trajectory preview')}
          onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
          style={{
            objectFit: crop ? 'cover' : 'contain',
            objectPosition: crop
              ? `${crop.width < 1 ? (crop.x / (1 - crop.width)) * 100 : 50}% ${crop.height < 1 ? (crop.y / (1 - crop.height)) * 100 : 50}%`
              : '50% 50%',
          }}
        />
      </div>
      {!crop && (
        <p role='status' className='text-destructive text-sm'>
          {t(
            'This source time has no reviewed crop. Full framing is shown for correction.'
          )}
        </p>
      )}
      <p className='text-muted-foreground text-sm'>
        {t(
          'Manual crop keys use source seconds and the top-left crop position as percentages. They replace the path only between the first and last key; original tracking and confidence remain available.'
        )}
      </p>
      {savedKeysInvalid && (
        <Alert variant='destructive'>
          <AlertDescription>
            {t(
              'The saved crop keys are invalid. Choose the original analysis to make a new correction; this saved version is preserved.'
            )}
          </AlertDescription>
        </Alert>
      )}
      {!savedKeysInvalid && draftKeysInvalid && (
        <Alert variant='destructive'>
          <AlertDescription>
            {t(
              'Use increasing source times and keep every crop key inside the frame before saving.'
            )}
          </AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        {keys.map((key, index) => (
          <div key={key.id} className='grid grid-cols-3 gap-2'>
            {(['time', 'x', 'y'] as const).map((field) => (
              <Field key={field}>
                <FieldLabel>
                  {t(
                    {
                      time: 'Source seconds',
                      x: 'Horizontal position',
                      y: 'Vertical position',
                    }[field]
                  )}
                  {field !== 'time' && ' %'}
                </FieldLabel>
                <Input
                  aria-label={`${t('Crop key')} ${index + 1} ${field}`}
                  disabled={
                    props.readOnly || savedKeysInvalid || correction.isPending
                  }
                  aria-invalid={draftKeysInvalid}
                  type='number'
                  min={field === 'time' ? first.time : 0}
                  max={
                    field === 'time'
                      ? last.time
                      : Math.max(
                          0,
                          1 -
                            (field === 'x'
                              ? first.crop.width
                              : first.crop.height)
                        ) * 100
                  }
                  step={0.01}
                  value={
                    field === 'time'
                      ? key[field]
                      : Number((key[field] * 100).toFixed(2))
                  }
                  onChange={(event) => {
                    setConfirmed(false)
                    setKeys(
                      keys.map((item, candidate) =>
                        candidate === index
                          ? {
                              ...item,
                              [field]:
                                Number(event.target.value) /
                                (field === 'time' ? 1 : 100),
                            }
                          : item
                      )
                    )
                  }}
                />
              </Field>
            ))}
            <Button
              size='sm'
              variant='ghost'
              disabled={
                props.readOnly || keys.length <= 2 || correction.isPending
              }
              onClick={() => {
                setKeys(keys.filter((item) => item.id !== key.id))
                setConfirmed(false)
              }}
            >
              {t('Remove crop key')} {index + 1}
            </Button>
          </div>
        ))}
        <Button
          size='sm'
          variant='outline'
          disabled={props.readOnly || savedKeysInvalid || keys.length >= 100}
          onClick={() => {
            const at = Math.max(first.time, Math.min(last.time, time))
            if (keys.some((key) => Math.abs(key.time - at) < 0.001)) return
            setKeys(
              [
                ...keys,
                {
                  id: crypto.randomUUID(),
                  time: at,
                  x: crop?.x || 0,
                  y: crop?.y || 0,
                },
              ].sort((a, b) => a.time - b.time)
            )
            setConfirmed(false)
          }}
        >
          {t('Add crop key at current frame')}
        </Button>
      </FieldGroup>
      <label className='flex items-start gap-2 text-sm'>
        <Checkbox
          checked={confirmed}
          disabled={
            props.readOnly ||
            savedKeysInvalid ||
            draftKeysInvalid ||
            correction.isPending
          }
          onCheckedChange={(value) => setConfirmed(value === true)}
        />
        {t('I checked these manual keys against the source footage.')}
      </label>
      <Button
        variant='outline'
        disabled={
          props.readOnly ||
          savedKeysInvalid ||
          draftKeysInvalid ||
          !confirmed ||
          correction.isPending
        }
        onClick={() => correction.mutate()}
      >
        {t('Save a corrected trajectory version')}
      </Button>
    </section>
  )
}
