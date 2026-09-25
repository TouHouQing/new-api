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

import type { StudioProject } from './local-projects'
import { StudioAssemblyPanel } from './studio-assembly-panel'

type Props = {
  project: StudioProject
  previews: Record<string, string>
  onSelectNode: (nodeId: string) => void
  onGenerateVideo: (nodeId: string) => void
  onGenerateAll: () => void
  onCreateFinalVideo: () => void
  batchBusy?: boolean
  onAddShot: () => void
  onMoveShot: (shotId: string, direction: 'up' | 'down') => void
  onRenameShot: (shotId: string, title: string) => void
  onDeleteShot: (shotId: string) => void
  assembly: {
    busy: boolean
    progress: number
    previewUrl?: string
    error?: string
    onAssemble: () => void
    onCancel: () => void
    onDownload: () => void
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
            </Card>
          )
        })}
        {shots.length > 0 && (
          <Card className='gap-3 py-3'>
            <CardHeader className='px-4'>
              <CardTitle className='text-sm'>
                {t('studio.shot.finalTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3 px-4'>
              <p className='text-muted-foreground text-xs'>
                {t('studio.shot.finalDescription')}
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
                    {t('studio.shot.createFinal')}
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
                      {t('studio.shot.generateFinal')}
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
