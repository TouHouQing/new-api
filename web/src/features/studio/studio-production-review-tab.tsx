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
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import {
  studioCloudMedia,
  studioCloudRequest,
  type StudioCloudProject,
} from './studio-cloud'
import { studioMediaModelAction } from './studio-media-draft'
import { useStudioProductionContext } from './studio-production-context'
import { StudioTabSection } from './studio-tab-section'

export function StudioProductionReviewTab(
  options: { value?: string; inline?: boolean } = {}
) {
  const { t } = useTranslation()
  const {
    props,
    path,
    comment,
    setComment,
    seconds,
    setSeconds,
    record,
    comments,
    mutate,
    writable,
    setSelectedNodes,
    setMediaDraftNodeId,
    setMediaEntryAction,
    setActiveTab,
    reviewTarget,
  } = useStudioProductionContext()
  const [reviewNodeId, setReviewNodeId] = useState(props.selectedNodeId || '')
  const [reviewTakeId, setReviewTakeId] = useState('current')
  const reviewSource = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const nodeId = reviewTarget?.nodeId || props.selectedNodeId
    if (!nodeId) return
    setReviewNodeId(nodeId)
    setReviewTakeId(reviewTarget?.takeId || 'current')
    if (reviewTarget) {
      reviewSource.current?.scrollIntoView?.({ block: 'center' })
      reviewSource.current?.focus()
    }
  }, [props.selectedNodeId, reviewTarget])
  const [preview, setPreview] = useState('')
  const [previewError, setPreviewError] = useState(false)
  const reviewable = props.project.nodes.filter((item) =>
    ['image', 'audio', 'video'].includes(item.data.kind)
  )
  const node =
    reviewable.find((node) => node.id === reviewNodeId) ||
    reviewable.find((node) => node.data.kind === 'video') ||
    reviewable[0]
  const takeId =
    reviewTakeId === 'current' ? node?.data.selectedTakeId || '' : reviewTakeId
  const mediaId =
    node?.data.takes?.find(
      (take) => take.id === takeId && take.status === 'completed'
    )?.mediaId || (reviewTakeId === 'current' ? node?.data.mediaId : undefined)
  useEffect(() => {
    let active = true
    let url = ''
    setPreview('')
    setPreviewError(false)
    if (mediaId) {
      void studioCloudMedia(props.project.id, mediaId)
        .then((blob) => {
          if (!active) return
          url = URL.createObjectURL(blob)
          setPreview(url)
        })
        .catch(() => {
          if (active) setPreviewError(true)
        })
    }
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [mediaId, props.project.id])
  return (
    <StudioTabSection
      inline={options.inline}
      value={options.value || 'review'}
      className='space-y-4'
    >
      <Select
        value={node?.id || ''}
        items={reviewable.map((item) => ({
          value: item.id,
          label: item.data.title,
        }))}
        onValueChange={(value) => {
          setReviewNodeId(value || '')
          setReviewTakeId('current')
        }}
      >
        <SelectTrigger ref={reviewSource} aria-label={t('Review media')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {reviewable.map((node) => (
            <SelectItem key={node.id} value={node.id}>
              {node.data.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {previewError && (
        <p role='alert'>
          {t(
            'The selected Take could not be loaded. Refresh the project before reviewing it.'
          )}
        </p>
      )}
      {preview && node?.data.kind === 'image' && (
        <img
          src={preview}
          alt={node.data.title}
          className='max-h-80 w-full object-contain'
        />
      )}
      {preview && node?.data.kind === 'video' && (
        <video
          src={preview}
          aria-label={t('Review Take preview')}
          controls
          className='max-h-80 w-full'
          onTimeUpdate={(event) =>
            setSeconds(event.currentTarget.currentTime.toFixed(1))
          }
        />
      )}
      {preview && node?.data.kind === 'audio' && (
        <audio
          src={preview}
          aria-label={t('Review Take preview')}
          controls
          className='w-full'
          onTimeUpdate={(event) =>
            setSeconds(event.currentTarget.currentTime.toFixed(1))
          }
        />
      )}
      <Select
        value={reviewTakeId}
        items={[
          { value: 'current', label: t('studio.production.currentTake') },
          ...(node?.data.takes || [])
            .filter((take) => take.mediaId)
            .map((take, index) => ({
              value: take.id,
              label: `${t('Take')} ${index + 1}`,
            })),
        ]}
        onValueChange={(value) => setReviewTakeId(value || 'current')}
      >
        <SelectTrigger aria-label={t('studio.production.take')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='current'>
            {t('studio.production.currentTake')}
          </SelectItem>
          {node?.data.takes
            ?.filter((take) => take.mediaId)
            .map((take, index) => (
              <SelectItem key={take.id} value={take.id}>
                {t('Take')} {index + 1}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <div className='flex gap-2'>
        {(['approved', 'retake'] as const).map((status) => (
          <Button
            key={status}
            variant={status === 'approved' ? 'default' : 'outline'}
            disabled={
              !mediaId || record.data?.role === 'viewer' || mutate.isPending
            }
            onClick={() =>
              mutate.mutate(async () => {
                const current =
                  await studioCloudRequest<StudioCloudProject>(path)
                await studioCloudRequest(`${path}/review`, 'POST', {
                  revision: current.revision,
                  node_id: node?.id,
                  take_id: takeId,
                  status,
                  note: comment,
                })
                await props.onRefresh()
              })
            }
          >
            {t(`studio.review.${status}`)}
          </Button>
        ))}
      </div>
      <Field>
        <FieldLabel htmlFor='studio-review-time'>
          {t('studio.production.time')}
        </FieldLabel>
        <Input
          type='number'
          id='studio-review-time'
          min='0'
          max='3600'
          step='0.1'
          value={seconds}
          onChange={(event) => setSeconds(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor='studio-review-comment'>
          {t('studio.production.comment')}
        </FieldLabel>
        <Textarea
          id='studio-review-comment'
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={2000}
        />
      </Field>
      <Button
        disabled={
          record.data?.role === 'viewer' || !comment.trim() || mutate.isPending
        }
        onClick={() =>
          mutate.mutate(async () => {
            const current = await studioCloudRequest<StudioCloudProject>(path)
            await studioCloudRequest(`${path}/comments`, 'POST', {
              revision: current.revision,
              node_id: node?.id || '',
              take_id: takeId,
              seconds: Number(seconds),
              message: comment,
            })
            setComment('')
          })
        }
      >
        {t('studio.production.addComment')}
      </Button>
      {comments.data?.map((item) => (
        <div className='rounded-lg border p-3' key={item.id}>
          <p className='text-muted-foreground text-xs'>
            v{item.revision} · {item.seconds}s · {item.author_id}
          </p>
          <p className='whitespace-pre-wrap'>
            {item.message.replace(
              /^\[frameio:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+\] /,
              'Frame.io · '
            )}
          </p>
          {writable && (
            <div className='flex gap-2'>
              {(['regenerate', 'edit', 'audio'] as const).map((action) => (
                <Button
                  key={action}
                  size='sm'
                  variant='outline'
                  onClick={() =>
                    mutate.mutate(async () => {
                      await props.onSave()
                      const current =
                        await studioCloudRequest<StudioCloudProject>(path)
                      const updated =
                        await studioCloudRequest<StudioCloudProject>(
                          `${path}/rework`,
                          'POST',
                          {
                            revision: current.revision,
                            comment_id: item.id,
                            action,
                          }
                        )
                      props.onUpdate(updated.document)
                      setSelectedNodes(
                        updated.document.production?.changes.at(-1)?.nodeIds ||
                          []
                      )
                      const targetId =
                        updated.document.production?.changes.at(-1)?.nodeIds[0]
                      const target = updated.document.nodes.find(
                        (node) => node.id === targetId
                      )
                      if (
                        !options.inline &&
                        target &&
                        studioMediaModelAction(target.data.model)
                      ) {
                        setMediaDraftNodeId(target.id)
                        setActiveTab('media')
                      } else if (!options.inline) {
                        if (action === 'audio') {
                          setMediaDraftNodeId('')
                          setMediaEntryAction('voice_speech')
                          setActiveTab('media')
                        } else {
                          setActiveTab(
                            action === 'edit' ? 'timeline' : 'workflow'
                          )
                        }
                      }
                      await props.onRefresh()
                    })
                  }
                >
                  {t(`studio.production.rework.${action}`)}
                </Button>
              ))}
            </div>
          )}
          <Button
            size='xs'
            variant='outline'
            disabled={record.data?.role === 'viewer' || mutate.isPending}
            onClick={() =>
              mutate.mutate(() =>
                studioCloudRequest(`${path}/comments`, 'PATCH', {
                  id: item.id,
                  resolved: !item.resolved,
                })
              )
            }
          >
            {t(
              item.resolved
                ? 'studio.production.reopen'
                : 'studio.production.resolve'
            )}
          </Button>
        </div>
      ))}
    </StudioTabSection>
  )
}
