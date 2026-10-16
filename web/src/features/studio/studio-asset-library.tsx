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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import type { StudioAsset } from './local-projects'
import { StudioAssetProfileEditor } from './studio-asset-profile-editor'
import { StudioMediaThumbnail } from './studio-media-thumbnail'

type Props = {
  assets: StudioAsset[]
  previews: Record<string, string>
  projectId: string
  readOnly?: boolean
  compact?: boolean
  applyLabel?: string
  getMedia?: (id: string) => Promise<Blob | null>
  onAdd: (kind: StudioAsset['kind'], title: string, prompt: string) => void
  onUpdate: (
    assetId: string,
    patch: Partial<Pick<StudioAsset, 'title' | 'prompt' | 'profile'>>
  ) => void
  onUpload: (assetId: string, file: File) => void
  onDelete: (assetId: string) => void
  onApplyToShots?: (assetId: string) => void
  onCreateVersion?: (assetId: string) => void
  onPlaceOnCanvas?: (assetId: string) => void
}

export function StudioAssetLibrary(props: Props) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<StudioAsset['kind']>('character')
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [search, setSearch] = useState('')

  return (
    <div className='h-full space-y-4 overflow-y-auto p-4'>
      <div>
        <h2 className='text-base font-semibold'>{t('studio.asset.title')}</h2>
        <p className='text-muted-foreground text-xs'>
          {t('studio.asset.description')}
        </p>
      </div>
      <fieldset
        disabled={props.readOnly}
        className='grid min-w-0 gap-2 rounded-lg border p-3 md:grid-cols-[150px_1fr]'
      >
        <Select
          value={kind}
          onValueChange={(value) => setKind(value as StudioAsset['kind'])}
          items={(['character', 'location', 'style'] as const).map((item) => ({
            value: item,
            label: t(`studio.asset.${item}`),
          }))}
        >
          <SelectTrigger aria-label={t('studio.asset.kind')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['character', 'location', 'style'] as const).map((item) => (
              <SelectItem key={item} value={item}>
                {t(`studio.asset.${item}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label={t('studio.asset.name')}
          placeholder={t('studio.asset.name')}
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Textarea
          aria-label={t('studio.asset.prompt')}
          className='md:col-span-2'
          placeholder={t('studio.asset.prompt')}
          maxLength={10000}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <Button
          size='sm'
          className='md:col-span-2'
          disabled={!title.trim()}
          onClick={() => {
            props.onAdd(kind, title.trim(), prompt.trim())
            setTitle('')
            setPrompt('')
          }}
        >
          {t('studio.asset.add')}
        </Button>
      </fieldset>
      <Input
        aria-label={t('Find a character or scene')}
        placeholder={t('Find a character or scene')}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className='grid gap-3 md:grid-cols-2'>
        {props.assets
          .filter(
            (asset) =>
              !search ||
              `${asset.title} ${asset.prompt}`
                .toLocaleLowerCase()
                .includes(search.toLocaleLowerCase())
          )
          .map((asset) => {
            const preview =
              props.previews[`${props.projectId}:asset:${asset.id}`] ||
              asset.outputUrl
            return (
              <fieldset
                disabled={props.readOnly}
                key={asset.id}
                className='min-w-0 space-y-2 rounded-lg border p-3'
              >
                <p className='text-muted-foreground text-xs'>
                  {t(`studio.asset.${asset.kind}`)}
                </p>
                {preview && (
                  <img
                    src={preview}
                    alt={asset.title}
                    className='h-32 w-full rounded object-cover'
                  />
                )}
                {!preview && asset.mediaId && props.getMedia && (
                  <StudioMediaThumbnail
                    large
                    mediaId={asset.mediaId}
                    kind='image'
                    title={asset.title}
                    getMedia={props.getMedia}
                  />
                )}
                {props.compact && (
                  <p className='text-muted-foreground text-xs'>
                    {asset.profile?.wardrobe} {asset.profile?.voice} ·{' '}
                    {t('Reference version')} {asset.versions?.length || 0}
                  </p>
                )}
                <Input
                  aria-label={`${asset.title} ${t('studio.asset.name')}`}
                  maxLength={200}
                  value={asset.title}
                  onChange={(event) => {
                    if (event.target.value.trim()) {
                      props.onUpdate(asset.id, { title: event.target.value })
                    }
                  }}
                />
                <Collapsible defaultOpen={!props.compact}>
                  <CollapsibleTrigger
                    render={<Button size='sm' variant='ghost' />}
                  >
                    {t('Reference description and details')}
                  </CollapsibleTrigger>
                  <CollapsibleContent className='flex flex-col gap-2 pt-2'>
                    <Textarea
                      aria-label={`${asset.title} ${t('studio.asset.prompt')}`}
                      maxLength={10000}
                      value={asset.prompt}
                      onChange={(event) =>
                        props.onUpdate(asset.id, { prompt: event.target.value })
                      }
                    />
                    <StudioAssetProfileEditor
                      asset={asset}
                      disabled={props.readOnly}
                      onChange={(profile) =>
                        props.onUpdate(asset.id, { profile })
                      }
                    />
                  </CollapsibleContent>
                </Collapsible>
                {props.onPlaceOnCanvas && (
                  <Button
                    size='sm'
                    variant='secondary'
                    onClick={() => props.onPlaceOnCanvas?.(asset.id)}
                  >
                    {t('studio.asset.placeOnCanvas')}
                  </Button>
                )}
                <Input
                  type='file'
                  accept='image/png,image/jpeg,image/webp'
                  aria-label={`${asset.title} ${t('studio.asset.reference')}`}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) props.onUpload(asset.id, file)
                    event.target.value = ''
                  }}
                />
                {props.onCreateVersion && (
                  <Button
                    size='xs'
                    variant='outline'
                    aria-label={`${asset.title} ${t('studio.asset.lockVersion')}`}
                    onClick={() => props.onCreateVersion?.(asset.id)}
                  >
                    {t('studio.asset.lockVersion')}
                  </Button>
                )}
                {Boolean(asset.versions?.length) && (
                  <div className='flex flex-col gap-2 rounded-md border p-2'>
                    <p className='text-muted-foreground text-xs'>
                      {t('studio.asset.version')}
                    </p>
                    {asset.versions?.map((version, index) => {
                      const versionPreview =
                        props.previews[
                          `${props.projectId}:asset:${asset.id}:version:${version.id}`
                        ] || version.outputUrl
                      return (
                        <div
                          key={version.id}
                          className='flex items-start gap-2 text-xs'
                        >
                          {versionPreview && (
                            <img
                              src={versionPreview}
                              alt={`${asset.title} ${t('studio.asset.version')} ${index + 1}`}
                              className='size-12 rounded object-cover'
                            />
                          )}
                          <div className='min-w-0'>
                            <p className='font-medium'>
                              {t('studio.asset.version')} {index + 1}
                            </p>
                            <p className='text-muted-foreground break-words'>
                              {version.prompt}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                <Button
                  size='xs'
                  variant='outline'
                  aria-label={`${asset.title} ${props.applyLabel || t('studio.asset.applyToShots')}`}
                  onClick={() => props.onApplyToShots?.(asset.id)}
                >
                  {props.applyLabel || t('studio.asset.applyToShots')}
                </Button>
                <Button
                  size='xs'
                  variant='outline'
                  onClick={() => props.onDelete(asset.id)}
                >
                  {t('studio.asset.delete')}
                </Button>
              </fieldset>
            )
          })}
      </div>
    </div>
  )
}
