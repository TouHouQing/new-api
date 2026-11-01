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
import { useQuery } from '@tanstack/react-query'
import { ALL_FORMATS, BlobSource, Input as MediaInput } from 'mediabunny'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import type { StudioProject } from './local-projects'
import { studioCaptionTrack } from './studio-caption-track'
import { studioCloudRequest } from './studio-cloud'
import { studioMusicGain, studioVoiceWindows } from './studio-creative-plan'
import { StudioFilmOverlay } from './studio-film-overlay'
import {
  studioTimelineAudio,
  studioTimelineMediaIds,
  studioTimelineSchedule,
} from './studio-timeline-playback'
import {
  studioSampleTracking,
  type StudioTrackingPoint,
} from './studio-tracking'

export function StudioTimelinePreview(props: {
  project: StudioProject
  getMedia: (id: string) => Promise<Blob | null>
  onPreviewed?: () => void
  compact?: boolean
  syncGroup?: string
  muted?: boolean
}) {
  const previewElement = useRef<HTMLDivElement>(null)
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [durations, setDurations] = useState<Record<string, number>>({})
  const [audibleMedia, setAudibleMedia] = useState<Record<string, boolean>>({})
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const reframeIds = [
    ...new Set(
      Object.values(props.project.production?.reframes || {}).map(
        (item) => item.analysisId
      )
    ),
  ]
    .sort()
    .join('|')
  const tracks = useQuery({
    queryKey: ['studio-tracking-preview', props.project.id, reframeIds],
    queryFn: async () => {
      const result: Record<string, StudioTrackingPoint[]> = {}
      await Promise.all(
        reframeIds
          .split('|')
          .filter(Boolean)
          .map(async (id) => {
            const data = await studioCloudRequest<{
              document: { analysis: { points: StudioTrackingPoint[] } }
            }>(
              `/projects/${encodeURIComponent(props.project.id)}/analyses/${encodeURIComponent(id)}`
            )
            result[id] = data.document.analysis.points
          })
      )
      return result
    },
    enabled: !!reframeIds,
  })
  useEffect(() => {
    const pauseHiddenPreview = () => {
      if (document.hidden) setPlaying(false)
    }
    document.addEventListener('visibilitychange', pauseHiddenPreview)
    return () =>
      document.removeEventListener('visibilitychange', pauseHiddenPreview)
  }, [])
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
  const sources = useMemo(() => {
    try {
      return { key: studioTimelineMediaIds(props.project).join('|'), error: '' }
    } catch (error) {
      return {
        key: '',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }, [props.project])
  const mediaKey = sources.key
  useEffect(() => {
    let disposed = false
    const next: Record<string, string> = {}
    const audible: Record<string, boolean> = {}
    const measured: Record<string, number> = {}
    setPlaying(false)
    async function loadMedia() {
      await Promise.all(
        mediaKey
          .split('|')
          .filter(Boolean)
          .map(async (id) => {
            const blob = await access.current(id)
            if (blob && !disposed) {
              next[id] = URL.createObjectURL(blob)
              const input = new MediaInput({
                source: new BlobSource(blob),
                formats: ALL_FORMATS,
              })
              try {
                const audioTrack = await input.getPrimaryAudioTrack()
                const videoTrack = await input.getPrimaryVideoTrack()
                audible[id] = !!audioTrack
                const track = videoTrack || audioTrack
                if (track) {
                  const duration = await track.computeDuration()
                  if (Number.isFinite(duration) && duration > 0) {
                    measured[id] = duration
                  }
                }
              } finally {
                input.dispose()
              }
            }
          })
      )
      if (!disposed) {
        setUrls(next)
        setAudibleMedia(audible)
        setDurations((current) => ({ ...current, ...measured }))
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
    if (!props.syncGroup) return
    const transport = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          group: string
          seconds: number
          playing: boolean
        }>
      ).detail
      if (
        detail?.group !== props.syncGroup ||
        !Number.isFinite(detail.seconds)
      ) {
        return
      }
      setTime(Math.max(0, Math.min(total, detail.seconds)))
      setPlaying(detail.playing && total > 0)
    }
    window.addEventListener('studio-timeline-transport', transport)
    return () =>
      window.removeEventListener('studio-timeline-transport', transport)
  }, [props.syncGroup, total])
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
      const reframe = props.project.production?.reframes?.[item.clip.id]
      if (reframe) {
        const crop = studioSampleTracking(
          tracks.data?.[reframe.analysisId] || [],
          local
        )
        if (!crop) {
          video.pause()
          setPlaying(false)
          continue
        }
        video.style.objectFit = 'cover'
        video.style.objectPosition = `${crop.width < 1 ? (crop.x / (1 - crop.width)) * 100 : 50}% ${crop.height < 1 ? (crop.y / (1 - crop.height)) * 100 : 50}%`
      }
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
      video.muted = !!props.muted || item.clip.muted || item.replacesAudio
      video.style.opacity = String(Math.min(fadeIn, fadeOut))
      if (playing) void video.play().catch(() => setPlaying(false))
      else video.pause()
    }
    for (const track of audio) {
      const element = audios.current[track.id]
      if (!element) continue
      const speed = track.speed ?? 1
      const local = (time - track.offset) * speed + track.start
      const duration =
        Math.min(track.duration || Infinity, element.duration - track.start) /
        speed
      if (time < track.offset || time >= track.offset + duration) {
        element.pause()
        continue
      }
      if (Math.abs(element.currentTime - local) > 0.15) {
        element.currentTime = Math.max(0, local)
      }
      element.playbackRate = speed
      element.muted = !!props.muted
      const isMusic =
        track.mediaId === props.project.soundtrackMediaId ||
        props.project.production?.audioMix?.musicMediaIds.includes(
          track.mediaId
        )
      element.volume =
        track.volume *
        (isMusic
          ? studioMusicGain(
              props.project,
              time,
              studioVoiceWindows(props.project, durations, audibleMedia),
              total
            )
          : 1)
      if (playing) void element.play().catch(() => setPlaying(false))
      else element.pause()
    }
  }, [
    time,
    total,
    playing,
    schedule,
    tracks.data,
    audio,
    props.project,
    props.muted,
    durations,
    audibleMedia,
  ])
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('studio-timeline-position', {
        detail: { projectId: props.project.id, seconds: time },
      })
    )
  }, [props.project.id, time])
  const active = schedule.find((item) => time >= item.start && time < item.end)
  let caption = ''
  try {
    caption = studioCaptionTrack(props.project, durations)
      .filter((cue) => time >= cue.start && time < cue.end)
      .map((cue) => cue.text)
      .join('\n')
  } catch {
    /* Caption errors are actionable in the caption editor. */
  }
  let captionBottom = '4%'
  if (props.project.production?.framing?.safeArea) {
    captionBottom = '8%'
    if (
      (props.project.production?.height || 1080) >
      (props.project.production?.width || 1920)
    ) {
      captionBottom = '20%'
    }
  }
  let scheduleError = sources.error
  if (!scheduleError) {
    try {
      studioTimelineSchedule(props.project, durations)
    } catch (error) {
      // Wait for raw source metadata before treating a generation setting as a bound.
      if (
        mediaKey
          .split('|')
          .filter(Boolean)
          .every((id) => durations[id] !== undefined)
      ) {
        scheduleError = error instanceof Error ? error.message : String(error)
      }
    }
  }
  if (scheduleError) {
    return (
      <p role='alert' className='text-destructive text-sm'>
        {t(scheduleError)}
      </p>
    )
  }
  if (!schedule.length) return null
  return (
    <div ref={previewElement} className='studio-timeline-preview space-y-3'>
      <div
        className='studio-preview-frame relative mx-auto overflow-hidden rounded-lg bg-black'
        style={{
          aspectRatio: `${props.project.production?.width || 1920} / ${props.project.production?.height || 1080}`,
          maxHeight: props.compact ? '43dvh' : undefined,
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
            muted={!!props.muted || item.clip.muted || item.replacesAudio}
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
              objectPosition: `${(props.project.production?.framing?.focusX ?? 0.5) * 100}% ${(props.project.production?.framing?.focusY ?? 0.5) * 100}%`,
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
          <p
            className='absolute inset-x-[8%] text-center whitespace-pre-wrap text-white [text-shadow:0_1px_4px_black]'
            style={{
              bottom: captionBottom,
            }}
          >
            {caption}
          </p>
        )}
        <StudioFilmOverlay
          project={props.project}
          seconds={time}
          total={total}
          getMedia={props.getMedia}
        />
        {props.project.production?.framing?.safeArea && (
          <div
            className='pointer-events-none absolute top-[8%] right-[12%] bottom-[18%] left-[8%] border border-dashed border-white/40'
            aria-hidden
          />
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
          muted={props.muted}
          preload='metadata'
          onLoadedMetadata={(event) => {
            const duration = event.currentTarget.duration
            if (Number.isFinite(duration) && duration > 0) {
              setDurations((current) =>
                current[track.mediaId] === duration
                  ? current
                  : { ...current, [track.mediaId]: duration }
              )
            }
          }}
        />
      ))}
      <Button
        variant='ghost'
        onClick={() => {
          void previewElement.current
            ?.requestFullscreen()
            .catch(handleServerError)
        }}
      >
        {t('Full-screen preview')}
      </Button>
      <div className='flex flex-wrap items-center gap-3'>
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
