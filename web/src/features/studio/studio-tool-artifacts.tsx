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
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { studioCloudMedia, studioCloudRequest } from './studio-cloud'
import { createStudioImageLayers } from './studio-image-layers'
import { StudioLyricsReport } from './studio-lyrics-report'
import { studioMediaTakeDraft } from './studio-media-draft'
import { StudioMediaThumbnail } from './studio-media-thumbnail'
import { studioPrevisSchema } from './studio-previs'
import { studioProductionSchema } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import { parseStudioSubtitleCues } from './studio-subtitle-cues'
import { StudioToolQualityReport } from './studio-tool-quality-report'
import { addStudioNode, recordStudioTake, selectStudioTake } from './workspace'

export function StudioToolArtifacts() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const {
    props,
    writable,
    mutate,
    path,
    record,
    setMediaDraftNodeId,
    setActiveTab,
  } = useStudioProductionContext()
  const [captionImport, setCaptionImport] = useState('')
  const latest = useRef(props.project)
  latest.current = props.project
  const outputs = props.project.nodes.flatMap((node) =>
    (node.data.takes || [])
      .filter((take) => take.status === 'completed' && take.auxiliary?.length)
      .map((take) => ({
        node,
        take,
        version:
          (node.data.takes || []).findIndex((item) => item.id === take.id) + 1,
      }))
  )
  const prepareDraft = (
    sourceNode: (typeof props.project.nodes)[number],
    sourceTake: NonNullable<typeof sourceNode.data.takes>[number],
    changes: Partial<
      NonNullable<NonNullable<typeof props.project.production>['mediaDraft']>
    >
  ): void => {
    const draft = studioMediaTakeDraft({
      ...sourceNode,
      data: {
        ...sourceNode.data,
        selectedTakeId: sourceTake.id,
        model: sourceTake.model || sourceNode.data.model,
        takes: [sourceTake],
      },
    })
    if (!draft) return
    const id = crypto.randomUUID()
    const action = changes.action || draft.action
    const kind = action.startsWith('image_') ? 'image' : 'audio'
    let next = addStudioNode(latest.current, kind, id)
    next = {
      ...next,
      nodes: next.nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                title: `${sourceNode.data.title} · ${t('Repair')}`,
                model: changes.model || draft.model,
                derivedFrom: {
                  nodeId: sourceNode.id,
                  takeId: sourceTake.id,
                  mediaId: sourceTake.mediaId || '',
                  action: 'repair',
                },
              },
            }
          : node
      ),
    }
    const repaired = { ...draft, ...changes, node_id: id }
    const production = next.production || studioProductionSchema.parse({})
    props.onUpdate({
      ...next,
      production: {
        ...production,
        mediaDraft: repaired,
        mediaDrafts: [...production.mediaDrafts, repaired],
        guide: {
          ...(production.guide || { goal: 'story' as const }),
          step: 'voice',
        },
      },
    })
    setMediaDraftNodeId(id)
    setActiveTab('media')
  }
  if (!outputs.length) return null
  return (
    <div className='space-y-3'>
      <p className='text-sm font-medium'>{t('Processed files and layers')}</p>
      {outputs.map(({ node, take, version }) => (
        <div
          key={take.id}
          className='space-y-2 border-b pb-3'
          role='group'
          aria-label={`${node.data.title} · ${t('Take')} ${formatNumber(version, locale)}`}
        >
          <p className='flex flex-wrap items-center gap-2 text-sm'>
            {node.data.title} · {t('Take')} {formatNumber(version, locale)}{' '}
            {node.data.selectedTakeId === take.id && (
              <Badge variant='secondary'>
                {t('studio.production.currentTake')}
              </Badge>
            )}
          </p>
          {take.auxiliary
            ?.filter((item) => item.role === 'lyrics_check')
            .map((item) => (
              <StudioLyricsReport
                key={item.mediaId}
                projectId={props.project.id}
                mediaId={item.mediaId}
                audioMediaId={take.mediaId}
                getMedia={props.getMedia}
                readOnly={!writable || mutate.isPending}
                canReview={
                  !!record.data &&
                  ['owner', 'editor', 'reviewer'].includes(record.data.role) &&
                  !mutate.isPending
                }
                onRepair={(text, start, end) => {
                  const draft = studioMediaTakeDraft({
                    ...node,
                    data: {
                      ...node.data,
                      selectedTakeId: take.id,
                      model: take.model || node.data.model,
                      takes: [take],
                    },
                  })
                  if (!draft || !take.mediaId) return
                  prepareDraft(node, take, {
                    prompt: draft.prompt,
                    seconds: Math.max(12, end - start),
                    reference_media_ids: [take.mediaId],
                    options: {
                      ...draft.options,
                      music_mode: 'song',
                      lyrics: text,
                      repair_start: start,
                      repair_end: end,
                    },
                  })
                }}
                onConfirm={(note) =>
                  mutate.mutate(async () => {
                    await props.onSave()
                    const current = await studioCloudRequest<{
                      revision: number
                    }>(path)
                    await studioCloudRequest(`${path}/review`, 'POST', {
                      revision: current.revision,
                      node_id: node.id,
                      take_id: take.id,
                      status: note.includes('words are present')
                        ? 'approved'
                        : 'retake',
                      note,
                    })
                    await props.onRefresh()
                  })
                }
              />
            ))}
          {take.auxiliary
            ?.filter((item) => item.role === 'quality_report')
            .map((item) => (
              <StudioToolQualityReport
                key={item.mediaId}
                projectId={props.project.id}
                mediaId={item.mediaId}
              />
            ))}
          <div className='flex flex-wrap gap-3'>
            {take.auxiliary
              ?.filter(
                (item) =>
                  item.role === 'background' ||
                  item.role === 'foreground' ||
                  item.role === 'removal-mask' ||
                  item.role === 'vocal_candidate' ||
                  item.role.startsWith('cell-')
              )
              .map((item) => (
                <div key={item.mediaId} className='flex flex-col gap-2'>
                  <StudioMediaThumbnail
                    mediaId={item.mediaId}
                    kind={
                      item.mimeType.startsWith('audio/') ? 'audio' : 'image'
                    }
                    title={`${node.data.title} · ${item.role}`}
                    getMedia={props.getMedia}
                  />
                  <span className='text-xs'>
                    {t(`Tool artifact ${item.role}`)}
                  </span>
                  {item.role.startsWith('cell-') && (
                    <Button
                      size='xs'
                      variant='outline'
                      disabled={!writable || mutate.isPending}
                      onClick={() => {
                        const draft = studioMediaTakeDraft({
                          ...node,
                          data: {
                            ...node.data,
                            selectedTakeId: take.id,
                            model: take.model || node.data.model,
                            takes: [take],
                          },
                        })
                        if (!draft || !take.mediaId) return
                        prepareDraft(node, take, {
                          reference_media_ids: [
                            draft.reference_media_ids[0] || item.mediaId,
                            take.mediaId,
                          ],
                          options: {
                            ...draft.options,
                            redo_panel: Number(item.role.slice(5)),
                          },
                        })
                      }}
                    >
                      {t('Redo only panel {{number}}', {
                        number: Number(item.role.slice(5)),
                      })}
                    </Button>
                  )}
                </div>
              ))}
          </div>
          {take.auxiliary?.some((item) => item.role === 'vocal_candidate') && (
            <Button
              variant='outline'
              size='sm'
              disabled={!writable || mutate.isPending}
              onClick={() => {
                const item = take.auxiliary?.find(
                  (item) => item.role === 'vocal_candidate'
                )
                const draft = studioMediaTakeDraft({
                  ...node,
                  data: {
                    ...node.data,
                    selectedTakeId: take.id,
                    takes: [take],
                  },
                })
                if (
                  !item ||
                  !draft?.options?.repair_end ||
                  !draft.reference_media_ids[0]
                ) {
                  return
                }
                const candidateId = crypto.randomUUID()
                let next = addStudioNode(latest.current, 'audio', candidateId)
                next = {
                  ...next,
                  nodes: next.nodes.map((n) =>
                    n.id === candidateId
                      ? {
                          ...n,
                          data: {
                            ...n.data,
                            title: `${node.data.title.slice(0, 150)} · ${t('Tool artifact vocal_candidate')}`,
                            mediaId: item.mediaId,
                            status: 'completed',
                            sourceMode: 'upload',
                          },
                        }
                      : n
                  ),
                }
                latest.current = next
                prepareDraft(node, take, {
                  action: 'audio_separate',
                  model: 'studio-audio-separate',
                  prompt: t('Apply selected candidate vocals'),
                  seconds: 60,
                  reference_media_ids: [
                    draft.reference_media_ids[0],
                    item.mediaId,
                  ],
                  options: {
                    repair_start: draft.options.repair_start,
                    repair_end: draft.options.repair_end,
                    candidate_start: 0,
                    candidate_end: Math.min(4, draft.seconds),
                  },
                })
              }}
            >
              {t('Apply this candidate after checking its interval')}
            </Button>
          )}
          {take.auxiliary?.some((item) => item.role === 'subtitles') && (
            <Button
              variant='outline'
              size='sm'
              disabled={!writable || mutate.isPending}
              onClick={() =>
                mutate.mutate(async () => {
                  const item = take.auxiliary?.find(
                    (item) => item.role === 'subtitles'
                  )
                  if (!item) return
                  const blob = await studioCloudMedia(
                    props.project.id,
                    item.mediaId
                  )
                  if (!blob) throw new Error(t('Processed file is unavailable'))
                  const text = await blob.text()
                  parseStudioSubtitleCues(text)
                  props.onUpdate({
                    ...latest.current,
                    captionsText: text,
                    captionOffsetSeconds: 0,
                  })
                  await props.onSave()
                  setCaptionImport(take.id)
                })
              }
            >
              {t('Use dubbed subtitles')}
            </Button>
          )}
          {take.auxiliary?.some((item) => item.role === 'subtitles') && (
            <p className='text-muted-foreground text-xs' role='status'>
              {captionImport === take.id
                ? t('Subtitles applied. Preview them in editing.')
                : t(
                    'Replaces project captions; the project name stays the same.'
                  )}
            </p>
          )}
          <div className='flex flex-wrap gap-2'>
            {take.auxiliary?.map((item) => (
              <Button
                key={item.role}
                variant='outline'
                size='sm'
                disabled={mutate.isPending}
                onClick={() =>
                  mutate.mutate(async () => {
                    const blob = await studioCloudMedia(
                      props.project.id,
                      item.mediaId
                    )
                    if (!blob) {
                      throw new Error(t('Processed file is unavailable'))
                    }
                    const url = URL.createObjectURL(blob)
                    const anchor = document.createElement('a')
                    anchor.href = url
                    const extensions: Record<string, string> = {
                      'image/png': '.png',
                      'audio/wav': '.wav',
                      'model/gltf-binary': '.glb',
                      'application/zip': '.zip',
                      'video/mp4': '.mp4',
                      'application/json': '.json',
                      'text/plain': '.srt',
                    }
                    anchor.download = `${node.data.title}-${item.role}${extensions[item.mimeType] || ''}`
                    anchor.click()
                    window.setTimeout(() => URL.revokeObjectURL(url), 10000)
                  })
                }
              >
                {t('Download')} · {t(`Tool artifact ${item.role}`)}
              </Button>
            ))}
          </div>
          {take.auxiliary?.some(
            (item) =>
              item.mimeType.startsWith('image/') ||
              item.mimeType.startsWith('audio/')
          ) && (
            <Button
              variant='outline'
              size='sm'
              disabled={
                !writable ||
                mutate.isPending ||
                latest.current.nodes.length + (take.auxiliary?.length || 0) >
                  500
              }
              onClick={() =>
                mutate.mutate(async () => {
                  let next = latest.current
                  for (const item of take.auxiliary || []) {
                    const kind = item.mimeType.startsWith('image/')
                      ? 'image'
                      : 'audio'
                    if (
                      !item.mimeType.startsWith('image/') &&
                      !item.mimeType.startsWith('audio/')
                    ) {
                      continue
                    }
                    if (
                      next.nodes.some(
                        (existing) =>
                          existing.data.derivedFrom?.takeId === take.id &&
                          existing.data.mediaId === item.mediaId
                      )
                    ) {
                      continue
                    }
                    const id = crypto.randomUUID()
                    next = recordStudioTake(addStudioNode(next, kind, id), id, {
                      id: crypto.randomUUID(),
                      createdAt: new Date().toISOString(),
                      prompt: take.prompt,
                      status: 'completed',
                      sourceMode: 'upload',
                      mediaId: item.mediaId,
                    })
                    next = {
                      ...next,
                      nodes: next.nodes.map((created) =>
                        created.id === id
                          ? {
                              ...created,
                              data: {
                                ...created.data,
                                title: `${node.data.title} · ${t(`Tool artifact ${item.role}`)}`,
                                derivedFrom: {
                                  nodeId: node.id,
                                  takeId: take.id,
                                  mediaId: item.mediaId,
                                  action: item.role,
                                },
                              },
                            }
                          : created
                      ),
                    }
                  }
                  props.onUpdate(next)
                  await props.onSave()
                })
              }
            >
              {t('Add processed files to the canvas')}
            </Button>
          )}
          {take.auxiliary?.some((item) => item.role === 'foreground') && (
            <Button
              variant='outline'
              size='sm'
              disabled={!writable || mutate.isPending}
              onClick={() =>
                mutate.mutate(async () => {
                  const foreground = take.auxiliary?.find(
                    (item) => item.role === 'foreground'
                  )
                  const background = take.auxiliary?.find(
                    (item) => item.role === 'background'
                  )
                  if (!foreground || !background) {
                    throw new Error(t('Separated layers are incomplete'))
                  }
                  const blob = await props.getMedia(foreground.mediaId)
                  if (!blob) throw new Error(t('Image is unavailable'))
                  const bitmap = await createImageBitmap(blob)
                  try {
                    const scale = Math.min(
                      1,
                      2048 / Math.max(bitmap.width, bitmap.height)
                    )
                    const document = createStudioImageLayers(
                      background.mediaId,
                      Math.round(bitmap.width * scale),
                      Math.round(bitmap.height * scale),
                      t('Background')
                    )
                    document.layers[0].name = t('Background')
                    document.layers.push({
                      ...document.layers[0],
                      id: crypto.randomUUID(),
                      name: t('Foreground'),
                      mediaId: foreground.mediaId,
                    })
                    const next = selectStudioTake(
                      latest.current,
                      node.id,
                      take.id
                    )
                    props.onUpdate({
                      ...next,
                      nodes: next.nodes.map((current) =>
                        current.id === node.id
                          ? {
                              ...current,
                              data: { ...current.data, imageLayers: document },
                            }
                          : current
                      ),
                    })
                    await props.onSave()
                  } finally {
                    bitmap.close()
                  }
                })
              }
            >
              {t('Use separated layers in the image editor')}
            </Button>
          )}
          {take.auxiliary?.some((item) => item.role === 'mesh') && (
            <Button
              variant='outline'
              size='sm'
              disabled={!writable || mutate.isPending}
              onClick={() =>
                mutate.mutate(async () => {
                  const mesh = take.auxiliary?.find(
                    (item) => item.role === 'mesh'
                  )
                  if (!mesh) return
                  const project = latest.current
                  const production =
                    project.production || studioProductionSchema.parse({})
                  const scene =
                    production.previs || studioPrevisSchema.parse({})
                  const advanced = studioPrevisSchema.parse({
                    advanced: {},
                  }).advanced
                  const current = scene.advanced || advanced
                  if (!current) {
                    throw new Error(t('The 3D scene is unavailable'))
                  }
                  if (
                    current.models.some(
                      (model) => model.modelMediaId === mesh.mediaId
                    )
                  ) {
                    return
                  }
                  if (current.models.length >= 12) {
                    throw new Error(t('The stage has reached its model limit'))
                  }
                  props.onUpdate({
                    ...project,
                    production: {
                      ...production,
                      previs: {
                        ...scene,
                        advanced: {
                          ...current,
                          models: [
                            ...current.models,
                            {
                              id: crypto.randomUUID(),
                              title: node.data.title,
                              modelMediaId: mesh.mediaId,
                              assetId: node.data.linkedAssetId,
                              assetVersionId: node.data.linkedAssetId
                                ? take.id
                                : undefined,
                              x: 0,
                              y: 0,
                              z: 0,
                              scale: 1,
                              animation: '',
                            },
                          ],
                        },
                      },
                    },
                  })
                  await props.onSave()
                })
              }
            >
              {t('Add the generated model to the 3D stage')}
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}
