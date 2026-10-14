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

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import { StudioMotionGraphics } from './studio-motion-graphics'
import {
  studioProductionSchema,
  studioSeriesVersionSchema,
  type StudioSeriesVersion,
} from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import {
  applyStudioSeriesTranslation,
  createStudioSeriesTranslation,
  createStudioRegionalVersion,
  studioSeriesRenderPlan,
} from './studio-series'
import { parseStudioSubtitleCues } from './studio-subtitle-cues'

export function StudioSeriesPanel() {
  const { t } = useTranslation()
  const {
    props,
    writable,
    mutate,
    path,
    jobs,
    download,
    budget,
    setBudget,
    confirm,
    setConfirm,
    capabilities,
  } = useStudioProductionContext()
  const production =
    props.project.production || studioProductionSchema.parse({})
  const latest = useRef(props.project)
  latest.current = props.project
  const [title, setTitle] = useState('')
  const [shotIds, setShotIds] = useState<string[]>([])
  const [episodeId, setEpisodeId] = useState(production.episodes[0]?.id || '')
  const [language, setLanguage] = useState('en')
  const [region, setRegion] = useState('')
  const [versionId, setVersionId] = useState(
    production.regionalVersions[0]?.id || ''
  )
  const [audioId, setAudioId] = useState('')
  const [model, setModel] = useState('qwen3.5:9b')
  const [removeEpisode, setRemoveEpisode] = useState(false)
  const [error, setError] = useState('')
  const episode = production.episodes.find((item) => item.id === episodeId)
  const version = production.regionalVersions.find(
    (item) => item.id === versionId
  )
  const audio = props.project.nodes.filter(
    (node) => node.data.kind === 'audio' && node.data.mediaId
  )
  const update = (patch: Partial<StudioSeriesVersion>) => {
    if (!writable || !version) return
    const parsed = studioSeriesVersionSchema.safeParse({ ...version, ...patch })
    if (!parsed.success) {
      setError(
        t(
          'Enter a valid version title, export size, frame rate and audio settings'
        )
      )
      return
    }
    setError('')
    props.onUpdate({
      ...props.project,
      production: {
        ...production,
        regionalVersions: production.regionalVersions.map((item) =>
          item.id === versionId ? parsed.data : item
        ),
      },
    })
  }
  const active =
    jobs.data?.filter(
      (job) =>
        job.kind === 'render' &&
        ['queued', 'running', 'waiting'].includes(job.status)
    ) || []
  const delivered =
    jobs.data?.filter(
      (job) =>
        job.kind === 'render' &&
        job.status === 'succeeded' &&
        (job.result as { variant_id?: string })?.variant_id
    ) || []
  return (
    <fieldset
      className='space-y-4 border-b pb-4'
      disabled={mutate.isPending}
      aria-busy={mutate.isPending}
    >
      <p className='font-medium'>{t('Episodes and regional versions')}</p>
      {error && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
      <p className='text-muted-foreground text-sm'>
        {t(
          'Episodes share this project’s character, scene and style library. Each regional version keeps its own pinned video Takes, subtitles, soundtrack and export size.'
        )}
      </p>
      <Field>
        <FieldLabel>{t('New episode title')}</FieldLabel>
        <Input
          aria-label={t('New episode title')}
          disabled={!writable}
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>
      <fieldset className='space-y-2'>
        <legend className='text-sm'>{t('Shots in this episode')}</legend>
        {props.project.shots?.map((shot) => (
          <label key={shot.id} className='flex items-center gap-2 text-sm'>
            <Checkbox
              disabled={!writable}
              checked={shotIds.includes(shot.id)}
              onCheckedChange={(checked) =>
                setShotIds((ids) =>
                  checked
                    ? [...new Set([...ids, shot.id])]
                    : ids.filter((id) => id !== shot.id)
                )
              }
            />
            {shot.title || t('Untitled shot')}
          </label>
        ))}
      </fieldset>
      <Button
        variant='outline'
        disabled={
          !writable ||
          !title.trim() ||
          !shotIds.length ||
          production.episodes.length >= 100
        }
        onClick={() => {
          const id = crypto.randomUUID()
          props.onUpdate({
            ...props.project,
            production: {
              ...production,
              episodes: [
                ...production.episodes,
                { id, title: title.trim(), synopsis: '', shotIds },
              ],
            },
          })
          setEpisodeId(id)
          setTitle('')
          setShotIds([])
        }}
      >
        {t('Create episode')}
      </Button>
      <div className='grid gap-3 sm:grid-cols-3'>
        <Field>
          <FieldLabel>{t('Episode')}</FieldLabel>
          <Select
            value={episodeId}
            onValueChange={(value) => setEpisodeId(value || '')}
          >
            <SelectTrigger aria-label={t('Episode')}>
              <SelectValue>{episode?.title}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {production.episodes.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>{t('Target language code')}</FieldLabel>
          <Input
            aria-label={t('Target language code')}
            disabled={!writable}
            value={language}
            maxLength={40}
            onChange={(event) => setLanguage(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>{t('Region')}</FieldLabel>
          <Input
            aria-label={t('Region')}
            disabled={!writable}
            value={region}
            maxLength={100}
            onChange={(event) => setRegion(event.target.value)}
          />
        </Field>
      </div>
      <Button
        variant='outline'
        disabled={
          !writable ||
          !episode ||
          !/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(language) ||
          production.regionalVersions.length >= 100 ||
          mutate.isPending
        }
        onClick={() =>
          mutate.mutate(async () => {
            if (!episode) return
            const sourceSnapshot = JSON.stringify(props.project)
            const created = await createStudioRegionalVersion(
              props.project,
              episode.id,
              language,
              region,
              (id) =>
                studioCloudRequest(
                  `/media/${encodeURIComponent(id)}/probe?project_id=${encodeURIComponent(props.project.id)}`
                )
            )
            const id = created.id
            if (JSON.stringify(latest.current) !== sourceSnapshot) {
              throw new Error(
                t(
                  'Project changed while preparing this version; create it again'
                )
              )
            }
            props.onUpdate({
              ...latest.current,
              production: {
                ...production,
                regionalVersions: [...production.regionalVersions, created],
              },
            })
            setVersionId(id)
            await props.onSave()
          })
        }
      >
        {t('Create regional version')}
      </Button>
      {episode && (
        <div className='space-y-2'>
          <Field>
            <FieldLabel>{t('Episode title')}</FieldLabel>
            <Input
              key={`${episode.id}:${episode.title}`}
              aria-label={t('Episode title')}
              defaultValue={episode.title}
              maxLength={200}
              disabled={!writable}
              onBlur={(event) => {
                const title = event.target.value.trim()
                if (title) {
                  props.onUpdate({
                    ...props.project,
                    production: {
                      ...production,
                      episodes: production.episodes.map((item) =>
                        item.id === episode.id ? { ...item, title } : item
                      ),
                    },
                  })
                } else event.target.value = episode.title
              }}
            />
          </Field>
          <Field>
            <FieldLabel>{t('Episode synopsis')}</FieldLabel>
            <Textarea
              aria-label={t('Episode synopsis')}
              value={episode.synopsis}
              maxLength={30000}
              disabled={!writable}
              onChange={(event) =>
                props.onUpdate({
                  ...props.project,
                  production: {
                    ...production,
                    episodes: production.episodes.map((item) =>
                      item.id === episode.id
                        ? { ...item, synopsis: event.target.value }
                        : item
                    ),
                  },
                })
              }
            />
          </Field>
          <Button
            variant='outline'
            disabled={!writable || !shotIds.length}
            onClick={() =>
              props.onUpdate({
                ...props.project,
                production: {
                  ...production,
                  episodes: production.episodes.map((item) =>
                    item.id === episode.id ? { ...item, shotIds } : item
                  ),
                },
              })
            }
          >
            {t('Use selected shots in this episode')}
          </Button>
          <Button
            variant='outline'
            disabled={!writable}
            onClick={() => setRemoveEpisode(true)}
          >
            {t('Remove episode')}
          </Button>
          <ConfirmDialog
            open={removeEpisode}
            onOpenChange={setRemoveEpisode}
            title={t('Remove episode')}
            desc={t(
              'Remove this episode and its regional version entries? Stored source media and project history remain available.'
            )}
            destructive
            confirmText={t('Remove episode')}
            handleConfirm={() => {
              props.onUpdate({
                ...props.project,
                production: {
                  ...production,
                  episodes: production.episodes.filter(
                    (item) => item.id !== episode.id
                  ),
                  regionalVersions: production.regionalVersions.filter(
                    (item) => item.episodeId !== episode.id
                  ),
                },
              })
              setEpisodeId('')
              setVersionId('')
              setRemoveEpisode(false)
            }}
          />
        </div>
      )}
      {production.regionalVersions.length > 0 && (
        <Field>
          <FieldLabel>{t('Regional version')}</FieldLabel>
          <Select
            value={versionId}
            onValueChange={(value) => setVersionId(value || '')}
          >
            <SelectTrigger aria-label={t('Regional version')}>
              <SelectValue>{version?.title}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {production.regionalVersions.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      {version && (
        <>
          <Field>
            <FieldLabel>{t('Version title')}</FieldLabel>
            <Input
              aria-label={t('Version title')}
              key={`${version.id}:${version.title}`}
              defaultValue={version.title}
              maxLength={200}
              disabled={!writable}
              onBlur={(event) => update({ title: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>{t('Version subtitles')}</FieldLabel>
            <Textarea
              aria-label={t('Version subtitles')}
              value={version.subtitles}
              maxLength={100000}
              rows={6}
              disabled={!writable}
              onChange={(event) => update({ subtitles: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>{t('Translation model')}</FieldLabel>
            <Input
              aria-label={t('Translation model')}
              value={model}
              maxLength={200}
              onChange={(event) => setModel(event.target.value)}
            />
          </Field>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Review subtitles and choose a generation budget before translating. Longer subtitles are split into resumable drafts.'
            )}
          </p>
          <Field>
            <FieldLabel>{t('studio.production.budget')}</FieldLabel>
            <Input
              aria-label={t('studio.production.budget')}
              type='number'
              min={0.01}
              max={4000}
              disabled={!writable || mutate.isPending}
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
            />
          </Field>
          <label className='flex items-center gap-2 text-sm'>
            <Checkbox
              disabled={!writable || mutate.isPending}
              checked={confirm}
              onCheckedChange={(checked) => setConfirm(checked === true)}
            />
            {t('studio.production.confirm')}
          </label>
          <Button
            variant='outline'
            disabled={
              !writable ||
              mutate.isPending ||
              !confirm ||
              capabilities.data?.generation_credit_available !== true ||
              Number(budget) <= 0 ||
              !version.subtitles.trim() ||
              !model.trim()
            }
            onClick={() =>
              mutate.mutate(async () => {
                const prepared = createStudioSeriesTranslation(
                  props.project,
                  version.id,
                  model
                )
                props.onUpdate(prepared.project)
                await props.onSave()
                const current =
                  await studioCloudRequest<StudioCloudProject>(path)
                await studioCloudRequest(`${path}/jobs`, 'POST', {
                  request_id: crypto.randomUUID(),
                  kind: 'generate',
                  revision: current.revision,
                  budget: Math.round(
                    Number(budget) *
                      (capabilities.data?.quota_per_unit || 500000)
                  ),
                  confirm_generation: true,
                  node_ids: prepared.nodeIds,
                })
              })
            }
          >
            {t('Create subtitle translation draft')}
          </Button>
          <Button
            variant='outline'
            disabled={
              !writable || mutate.isPending || !version.translationNodes.length
            }
            onClick={() =>
              mutate.mutate(async () => {
                props.onUpdate(
                  applyStudioSeriesTranslation(props.project, version.id)
                )
                await props.onSave()
              })
            }
          >
            {t('Apply reviewed subtitle translation')}
          </Button>
          <div className='grid gap-3 sm:grid-cols-3'>
            {(['width', 'height', 'fps'] as const).map((key) => (
              <Field key={key}>
                <FieldLabel>{t(`Version ${key}`)}</FieldLabel>
                <Input
                  aria-label={t(`Version ${key}`)}
                  type='number'
                  key={`${version.id}-${key}-${version[key]}`}
                  defaultValue={version[key]}
                  disabled={!writable}
                  min={key === 'fps' ? 12 : 64}
                  max={key === 'fps' ? 60 : 4096}
                  onBlur={(event) => {
                    const value = Number(event.target.value)
                    const min = key === 'fps' ? 12 : 64,
                      max = key === 'fps' ? 60 : 4096
                    if (
                      !Number.isInteger(value) ||
                      value < min ||
                      value > max ||
                      (key !== 'fps' && value % 2)
                    ) {
                      event.target.value = String(version[key])
                      setError(
                        t(
                          'Choose even export dimensions and a frame rate from 12 to 60'
                        )
                      )
                      return
                    }
                    update({ [key]: value })
                  }}
                />
              </Field>
            ))}
          </div>
          <Field>
            <FieldLabel>{t('Version audio source')}</FieldLabel>
            <Select
              value={audioId}
              onValueChange={(value) => setAudioId(value || '')}
            >
              <SelectTrigger aria-label={t('Version audio source')}>
                <SelectValue>
                  {audio.find((node) => node.id === audioId)?.data.title ||
                    t('Choose a stored audio track')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {audio.map((node) => (
                  <SelectItem key={node.id} value={node.id}>
                    {node.data.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button
            variant='outline'
            disabled={
              !writable || !audioId || version.audioTracks.length >= 100
            }
            onClick={() => {
              const source = audio.find((node) => node.id === audioId)
              if (source?.data.mediaId) {
                update({
                  audioTracks: [
                    ...version.audioTracks,
                    {
                      id: crypto.randomUUID(),
                      mediaId: source.data.mediaId,
                      start: 0,
                      offset: 0,
                      volume: 1,
                    },
                  ],
                })
              }
            }}
          >
            {t('Add audio to this version')}
          </Button>
          {version.audioTracks.map((track) => (
            <div key={track.id} className='grid gap-2 sm:grid-cols-4'>
              <span className='text-sm'>
                {audio.find((node) => node.data.mediaId === track.mediaId)?.data
                  .title || t('Stored audio track')}
              </span>
              {(['start', 'offset', 'volume'] as const).map((key) => (
                <Input
                  aria-label={t(`Version audio ${key}`)}
                  type='number'
                  min={0}
                  max={key === 'volume' ? 1 : 3600}
                  step={0.1}
                  key={`${version.id}-${track.id}-${key}-${track[key]}`}
                  defaultValue={track[key]}
                  disabled={!writable}
                  onBlur={(event) =>
                    update({
                      audioTracks: version.audioTracks.map((item) =>
                        item.id === track.id
                          ? { ...item, [key]: Number(event.target.value) }
                          : item
                      ),
                    })
                  }
                />
              ))}
              <Button
                variant='ghost'
                size='sm'
                disabled={!writable}
                onClick={() =>
                  update({
                    audioTracks: version.audioTracks.filter(
                      (item) => item.id !== track.id
                    ),
                  })
                }
              >
                {t('Remove version audio')}
              </Button>
            </div>
          ))}
          <p className='text-muted-foreground text-xs'>
            {t(
              'Regional delivery uses only the audio tracks you add here. Add the translated dialogue from the media tools, then preview the exported film.'
            )}
          </p>
          <StudioMotionGraphics key={version.id} versionId={version.id} />
        </>
      )}
      <Button
        disabled={
          !writable ||
          mutate.isPending ||
          active.length > 0 ||
          !production.regionalVersions.length
        }
        onClick={() =>
          mutate.mutate(async () => {
            await props.onSave()
            const current = await studioCloudRequest<StudioCloudProject>(path)
            for (const item of current.document.production?.regionalVersions ||
              []) {
              parseStudioSubtitleCues(item.subtitles)
              const plan = studioSeriesRenderPlan(current.document, item)
              const digest = await crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(
                  JSON.stringify([current.id, current.revision, plan])
                )
              )
              const key = [...new Uint8Array(digest)]
                .map((byte) => byte.toString(16).padStart(2, '0'))
                .join('')
              await studioCloudRequest(`${path}/jobs`, 'POST', {
                request_id: `regional-${key}`,
                kind: 'render',
                revision: current.revision,
                budget: 0,
                node_ids: [],
                render: plan,
              })
            }
          })
        }
      >
        {t('Render all regional delivery packages')}
      </Button>
      {delivered.map((job) => {
        const result = job.result as {
          delivery_label?: string
          variant_id: string
          media_id?: string
          package_media_id?: string
        }
        return (
          <div
            key={job.id}
            className='flex flex-wrap items-center gap-2 text-sm'
          >
            <span>
              {result.delivery_label ||
                production.regionalVersions.find(
                  (item) => item.id === result.variant_id
                )?.title}
            </span>
            {result.media_id && (
              <Button
                variant='outline'
                size='sm'
                onClick={() =>
                  mutate.mutate(() =>
                    download(
                      result.media_id || '',
                      `${result.delivery_label || 'version'}.mp4`
                    )
                  )
                }
              >
                {t('Download film')}
              </Button>
            )}
            {result.package_media_id && (
              <Button
                variant='outline'
                size='sm'
                onClick={() =>
                  mutate.mutate(() =>
                    download(
                      result.package_media_id || '',
                      `${result.delivery_label || 'version'}.zip`
                    )
                  )
                }
              >
                {t('Download delivery package')}
              </Button>
            )}
          </div>
        )
      })}
    </fieldset>
  )
}
