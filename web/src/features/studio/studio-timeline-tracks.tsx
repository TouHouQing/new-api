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
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { studioProductionSchema } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import {
  parseStudioSubtitleCues,
  serializeStudioSubtitleCues,
} from './studio-subtitle-cues'
import {
  studioTimelineSchedule,
  studioTimelineAudio,
} from './studio-timeline-playback'

function StudioAudioWaveform(props: {
  mediaId: string
  getMedia: (id: string) => Promise<Blob | null>
  onDuration: (id: string, seconds: number) => void
}) {
  const { t } = useTranslation()
  const [peaks, setPeaks] = useState<number[]>([]),
    [failed, setFailed] = useState(false)
  const access = useRef(props.getMedia)
  access.current = props.getMedia
  const durationAccess = useRef(props.onDuration)
  durationAccess.current = props.onDuration
  useEffect(() => {
    if (typeof AudioContext === 'undefined') {
      setFailed(true)
      return
    }
    let closed = false
    const audio = new AudioContext()
    access
      .current(props.mediaId)
      .then(async (blob) => {
        if (!blob) throw new Error('missing audio')
        const decoded = await audio.decodeAudioData(await blob.arrayBuffer())
        const channel = decoded.getChannelData(0),
          count = 96,
          step = Math.max(1, Math.floor(channel.length / count))
        const values = Array.from({ length: count }, (_, i) => {
          let peak = 0
          for (
            let j = i * step;
            j < Math.min(channel.length, (i + 1) * step);
            j++
          ) {
            peak = Math.max(peak, Math.abs(channel[j]))
          }
          return peak
        })
        if (!closed) {
          setPeaks(values)
          durationAccess.current(props.mediaId, decoded.duration)
        }
      })
      .catch(() => {
        if (!closed) setFailed(true)
      })
      .finally(() => audio.close().catch(() => {}))
      .catch(() => {
        if (!closed) setFailed(true)
      })
    return () => {
      closed = true
    }
  }, [props.mediaId])
  if (failed) {
    return (
      <span className='text-xs'>
        {t('Waveform unavailable; the audio can still be previewed.')}
      </span>
    )
  }
  return (
    <svg
      className='h-8 w-full'
      viewBox='0 0 192 32'
      role='img'
      aria-label={t('Audio waveform')}
    >
      {peaks.map((peak, i) => {
        const x = i * 2
        return (
          <line
            key={x}
            x1={x}
            x2={x}
            y1={16 - peak * 15}
            y2={16 + peak * 15}
            stroke='currentColor'
            strokeWidth='1'
          />
        )
      })}
    </svg>
  )
}

