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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'

import type { StudioCanvasNode, StudioCanvasNodeData } from './canvas-flow'
import {
  type StudioVisualPreset,
  STUDIO_VISUAL_PRESETS,
  studioApplyVisualPreset,
  studioRemoveVisualPreset,
  studioRestoreVisualPreset,
  studioVisualPresetVersion,
} from './studio-visual-presets'

const presetVideoSchema = z.object({
  url: z.string().regex(/^\/studio-presets\/[a-zA-Z0-9_./-]+\.(mp4|webm)$/),
  model: z.string().min(1),
  modelId: z.string().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  kind: z.enum(['model-output', 'motion-diagram']),
  verification: z.enum(['verified', 'unverified']),
  createdAt: z.string().optional(),
  notes: z.string().optional(),
})
const presetDemoSchema = z.object({
  model: z.string().optional(),
  seed: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  video: presetVideoSchema.optional(),
  modelTest: presetVideoSchema.optional(),
})
export type StudioVisualPresetDemoManifest = Record<
  string,
  z.infer<typeof presetDemoSchema>
>

/** A replacement is previewed before changing an existing direction or style. */
function studioVisualPresetReplacement(
  data: StudioCanvasNodeData,
  preset: StudioVisualPreset,
  presets: StudioVisualPreset[]
) {
  const conflicts = Object.entries(preset.camera).flatMap(([key, value]) => {
    const previous =
      data.camera?.[key as keyof NonNullable<StudioCanvasNodeData['camera']>]
    return previous && previous !== value
      ? [{ key, previous, next: value }]
      : []
  })
  const oldPresets = (data.visualPresetIds || [])
    .map((token) => studioVisualPresetVersion(token, presets))
    .filter(
      (item): item is StudioVisualPreset =>
        !!item &&
        `${item.id}@${item.version}` !== `${preset.id}@${preset.version}` &&
        item.category === preset.category
    )
  let prompt = data.prompt
  for (const previous of oldPresets) {
    if (
      previous.prompt &&
      preset.category === 'style' &&
      prompt.includes(previous.prompt)
    ) {
      conflicts.push({
        key: 'prompt',
        previous: previous.prompt,
        next: preset.prompt,
      })
      prompt = prompt.replaceAll(previous.prompt, '').trim()
    }
  }
  for (const conflict of conflicts) {
    if (conflict.key !== 'prompt' && conflict.previous) {
      prompt = prompt.replaceAll(conflict.previous, '').trim()
    }
  }
  let opposite: RegExp | undefined
  if (preset.id === 'camera-push') {
    opposite =
      /\b(?:static camera|locked-off|dolly out|pull back|zoom out|orbit|tracking shot)\b|固定镜头|拉远|环绕|跟拍/gi
  }
  if (preset.id === 'camera-static') {
    opposite =
      /\b(?:dolly in|dolly out|push in|pull back|zoom in|zoom out|orbit|tracking shot)\b|推进|推近|拉远|环绕|跟拍/gi
  }
  if (preset.id === 'camera-orbit' || preset.id === 'camera-follow') {
    opposite =
      /\b(?:static camera|locked-off|dolly in|dolly out|push in|pull back|zoom in|zoom out)\b|固定镜头|推进|推近|拉远/gi
  }
  if (opposite) {
    const matches = prompt.match(opposite)
    if (matches?.length) {
      conflicts.push({
        key: 'prompt',
        previous: matches.join(' · '),
        next: preset.camera.movement || '',
      })
      prompt = prompt.replace(opposite, '').trim()
    }
  }
  const patch = studioApplyVisualPreset({ ...data, prompt }, preset)
  if (
    preset.category === 'style' ||
    preset.category === 'camera' ||
    preset.category === 'lighting'
  ) {
    patch.visualPresetIds = patch.visualPresetIds?.filter(
      (id) => !oldPresets.some((item) => id === `${item.id}@${item.version}`)
    )
  }
  return { conflicts, patch }
}

