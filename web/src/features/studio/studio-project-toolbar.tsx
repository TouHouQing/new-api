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

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type { StudioProject } from './local-projects'

export function StudioProjectToolbar(props: {
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
  const { t } = useTranslation()
  const upload = useRef<HTMLInputElement>(null)
  const [renaming, setRenaming] = useState(false)
  let saveLabel = 'Saving project changes…'
  if (props.saved) saveLabel = 'Saved to the server'
  if (props.saveProblem) saveLabel = 'Draft save needs attention'
  if (props.readOnly) saveLabel = 'Read-only project'
  return (
    <header className='min-w-0 space-y-3 border-b p-3 sm:px-4'>
      <div className='flex min-w-0 flex-wrap items-center gap-2'>
        <h1 className='mr-auto text-lg font-semibold'>{t('studio.title')}</h1>
        <Button size='sm' variant='outline' onClick={props.onTasks}>
          {t('studio.taskCenter.title')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size='sm' variant='outline' />}>
            {t('Project actions')}
          </DropdownMenuTrigger>
          <DropdownMenuContent>
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
            <DropdownMenuItem
              disabled={props.readOnly}
              onClick={props.onDelete}
            >
              {t('studio.project.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className='flex min-w-0 items-center gap-2'>
        <Select
          value={props.project.id}
          onValueChange={(id) => {
            if (id) props.onSelect(id)
          }}
          items={props.projects.map((p) => ({ value: p.id, label: p.title }))}
        >
          <SelectTrigger
            className='w-full min-w-0'
            aria-label={t('studio.project.select')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {props.projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {renaming && (
          <Input
            aria-label={t('studio.project.name')}
            value={props.project.title}
            readOnly={props.readOnly}
            maxLength={200}
            onChange={(event) => props.onTitle(event.target.value)}
            autoFocus
            onBlur={() => setRenaming(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'Escape') {
                setRenaming(false)
              }
            }}
          />
        )}
        <Button variant='outline' size='sm' onClick={props.onNew}>
          {t('studio.project.new')}
        </Button>
      </div>
      <p className='text-muted-foreground text-xs' role='status'>
        {t(saveLabel)}
      </p>
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
