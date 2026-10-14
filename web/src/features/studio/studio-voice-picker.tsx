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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
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

export function StudioVoicePicker(props: {
  project: StudioProject
  value: string
  disabled?: boolean
  onChange: (id: string) => void
  getMedia: (id: string) => Promise<Blob | null>
}) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [favorites, setFavorites] = useState(false)
  const mediaAccess = useRef(props.getMedia)
  mediaAccess.current = props.getMedia
  const voices = useMemo(() => {
    const choices = new Map<
      string,
      { id: string; label: string; mediaId?: string }
    >([
      [
        'default',
        {
          id: 'default',
          label:
            props.project.production?.voiceLibrary.find(
              (item) => item.id === 'default'
            )?.title || t('Default studio voice'),
        },
      ],
    ])
    for (const node of props.project.nodes) {
      for (const take of node.data.takes || []) {
        if (take.voice && take.status === 'completed') {
          choices.set(take.voice, {
            id: take.voice,
            label:
              props.project.production?.voiceLibrary.find(
                (item) => item.id === take.voice
              )?.title || node.data.title,
            mediaId: take.mediaId,
          })
        }
      }
    }
    if (props.value && !choices.has(props.value)) {
      choices.set(props.value, {
        id: props.value,
        label: t('Saved voice unavailable'),
      })
    }
    return [...choices.values()]
  }, [
    props.project.nodes,
    props.project.production?.voiceLibrary,
    props.value,
    t,
  ])
  const filtered = voices.filter((voice) => {
    const metadata = props.project.production?.voiceLibrary.find(
      (item) => item.id === voice.id
    )
    return (
      (!favorites || metadata?.favorite || voice.id === props.value) &&
      (!search.trim() ||
        voice.id === props.value ||
        [voice.label, metadata?.language, ...(metadata?.tags || [])]
          .join(' ')
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase()))
    )
  })
  const mediaId = voices.find((voice) => voice.id === props.value)?.mediaId
  useEffect(() => {
    let disposed = false
    let owned = ''
    setUrl(
      props.value === 'default' || props.value === 'alloy'
        ? '/studio-example/default-voice.wav'
        : ''
    )
    setError('')
    if (mediaId) {
      void mediaAccess
        .current(mediaId)
        .then((blob) => {
          if (blob && !disposed) {
            owned = URL.createObjectURL(blob)
            setUrl(owned)
          }
        })
        .catch((error) => {
          if (!disposed) setError(String(error))
        })
    }
    return () => {
      disposed = true
      if (owned) URL.revokeObjectURL(owned)
    }
  }, [mediaId, props.value])
  return (
    <Field>
      <FieldLabel>{t('Choose a character voice')}</FieldLabel>
      <Input
        aria-label={t('Search voices by name, language or tag')}
        placeholder={t('Search voices by name, language or tag')}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <label className='flex items-center gap-2 text-sm'>
        <Checkbox
          checked={favorites}
          onCheckedChange={(checked) => setFavorites(checked === true)}
        />
        {t('Favorite voices')}
      </label>
      <Select
        disabled={props.disabled}
        value={props.value || null}
        onValueChange={(value) => {
          if (value) props.onChange(value)
        }}
        items={voices.map((voice) => ({ value: voice.id, label: voice.label }))}
      >
        <SelectTrigger aria-label={t('Choose a character voice')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {filtered.map((voice) => (
              <SelectItem key={voice.id} value={voice.id}>
                {voice.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {url ? (
        <audio src={url} controls className='w-full' />
      ) : (
        <p className='text-muted-foreground text-xs'>
          {t(
            'Saved voice samples appear here. Generate a short dialogue sample to preview a new voice.'
          )}
        </p>
      )}
      {error && (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </Field>
  )
}
