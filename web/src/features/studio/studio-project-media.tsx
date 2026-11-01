/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import type { StudioProject } from './local-projects'
import { studioCloudRequest, type StudioCloudJob } from './studio-cloud'
import { StudioMediaSearch } from './studio-media-search'
import { StudioMediaThumbnail } from './studio-media-thumbnail'
import {
  studioProductionSchema,
  studioProjectTimeline,
  studioTimelineClipSchema,
} from './studio-production'

export function StudioProjectMedia(props: {
  project: StudioProject
  onSave?: () => Promise<void>
  timelineHistory?: import('./studio-timeline-history').StudioTimelineHistory
  getMedia: (id: string) => Promise<Blob | null>
  readOnly: boolean
  onUpdate: (project: StudioProject) => void
  onOpen: (id: string) => void
  onAssets: () => void
}) {
  const { t } = useTranslation()
  const [kind, setKind] = useState('all')
  const [search, setSearch] = useState('')
  const [pagination, setPagination] = useState({
    projectId: props.project.id,
    page: 0,
  })
  const [preview, setPreview] = useState<{
    projectId: string
    mediaId: string
    kind: string
    title: string
  } | null>(null)
  useEffect(() => setPreview(null), [props.project.id])
  const deliveries = useQuery({
    queryKey: ['studio-cloud-jobs', props.project.id],
    queryFn: () =>
      studioCloudRequest<StudioCloudJob[]>(
        `/projects/${encodeURIComponent(props.project.id)}/jobs`
      ),
  })
  const production =
    props.project.production || studioProductionSchema.parse({})
  const timeline = studioProjectTimeline(props.project)
  const items = props.project.nodes
    .flatMap((node) => {
      const takes = (node.data.takes || []).filter(
        (take) => take.status === 'completed' && take.mediaId
      )
      const seen = new Set<string>()
      return [
        {
          mediaId: node.data.mediaId,
          takeId: node.data.selectedTakeId,
          source: node.data.sourceMode,
        },
        ...takes.map((take) => ({
          mediaId: take.mediaId,
          takeId: take.id,
          source: take.sourceMode,
        })),
      ].flatMap((item) => {
        if (!item.mediaId || seen.has(item.mediaId)) return []
        seen.add(item.mediaId)
        return [
          {
            node,
            mediaId: item.mediaId,
            takeId: item.takeId,
            source: item.source,
            version: Math.max(
              1,
              takes.findIndex((take) => take.mediaId === item.mediaId) + 1
            ),
            used:
              timeline.some(
                (clip) =>
                  clip.nodeId === node.id &&
                  (!clip.takeId
                    ? item.mediaId === node.data.mediaId
                    : clip.takeId === item.takeId)
              ) ||
              [
                props.project.soundtrackMediaId,
                props.project.voiceoverMediaId,
              ].includes(item.mediaId) ||
              production.audioTracks.some(
                (track) => track.mediaId === item.mediaId
              ),
          },
        ]
      })
    })
    .filter(
      (item) =>
        (kind === 'all' ||
          (kind === 'used' && item.used) ||
          (kind === 'upload' && item.source === 'upload') ||
          (kind === 'generated' && item.source !== 'upload') ||
          (kind === 'delivery' && item.node.data.purpose === 'assembly')) &&
        item.node.data.title.toLowerCase().includes(search.toLowerCase())
    )
  const finished = [
    ...new Set([
      props.project.assembledMediaId,
      ...(deliveries.data || []).flatMap((job) =>
        job.kind === 'render' && job.status === 'succeeded'
          ? [(job.result as { media_id?: string } | undefined)?.media_id]
          : []
      ),
    ]),
  ].filter(
    (id): id is string => !!id && !items.some((item) => item.mediaId === id)
  )
  const showFinished =
    (kind === 'all' || kind === 'delivery') &&
    props.project.title.toLowerCase().includes(search.toLowerCase())
  const finishedCount = showFinished ? finished.length : 0
  const total = finishedCount + items.length
  const pages = Math.max(1, Math.ceil(total / 48))
  const page = Math.min(
    pagination.projectId === props.project.id ? pagination.page : 0,
    pages - 1
  )
  const start = page * 48,
    end = Math.min(total, start + 48)
  const visibleFinished = showFinished ? finished.slice(start, end) : []
  const visibleItems = items.slice(
    Math.max(0, start - finishedCount),
    Math.max(0, end - finishedCount)
  )
  return (
    <section className='space-y-4 p-4' aria-label={t('Project media library')}>
      <StudioMediaSearch
        project={props.project}
        timelineHistory={props.timelineHistory}
        getMedia={props.getMedia}
        readOnly={props.readOnly}
        onUpdate={props.onUpdate}
        onSave={props.onSave}
      />
      <div className='flex flex-wrap items-center gap-3'>
        <h2 className='mr-auto text-lg font-semibold'>
          {t('Project media library')}
        </h2>
        <Button variant='outline' onClick={props.onAssets}>
          {t('Characters and scenes')}
        </Button>
      </div>
      <Field>
        <FieldLabel>{t('Find project media')}</FieldLabel>
        <Input
          aria-label={t('Find project media')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPagination({ projectId: props.project.id, page: 0 })
          }}
        />
      </Field>
      <Tabs
        value={kind}
        onValueChange={(value) => {
          setKind(value || 'all')
          setPagination({ projectId: props.project.id, page: 0 })
        }}
      >
        <TabsList className='flex h-auto flex-wrap'>
          {[
            ['all', 'All media'],
            ['upload', 'Uploaded'],
            ['generated', 'Generated'],
            ['used', 'Used in this film'],
            ['delivery', 'Finished films'],
          ].map(([value, label]) => (
            <TabsTrigger key={value} value={value}>
              {t(label)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {!items.length && !(showFinished && finished.length) && (
        <EmptyState
          title={t('No matching media yet')}
          description={t(
            'Upload files above or make a key image in the creation workspace. Media stay with this project.'
          )}
        />
      )}
      <nav
        aria-label={t('Project media pages')}
        className='bg-background sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b py-2'
      >
        <p className='text-muted-foreground mr-auto text-sm' role='status'>
          {t('Showing {{start}}–{{end}} of {{total}} media', {
            start: total ? start + 1 : 0,
            end,
            total,
          })}
        </p>
        {pages > 1 && (
          <>
            <Button
              size='sm'
              variant='outline'
              disabled={page === 0}
              onClick={() =>
                setPagination({ projectId: props.project.id, page: page - 1 })
              }
            >
              {t('Previous page')}
            </Button>
            <span className='text-sm'>
              {t('Page {{page}} of {{pages}}', { page: page + 1, pages })}
            </span>
            <Button
              size='sm'
              variant='outline'
              disabled={page + 1 >= pages}
              onClick={() =>
                setPagination({ projectId: props.project.id, page: page + 1 })
              }
            >
              {t('Next page')}
            </Button>
          </>
        )}
      </nav>
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        {visibleFinished.map((mediaId, index) => (
          <div
            key={mediaId}
            className='min-w-0 space-y-2 rounded-lg border p-3'
          >
            <StudioMediaThumbnail
              mediaId={mediaId}
              kind='video'
              title={`${props.project.title} · ${t('Finished films')} ${start + index + 1}`}
              getMedia={props.getMedia}
              large
            />
            <p className='font-medium'>
              {props.project.title} · {t('Finished films')} {start + index + 1}
            </p>
            <p className='text-muted-foreground text-xs'>
              {t('Saved export version')}
            </p>
          </div>
        ))}
        {visibleItems.map((item) => (
          <div
            key={`${item.node.id}-${item.mediaId}`}
            className='min-w-0 space-y-2 rounded-lg border p-3'
          >
            <StudioMediaThumbnail
              mediaId={item.mediaId}
              kind={item.node.data.kind}
              title={item.node.data.title}
              getMedia={props.getMedia}
            />
            <p className='truncate font-medium'>{item.node.data.title}</p>
            <p className='text-muted-foreground text-xs'>
              {t('Candidate {{number}}', { number: item.version })}
              {item.node.data.mediaId === item.mediaId &&
                ` · ${t('Current version')}`}
            </p>
            <p className='text-muted-foreground text-xs'>
              {t(item.source === 'upload' ? 'Uploaded' : 'Generated')} ·{' '}
              {t(item.used ? 'Used in this film' : 'Available candidate')}
            </p>
            <div className='flex flex-wrap gap-2'>
              <Button
                size='sm'
                variant='outline'
                onClick={() =>
                  setPreview({
                    projectId: props.project.id,
                    mediaId: item.mediaId,
                    kind: item.node.data.kind,
                    title: `${item.node.data.title} · ${t('Candidate {{number}}', { number: item.version })}`,
                  })
                }
              >
                {t('Preview this version')}
              </Button>
              <Button
                size='sm'
                variant='outline'
                onClick={() => props.onOpen(item.node.id)}
              >
                {t('Open shot and versions')}
              </Button>
              {item.node.data.kind === 'video' && (
                <Button
                  size='sm'
                  variant='outline'
                  disabled={props.readOnly}
                  onClick={() =>
                    props.onUpdate({
                      ...props.project,
                      production: {
                        ...production,
                        timelineEdited: true,
                        timeline: [
                          ...timeline,
                          studioTimelineClipSchema.parse({
                            id: crypto.randomUUID(),
                            nodeId: item.node.id,
                            takeId: item.takeId,
                          }),
                        ],
                      },
                    })
                  }
                >
                  {t('Add this version to the film')}
                </Button>
              )}
              {item.node.data.kind === 'audio' && (
                <Button
                  size='sm'
                  variant='outline'
                  disabled={props.readOnly}
                  onClick={() =>
                    props.onUpdate({
                      ...props.project,
                      production: {
                        ...production,
                        audioTracks: [
                          ...production.audioTracks,
                          {
                            id: crypto.randomUUID(),
                            mediaId: item.mediaId,
                            start: 0,
                            offset: 0,
                            volume: 1,
                          },
                        ],
                      },
                    })
                  }
                >
                  {t('Add this audio to the film')}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <Dialog
        open={preview?.projectId === props.project.id}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
      >
        <DialogContent className='sm:max-w-3xl'>
          <DialogHeader>
            <DialogTitle>
              {preview?.title || t('Preview this version')}
            </DialogTitle>
            <DialogDescription>
              {t('Previewing does not change the selected version.')}
            </DialogDescription>
          </DialogHeader>
          {preview?.projectId === props.project.id && (
            <StudioMediaVersionPreview
              key={preview.mediaId}
              mediaId={preview.mediaId}
              kind={preview.kind}
              title={preview.title}
              getMedia={props.getMedia}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}

function StudioMediaVersionPreview(props: {
  mediaId: string
  kind: string
  title: string
  getMedia: (id: string) => Promise<Blob | null>
}) {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = container.current
    return () => {
      for (const media of element?.querySelectorAll('video, audio') || []) {
        if (media instanceof HTMLMediaElement) {
          media.pause()
          media.removeAttribute('src')
          media.load()
        }
      }
    }
  }, [])
  return (
    <div ref={container}>
      <StudioMediaThumbnail {...props} large />
    </div>
  )
}