export function StudioTimelineTracks() {
  const { t, i18n } = useTranslation()
  const { props, timeline, selectedClip, setSelectedClip, writable } =
    useStudioProductionContext()
  const [audioDurations, setAudioDurations] = useState<Record<string, number>>(
    {}
  )
  useEffect(() => {
    const update = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          projectId: string
          durations: Record<string, number>
        }>
      ).detail
      if (detail?.projectId !== props.project.id) return
      setAudioDurations((current) => ({ ...current, ...detail.durations }))
    }
    window.addEventListener('studio-timeline-durations', update)
    return () => window.removeEventListener('studio-timeline-durations', update)
  }, [props.project.id])
  let schedule: ReturnType<typeof studioTimelineSchedule> = []
  let scheduleError = ''
  try {
    schedule = studioTimelineSchedule(props.project, audioDurations)
  } catch (problem) {
    scheduleError = problem instanceof Error ? problem.message : String(problem)
  }
  const total = schedule.at(-1)?.end || 1
  const production =
    props.project.production || studioProductionSchema.parse({})
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const save = (next: typeof production) =>
    props.onUpdate({ ...props.project, production: next })
  const seek = (seconds: number) =>
    window.dispatchEvent(
      new CustomEvent('studio-timeline-seek', {
        detail: { projectId: props.project.id, seconds },
      })
    )
  let subtitles: ReturnType<typeof parseStudioSubtitleCues> = []
  let subtitleError = ''
  try {
    subtitles = parseStudioSubtitleCues(props.project.captionsText || '')
  } catch (problem) {
    subtitleError = problem instanceof Error ? problem.message : String(problem)
  }
  const captionOffset = props.project.captionOffsetSeconds || 0
  let audioTracks: ReturnType<typeof studioTimelineAudio> = []
  try {
    audioTracks = studioTimelineAudio(props.project, audioDurations)
  } catch {
    /* Schedule error already displayed above. */
  }
  const moveAudio = (id: string, offset: number) => {
    if (production.audioTracks.some((track) => track.id === id)) {
      save({
        ...production,
        audioTracks: production.audioTracks.map((track) =>
          track.id === id ? { ...track, offset } : track
        ),
      })
      return
    }
    if (id === 'soundtrack') {
      props.onUpdate({ ...props.project, soundtrackOffsetSeconds: offset })
      return
    }
    if (id === 'voiceover') {
      props.onUpdate({ ...props.project, voiceoverOffsetSeconds: offset })
      return
    }
    for (const item of schedule) {
      const local =
        Math.max(0, Math.min(item.duration - 0.01, offset - item.start)) +
        item.sourceOffset
      if (id === `voice-${item.clip.id}` && item.shot) {
        props.onUpdate({
          ...props.project,
          shots: props.project.shots?.map((shot) =>
            shot.id === item.shot?.id
              ? { ...shot, shotVoiceoverOffsetSeconds: local }
              : shot
          ),
        })
        return
      }
      const cue = production.dialogueCues.find(
        (cue) => id === `${cue.id}-${item.clip.id}`
      )
      if (cue) {
        save({
          ...production,
          dialogueCues: production.dialogueCues.map((current) =>
            current.id === cue.id ? { ...current, offset: local } : current
          ),
        })
        return
      }
    }
  }
  const boundedWidth = (start: number, length: number) =>
    `${(Math.max(0, Math.min(length, total - start)) / total) * 100}%`
  const dropCaption = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (!writable) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const start = Math.max(
      0,
      Math.min(total, ((event.clientX - bounds.left) / bounds.width) * total)
    )
    const clipId = event.dataTransfer.getData('studio-caption-clip')
    const item = schedule.find((item) => item.clip.id === clipId)
    if (item) {
      save({
        ...production,
        timelineEdited: true,
        timeline: timeline.map((clip) =>
          clip.id === clipId
            ? {
                ...clip,
                captionOffset: Math.max(
                  0,
                  Math.min(item.duration - 0.01, start - item.start)
                ),
              }
            : clip
        ),
      })
      return
    }
    const indexText = event.dataTransfer.getData('studio-caption-global')
    if (!/^\d+$/.test(indexText)) return
    const index = Number(indexText),
      cue = subtitles[index]
    if (!cue) return
    const nextStart = Math.max(
      0,
      Math.min(3600 - (cue.end - cue.start), start - captionOffset)
    )
    props.onUpdate({
      ...props.project,
      captionsText: serializeStudioSubtitleCues(
        subtitles.map((current, i) =>
          i === index
            ? { ...cue, start: nextStart, end: nextStart + cue.end - cue.start }
            : current
        )
      ),
    })
  }
  return (
    <section
      className='min-w-0 space-y-3 rounded-lg border p-3'
      aria-label={t('Multitrack timeline')}
    >
      <p className='text-sm'>
        {t(
          'Drag video clips to reorder. Drag an audio track to change its start. Select a caption or clip for precise editing.'
        )}
      </p>
      {scheduleError && <p role='alert'>{t(scheduleError)}</p>}
      <div className='text-muted-foreground flex justify-between text-xs'>
        {[0, total / 4, total / 2, (total * 3) / 4, total].map((time) => (
          <span key={time}>{formatNumber(time, locale)}s</span>
        ))}
      </div>
      <p className='text-xs font-medium'>{t('Video track')}</p>
      <div
        className='bg-muted relative h-12 rounded'
        aria-label={t('Video clip order')}
      >
        {schedule.map((item) => (
          <Button
            key={item.clip.id}
            aria-pressed={selectedClip === item.clip.id}
            size='sm'
            variant={selectedClip === item.clip.id ? 'secondary' : 'outline'}
            className='absolute top-1 h-10 min-w-0 overflow-hidden px-1 text-xs'
            style={{
              left: `${(item.start / total) * 100}%`,
              width: `${(item.duration / total) * 100}%`,
            }}
            draggable={!!writable}
            onDragStart={(event) =>
              event.dataTransfer.setData('studio-clip', item.clip.id)
            }
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              if (!writable) return
              const id = event.dataTransfer.getData('studio-clip')
              const moved = timeline.find((clip) => clip.id === id)
              if (!moved || id === item.clip.id) return
              const next = timeline.filter((clip) => clip.id !== id)
              next.splice(
                next.findIndex((clip) => clip.id === item.clip.id),
                0,
                moved
              )
              save({ ...production, timelineEdited: true, timeline: next })
            }}
            onClick={() => {
              setSelectedClip(item.clip.id)
              props.onSelectNode?.(item.clip.nodeId)
              seek(item.start)
            }}
          >
            {
              props.project.nodes.find((node) => node.id === item.clip.nodeId)
                ?.data.title
            }
          </Button>
        ))}
      </div>
      <p className='text-xs font-medium'>{t('Caption track')}</p>
      <div
        className='bg-muted relative h-10 overflow-hidden rounded'
        onDragOver={(event) => event.preventDefault()}
        onDrop={dropCaption}
      >
        {schedule
          .filter((item) => item.clip.caption)
          .map((item) => (
            <Button
              key={item.clip.id}
              draggable={!!writable}
              onDragStart={(event) =>
                event.dataTransfer.setData('studio-caption-clip', item.clip.id)
              }
              variant='outline'
              size='sm'
              className='absolute top-1 h-8 min-w-0 overflow-hidden px-1 text-xs'
              style={{
                left: `${((item.start + item.clip.captionOffset) / total) * 100}%`,
                width: boundedWidth(
                  item.start + item.clip.captionOffset,
                  item.clip.captionDuration ||
                    item.duration - item.clip.captionOffset
                ),
              }}
              onClick={() => {
                setSelectedClip(item.clip.id)
                props.onSelectNode?.(item.clip.nodeId)
                seek(item.start + item.clip.captionOffset)
              }}
            >
              {item.clip.caption}
            </Button>
          ))}
        {!schedule.some((item) => item.clip.caption) && (
          <span className='p-2 text-xs'>
            {t('Select a video clip to add its caption.')}
          </span>
        )}
      </div>
      {subtitleError && <p role='alert'>{t(subtitleError)}</p>}
      {!!subtitles.length && (
        <>
          <p className='text-xs font-medium'>{t('Project subtitle track')}</p>
          <div
            className='bg-muted relative h-10 overflow-hidden rounded'
            onDragOver={(event) => event.preventDefault()}
            onDrop={dropCaption}
          >
            {subtitles.map((cue, index) => (
              <Button
                key={JSON.stringify([cue.start, cue.end, cue.text])}
                draggable={!!writable}
                onDragStart={(event) =>
                  event.dataTransfer.setData(
                    'studio-caption-global',
                    String(index)
                  )
                }
                variant='outline'
                size='sm'
                className='absolute top-1 h-8 min-w-0 overflow-hidden px-1 text-xs'
                style={{
                  left: `${((cue.start + captionOffset) / total) * 100}%`,
                  width: boundedWidth(
                    cue.start + captionOffset,
                    cue.end - cue.start
                  ),
                }}
                onClick={() => seek(cue.start + captionOffset)}
              >
                {cue.text}
              </Button>
            ))}
          </div>
        </>
      )}
      {audioTracks.map((track, index) => (
        <div key={track.id} className='space-y-1'>
          <p className='text-xs font-medium'>
            {props.project.nodes.find(
              (node) => node.data.mediaId === track.mediaId
            )?.data.title ||
              t('Audio track {{number}}', { number: index + 1 })}{' '}
            · {formatNumber(track.offset, locale)}s
          </p>
          <div
            className='bg-muted relative h-12 overflow-hidden rounded'
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              if (
                !writable ||
                event.dataTransfer.getData('studio-audio') !== track.id
              ) {
                return
              }
              const bounds = event.currentTarget.getBoundingClientRect()
              const offset = Math.max(
                0,
                Math.min(
                  total - 0.01,
                  ((event.clientX - bounds.left) / bounds.width) * total
                )
              )
              moveAudio(track.id, offset)
            }}
          >
            <Button
              draggable={!!writable}
              onDragStart={(event) =>
                event.dataTransfer.setData('studio-audio', track.id)
              }
              variant='outline'
              className='absolute top-1 h-10 min-w-0 overflow-hidden px-1'
              style={{
                left: `${Math.min(track.offset / total, 1) * 100}%`,
                width: boundedWidth(
                  track.offset,
                  track.duration || audioDurations[track.mediaId] || total
                ),
              }}
              aria-label={t('Move audio track: {{number}}', {
                number: index + 1,
              })}
              onClick={() => seek(track.offset)}
            >
              <StudioAudioWaveform
                mediaId={track.mediaId}
                getMedia={props.getMedia}
                onDuration={(id, seconds) =>
                  setAudioDurations((current) =>
                    current[id] === seconds
                      ? current
                      : { ...current, [id]: seconds }
                  )
                }
              />
            </Button>
          </div>
        </div>
      ))}
    </section>
  )
}
