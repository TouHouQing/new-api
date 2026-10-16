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

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { toIntlLocale } from '@/i18n/languages'

import type { StudioProject } from './local-projects'
import { StudioMediaThumbnail } from './studio-media-thumbnail'
import { studioProjectDisplayTitle } from './studio-project-identity'

export function StudioProjectToolbar(props: {
  getMedia?: (id: string) => Promise<Blob | null>
  compact?: boolean
  project: StudioProject
  projects: StudioProject[]
  readOnly: boolean
  saved: boolean
  saveProblem?: boolean
  onSelect: (id: string) => void
  onTitle: (title: string) => void
  onNew: () => void
  onBackup: () => void
  onImport: (file: File) => void
  onSettings: () => void
  onTasks: () => void
  onDelete: () => void
}) {
  const { t, i18n } = useTranslation()
  const upload = useRef<HTMLInputElement>(null)
  const [renaming, setRenaming] = useState(false)
  const [picker, setPicker] = useState(false)
  const [search, setSearch] = useState('')
  let saveLabel = 'Saving project changes…'
  if (props.saved) saveLabel = 'Saved to the server'
  if (props.saveProblem) saveLabel = 'Draft save needs attention'
  if (props.readOnly) saveLabel = 'Read-only project'
  return (
    <header className='studio-project-toolbar flex min-w-0 items-center gap-3 border-b px-4 py-3'>
      <h1 className='sr-only'>{t('Video creation studio')}</h1>
      <Button
        variant='ghost'
        className='min-w-0 flex-1 justify-start text-base font-semibold'
        aria-label={t('studio.project.select')}
        onClick={() => setPicker(true)}
      >
        <span className='truncate'>
          {studioProjectDisplayTitle(props.project)}
        </span>
        <span aria-hidden='true'>⌄</span>
      </Button>
      <p
        className='text-muted-foreground hidden text-sm sm:block'
        role='status'
      >
        {t(saveLabel)}
      </p>
      <Button
        className='hidden sm:inline-flex'
        variant='outline'
        onClick={props.onTasks}
      >
        {t('studio.taskCenter.title')}
      </Button>
      <Button
        className='hidden sm:inline-flex'
        variant='outline'
        onClick={props.onNew}
      >
        {t('studio.project.new')}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant='outline' />}>
          {t('Project actions')}
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onClick={props.onNew}>
            {t('studio.project.new')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={props.onTasks}>
            {t('studio.taskCenter.title')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={props.readOnly}
            onClick={() => setRenaming(true)}
          >
            {t('Rename project')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={props.onBackup}>
            {t('Back up project')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => upload.current?.click()}>
            {t('Import a project backup')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={props.onSettings}>
            {t('Optional: connect your own API')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={props.readOnly} onClick={props.onDelete}>
            {t('studio.project.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={renaming}
        onOpenChange={setRenaming}
        title={t('Rename project')}
        footer={<Button onClick={() => setRenaming(false)}>{t('Done')}</Button>}
      >
        <Field>
          <FieldLabel>{t('studio.project.name')}</FieldLabel>
          <Input
            aria-label={t('studio.project.name')}
            value={props.project.title}
            readOnly={props.readOnly}
            maxLength={200}
            onChange={(event) => props.onTitle(event.target.value)}
          />
        </Field>
      </Dialog>
      <Dialog
        open={picker}
        onOpenChange={setPicker}
        title={t('Choose a video project')}
      >
        <Field>
          <FieldLabel>{t('Search your projects')}</FieldLabel>
          <Input
            aria-label={t('Search your projects')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>
        <div className='mt-4 grid gap-2'>
          {props.projects
            .filter((p) =>
              [p.title, studioProjectDisplayTitle(p)]
                .join(' ')
                .toLowerCase()
                .includes(search.toLowerCase())
            )
            .map((p) => {
              const image = p.nodes.find(
                (node) => node.data.kind === 'image' && node.data.mediaId
              )
              return (
                <Button
                  key={p.id}
                  variant={p.id === props.project.id ? 'secondary' : 'ghost'}
                  className='h-auto min-h-20 justify-start gap-4 p-3 text-left whitespace-normal'
                  onClick={() => {
                    props.onSelect(p.id)
                    setPicker(false)
                  }}
                >
                  <span className='bg-muted flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md'>
                    {image?.data.mediaId && props.getMedia ? (
                      <StudioMediaThumbnail
                        mediaId={image.data.mediaId}
                        kind='image'
                        title={studioProjectDisplayTitle(p)}
                        getMedia={props.getMedia}
                      />
                    ) : (
                      t('Video draft')
                    )}
                  </span>
                  <span className='flex min-w-0 flex-col gap-1'>
                    <span className='font-medium'>
                      {studioProjectDisplayTitle(p)}
                    </span>
                    <span className='text-muted-foreground text-sm'>
                      {Number.isFinite(Date.parse(p.updatedAt)) &&
                        new Intl.DateTimeFormat(toIntlLocale(i18n.language), {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(new Date(p.updatedAt))}{' '}
                      ·{' '}
                      {t(
                        `studio.workspace.stage.${p.production?.guide?.step || 'story'}`
                      )}
                    </span>
                  </span>
                </Button>
              )
            })}
        </div>
      </Dialog>
      <Input
        ref={upload}
        type='file'
        accept='application/json,application/zip,.json,.zip'
        className='hidden'
        aria-label={t('Import a project backup')}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) props.onImport(file)
          event.target.value = ''
        }}
      />
    </header>
  )
}
