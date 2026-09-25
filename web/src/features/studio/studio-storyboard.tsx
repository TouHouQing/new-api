/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

import type { StudioGroup, StudioShotDraft } from './api'
import type {
  StudioProject,
  StudioProjectDefaults,
  StudioShot,
} from './local-projects'
import { StudioAssemblyPanel } from './studio-assembly-panel'
import { StudioShotDefaults } from './studio-shot-defaults'
import { StudioShotPlanner } from './studio-shot-planner'

type Props = {
  project: StudioProject
  previews: Record<string, string>
  groups?: StudioGroup[]
  userGroup?: string
  textModels?: string[]
  imageModels?: string[]
  onChangeDefaults?: (patch: Partial<StudioProjectDefaults>) => void
  onPlanShots?: (
    model: string,
    prompt: string,
    count: number
  ) => Promise<StudioShotDraft[]>
  onCreatePlannedShots?: (
    drafts: StudioShotDraft[],
    sourcePrompt: string,
    model?: string
  ) => boolean | void
  planningScope?: string
  onUsePreviousFrame?: (shotId: string) => void
  frameBusyShotId?: string | null
  onSelectNode: (nodeId: string) => void
  onGenerateVideo: (nodeId: string) => void
  onGenerateAll: () => void
  onCreateFinalVideo: () => void
  batchBusy?: boolean
  batchLimit?: number
  batchCost?:
    | { status: 'estimated'; estimatedUsd: number }
    | { status: 'unknown' }
  onBatchLimitChange?: (limit: number) => void
  onAddShot: () => void
  onMoveShot: (shotId: string, direction: 'up' | 'down') => void
  onRenameShot: (shotId: string, title: string) => void
  onDeleteShot: (shotId: string) => void
  onUpdateShotEdit?: (
    shotId: string,
    patch: Pick<
      StudioShot,
      | 'trimStart'
      | 'trimEnd'
      | 'muted'
      | 'volume'
      | 'transition'
      | 'transitionSeconds'
    >
  ) => void
  assembly: {
    busy: boolean
    progress: number
    previewUrl?: string
    error?: string
    onAssemble: () => void
    onCancel: () => void
    onDownload: () => void
    soundtrackUrl?: string
    soundtrackVolume?: number
    preflight?: { totalDuration: number; estimatedOutputBytes: number }
    onUploadSoundtrack?: (file: File) => void
    onRemoveSoundtrack?: () => void
    onSoundtrackVolumeChange?: (volume: number) => void
  }
}

