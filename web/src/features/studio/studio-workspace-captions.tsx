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
import { Field, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'

import {
  studioCaptionTrack,
  studioCaptionTrackSrt,
} from './studio-caption-track'
import { studioProductionSchema } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'

export function StudioWorkspaceCaptions() {
  const { t } = useTranslation()
  const { props, timeline, writable, setSelectedClip, clip, updateClip } =
    useStudioProductionContext()
  const [additional, setAdditional] = useState(false)
  useEffect(() => setAdditional(false), [clip?.id])
  const [durations, setDurations] = useState<Record<string, number>>({})
  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          projectId: string
          durations: Record<string, number>
        }>
      ).detail
      if (detail?.projectId === props.project.id) setDurations(detail.durations)
    }
    window.addEventListener('studio-timeline-durations', changed)
    return () =>
      window.removeEventListener('studio-timeline-durations', changed)
  }, [props.project.id])
  let rows: ReturnType<typeof studioCaptionTrack> = []
  let error = ''
  try {
    rows = studioCaptionTrack(props.project, durations)
  } catch (problem) {
    error = problem instanceof Error ? problem.message : String(problem)
  }
  return (
    <section
      className='flex flex-col gap-3'
      aria-label={t('Timeline captions')}
    >
      <h3 className='font-medium'>
        {t('Timeline captions')} · {rows.length}
      </h3>
      {clip &&
        !additional &&
        !clip.caption &&
        rows.some(
          (row) => row.source === 'dialogue' && row.clipId === clip.id
        ) && (
          <Button variant='ghost' onClick={() => setAdditional(true)}>
            {t('Add another clip caption')}
          </Button>
        )}
      {clip &&
        (additional ||
          clip.caption ||
          !rows.some(
            (row) => row.source === 'dialogue' && row.clipId === clip.id
          )) && (
          <Field>
            <FieldLabel htmlFor='production-caption'>
              {t('studio.production.caption')}
            </FieldLabel>
            <Textarea
              id='production-caption'
              aria-label={t('studio.production.caption')}
              disabled={!writable}
              value={clip.caption}
              maxLength={2000}
              onChange={(event) => updateClip({ caption: event.target.value })}
            />
          </Field>
        )}
      {rows
        .filter(
          (row) =>
            row.source !== 'srt' &&
            (!clip || row.clipId === clip.id) &&
            !(row.source === 'clip' && row.clipId === clip?.id)
        )
        .map((row, rowIndex) => (
          <Field key={row.id}>
            <FieldLabel>
              {t(row.source === 'clip' ? 'Clip caption' : 'Dialogue caption')} ·{' '}
              {row.start.toFixed(2)}–{row.end.toFixed(2)}s
            </FieldLabel>
            <Textarea
              aria-label={`${t('Caption text')} ${rowIndex + 1} · ${row.start.toFixed(2)}s`}
              disabled={!writable}
              value={row.text}
              maxLength={2000}
              onChange={(event) => {
                const production =
                  props.project.production || studioProductionSchema.parse({})
                props.onUpdate({
                  ...props.project,
                  production: {
                    ...production,
                    ...(row.source === 'clip'
                      ? {
                          timelineEdited: true,
                          timeline: timeline.map((clip) =>
                            clip.id === row.clipId
                              ? { ...clip, caption: event.target.value }
                              : clip
                          ),
                        }
                      : {
                          dialogueCues: production.dialogueCues.map((cue) =>
                            cue.id === row.cueId
                              ? { ...cue, text: event.target.value }
                              : cue
                          ),
                        }),
                  },
                })
              }}
            />
            <Button
              size='xs'
              variant='ghost'
              onClick={() => {
                if (row.clipId) setSelectedClip(row.clipId)
                window.dispatchEvent(
                  new CustomEvent('studio-timeline-seek', {
                    detail: { projectId: props.project.id, seconds: row.start },
                  })
                )
              }}
            >
              {t('Show this caption in preview')}
            </Button>
          </Field>
        ))}
      {!rows.length && !error && (
        <p className='text-muted-foreground text-xs'>
          {t(
            'No captions yet. Add a clip caption, import SRT, or transcribe your audio below.'
          )}
        </p>
      )}
      {error && <p role='alert'>{error}</p>}
      <Button
        size='sm'
        variant='outline'
        disabled={
          !rows.length ||
          !!error ||
          !!props.project.production?.captionDraft?.length
        }
        onClick={() => {
          const url = URL.createObjectURL(
            new Blob([studioCaptionTrackSrt(props.project, durations)], {
              type: 'text/plain;charset=utf-8',
            })
          )
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = `${props.project.title}.srt`
          anchor.click()
          setTimeout(() => URL.revokeObjectURL(url), 10000)
        }}
      >
        {t('Export all timeline captions as SRT')}
      </Button>
      {rows.some((row, index) =>
        rows.some(
          (next, j) => j > index && row.start < next.end && next.start < row.end
        )
      ) && (
        <p role='status'>
          {t(
            'Captions overlap. Use the source labels above to remove duplicates before export.'
          )}
        </p>
      )}
    </section>
  )
}
