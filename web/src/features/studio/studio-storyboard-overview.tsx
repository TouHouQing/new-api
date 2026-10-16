/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { handleServerError } from '@/lib/handle-server-error'

import { StudioMediaThumbnail } from './studio-media-thumbnail'
import { studioProductionSchema } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import { studioTimelineAudio } from './studio-timeline-playback'

export function StudioStoryboardOverview() {
  const { t } = useTranslation()
  const { props, writable, setSelectedNodes } = useStudioProductionContext()
  const production =
    props.project.production || studioProductionSchema.parse({})
  const shots = (props.project.shots || []).map((shot) => ({
    shot,
    image: props.project.nodes.find((node) => node.id === shot.imageNodeId),
    video: props.project.nodes.find((node) => node.id === shot.videoNodeId),
  }))
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({})
  const audios = useRef<Record<string, HTMLAudioElement | null>>({})
  const getMedia = useRef(props.getMedia)
  getMedia.current = props.getMedia
  let total = 0
  const schedule = shots.map((item) => {
    const start = total
    total += item.video?.data.seconds || 5
    return { ...item, start, end: total }
  })
  const tracks = useMemo(() => {
    try {
      return studioTimelineAudio(props.project)
    } catch {
      return []
    }
  }, [props.project])
  const audioKey = [...new Set(tracks.map((track) => track.mediaId))]
    .sort()
    .join('|')
  useEffect(() => {
    let disposed = false
    const urls: Record<string, string> = {}
    void Promise.all(
      audioKey
        .split('|')
        .filter(Boolean)
        .map(async (id) => {
          const blob = await getMedia.current(id)
          if (blob && !disposed) urls[id] = URL.createObjectURL(blob)
        })
    )
      .then(() => {
        if (!disposed) setAudioUrls(urls)
      })
      .catch(handleServerError)
    return () => {
      disposed = true
      Object.values(urls).forEach(URL.revokeObjectURL)
    }
  }, [audioKey])
  useEffect(() => {
    if (!playing) return
    let frame = 0,
      previous = performance.now()
    const tick = (now: number) => {
      setTime((value) =>
        Math.min(total, value + Math.min((now - previous) / 1000, 0.1))
      )
      previous = now
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, total])
  useEffect(() => {
    if (time >= total && playing) setPlaying(false)
    for (const track of tracks) {
      const element = audios.current[track.id]
      if (!element) continue
      const local = time - track.offset + track.start
      const end =
        track.offset +
        Math.min(track.duration || Infinity, element.duration - track.start)
      if (!playing || time < track.offset || time >= end) {
        element.pause()
        continue
      }
      if (Math.abs(element.currentTime - local) > 0.2) {
        element.currentTime = Math.max(0, local)
      }
      element.volume = track.volume
      void element.play().catch(() => setPlaying(false))
    }
  }, [playing, time, total, tracks])
  const active =
    schedule.find((item) => time >= item.start && time < item.end) ||
    schedule[0]
  const ready = shots.filter((item) => item.image?.data.mediaId)
  const approved = ready.filter(
    (item) =>
      production.approvedKeyImages[item.shot.id] === item.image?.data.mediaId
  )
  if (!shots.length) return null
  return (
    <Collapsible
      className='mb-4'
      defaultOpen={!shots.some((item) => item.video?.data.mediaId)}
    >
      <CollapsibleTrigger render={<Button variant='outline' size='sm' />}>
        {t('Review all key images')} · {approved.length}/{shots.length}
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-3 pt-3'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Check the same character, wardrobe, setting and visual style across the film before making video. Image approval follows the exact selected image version.'
          )}
        </p>
        <div className='grid grid-cols-2 gap-3 xl:grid-cols-3'>
          {shots.map((item, i) => (
            <div key={item.shot.id} className='min-w-0 space-y-2'>
              <p className='truncate text-sm'>
                {i + 1}. {item.shot.title}
              </p>
              {item.image?.data.mediaId ? (
                <StudioMediaThumbnail
                  large
                  mediaId={item.image.data.mediaId}
                  kind='image'
                  title={item.shot.title}
                  getMedia={props.getMedia}
                />
              ) : (
                <p className='bg-muted flex min-h-20 items-center justify-center rounded p-3 text-xs'>
                  {t('Key image needed')}
                </p>
              )}
              <div className='flex flex-wrap gap-1'>
                <Button
                  size='xs'
                  variant='outline'
                  onClick={() => {
                    props.onSelectNode?.(item.shot.imageNodeId)
                    setSelectedNodes([item.shot.imageNodeId])
                  }}
                >
                  {t('Adjust this image')}
                </Button>
                <Button
                  size='xs'
                  disabled={!writable || !item.image?.data.mediaId}
                  variant={
                    !!item.image?.data.mediaId &&
                    production.approvedKeyImages[item.shot.id] ===
                      item.image.data.mediaId
                      ? 'secondary'
                      : 'outline'
                  }
                  onClick={() =>
                    props.onUpdate({
                      ...props.project,
                      production: {
                        ...production,
                        approvedKeyImages: {
                          ...production.approvedKeyImages,
                          [item.shot.id]: item.image?.data.mediaId || '',
                        },
                      },
                    })
                  }
                >
                  {t(
                    !!item.image?.data.mediaId &&
                      production.approvedKeyImages[item.shot.id] ===
                        item.image.data.mediaId
                      ? 'Picture approved'
                      : 'Approve picture'
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={!writable || ready.length === shots.length}
            onClick={() => {
              const ids = shots
                .filter((item) => !item.image?.data.mediaId)
                .map((item) => item.shot.imageNodeId)
              if (ids[0]) props.onSelectNode?.(ids[0])
              setSelectedNodes(ids)
            }}
          >
            {t('Prepare missing key images')}
          </Button>
          <Button
            variant='outline'
            size='sm'
            disabled={
              !writable ||
              approved.length !== shots.length ||
              shots.every((item) => !!item.video?.data.mediaId)
            }
            onClick={() => {
              const ids = shots
                .filter((item) => !item.video?.data.mediaId)
                .map((item) => item.shot.videoNodeId)
              if (ids.length) {
                props.onSelectNode?.(ids[0])
                setSelectedNodes(ids)
              }
            }}
          >
            {t('Prepare videos from approved pictures')}
          </Button>
        </div>
        <Collapsible>
          <CollapsibleTrigger render={<Button variant='ghost' size='sm' />}>
            {t('Preview the storyboard rhythm for free')}
          </CollapsibleTrigger>
          <CollapsibleContent className='space-y-2 pt-2'>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Still images with your existing audio. This checks timing and does not predict generated motion or call a model.'
              )}
            </p>
            {active?.image?.data.mediaId && (
              <StudioMediaThumbnail
                large
                mediaId={active.image.data.mediaId}
                kind='image'
                title={active.shot.title}
                getMedia={props.getMedia}
              />
            )}
            <p>
              {active?.shot.title} · {Math.floor(time)} / {total}s
            </p>
            <Button
              variant='outline'
              size='sm'
              disabled={!ready.length}
              onClick={() => {
                if (time >= total) setTime(0)
                setPlaying(!playing)
              }}
            >
              {t(
                playing ? 'Pause storyboard preview' : 'Play storyboard preview'
              )}
            </Button>
            <Button
              size='sm'
              variant='ghost'
              onClick={() => {
                setPlaying(false)
                setTime(0)
              }}
            >
              {t('Start again')}
            </Button>
            {tracks.map(
              (track) =>
                audioUrls[track.mediaId] && (
                  <audio
                    key={track.id}
                    src={audioUrls[track.mediaId]}
                    ref={(element) => {
                      audios.current[track.id] = element
                    }}
                  />
                )
            )}
          </CollapsibleContent>
        </Collapsible>
      </CollapsibleContent>
    </Collapsible>
  )
}