export function StudioStoryboard(props: Props) {
  const { t } = useTranslation()
  const [editingShotId, setEditingShotId] = useState<string | null>(null)
  const shots = props.project.shots || []
  const finalVideo = props.project.nodes.find(
    (node) => node.id === props.project.finalVideoNodeId
  )
  const finalPreview =
    finalVideo &&
    (props.previews[`${props.project.id}:${finalVideo.id}`] ||
      finalVideo.data.outputUrl)

  return (
    <div className='h-full overflow-y-auto p-4'>
      <div className='mb-4 flex items-center justify-between gap-3'>
        <div>
          <h2 className='text-base font-semibold'>{t('studio.shot.title')}</h2>
          <p className='text-muted-foreground text-xs'>
            {t('studio.shot.description')}
          </p>
        </div>
        <div className='flex gap-2'>
          <Button size='sm' variant='outline' onClick={props.onAddShot}>
            {t('studio.shot.add')}
          </Button>
          <Button
            size='sm'
            disabled={
              props.batchBusy ||
              !shots.some((shot) =>
                props.project.nodes.some(
                  (node) => node.id === shot.videoNodeId && node.data.model
                )
              )
            }
            onClick={props.onGenerateAll}
          >
            {props.batchBusy
              ? t('studio.generating')
              : t('studio.shot.generateAll')}
          </Button>
        </div>
      </div>
      {props.onPlanShots && props.onCreatePlannedShots && (
        <StudioShotPlanner
          scopeKey={props.planningScope || props.project.id}
          models={props.textModels || []}
          defaultModel={props.project.defaults?.textModel}
          onPlan={props.onPlanShots}
          onConfirm={props.onCreatePlannedShots}
        />
      )}
      {props.onChangeDefaults && (
        <div className='mb-4'>
          <StudioShotDefaults
            value={props.project.defaults || {}}
            groups={props.groups || []}
            userGroup={props.userGroup || ''}
            textModels={props.textModels || []}
            imageModels={props.imageModels || []}
            onChange={props.onChangeDefaults}
          />
        </div>
      )}
      <div className='text-muted-foreground mb-4 flex flex-wrap items-center gap-3 text-xs'>
        <label className='flex items-center gap-2'>
          {t('studio.batch.limit')}
          <Input
            aria-label={t('studio.batch.limit')}
            type='number'
            min={1}
            max={20}
            className='w-20'
            value={props.batchLimit ?? 5}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (Number.isInteger(value) && value >= 1 && value <= 20) {
                props.onBatchLimitChange?.(value)
              }
            }}
          />
        </label>
        <span role='status'>
          {props.batchCost?.status === 'estimated'
            ? t('studio.cost.estimated', {
                amount: props.batchCost.estimatedUsd.toFixed(4),
              })
            : t('studio.cost.unknown')}
        </span>
      </div>
      {shots.length === 0 && (
        <p className='text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm'>
          {t('studio.shot.empty')}
        </p>
      )}
      <div className='space-y-4'>
        {shots.map((shot, index) => {
          const textNode = props.project.nodes.find(
            (node) => node.id === shot.textNodeId
          )
          const imageNode = props.project.nodes.find(
            (node) => node.id === shot.imageNodeId
          )
          const videoNode = props.project.nodes.find(
            (node) => node.id === shot.videoNodeId
          )
          const imagePreview =
            props.previews[`${props.project.id}:${shot.imageNodeId}`] ||
            imageNode?.data.outputUrl
          const videoPreview =
            props.previews[`${props.project.id}:${shot.videoNodeId}`] ||
            videoNode?.data.outputUrl
          return (
            <Card key={shot.id} className='gap-3 py-3'>
              <CardHeader className='flex items-center justify-between gap-2 px-4'>
                <div className='flex min-w-0 items-center gap-3'>
                  <span className='text-muted-foreground shrink-0 text-xs'>
                    {index + 1}
                  </span>
                  {editingShotId === shot.id ? (
                    <Input
                      value={shot.title}
                      maxLength={200}
                      aria-label={t('studio.shot.rename')}
                      onChange={(event) =>
                        props.onRenameShot(shot.id, event.target.value)
                      }
                      onBlur={() => setEditingShotId(null)}
                    />
                  ) : (
                    <CardTitle className='truncate text-sm'>
                      {shot.title}
                    </CardTitle>
                  )}
                </div>
                <div className='flex shrink-0 gap-1'>
                  <Button
                    size='xs'
                    variant='ghost'
                    onClick={() => setEditingShotId(shot.id)}
                  >
                    {t('studio.shot.rename')}
                  </Button>
                  <Button
                    size='xs'
                    variant='ghost'
                    disabled={index === 0}
                    onClick={() => props.onMoveShot(shot.id, 'up')}
                  >
                    {t('studio.shot.up')}
                  </Button>
                  <Button
                    size='xs'
                    variant='ghost'
                    disabled={index === shots.length - 1}
                    onClick={() => props.onMoveShot(shot.id, 'down')}
                  >
                    {t('studio.shot.down')}
                  </Button>
                  <Button
                    size='xs'
                    variant='ghost'
                    onClick={() => props.onDeleteShot(shot.id)}
                  >
                    {t('studio.shot.delete')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className='grid gap-3 px-4 md:grid-cols-3'>
                <div className='min-w-0 space-y-2 rounded-md border p-3'>
                  <p className='text-muted-foreground text-xs'>
                    {t('studio.kind.text')}
                  </p>
                  <p className='line-clamp-4 text-sm'>
                    {textNode?.data.outputText ||
                      textNode?.data.prompt ||
                      t('studio.shot.emptyText')}
                  </p>
                  {textNode?.data.error && (
                    <p className='text-destructive text-xs'>
                      {textNode.data.error}
                    </p>
                  )}
                  <Button
                    size='xs'
                    variant='outline'
                    onClick={() => props.onSelectNode(shot.textNodeId)}
                  >
                    {t('studio.shot.editText')}
                  </Button>
                </div>
                <div className='min-w-0 space-y-2 rounded-md border p-3'>
                  <p className='text-muted-foreground text-xs'>
                    {t('studio.kind.image')}
                  </p>
                  {imagePreview ? (
                    <img
                      src={imagePreview}
                      alt={shot.title}
                      className='h-24 w-full rounded object-cover'
                    />
                  ) : (
                    <p className='text-muted-foreground h-24 text-sm'>
                      {t('studio.shot.noImage')}
                    </p>
                  )}
                  {imageNode?.data.error && (
                    <p className='text-destructive text-xs'>
                      {imageNode.data.error}
                    </p>
                  )}
                  <Button
                    size='xs'
                    variant='outline'
                    onClick={() => props.onSelectNode(shot.imageNodeId)}
                  >
                    {t('studio.shot.editImage')}
                  </Button>
                  {index > 0 && props.onUsePreviousFrame && (
                    <Button
                      size='xs'
                      variant='outline'
                      disabled={
                        props.frameBusyShotId === shot.id ||
                        !props.project.nodes.some(
                          (node) =>
                            node.id === shots[index - 1].videoNodeId &&
                            node.data.status === 'completed' &&
                            Boolean(
                              node.data.mediaId ||
                              node.data.taskId ||
                              node.data.outputUrl
                            )
                        )
                      }
                      onClick={() => props.onUsePreviousFrame?.(shot.id)}
                    >
                      {props.frameBusyShotId === shot.id
                        ? t('studio.generating')
                        : t('studio.shot.usePreviousFrame')}
                    </Button>
                  )}
                </div>
                <div className='min-w-0 space-y-2 rounded-md border p-3'>
                  <p className='text-muted-foreground text-xs'>
                    {t('studio.kind.video')}
                  </p>
                  {videoPreview ? (
                    <video
                      src={videoPreview}
                      controls
                      preload='metadata'
                      className='h-24 w-full rounded object-cover'
                    />
                  ) : (
                    <p className='text-muted-foreground h-24 text-sm'>
                      {t('studio.shot.noVideo')}
                    </p>
                  )}
                  <div className='flex flex-wrap gap-1'>
                    <Button
                      size='xs'
                      variant='outline'
                      onClick={() => props.onSelectNode(shot.videoNodeId)}
                    >
                      {t('studio.shot.editVideo')}
                    </Button>
                    <Button
                      size='xs'
                      disabled={
                        !videoNode?.data.model ||
                        videoNode.data.status === 'submitting' ||
                        videoNode.data.status === 'queued' ||
                        videoNode.data.status === 'processing'
                      }
                      onClick={() => props.onGenerateVideo(shot.videoNodeId)}
                    >
                      {t('studio.shot.generateVideo')}
                    </Button>
                  </div>
                  {videoNode?.data.status &&
                    videoNode.data.status !== 'idle' && (
                      <p className='text-muted-foreground text-xs'>
                        {t(`studio.status.${videoNode.data.status}`)}
                      </p>
                    )}
                  {videoNode?.data.error && (
                    <p className='text-destructive text-xs'>
                      {videoNode.data.error}
                    </p>
                  )}
                </div>
              </CardContent>
              <div className='flex flex-wrap items-end gap-3 border-t px-4 pt-3'>
                <label className='text-muted-foreground flex flex-col gap-1 text-xs'>
                  {t('studio.timeline.trimStart')}
                  <Input
                    aria-label={`${shot.title} ${t('studio.timeline.trimStart')}`}
                    type='number'
                    min={0}
                    step={0.1}
                    className='w-24'
                    value={shot.trimStart ?? 0}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      if (value >= 0 && value <= 3600) {
                        props.onUpdateShotEdit?.(shot.id, { trimStart: value })
                      }
                    }}
                  />
                </label>
                <label className='text-muted-foreground flex flex-col gap-1 text-xs'>
                  {t('studio.timeline.trimEnd')}
                  <Input
                    aria-label={`${shot.title} ${t('studio.timeline.trimEnd')}`}
                    type='number'
                    min={0}
                    step={0.1}
                    className='w-24'
                    value={shot.trimEnd ?? ''}
                    placeholder={t('studio.timeline.fullClip')}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      if (
                        event.target.value === '' ||
                        (value >= 0 && value <= 3600)
                      ) {
                        props.onUpdateShotEdit?.(shot.id, {
                          trimEnd:
                            event.target.value === '' ? undefined : value,
                        })
                      }
                    }}
                  />
                </label>
                <label className='flex items-center gap-2 text-xs'>
                  <input
                    type='checkbox'
                    checked={Boolean(shot.muted)}
                    onChange={(event) =>
                      props.onUpdateShotEdit?.(shot.id, {
                        muted: event.target.checked,
                      })
                    }
                  />
                  {t('studio.timeline.mute')}
                </label>
                <label className='text-muted-foreground flex flex-col gap-1 text-xs'>
                  {t('studio.timeline.volume')}
                  <Input
                    aria-label={`${shot.title} ${t('studio.timeline.volume')}`}
                    type='number'
                    min={0}
                    max={1}
                    step={0.1}
                    className='w-24'
                    disabled={shot.muted}
                    value={shot.volume ?? 1}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      if (value >= 0 && value <= 1) {
                        props.onUpdateShotEdit?.(shot.id, { volume: value })
                      }
                    }}
                  />
                </label>
                {index < shots.length - 1 && (
                  <label className='text-muted-foreground flex flex-col gap-1 text-xs'>
                    {t('studio.timeline.transition')}
                    <select
                      aria-label={`${shot.title} ${t('studio.timeline.transition')}`}
                      className='border-input bg-background h-8 rounded-md border px-2'
                      value={shot.transition || 'cut'}
                      onChange={(event) =>
                        props.onUpdateShotEdit?.(shot.id, {
                          transition: event.target.value as 'cut' | 'fade',
                        })
                      }
                    >
                      <option value='cut'>{t('studio.timeline.cut')}</option>
                      <option value='fade'>{t('studio.timeline.fade')}</option>
                    </select>
                  </label>
                )}
                {index < shots.length - 1 && shot.transition === 'fade' && (
                  <label className='text-muted-foreground flex flex-col gap-1 text-xs'>
                    {t('studio.timeline.transitionSeconds')}
                    <Input
                      aria-label={`${shot.title} ${t('studio.timeline.transitionSeconds')}`}
                      type='number'
                      min={0.1}
                      max={3}
                      step={0.1}
                      className='w-24'
                      value={shot.transitionSeconds ?? 0.5}
                      onChange={(event) => {
                        const value = Number(event.target.value)
                        if (value >= 0.1 && value <= 3) {
                          props.onUpdateShotEdit?.(shot.id, {
                            transitionSeconds: value,
                          })
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            </Card>
          )
        })}
        {shots.length > 0 && (
          <Card className='gap-3 py-3'>
            <CardHeader className='px-4'>
              <CardTitle className='text-sm'>
                {t('studio.final.aiTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3 px-4'>
              <p className='text-muted-foreground text-xs'>
                {t('studio.final.aiDescription')}
              </p>
              <p className='text-muted-foreground text-xs'>
                {t('studio.final.aiBillable')}
              </p>
              {finalPreview && (
                <video
                  src={finalPreview}
                  controls
                  preload='metadata'
                  className='aspect-video max-h-64 w-full rounded object-contain'
                />
              )}
              <div className='flex flex-wrap gap-2'>
                {!finalVideo ? (
                  <Button size='sm' onClick={props.onCreateFinalVideo}>
                    {t('studio.final.aiCreate')}
                  </Button>
                ) : (
                  <>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => props.onSelectNode(finalVideo.id)}
                    >
                      {t('studio.shot.editFinal')}
                    </Button>
                    <Button
                      size='sm'
                      disabled={
                        !finalVideo.data.model ||
                        finalVideo.data.status === 'submitting' ||
                        finalVideo.data.status === 'queued' ||
                        finalVideo.data.status === 'processing'
                      }
                      onClick={() => props.onGenerateVideo(finalVideo.id)}
                    >
                      {t('studio.final.aiGenerate')}
                    </Button>
                  </>
                )}
              </div>
              {finalVideo?.data.status && finalVideo.data.status !== 'idle' && (
                <p className='text-muted-foreground text-xs'>
                  {t(`studio.status.${finalVideo.data.status}`)}
                </p>
              )}
              {finalVideo?.data.error && (
                <p className='text-destructive text-xs'>
                  {finalVideo.data.error}
                </p>
              )}
            </CardContent>
          </Card>
        )}
        {shots.length > 0 && <StudioAssemblyPanel {...props.assembly} />}
      </div>
    </div>
  )
}
