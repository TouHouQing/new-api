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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'

import type { StudioCanvasNode, StudioCanvasNodeData } from './canvas-flow'
import {
  type StudioVisualPreset,
  STUDIO_VISUAL_PRESETS,
  studioApplyVisualPreset,
} from './studio-visual-presets'

export function StudioVisualPresetLibrary(props: {
  node: StudioCanvasNode
  presets: StudioVisualPreset[]
  favorites: string[]
  disabled?: boolean
  onApply: (value: Partial<StudioCanvasNodeData>) => void
  onSave: (presets: StudioVisualPreset[], favorites: string[]) => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [name, setName] = useState('')
  const [personalCategory, setPersonalCategory] =
    useState<StudioVisualPreset['category']>('camera')
  const [personalPrompt, setPersonalPrompt] = useState('')
  const [license, setLicense] = useState('')
  const [editing, setEditing] = useState('')
  const [error, setError] = useState('')
  const [example, setExample] = useState('')
  const presets = [...STUDIO_VISUAL_PRESETS, ...props.presets]
  const visiblePresets = presets.filter(
    (preset) =>
      (category === 'all' || preset.category === category) &&
      (!onlyFavorites || props.favorites.includes(preset.id)) &&
      [preset.name, t(preset.name), preset.description, t(preset.description)]
        .join(' ')
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase())
  )
  return (
    <div className='space-y-3 rounded-lg border p-3'>
      <h3 className='font-medium'>
        {t('Camera, lighting and visual presets')}
      </h3>
      <p className='text-muted-foreground text-xs'>
        {t(
          'These are composition examples. Applying a preset edits the draft; generation still requires confirmation.'
        )}
      </p>
      <Input
        aria-label={t('Search visual presets')}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className='flex flex-wrap gap-2'>
        <NativeSelect
          aria-label={t('Preset category')}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {['all', 'camera', 'lighting', 'style', 'effect'].map((item) => (
            <NativeSelectOption key={item} value={item}>
              {t(`studio.preset.${item}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          size='sm'
          variant='outline'
          aria-pressed={onlyFavorites}
          onClick={() => setOnlyFavorites(!onlyFavorites)}
        >
          {t('Favorites')}
        </Button>
      </div>
      <div className='max-h-80 space-y-3 overflow-auto'>
        {!visiblePresets.length && (
          <p role='status' className='text-muted-foreground text-sm'>
            {t(
              'No presets match these filters. Clear the search or choose another category.'
            )}
          </p>
        )}
        {visiblePresets.map((preset) => (
          <div key={preset.id} className='space-y-2 border-b pb-3'>
            <div className='flex items-center gap-3'>
              {STUDIO_VISUAL_PRESETS.some((item) => item.id === preset.id) ? (
                <Button
                  variant='ghost'
                  onClick={() =>
                    setExample(example === preset.id ? '' : preset.id)
                  }
                  aria-label={t('Compare preset example: {{name}}', {
                    name: t(preset.name),
                  })}
                  className='h-auto shrink-0 p-0'
                >
                  <img
                    src={`/studio-presets/${preset.id}.webp`}
                    alt={t(preset.name)}
                    loading='lazy'
                    className='h-20 w-32 rounded object-cover'
                  />
                </Button>
              ) : (
                <svg
                  viewBox='0 0 120 70'
                  className='bg-muted h-16 w-28 shrink-0 rounded'
                  role='img'
                  aria-label={t('Composition example')}
                >
                  <rect
                    x='12'
                    y='10'
                    width='96'
                    height='50'
                    fill='none'
                    stroke='currentColor'
                  />
                  <circle
                    cx='60'
                    cy='30'
                    r='8'
                    fill={
                      preset.category === 'lighting' ? '#f59e0b' : '#64748b'
                    }
                  />
                  <path
                    d='M45 53 Q60 30 75 53 M20 60 L45 48 M100 60 L75 48'
                    fill='none'
                    stroke='currentColor'
                  />
                  {preset.camera.movement?.includes('orbit') && (
                    <ellipse
                      cx='60'
                      cy='50'
                      rx='30'
                      ry='8'
                      fill='none'
                      stroke='#3b82f6'
                      strokeDasharray='3 2'
                    />
                  )}
                  {preset.category === 'lighting' && (
                    <path d='M10 5 L52 23 M13 12 L50 27' stroke='#f59e0b' />
                  )}
                </svg>
              )}
              <div>
                <p className='text-sm font-medium'>
                  {t(preset.name)} · v{preset.version}
                </p>
                <p className='text-muted-foreground text-xs'>
                  {t(preset.description)}
                </p>
              </div>
            </div>
            {example === preset.id && (
              <div className='space-y-2'>
                <a
                  href='/studio-presets/manifest.json'
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-primary text-xs underline'
                >
                  FLUX.2 Klein 4B · 512×320 · seed 47
                </a>
                <div className='grid grid-cols-2 gap-2'>
                  <figure>
                    <img
                      src='/studio-presets/baseline.webp'
                      alt={t('Base composition')}
                      className='w-full rounded'
                    />
                    <figcaption className='text-xs'>
                      {t('Base composition')}
                    </figcaption>
                  </figure>
                  <figure>
                    <img
                      src={`/studio-presets/${preset.id}.webp`}
                      alt={t(preset.name)}
                      className='w-full rounded'
                    />
                    <figcaption className='text-xs'>
                      {t(preset.name)}
                    </figcaption>
                  </figure>
                </div>
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Real local FLUX examples with the same prompt subject and seed. These still frames illustrate composition and style; camera movement must be checked in the resulting video.'
                  )}
                </p>
              </div>
            )}
            <details className='text-muted-foreground text-xs'>
              <summary>{t('Parameters and commercial use')}</summary>
              <p>
                {Object.values(preset.camera).join(' · ')} {preset.prompt}
              </p>
              <p>{t(preset.license)}</p>
            </details>
            <div className='flex flex-wrap gap-2'>
              <Button
                size='sm'
                disabled={props.disabled}
                onClick={() => {
                  try {
                    props.onApply(
                      studioApplyVisualPreset(props.node.data, preset)
                    )
                    setError('')
                  } catch (problem) {
                    setError(String(problem))
                  }
                }}
              >
                {t('Apply preset')}
              </Button>
              <Button
                size='sm'
                variant='outline'
                aria-pressed={props.favorites.includes(preset.id)}
                disabled={props.disabled}
                onClick={() =>
                  props.onSave(
                    props.presets,
                    props.favorites.includes(preset.id)
                      ? props.favorites.filter((id) => id !== preset.id)
                      : [...props.favorites, preset.id]
                  )
                }
              >
                {t('Favorite')}
              </Button>
              {props.presets.some((item) => item.id === preset.id) && (
                <>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={props.disabled}
                    onClick={() => {
                      setEditing(preset.id)
                      setName(preset.name)
                      setLicense(preset.license)
                      setPersonalCategory(preset.category)
                      setPersonalPrompt(preset.prompt)
                    }}
                  >
                    {t('Update from current settings')}
                  </Button>
                  {!!preset.history.length && (
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={props.disabled}
                      onClick={() => {
                        const previous = preset.history.at(-1)
                        if (previous) {
                          props.onSave(
                            props.presets.map((item) =>
                              item.id === preset.id
                                ? {
                                    ...item,
                                    ...previous,
                                    history: item.history.slice(0, -1),
                                  }
                                : item
                            ),
                            props.favorites
                          )
                        }
                      }}
                    >
                      {t('Restore previous preset version')}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <NativeSelect
        aria-label={t('Personal preset category')}
        value={personalCategory}
        disabled={props.disabled}
        onChange={(event) =>
          setPersonalCategory(
            event.target.value as StudioVisualPreset['category']
          )
        }
      >
        {(['camera', 'lighting', 'style', 'effect'] as const).map((item) => (
          <NativeSelectOption key={item} value={item}>
            {t(`studio.preset.${item}`)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {['style', 'effect'].includes(personalCategory) && (
        <Textarea
          aria-label={t('Personal visual preset description')}
          maxLength={2000}
          value={personalPrompt}
          disabled={props.disabled}
          onChange={(event) => setPersonalPrompt(event.target.value)}
        />
      )}
      <Input
        aria-label={t('Personal preset name')}
        placeholder={t('Personal preset name')}
        value={name}
        maxLength={100}
        disabled={props.disabled}
        onChange={(event) => setName(event.target.value)}
      />
      <Input
        aria-label={t('Preset commercial use note')}
        placeholder={t('Preset commercial use note')}
        value={license}
        maxLength={1000}
        disabled={props.disabled}
        onChange={(event) => setLicense(event.target.value)}
      />
      <Button
        size='sm'
        variant='outline'
        disabled={
          props.disabled ||
          !name.trim() ||
          !license.trim() ||
          (['style', 'effect'].includes(personalCategory) &&
            !personalPrompt.trim()) ||
          (!editing && props.presets.length >= 50)
        }
        onClick={() => {
          const previous = props.presets.find((item) => item.id === editing)
          const preset: StudioVisualPreset = {
            id: previous?.id || crypto.randomUUID(),
            category: personalCategory,
            name: name.trim(),
            description: 'Personal project preset',
            camera: { ...props.node.data.camera },
            prompt: personalPrompt,
            license: license.trim(),
            version: (previous?.version || 0) + 1,
            history: previous
              ? [
                  ...previous.history.slice(-19),
                  {
                    version: previous.version,
                    category: previous.category,
                    name: previous.name,
                    description: previous.description,
                    camera: previous.camera,
                    prompt: previous.prompt,
                    license: previous.license,
                  },
                ]
              : [],
          }
          props.onSave(
            [...props.presets.filter((item) => item.id !== preset.id), preset],
            props.favorites
          )
          setName('')
          setLicense('')
          setEditing('')
        }}
      >
        {t(
          editing ? 'Save preset revision' : 'Save current settings as preset'
        )}
      </Button>
      {editing && (
        <Button
          size='sm'
          variant='ghost'
          onClick={() => {
            setEditing('')
            setName('')
            setLicense('')
          }}
        >
          {t('Cancel')}
        </Button>
      )}
      {error && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
    </div>
  )
}
