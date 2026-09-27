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
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import type { StudioCanvasNode } from './canvas-flow'
import type { StudioAsset, StudioShot } from './local-projects'

type Props = {
  projectId: string
  shot: StudioShot
  previousShot?: StudioShot
  videoNode?: StudioCanvasNode
  assets: readonly StudioAsset[]
  selectedAssetIds: readonly string[]
  pinnedVersionIds: Readonly<Record<string, string>>
  takePreviews?: Readonly<Record<string, string>>
  onUpdateReview?: (
    shotId: string,
    patch: Pick<StudioShot, 'reviewStatus' | 'reviewNote'>
  ) => void
  onUpdateDetails?: (
    shotId: string,
    patch: Pick<StudioShot, 'shotType' | 'camera' | 'dialogue'>
  ) => void
  onSelectTake?: (nodeId: string, takeId: string) => void
  onSetAssets?: (shotId: string, assetIds: string[]) => void
  onPinVersion?: (shotId: string, assetId: string, versionId?: string) => void
  onReusePrevious?: (shotId: string, sourceShotId: string) => void
}

export function StudioShotReviewPanel(props: Props) {
  const { t } = useTranslation()
  const status = props.shot.reviewStatus || 'unreviewed'
  const previousShotId = props.previousShot?.id
  const videoNodeId = props.videoNode?.id
  const completedTakes = (props.videoNode?.data.takes || [])
    .map((take, index) => ({ take, index }))
    .filter(({ take }) => take.status === 'completed')
    .slice(-6)
    .reverse()

  return (
    <div className='flex flex-col gap-4 border-t px-4 pt-3'>
      <div className='flex flex-col gap-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-sm font-medium'>
            {t('studio.review.status')}
          </span>
          <Badge variant='secondary'>{t(`studio.review.${status}`)}</Badge>
        </div>
        <ToggleGroup
          value={[status]}
          onValueChange={(values) => {
            const value = values[0]
            if (
              value === 'unreviewed' ||
              value === 'approved' ||
              value === 'retake'
            ) {
              props.onUpdateReview?.(props.shot.id, { reviewStatus: value })
            }
          }}
          variant='outline'
          size='sm'
          aria-label={`${props.shot.title} ${t('studio.review.status')}`}
        >
          {(['unreviewed', 'approved', 'retake'] as const).map((value) => (
            <ToggleGroupItem
              key={value}
              value={value}
              disabled={!props.onUpdateReview}
            >
              {t(`studio.review.${value}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Textarea
          aria-label={`${props.shot.title} ${t('studio.review.note')}`}
          placeholder={t('studio.review.note')}
          maxLength={2000}
          value={props.shot.reviewNote || ''}
          disabled={!props.onUpdateReview}
          onChange={(event) =>
            props.onUpdateReview?.(props.shot.id, {
              reviewNote: event.target.value,
            })
          }
        />
      </div>

      <div className='grid gap-2 sm:grid-cols-2'>
        <label className='flex flex-col gap-1 text-xs'>
          {t('studio.shot.shotType')}
          <Input
            aria-label={`${props.shot.title} ${t('studio.shot.shotType')}`}
            maxLength={200}
            value={props.shot.shotType || ''}
            disabled={!props.onUpdateDetails}
            onChange={(event) =>
              props.onUpdateDetails?.(props.shot.id, {
                shotType: event.target.value,
              })
            }
          />
        </label>
        <label className='flex flex-col gap-1 text-xs'>
          {t('studio.shot.camera')}
          <Input
            aria-label={`${props.shot.title} ${t('studio.shot.camera')}`}
            maxLength={2000}
            value={props.shot.camera || ''}
            disabled={!props.onUpdateDetails}
            onChange={(event) =>
              props.onUpdateDetails?.(props.shot.id, {
                camera: event.target.value,
              })
            }
          />
        </label>
        <label className='flex flex-col gap-1 text-xs sm:col-span-2'>
          {t('studio.shot.dialogue')}
          <Textarea
            aria-label={`${props.shot.title} ${t('studio.shot.dialogue')}`}
            maxLength={30000}
            value={props.shot.dialogue || ''}
            disabled={!props.onUpdateDetails}
            onChange={(event) =>
              props.onUpdateDetails?.(props.shot.id, {
                dialogue: event.target.value,
              })
            }
          />
        </label>
      </div>

      {props.assets.length > 0 && (
        <div className='flex flex-col gap-2'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <span className='text-sm font-medium'>
              {t('studio.shot.references')}
            </span>
            {previousShotId && (
              <Button
                size='xs'
                variant='outline'
                disabled={!props.onReusePrevious}
                aria-label={`${props.shot.title} ${t('studio.shot.reusePrevious')}`}
                onClick={() =>
                  props.onReusePrevious?.(props.shot.id, previousShotId)
                }
              >
                {t('studio.shot.reusePrevious')}
              </Button>
            )}
          </div>
          <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
            {props.assets.map((asset) => {
              const selected = props.selectedAssetIds.includes(asset.id)
              return (
                <div
                  key={asset.id}
                  className='flex flex-col gap-2 rounded-md border p-2'
                >
                  <label className='flex items-center gap-2 text-xs'>
                    <Checkbox
                      aria-label={`${props.shot.title} ${asset.title}`}
                      checked={selected}
                      disabled={
                        !props.onSetAssets ||
                        (!selected && props.selectedAssetIds.length >= 32)
                      }
                      onCheckedChange={(checked) => {
                        const ids =
                          checked === true
                            ? [...props.selectedAssetIds, asset.id]
                            : props.selectedAssetIds.filter(
                                (id) => id !== asset.id
                              )
                        props.onSetAssets?.(props.shot.id, ids)
                      }}
                    />
                    <span className='truncate'>{asset.title}</span>
                    <span className='text-muted-foreground'>
                      {t(`studio.asset.${asset.kind}`)}
                    </span>
                  </label>
                  {selected && Boolean(asset.versions?.length) && (
                    <Select
                      value={props.pinnedVersionIds[asset.id] || 'current'}
                      disabled={!props.onPinVersion}
                      onValueChange={(value) =>
                        props.onPinVersion?.(
                          props.shot.id,
                          asset.id,
                          value === 'current' ? undefined : value || undefined
                        )
                      }
                      items={[
                        {
                          value: 'current',
                          label: t('studio.asset.currentVersion'),
                        },
                        ...(asset.versions || []).map((version, index) => ({
                          value: version.id,
                          label: `${t('studio.asset.version')} ${index + 1}`,
                        })),
                      ]}
                    >
                      <SelectTrigger
                        aria-label={`${props.shot.title} ${asset.title} ${t('studio.asset.version')}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value='current'>
                            {t('studio.asset.currentVersion')}
                          </SelectItem>
                          {(asset.versions || []).map((version, index) => (
                            <SelectItem key={version.id} value={version.id}>
                              {t('studio.asset.version')} {index + 1}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {completedTakes.length > 0 && videoNodeId && (
        <div className='flex flex-col gap-2'>
          <span className='text-sm font-medium'>
            {t('studio.review.takes')}
          </span>
          <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
            {completedTakes.map(({ take, index }) => {
              const selected = take.id === props.videoNode?.data.selectedTakeId
              const preview =
                props.takePreviews?.[
                  `${props.projectId}:${videoNodeId}:${take.id}`
                ] || take.outputUrl
              return (
                <div
                  key={take.id}
                  className='flex flex-col gap-2 rounded-md border p-2'
                >
                  <div className='flex items-center justify-between gap-2 text-xs'>
                    <span>
                      {t('studio.take.title')} {index + 1}
                    </span>
                    {selected && (
                      <Badge variant='secondary'>
                        {t('studio.review.selectedTake')}
                      </Badge>
                    )}
                  </div>
                  {preview && (
                    <video
                      src={preview}
                      controls
                      preload='metadata'
                      className='aspect-video w-full rounded object-cover'
                    />
                  )}
                  <p className='text-muted-foreground line-clamp-2 text-xs'>
                    {take.prompt}
                  </p>
                  <Button
                    size='xs'
                    variant={selected ? 'secondary' : 'outline'}
                    disabled={selected || !props.onSelectTake}
                    aria-label={`${t('studio.review.chooseTake')} ${index + 1}`}
                    onClick={() => props.onSelectTake?.(videoNodeId, take.id)}
                  >
                    {selected
                      ? t('studio.review.selectedTake')
                      : t('studio.review.chooseTake')}
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