export function StudioVisualPresetLibrary(props: {
  node: StudioCanvasNode
  presets: StudioVisualPreset[]
  favorites: string[]
  disabled?: boolean
  demoManifest?: StudioVisualPresetDemoManifest
  onApply: (value: Partial<StudioCanvasNodeData>) => void
  onSave: (presets: StudioVisualPreset[], favorites: string[]) => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState('')
  const [removalDirectionKey, setRemovalDirectionKey] = useState('')
  const [name, setName] = useState('')
  const [personalCategory, setPersonalCategory] =
    useState<StudioVisualPreset['category']>('camera')
  const [personalPrompt, setPersonalPrompt] = useState('')
  const [license, setLicense] = useState('')
  const [editing, setEditing] = useState('')
  const [error, setError] = useState('')
  const [example, setExample] = useState('')
  const [manifest, setManifest] = useState<StudioVisualPresetDemoManifest>({})
  const [demoErrors, setDemoErrors] = useState<string[]>([])
  const [pendingPreset, setPendingPreset] = useState<StudioVisualPreset>()
  const [pendingPrompt, setPendingPrompt] = useState('')
  const [pendingDirectionKey, setPendingDirectionKey] = useState('')
  const directionKey = JSON.stringify([
    props.node.id,
    props.node.data.prompt,
    props.node.data.camera,
    props.node.data.visualPresetIds,
  ])
  const pendingChanged = !!pendingPreset && pendingDirectionKey !== directionKey
  const removalChanged =
    !!pendingRemoval && removalDirectionKey !== directionKey
  const presets = [...STUDIO_VISUAL_PRESETS, ...props.presets]
  const activeManifest = props.demoManifest || manifest
  const applyDisabled =
    props.disabled ||
    props.node.data.locked ||
    ['submitting', 'queued', 'processing'].includes(
      props.node.data.status || ''
    )
  useEffect(() => {
    if (props.demoManifest) return
    const controller = new AbortController()
    fetch('/studio-presets/manifest.json', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return {}
        const parsed = z
          .record(z.string(), presetDemoSchema)
          .safeParse(await response.json())
        return parsed.success ? parsed.data : {}
      })
      .then((value) => {
        if (!controller.signal.aborted) setManifest(value)
      })
      .catch(() => {
        if (!controller.signal.aborted) setManifest({})
      })
    return () => controller.abort()
  }, [props.demoManifest])
  function application(preset: StudioVisualPreset) {
    if (applyDisabled) return
    try {
      const replacement = studioVisualPresetReplacement(
        props.node.data,
        preset,
        presets
      )
      if (replacement.conflicts.length) {
        setPendingPrompt(replacement.patch.prompt || '')
        setPendingDirectionKey(directionKey)
        setPendingPreset(preset)
      } else props.onApply(replacement.patch)
      setError('')
    } catch (problem) {
      setError(String(problem))
    }
  }
  const visiblePresets = presets.filter(
    (preset) =>
      (showArchived ? preset.archived : !preset.archived) &&
      (category === 'all' || preset.category === category) &&
      (!onlyFavorites || props.favorites.includes(preset.id)) &&
      [preset.name, t(preset.name), preset.description, t(preset.description)]
        .join(' ')
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase())
  )
  return (
    <div className='flex flex-col gap-3 rounded-lg border p-3'>
      <h3 className='font-medium'>
        {t('Camera, lighting and visual presets')}
      </h3>
      <p className='text-muted-foreground text-xs'>
        {t(
          'These are composition examples. Applying a preset edits the draft; generation still requires confirmation.'
        )}
      </p>
      {props.node.data.locked && (
        <p role='status' className='text-muted-foreground text-sm'>
          {t('This shot is locked. Unlock it before applying visual changes.')}
        </p>
      )}
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
        <Button
          size='sm'
          variant='outline'
          aria-pressed={showArchived}
          onClick={() => setShowArchived(!showArchived)}
        >
          {t('Archived presets')}
        </Button>
      </div>
      {!!props.node.data.visualPresetIds?.length && (
        <section
          aria-label={t('Applied visual presets')}
          className='flex flex-col gap-2'
        >
          <p className='text-sm font-medium'>{t('Applied visual presets')}</p>
          {props.node.data.visualPresetIds.map((token) => {
            const fixed = studioVisualPresetVersion(token, presets)
            return (
              <div
                key={token}
                className='flex items-center justify-between gap-2 text-sm'
              >
                <span>
                  {fixed ? `${t(fixed.name)} · v${fixed.version}` : token}
                </span>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={applyDisabled}
                  aria-label={t('Remove applied preset: {{name}}', {
                    name: fixed ? t(fixed.name) : token,
                  })}
                  onClick={() => {
                    setPendingRemoval(token)
                    setRemovalDirectionKey(directionKey)
                  }}
                >
                  {t('Remove from this shot')}
                </Button>
              </div>
            )
          })}
        </section>
      )}
      <div className='flex max-h-96 flex-col gap-3 overflow-auto'>
        {!visiblePresets.length && (
          <p role='status' className='text-muted-foreground text-sm'>
            {t(
              'No presets match these filters. Clear the search or choose another category.'
            )}
          </p>
        )}
        {visiblePresets.map((preset) => {
          const demo = activeManifest[preset.id]
          const playable = demo?.video && !demoErrors.includes(preset.id)
          const verifiedModel =
            playable &&
            demo.video?.kind === 'model-output' &&
            demo.video.verification === 'verified' &&
            demo.video.modelId === props.node.data.model
          return (
            <div key={preset.id} className='flex flex-col gap-2 border-b pb-3'>
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
                  <Badge variant='outline'>
                    {playable
                      ? t('Playable demo available')
                      : t('Motion demonstration not verified')}
                  </Badge>
                  {verifiedModel && (
                    <Badge variant='secondary'>
                      {t('Demonstrated with the selected model')}
                    </Badge>
                  )}
                </div>
              </div>
              <p className='text-muted-foreground text-xs'>
                {preset.category === 'camera' &&
                  t(
                    'Use one clear subject and enough space for the movement. A prompt preset does not reproduce an exact 3D camera path.'
                  )}
                {preset.category === 'lighting' &&
                  t(
                    'Use a readable subject reference. This changes the lighting direction; check skin, material and brand colors in the actual Take.'
                  )}
                {preset.category === 'style' &&
                  t(
                    'Use when the whole shot should share this visual style. Existing style directions will be reviewed before replacement.'
                  )}
                {preset.category === 'effect' &&
                  t(
                    'Use subtle effects around the subject. Check face, product and caption visibility in the actual Take.'
                  )}
              </p>
              {!verifiedModel && (
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'This preset has not been demonstrated with the currently selected model. Test a key shot before making the full sequence.'
                  )}
                </p>
              )}
              {example === preset.id && (
                <div className='flex flex-col gap-2'>
                  {playable && demo.video && (
                    <>
                      <video
                        controls
                        preload='metadata'
                        src={demo.video.url}
                        aria-label={t('Preset motion demo: {{name}}', {
                          name: t(preset.name),
                        })}
                        className='aspect-video w-full rounded'
                        onError={() =>
                          setDemoErrors((current) => [
                            ...new Set([...current, preset.id]),
                          ])
                        }
                      />
                      <p className='text-muted-foreground text-xs'>
                        {demo.video.model} ·{' '}
                        {demo.video.kind === 'model-output'
                          ? t('Model-generated demonstration')
                          : t('Motion diagram; not a model output')}{' '}
                        ·{' '}
                        {demo.video.verification === 'verified'
                          ? t('This sample was reviewed')
                          : t('Sample awaits review')}
                      </p>
                      {demo.video.notes && (
                        <p className='text-muted-foreground text-xs'>
                          {demo.video.notes}
                        </p>
                      )}
                    </>
                  )}
                  {demoErrors.includes(preset.id) && (
                    <p role='alert' className='text-destructive text-sm'>
                      {t(
                        'The motion demo could not be played. Verification remains unavailable; you can still inspect the parameters.'
                      )}
                    </p>
                  )}
                  {demo?.modelTest && (
                    <details className='text-muted-foreground text-xs'>
                      <summary className='cursor-pointer'>
                        {t('Inspect actual model test')}
                      </summary>
                      {demo.modelTest.verification === 'unverified' && (
                        <p>
                          {t(
                            'The recorded model test did not pass. A controlled illustration does not verify the model.'
                          )}
                        </p>
                      )}
                      <video
                        controls
                        playsInline
                        preload='none'
                        src={demo.modelTest.url}
                        aria-label={t('Recorded model test: {{name}}', {
                          name: t(preset.name),
                        })}
                        className='aspect-video w-full rounded'
                      />
                      <p>
                        {demo.modelTest.model} · {demo.modelTest.notes}
                      </p>
                    </details>
                  )}
                  <a
                    href='/studio-presets/manifest.json'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-primary text-xs underline'
                  >
                    {demo?.model || t('View demo provenance')}{' '}
                    {demo?.width && demo?.height
                      ? `· ${demo.width}×${demo.height}`
                      : ''}
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
                  disabled={applyDisabled || preset.archived}
                  onClick={() => application(preset)}
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
                      onClick={() =>
                        props.onSave(
                          props.presets.map((item) =>
                            item.id === preset.id
                              ? { ...item, archived: !item.archived }
                              : item
                          ),
                          props.favorites
                        )
                      }
                    >
                      {t(
                        preset.archived
                          ? 'Restore archived preset'
                          : 'Archive preset'
                      )}
                    </Button>
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
                          try {
                            props.onSave(
                              props.presets.map((item) =>
                                item.id === preset.id
                                  ? studioRestoreVisualPreset(item)
                                  : item
                              ),
                              props.favorites
                            )
                            setError('')
                          } catch {
                            setError(
                              t(
                                'Preset history is full. Save these settings as a new preset.'
                              )
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
          )
        })}
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
          if (
            previous &&
            (previous.history.length >= 20 || previous.version >= 10000)
          ) {
            setError(
              t('Preset history is full. Save these settings as a new preset.')
            )
            return
          }
          const preset: StudioVisualPreset = {
            id: previous?.id || crypto.randomUUID(),
            archived: previous?.archived,
            category: personalCategory,
            name: name.trim(),
            description: 'Personal project preset',
            camera: { ...props.node.data.camera },
            prompt: personalPrompt,
            license: license.trim(),
            version: (previous?.version || 0) + 1,
            history: previous
              ? [
                  ...previous.history,
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
          setError('')
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
      <ConfirmDialog
        open={!!pendingRemoval}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval('')
        }}
        title={t('Remove this preset from the shot?')}
        desc={t(
          'Only the exact matching values listed below will be removed. Manual changes, shared settings, source media and historical Takes are retained. Review the prompt before confirming.'
        )}
        cancelBtnText={t('Keep preset')}
        confirmText={t('Remove preset settings')}
        disabled={!!applyDisabled || removalChanged}
        handleConfirm={() => {
          if (!pendingRemoval || applyDisabled || removalChanged) return
          props.onApply(
            studioRemoveVisualPreset(props.node.data, pendingRemoval, presets)
              .patch
          )
          setPendingRemoval('')
        }}
      >
        {removalChanged && (
          <p role='alert'>
            {t(
              'The shot changed while you were reviewing. Keep the current direction and reopen the preset to review the latest draft.'
            )}
          </p>
        )}
        {pendingRemoval && (
          <div className='flex flex-col gap-2 text-sm'>
            {studioRemoveVisualPreset(props.node.data, pendingRemoval, presets)
              .changes.length ? (
              <dl>
                {studioRemoveVisualPreset(
                  props.node.data,
                  pendingRemoval,
                  presets
                ).changes.map((change) => (
                  <div key={change.field}>
                    <dt>{change.field}</dt>
                    <dd>{change.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>
                {t(
                  'No matching draft values will be cleared. Only the applied preset link will be removed.'
                )}
              </p>
            )}
            <p>{t('Prompt after removal')}</p>
            <pre className='max-h-48 overflow-auto whitespace-pre-wrap'>
              {
                studioRemoveVisualPreset(
                  props.node.data,
                  pendingRemoval,
                  presets
                ).patch.prompt
              }
            </pre>
          </div>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!pendingPreset}
        onOpenChange={(open) => {
          if (!open) setPendingPreset(undefined)
        }}
        title={t('Choose one visual direction')}
        desc={t(
          'This preset changes an existing direction. Review the replacement below, or keep your current settings. Source media and selected Takes are retained.'
        )}
        cancelBtnText={t('Keep current direction')}
        confirmText={t('Replace conflicting settings')}
        disabled={
          !!applyDisabled || pendingPrompt.length > 30000 || pendingChanged
        }
        handleConfirm={() => {
          if (!pendingPreset || applyDisabled || pendingChanged) return
          try {
            const replacement = studioVisualPresetReplacement(
              props.node.data,
              pendingPreset,
              presets
            )
            props.onApply({ ...replacement.patch, prompt: pendingPrompt })
            setPendingPreset(undefined)
            setError('')
          } catch (problem) {
            setError(String(problem))
          }
        }}
      >
        {pendingPreset && (
          <div className='flex flex-col gap-3'>
            {pendingChanged && (
              <p role='alert' className='text-destructive text-sm'>
                {t(
                  'The shot changed while you were reviewing. Keep the current direction and reopen the preset to review the latest draft.'
                )}
              </p>
            )}
            <dl className='flex flex-col gap-2 text-sm'>
              {studioVisualPresetReplacement(
                props.node.data,
                pendingPreset,
                presets
              ).conflicts.map((conflict) => (
                <div
                  key={`${conflict.key}-${conflict.previous}-${conflict.next}`}
                >
                  <dt>{conflict.key}</dt>
                  <dd>
                    {conflict.previous} → {conflict.next}
                  </dd>
                </div>
              ))}
            </dl>
            <label className='text-sm'>
              {t('Prompt after replacement')}
              <Textarea
                aria-label={t('Prompt after replacement')}
                value={pendingPrompt}
                maxLength={30000}
                onChange={(event) => setPendingPrompt(event.target.value)}
              />
            </label>
          </div>
        )}
      </ConfirmDialog>
    </div>
  )
}
