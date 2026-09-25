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

type Props = {
  assets: StudioAsset[]
  previews: Record<string, string>
  projectId: string
  onAdd: (kind: StudioAsset['kind'], title: string, prompt: string) => void
  onUpdate: (
    assetId: string,
    patch: Partial<Pick<StudioAsset, 'title' | 'prompt'>>
  ) => void
  onUpload: (assetId: string, file: File) => void
  onDelete: (assetId: string) => void
}

export function StudioAssetLibrary(props: Props) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<StudioAsset['kind']>('character')
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')

  return (
    <div className='h-full space-y-4 overflow-y-auto p-4'>
      <div>
        <h2 className='text-base font-semibold'>{t('studio.asset.title')}</h2>
        <p className='text-muted-foreground text-xs'>
          {t('studio.asset.description')}
        </p>
      </div>
      <div className='grid gap-2 rounded-lg border p-3 md:grid-cols-[150px_1fr]'>
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
      </div>
      <div className='grid gap-3 md:grid-cols-2'>
        {props.assets.map((asset) => {
          const preview =
            props.previews[`${props.projectId}:asset:${asset.id}`] ||
            asset.outputUrl
          return (
            <div key={asset.id} className='space-y-2 rounded-lg border p-3'>
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
              <Textarea
                aria-label={`${asset.title} ${t('studio.asset.prompt')}`}
                maxLength={10000}
                value={asset.prompt}
                onChange={(event) =>
                  props.onUpdate(asset.id, { prompt: event.target.value })
                }
              />
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
              <Button
                size='xs'
                variant='outline'
                onClick={() => props.onDelete(asset.id)}
              >
                {t('studio.asset.delete')}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
