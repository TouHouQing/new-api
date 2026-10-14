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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import { studioProductionSchema } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'

function StudioVoiceSample({
  mediaId,
  name,
}: {
  mediaId?: string
  name: string
}) {
  const { t } = useTranslation()
  const { props } = useStudioProductionContext()
  const getMedia = useRef(props.getMedia)
  getMedia.current = props.getMedia
  const [open, setOpen] = useState(false),
    [url, setUrl] = useState(''),
    [error, setError] = useState('')
  useEffect(() => {
    if (!open || !mediaId) return
    let disposed = false,
      objectUrl = ''
    void getMedia
      .current(mediaId)
      .then((blob) => {
        if (disposed) return
        if (!blob || !blob.type.startsWith('audio/')) {
          throw new Error(t('Stored voice sample is unavailable'))
        }
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch((error) => {
        if (!disposed) {
          setError(error instanceof Error ? error.message : String(error))
        }
      })
    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [open, mediaId, t])
  return (
    <div className='space-y-2'>
      <Button
        variant='outline'
        size='sm'
        disabled={!mediaId}
        onClick={() => setOpen(true)}
      >
        {t('Preview saved voice sample')}
      </Button>
      {!mediaId && (
        <p className='text-muted-foreground text-xs'>
          {t('Save speech with this voice to add a sample.')}
        </p>
      )}
      {url && (
        <audio
          controls
          preload='metadata'
          aria-label={t('Voice sample {{name}}', { name })}
          src={url}
          className='w-full'
        />
      )}
      {error && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
    </div>
  )
}

export function StudioVoiceLibrary() {
  const { t } = useTranslation()
  const { props, writable } = useStudioProductionContext()
  const [search, setSearch] = useState('')
  const production =
    props.project.production || studioProductionSchema.parse({})
  const available = new Map<string, string>([
    ['default', t('Default studio voice')],
  ])
  for (const node of props.project.nodes) {
    for (const take of node.data.takes || []) {
      if (take.voice && take.status === 'completed') {
        available.set(take.voice, node.data.title)
      }
    }
  }
  const voices = [...available].map(
    ([id, title]) =>
      production.voiceLibrary.find((voice) => voice.id === id) || {
        id,
        title,
        tags: [],
        language: '',
        favorite: false,
      }
  )
  const update = (id: string, patch: Partial<(typeof voices)[number]>) => {
    if (!writable) return
    const voice = voices.find((item) => item.id === id)
    if (!voice || (!patch.title?.trim() && patch.title !== undefined)) return
    const saved = { ...voice, ...patch }
    props.onUpdate({
      ...props.project,
      production: {
        ...production,
        voiceLibrary: [
          ...production.voiceLibrary.filter((item) => item.id !== id),
          saved,
        ],
      },
    })
  }
  return (
    <Collapsible className='space-y-3'>
      <CollapsibleTrigger render={<Button variant='outline' />}>
        {t('Manage voice library')}
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-3'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Catalog language organizes voices; output language is selected for each task. A stored sample does not change when you edit catalog tags.'
          )}
        </p>
        <Input
          aria-label={t('Search voices by name, language or tag')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {voices
          .filter((voice) =>
            [voice.title, voice.language, ...voice.tags]
              .join(' ')
              .toLowerCase()
              .includes(search.toLowerCase())
          )
          .map((voice) => (
            <div key={voice.id} className='space-y-2 border-b pb-3'>
              <Field>
                <FieldLabel>{t('Voice name')}</FieldLabel>
                <Input
                  aria-label={t('Voice name')}
                  maxLength={200}
                  disabled={!writable}
                  value={voice.title}
                  onChange={(event) =>
                    update(voice.id, { title: event.target.value })
                  }
                />
              </Field>
              <div className='grid gap-2 sm:grid-cols-2'>
                <Field>
                  <FieldLabel>{t('Voice catalog language')}</FieldLabel>
                  <Input
                    aria-label={t('Voice catalog language')}
                    maxLength={40}
                    disabled={!writable}
                    value={voice.language}
                    onChange={(event) =>
                      update(voice.id, { language: event.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>{t('Voice tags (comma separated)')}</FieldLabel>
                  <Input
                    aria-label={t('Voice tags (comma separated)')}
                    disabled={!writable}
                    key={voice.tags.join(',')}
                    defaultValue={voice.tags.join(', ')}
                    onBlur={(event) =>
                      update(voice.id, {
                        tags: [
                          ...new Set(
                            event.target.value
                              .split(',')
                              .map((tag) => tag.trim().slice(0, 40))
                              .filter(Boolean)
                          ),
                        ].slice(0, 12),
                      })
                    }
                  />
                </Field>
              </div>
              <label className='flex items-center gap-2 text-sm'>
                <Checkbox
                  disabled={!writable}
                  checked={voice.favorite}
                  onCheckedChange={(checked) =>
                    update(voice.id, { favorite: checked === true })
                  }
                />
                {t('Favorite voice')}
              </label>
              <StudioVoiceSample
                name={voice.title}
                mediaId={
                  props.project.nodes
                    .filter((node) => node.data.kind === 'audio')
                    .flatMap((node) => node.data.takes || [])
                    .find(
                      (take) =>
                        take.voice === voice.id &&
                        take.status === 'completed' &&
                        take.mediaId
                    )?.mediaId
                }
              />
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Sample language is not verified. Catalog tags do not change this recording.'
                )}
              </p>
            </div>
          ))}
      </CollapsibleContent>
    </Collapsible>
  )
}
