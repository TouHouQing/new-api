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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import type { StudioProject } from './local-projects'
import {
  studioTimelineAudio,
  studioTimelineSchedule,
} from './studio-timeline-playback'

export function StudioTimelinePreview(props: {
  project: StudioProject
  getMedia: (id: string) => Promise<Blob | null>
  onPreviewed?: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [durations, setDurations] = useState<Record<string, number>>({})
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('studio-timeline-durations', {
        detail: { projectId: props.project.id, durations },
      })
    )
  }, [durations, props.project.id])
  useEffect(() => {
    const seek = (event: Event) => {
      const detail = (
        event as CustomEvent<{ projectId: string; seconds: number }>
      ).detail
      if (
        detail?.projectId === props.project.id &&
        Number.isFinite(detail.seconds)
      ) {
        setTime(Math.max(0, detail.seconds))
      }
    }
    window.addEventListener('studio-timeline-seek', seek)
    return () => window.removeEventListener('studio-timeline-seek', seek)
  }, [props.project.id])
  const videos = useRef<Record<string, HTMLVideoElement | null>>({})
  const background = useRef<HTMLVideoElement>(null)
  const audios = useRef<Record<string, HTMLAudioElement | null>>({})
  const access = useRef(props.getMedia)
  access.current = props.getMedia
  const schedule = useMemo(() => {
    try {
      return studioTimelineSchedule(props.project, durations)
    } catch {
      return []
    }
  }, [props.project, durations])
  const audio = useMemo(() => {
    try {
      return studioTimelineAudio(props.project, durations)
    } catch {
      return []
    }
  }, [props.project, durations])
  const mediaKey = [
    ...new Set([
      ...schedule.map((item) => item.mediaId),
      ...audio.map((item) => item.mediaId),
    ]),
  ]
    .filter(Boolean)
    .sort()
    .join('|')
  useEffect(() => {
    let disposed = false
    const next: Record<string, string> = {}
    setPlaying(false)
    async function loadMedia() {
      await Promise.all(
        mediaKey
          .split('|')
          .filter(Boolean)
          .map(async (id) => {
            const blob = await access.current(id)
            if (blob && !disposed) next[id] = URL.createObjectURL(blob)
          })
      )
      if (!disposed) {
        setUrls(next)
      }
    }
    void loadMedia().catch(handleServerError)
    return () => {
      disposed = true
      Object.values(next).forEach(URL.revokeObjectURL)
    }
  }, [mediaKey])
  const total = schedule.at(-1)?.end || 0
  useEffect(() => {
    if (!playing) return
    let previous = performance.now()
    let frame = 0
    function tick(now: number) {
      const elapsed = Math.min((now - previous) / 1000, 0.1)
      previous = now
      setTime((value) => Math.min(total, value + elapsed))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, total])
  useEffect(() => {
    if (time >= total && playing) setPlaying(false)
    const backdrop = background.current
    const backgroundItem = schedule.find(
      (item) => time >= item.start && time < item.end
    )
    if (backdrop && backgroundItem) {
      const local =
        (time - backgroundItem.start) * backgroundItem.clip.speed +
        backgroundItem.clip.trimStart
      if (Math.abs(backdrop.currentTime - local) > 0.15) {
        backdrop.currentTime = local
      }
      backdrop.playbackRate = backgroundItem.clip.speed
      if (playing) void backdrop.play().catch(() => setPlaying(false))
      else backdrop.pause()
    }
    for (const item of schedule) {
      const video = videos.current[item.clip.id]
      if (!video) continue
      const active = time >= item.start && time < item.end
      if (!active) {
        video.pause()
        continue
      }
      const local = (time - item.start) * item.clip.speed + item.clip.trimStart
      if (Math.abs(video.currentTime - local) > 0.15) video.currentTime = local
      video.playbackRate = item.clip.speed
      const elapsed = time - item.start
      const remaining = item.end - time
      const fadeIn = item.clip.fadeIn
        ? Math.min(1, elapsed / item.clip.fadeIn)
        : 1
      const fadeOut = item.clip.fadeOut
        ? Math.min(1, remaining / item.clip.fadeOut)
        : 1
      video.volume = item.clip.volume * Math.min(fadeIn, fadeOut)
      video.muted = item.clip.muted || item.replacesAudio
      video.style.opacity = String(Math.min(fadeIn, fadeOut))
      if (playing) void video.play().catch(() => setPlaying(false))
      else video.pause()
    }
    for (const track of audio) {
      const element = audios.current[track.id]
      if (!element) continue
      const local = time - track.offset + track.start
      const duration = Math.min(
        track.duration || Infinity,
        element.duration - track.start
      )
      if (time < track.offset || time >= track.offset + duration) {
        element.pause()
        continue
      }
      if (Math.abs(element.currentTime - local) > 0.15) {
        element.currentTime = Math.max(0, local)
      }
      element.volume = track.volume
      if (playing) void element.play().catch(() => setPlaying(false))
      else element.pause()
    }
  }, [time, total, playing, schedule, audio])
  const active = schedule.find((item) => time >= item.start && time < item.end)
  const local = active ? time - active.start : 0
  const captions: string[] = []
  if (
    active &&
    local >= active.clip.captionOffset &&
    (!active.clip.captionDuration ||
      local < active.clip.captionOffset + active.clip.captionDuration)
  ) {
    captions.push(active.clip.caption)
  }
  for (const cue of props.project.captionsText
    ? []
    : props.project.production?.dialogueCues || []) {
    if (
      active &&
      cue.shotId === active.shot?.id &&
      local + active.sourceOffset >= cue.offset &&
      local + active.sourceOffset <
        cue.offset + (cue.duration || active.duration)
    ) {
      captions.push(cue.text)
    }
  }
  for (const cue of (props.project.captionsText || '')
    .replaceAll('\r\n', '\n')
    .split(/\n\s*\n/)) {
    const lines = cue.split('\n')
    const timing = lines.findIndex((line) => line.includes('-->'))
    if (timing < 0) continue
    const values = lines[timing].match(/(\d+):(\d+):(\d+)[,.](\d+)/g)
    if (!values || values.length !== 2) continue
    const seconds = values.map((value) => {
      const parts = value.split(/[:,.]/).map(Number)
      return parts[0] * 3600 + parts[1] * 60 + parts[2] + parts[3] / 1000
    })
    const offset = props.project.captionOffsetSeconds || 0
    if (time >= seconds[0] + offset && time < seconds[1] + offset) {
      captions.push(lines.slice(timing + 1).join('\n'))
    }
  }
  const caption = captions.filter(Boolean).join('\n')
  if (!schedule.length) return null
  return (
    <div className='space-y-2'>
      <div
        className='relative overflow-hidden rounded-lg bg-black'
        style={{
          aspectRatio: `${props.project.production?.width || 1920} / ${props.project.production?.height || 1080}`,
        }}
      >
        {props.project.production?.fit === 'blur' && active && (
          <video
            ref={background}
            src={urls[active.mediaId]}
            muted
            playsInline
            className='absolute inset-0 h-full w-full scale-110 object-cover blur-[20px]'
          />
        )}
        {schedule.map((item) => (
          <video
            key={item.clip.id}
            ref={(element) => {
              videos.current[item.clip.id] = element
            }}
            src={urls[item.mediaId]}
            preload='metadata'
            playsInline
            aria-label={t('studio.production.livePreview')}
            className={
              active?.clip.id === item.clip.id
                ? 'relative h-full w-full object-contain'
                : 'hidden'
            }
            style={{
              objectFit:
                props.project.production?.fit === 'crop' ? 'cover' : 'contain',
            }}
            onLoadedMetadata={(event) => {
              const duration = event.currentTarget.duration
              if (Number.isFinite(duration)) {
                setDurations((values) =>
                  values[item.mediaId] === duration
                    ? values
                    : { ...values, [item.mediaId]: duration }
                )
              }
            }}
            onError={() => setPlaying(false)}
            onPlaying={props.onPreviewed}
          />
        ))}
        {caption && (
          <p className='absolute inset-x-4 bottom-4 text-center whitespace-pre-wrap text-white [text-shadow:0_1px_4px_black]'>
            {caption}
          </p>
        )}
        {props.project.production?.watermark && (
          <p className='absolute top-4 right-4 max-w-[90%] text-xs text-white/75'>
            {props.project.production.watermark}
          </p>
        )}
      </div>
      {audio.map((track) => (
        <audio
          key={track.id}
          ref={(element) => {
            audios.current[track.id] = element
          }}
          src={urls[track.mediaId]}
          preload='metadata'
        />
      ))}
      <div className='flex items-center gap-3'>
        <Button
          variant='outline'
          disabled={!schedule.every((item) => urls[item.mediaId])}
          onClick={() => {
            if (time >= total) setTime(0)
            setPlaying(!playing)
          }}
        >
          {t(
            playing
              ? 'studio.production.pausePreview'
              : 'studio.production.playPreview'
          )}
        </Button>
        <Input
          aria-label={t('studio.production.playhead')}
          type='range'
          min='0'
          max={total}
          step='0.01'
          value={Math.min(time, total)}
          onChange={(event) => setTime(Number(event.target.value))}
        />
        <span className='shrink-0 text-xs tabular-nums'>
          {formatNumber(time, locale)} / {formatNumber(total, locale)}s
        </span>
      </div>
    </div>
  )
}
