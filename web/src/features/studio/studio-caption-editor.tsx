/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
For commercial licensing, please contact support@quantumnous.com
*/
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import {
  parseStudioSubtitleCues,
  serializeStudioSubtitleCues,
} from './studio-subtitle-cues'

type Row = { id: string; start: string; end: string; text: string }
function validRows(items: Row[]) {
  return items.every(
    (row) =>
      row.start.trim() &&
      row.end.trim() &&
      Number.isFinite(Number(row.start)) &&
      Number.isFinite(Number(row.end)) &&
      Number(row.start) >= 0 &&
      Number(row.end) > Number(row.start) &&
      Number(row.end) <= 3600 &&
      row.text.trim()
  )
}
export function StudioCaptionEditor(props: {
  value: string
  disabled: boolean
  hasClipCaptions?: boolean
  draft?: Row[]
  onChange: (value: string, draft?: Row[]) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<{ source: string; rows: Row[] }>()
  const [problem, setProblem] = useState('')
  const file = useRef<HTMLInputElement>(null)
  let rows: Row[] = []
  let parseError = false
  if (props.draft?.length) {
    rows = props.draft
  } else if (
    draft?.source === props.value &&
    (!('draft' in props) || validRows(draft.rows))
  ) {
    rows = draft.rows
  } else {
    try {
      rows = parseStudioSubtitleCues(props.value).map((cue, index) => ({
        id: String(index),
        start: String(cue.start),
        end: String(cue.end),
        text: cue.text,
      }))
    } catch {
      parseError = true
    }
  }
  const valid = validRows
  const overlaps = rows.some((row, i) =>
    rows.some(
      (other, j) =>
        j > i &&
        Number(row.start) < Number(other.end) &&
        Number(other.start) < Number(row.end)
    )
  )
  const update = (items: Row[]) => {
    if (props.disabled) return
    const accepted = valid(items)
    const value = accepted
      ? serializeStudioSubtitleCues(
          items.map((row) => ({
            start: Number(row.start),
            end: Number(row.end),
            text: row.text,
          }))
        )
      : props.value
    setDraft({ source: value, rows: items })
    props.onChange(value, accepted ? undefined : items)
  }
  const patch = (id: string, change: Partial<Row>) =>
    update(rows.map((row) => (row.id === id ? { ...row, ...change } : row)))
  return (
    <section className='space-y-3' aria-label={t('Edit captions by sentence')}>
      <h3 className='font-medium'>{t('Edit captions by sentence')}</h3>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Enter times in seconds. Valid sentences save automatically; incomplete rows stay in this editor until corrected.'
        )}
      </p>
      {(parseError || !valid(rows)) && (
        <p role='alert' className='text-destructive text-sm'>
          {t(
            parseError
              ? 'The subtitle file is invalid. Correct it in advanced SRT editing or import a valid file.'
              : 'Each caption needs text and an end time after its start, within 0–3600 seconds.'
          )}
        </p>
      )}
      {overlaps && (
        <p role='status' className='text-sm text-amber-600'>
          {t(
            'Some caption sentences overlap. Adjust their times before delivery.'
          )}
        </p>
      )}
      {props.hasClipCaptions && rows.length > 0 && (
        <p role='status' className='text-sm text-amber-600'>
          {t(
            'Clip captions are also enabled. Review the subtitle tracks to avoid displaying two captions at the same time.'
          )}
        </p>
      )}
      <div className='space-y-2'>
        {rows.map((row, index) => (
          <div
            key={row.id}
            className='grid grid-cols-2 gap-2 rounded-md border p-2 sm:grid-cols-[7rem_7rem_minmax(0,1fr)_auto]'
          >
            <Input
              type='number'
              min={0}
              max={3600}
              step={0.1}
              aria-label={t('Caption {{number}} start', { number: index + 1 })}
              value={row.start}
              disabled={props.disabled}
              onChange={(event) => patch(row.id, { start: event.target.value })}
            />
            <Input
              type='number'
              min={0}
              max={3600}
              step={0.1}
              aria-label={t('Caption {{number}} end', { number: index + 1 })}
              value={row.end}
              disabled={props.disabled}
              onChange={(event) => patch(row.id, { end: event.target.value })}
            />
            <Textarea
              className='col-span-2 min-h-10 sm:col-span-1'
              aria-label={t('Caption {{number}} text', { number: index + 1 })}
              value={row.text}
              maxLength={2000}
              disabled={props.disabled}
              onChange={(event) => patch(row.id, { text: event.target.value })}
            />
            <Button
              variant='ghost'
              size='sm'
              disabled={props.disabled}
              aria-label={t('Remove caption {{number}}', { number: index + 1 })}
              onClick={() => update(rows.filter((item) => item.id !== row.id))}
            >
              {t('Remove')}
            </Button>
          </div>
        ))}
      </div>
      <div className='flex flex-wrap gap-2'>
        <Button
          variant='outline'
          size='sm'
          disabled={props.disabled || parseError || rows.length >= 1000}
          onClick={() => {
            const start = Math.max(
              0,
              ...rows.map((row) => Number(row.end) || 0)
            )
            update([
              ...rows,
              {
                id: crypto.randomUUID(),
                start: String(start),
                end: String(Math.min(3600, start + 2)),
                text: '',
              },
            ])
          }}
        >
          {t('Add caption sentence')}
        </Button>
        <Button
          variant='outline'
          size='sm'
          disabled={props.disabled || parseError || !valid(rows)}
          onClick={() =>
            update([...rows].sort((a, b) => Number(a.start) - Number(b.start)))
          }
        >
          {t('Sort captions by time')}
        </Button>
        <Button
          variant='ghost'
          size='sm'
          disabled={props.disabled}
          onClick={() => file.current?.click()}
        >
          {t('Import SRT')}
        </Button>
        <Button
          variant='ghost'
          size='sm'
          disabled={!props.value || parseError || !valid(rows)}
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([props.value], { type: 'text/plain;charset=utf-8' })
            )
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = 'captions.srt'
            anchor.click()
            window.setTimeout(() => URL.revokeObjectURL(url), 10000)
          }}
        >
          {t('Export SRT')}
        </Button>
      </div>
      <input
        ref={file}
        type='file'
        hidden
        accept='.srt,text/plain'
        onChange={(event) => {
          const selected = event.target.files?.[0]
          if (selected) {
            void selected
              .text()
              .then((raw) => {
                parseStudioSubtitleCues(raw)
                props.onChange(raw)
                setDraft(undefined)
                setProblem('')
              })
              .catch(() =>
                setProblem(
                  t(
                    'The subtitle file is invalid. Correct it in advanced SRT editing or import a valid file.'
                  )
                )
              )
          }
          event.target.value = ''
        }}
      />
      {problem && <p role='alert'>{problem}</p>}
      <Collapsible defaultOpen={parseError}>
        <CollapsibleTrigger render={<Button variant='outline' size='sm' />}>
          {t('Advanced SRT editing')}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Textarea
            aria-label={t('studio.production.subtitles')}
            value={props.value}
            maxLength={100000}
            disabled={props.disabled}
            onChange={(event) => {
              setDraft(undefined)
              props.onChange(event.target.value)
            }}
          />
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}
