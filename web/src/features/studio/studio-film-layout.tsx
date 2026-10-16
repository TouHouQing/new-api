/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { ALL_FORMATS, BlobSource, Input as MediaInput } from 'mediabunny'
import { useEffect, useRef, useState } from 'react'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { handleServerError } from '@/lib/handle-server-error'

import {
  studioProductionSchema,
  studioProjectTimeline,
} from './studio-production'
import { useStudioProductionContext } from './studio-production-context'

export function StudioFilmLayout() {
  const { t } = useTranslation()
  const { props, writable } = useStudioProductionContext()
  const production =
    props.project.production || studioProductionSchema.parse({})
  const framing = {
    focusX: 0.5,
    focusY: 0.5,
    safeArea: false,
    ...production.framing,
  }
  const [source, setSource] = useState<{ width: number; height: number }>()
  const access = useRef(props.getMedia)
  access.current = props.getMedia
  const first = studioProjectTimeline(props.project)[0]
  const node = props.project.nodes.find((node) => node.id === first?.nodeId)
  const mediaId = first?.takeId
    ? node?.data.takes?.find((take) => take.id === first.takeId)?.mediaId
    : node?.data.mediaId
  useEffect(() => {
    let disposed = false
    setSource(undefined)
    if (mediaId) {
      void access
        .current(mediaId)
        .then(async (blob) => {
          if (!blob || disposed) return
          const input = new MediaInput({
            source: new BlobSource(blob),
            formats: ALL_FORMATS,
          })
          try {
            const track = await input.getPrimaryVideoTrack()
            if (track && !disposed) {
              setSource({
                width: track.displayWidth,
                height: track.displayHeight,
              })
            }
          } finally {
            input.dispose()
          }
        })
        .catch(handleServerError)
    }
    return () => {
      disposed = true
    }
  }, [mediaId])
  let shape = '16:9'
  if (production.height > production.width) shape = '9:16'
  else if (production.height === production.width) shape = '1:1'
  return (
    <Collapsible>
      <CollapsibleTrigger render={<Button variant='outline' size='sm' />}>
        {t('Fit the film to its destination')}
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-3 pt-3'>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Preview each frame shape before exporting. Keep the subject and editable titles inside the safe area. Earlier exported films are preserved.'
          )}
        </p>
        <ToggleGroup
          variant='outline'
          size='sm'
          disabled={!writable}
          aria-label={t('Frame shape')}
          value={[shape]}
          onValueChange={(values) => {
            const sizes: Record<string, [number, number]> = {
              '16:9': [1280, 720],
              '9:16': [720, 1280],
              '1:1': [720, 720],
            }
            const size = sizes[String(values[0])]
            if (size) {
              props.onUpdate({
                ...props.project,
                production: {
                  ...production,
                  width: size[0],
                  height: size[1],
                  fit: 'crop',
                  framing,
                  exportSizeMode: 'custom',
                },
              })
            }
          }}
        >
          {['16:9', '9:16', '1:1'].map((label) => (
            <ToggleGroupItem key={label} value={label}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {(['focusX', 'focusY'] as const).map((key) => (
          <Field key={key}>
            <FieldLabel>
              {t(
                key === 'focusX'
                  ? 'Subject horizontal position'
                  : 'Subject vertical position'
              )}
            </FieldLabel>
            <Input
              aria-label={t(
                key === 'focusX'
                  ? 'Subject horizontal position'
                  : 'Subject vertical position'
              )}
              type='range'
              min={0}
              max={100}
              disabled={!writable}
              value={framing[key] * 100}
              onChange={(event) =>
                props.onUpdate({
                  ...props.project,
                  production: {
                    ...production,
                    fit: 'crop',
                    framing: {
                      ...framing,
                      [key]: Number(event.target.value) / 100,
                    },
                  },
                })
              }
            />
          </Field>
        ))}
        <Field orientation='horizontal'>
          <Checkbox
            id='film-safe-area'
            disabled={!writable}
            checked={framing.safeArea}
            onCheckedChange={(checked) =>
              props.onUpdate({
                ...props.project,
                production: {
                  ...production,
                  framing: { ...framing, safeArea: !!checked },
                },
              })
            }
          />
          <FieldLabel htmlFor='film-safe-area'>
            {t('Show title and subtitle safe area')}
          </FieldLabel>
        </Field>
        {source && (
          <>
            <p className='text-sm'>
              {t('Source dimensions')}: {source.width} × {source.height}
            </p>
            <Button
              size='sm'
              variant='outline'
              disabled={!writable}
              onClick={() => {
                const scale = Math.min(
                  source.width / production.width,
                  source.height / production.height,
                  1
                )
                props.onUpdate({
                  ...props.project,
                  production: {
                    ...production,
                    width: Math.max(
                      64,
                      Math.floor((production.width * scale) / 2) * 2
                    ),
                    height: Math.max(
                      64,
                      Math.floor((production.height * scale) / 2) * 2
                    ),
                    exportSizeMode: 'source',
                  },
                })
              }}
            >
              {t('Use source detail without upscaling')}
            </Button>
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
