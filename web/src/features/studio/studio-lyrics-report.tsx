/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
For commercial licensing, please contact support@quantumnous.com
*/
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import { studioCloudMedia } from './studio-cloud'

const schema = z.strictObject({
  status: z.enum(['matched', 'review_required', 'unavailable']),
  transcript: z.string().max(30000),
  repair: z
    .object({ applied: z.boolean(), start: z.number(), end: z.number() })
    .optional(),
  lines: z
    .array(
      z.strictObject({
        text: z.string().max(3000),
        matched: z.boolean(),
        start: z.number().optional(),
        end: z.number().optional(),
      })
    )
    .max(500),
})
export function StudioLyricsReport(props: {
  projectId: string
  mediaId: string
  audioMediaId?: string
  getMedia?: (id: string) => Promise<Blob | null>
  readOnly?: boolean
  canReview?: boolean
  onRepair?: (text: string, start: number, end: number) => void
  onConfirm?: (note: string) => void
}) {
  const { t } = useTranslation()
  const audio = useRef<HTMLAudioElement>(null)
  const [url, setUrl] = useState('')
  const [duration, setDuration] = useState(0)
  const [repairLine, setRepairLine] = useState('')
  const [repairStart, setRepairStart] = useState('0')
  const [repairEnd, setRepairEnd] = useState('0')
  const access = useRef(props.getMedia)
  access.current = props.getMedia
  useEffect(() => {
    let disposed = false,
      owned = ''
    if (props.audioMediaId && access.current) {
      void access.current(props.audioMediaId).then((blob) => {
        if (!blob || disposed) return
        owned = URL.createObjectURL(blob)
        setUrl(owned)
      })
    }
    return () => {
      disposed = true
      if (owned) URL.revokeObjectURL(owned)
    }
  }, [props.audioMediaId])
  const query = useQuery({
    queryKey: ['studio', 'lyrics-report', props.projectId, props.mediaId],
    queryFn: async () =>
      schema.parse(
        await (
          await studioCloudMedia(props.projectId, props.mediaId)
        )
          .text()
          .then(JSON.parse)
      ),
    staleTime: Infinity,
  })
  if (!query.data) {
    return (
      <p role='status' className='text-muted-foreground text-xs'>
        {t(
          query.isError
            ? 'Lyrics check is unavailable. Listen to the song before delivery.'
            : 'Checking recognized lyrics'
        )}
      </p>
    )
  }
  const report = query.data
  const occurrences = new Map<string, number>()
  const lines = report.lines.map((line) => {
    const occurrence = (occurrences.get(line.text) || 0) + 1
    occurrences.set(line.text, occurrence)
    return { ...line, id: `${line.text}:${occurrence}` }
  })
  const title = {
    matched: 'All lyric lines were recognized in order',
    unavailable:
      'Lyrics check is unavailable. Listen to the song before delivery.',
    review_required: 'Some lyric lines need review',
  }[report.status]
  return (
    <Alert variant={report.status === 'matched' ? 'default' : 'destructive'}>
      <AlertDescription className='space-y-2'>
        <p className='font-medium'>{t(title)}</p>
        {report.repair?.applied === false && (
          <p role='status'>
            {t(
              'The repair candidate was not recognized. Your original song is retained. Listen to the candidate or retry.'
            )}
          </p>
        )}
        {url && (
          <audio
            ref={audio}
            src={url}
            controls
            preload='metadata'
            aria-label={t('Listen to this exact song Take')}
            onLoadedMetadata={() => setDuration(audio.current?.duration || 0)}
          />
        )}
        {report.lines.length > 0 && (
          <ul className='space-y-1'>
            {lines.map((line, index) => (
              <li key={line.id}>
                {t(line.matched ? 'Recognized' : 'Not recognized')} ·{' '}
                {line.text}
                {url && (
                  <Button
                    size='xs'
                    variant='outline'
                    onClick={() => {
                      if (!audio.current) return
                      audio.current.currentTime = Math.max(
                        0,
                        line.start ?? (duration * index) / lines.length - 0.5
                      )
                      void audio.current.play().catch(() => {})
                    }}
                  >
                    {t(
                      line.start === undefined
                        ? 'Listen near this line (estimated)'
                        : 'Listen at the recognized interval'
                    )}
                  </Button>
                )}
                {!line.matched && props.onRepair && (
                  <Button
                    size='xs'
                    variant='outline'
                    disabled={props.readOnly || !duration}
                    onClick={() => {
                      setRepairLine(line.text)
                      setRepairStart(
                        String(
                          Math.max(
                            0,
                            Math.floor((duration * index) / lines.length)
                          )
                        )
                      )
                      setRepairEnd(
                        String(
                          Math.min(
                            duration,
                            Math.ceil((duration * (index + 1)) / lines.length)
                          )
                        )
                      )
                    }}
                  >
                    {t('Prepare a vocal repair')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {repairLine && (
          <div className='flex flex-col gap-2'>
            <p>
              {t(
                'Repair only this phrase; keep the accompaniment and all audio outside the interval. Review the timing before confirming generation.'
              )}
            </p>
            <Field>
              <FieldLabel>{t('Repair lyric')}</FieldLabel>
              <Input
                aria-label={t('Repair lyric')}
                value={repairLine}
                onChange={(event) => setRepairLine(event.target.value)}
              />
            </Field>
            <div className='flex flex-wrap gap-2'>
              <Field>
                <FieldLabel>{t('Repair start')}</FieldLabel>
                <Input
                  aria-label={t('Repair start')}
                  inputMode='decimal'
                  value={repairStart}
                  onChange={(event) => setRepairStart(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>{t('Repair end')}</FieldLabel>
                <Input
                  aria-label={t('Repair end')}
                  inputMode='decimal'
                  value={repairEnd}
                  onChange={(event) => setRepairEnd(event.target.value)}
                />
              </Field>
            </div>
            <Button
              disabled={
                props.readOnly ||
                !repairLine.trim() ||
                !Number.isFinite(Number(repairStart)) ||
                !Number.isFinite(Number(repairEnd)) ||
                Number(repairStart) < 0 ||
                Number(repairEnd) <= Number(repairStart) ||
                Number(repairEnd) > Math.min(30, duration)
              }
              onClick={() =>
                props.onRepair?.(
                  repairLine,
                  Number(repairStart),
                  Number(repairEnd)
                )
              }
            >
              {t('Create repair draft; confirm generation next')}
            </Button>
          </div>
        )}
        {props.onConfirm && report.status !== 'matched' && (
          <div className='flex flex-wrap gap-2'>
            <Button
              size='sm'
              variant='outline'
              disabled={!props.canReview}
              onClick={() =>
                props.onConfirm?.(
                  'Listened to this exact Take: words are present; recognition omitted them.'
                )
              }
            >
              {t('I listened: the words are present')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={!props.canReview}
              onClick={() =>
                props.onConfirm?.(
                  'Listened to this exact Take: sung words are missing; vocal repair needed.'
                )
              }
            >
              {t('I listened: the words are missing')}
            </Button>
          </div>
        )}
        {report.transcript && (
          <p>
            {t('Recognized lyrics')}: {report.transcript}
          </p>
        )}
        <p>
          {t(
            'Recognition is a review aid. Listen to the final phrase; shorten lyrics, increase duration or explicitly generate another Take if words are missing.'
          )}
        </p>
      </AlertDescription>
    </Alert>
  )
}
