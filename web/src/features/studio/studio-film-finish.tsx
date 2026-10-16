/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { ALL_FORMATS, BlobSource, Input as MediaInput } from 'mediabunny'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { handleServerError } from '@/lib/handle-server-error'

import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import {
  studioDialogueTiming,
  studioFilmFindings,
} from './studio-creative-plan'
import { studioProductionSchema } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import { StudioQualityReport } from './studio-quality-report'

export function StudioDialogueTiming() {
  const { t } = useTranslation()
  const { props, writable, setActiveTab } = useStudioProductionContext()
  const [durations, setDurations] = useState<Record<string, number>>({})
  const [review, setReview] = useState(false)
  const mediaAccess = useRef(props.getMedia)
  mediaAccess.current = props.getMedia
  const audioKey = [
    ...new Set(
      (props.project.production?.dialogueCues || []).flatMap((cue) =>
        cue.audioMediaId ? [cue.audioMediaId] : []
      )
    ),
  ]
    .sort()
    .join('|')
  useEffect(() => {
    let disposed = false
    const values: Record<string, number> = {}
    void Promise.all(
      audioKey
        .split('|')
        .filter(Boolean)
        .map(async (id) => {
          const blob = await mediaAccess.current(id)
          if (!blob || disposed) return
          const input = new MediaInput({
            source: new BlobSource(blob),
            formats: ALL_FORMATS,
          })
          try {
            const track = await input.getPrimaryAudioTrack()
            if (track) values[id] = await track.computeDuration()
          } finally {
            input.dispose()
          }
        })
    )
      .then(() => {
        if (!disposed) setDurations(values)
      })
      .catch(handleServerError)
    return () => {
      disposed = true
    }
  }, [audioKey])
  const timings = studioDialogueTiming(props.project, durations)
  if (!timings.length) return null
  const long = timings.filter((item) => item.required > item.seconds)
  return (
    <section
      className='space-y-2 rounded-lg border p-3'
      aria-label={t('Time the pictures to the dialogue')}
    >
      <h3 className='font-medium'>{t('Time the pictures to the dialogue')}</h3>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Listen to the script first. Estimates are planning guidance; recorded audio duration takes precedence. Existing footage is retained when its plan changes.'
        )}
      </p>
      {timings.map((item) => (
        <div className='text-sm' key={item.shotId}>
          <strong>{item.title}</strong> · {item.seconds}s → {item.required}s ·{' '}
          {t(item.actual ? 'Recorded voice' : 'Speaking time estimate')}
          <p className='text-muted-foreground line-clamp-2'>{item.text}</p>
        </div>
      ))}
      {long.some((item) => item.required > 30) && (
        <p role='status' className='text-sm'>
          {t(
            'This dialogue exceeds a single shot’s 30-second planning limit. Shorten the text or split the scene before making footage.'
          )}
        </p>
      )}
      <div className='flex flex-wrap gap-2'>
        <Button
          size='sm'
          variant='outline'
          disabled={
            !writable || !long.length || long.some((item) => item.required > 30)
          }
          onClick={() => setReview(true)}
        >
          {t('Review longer shot timings')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          onClick={() => setActiveTab('media')}
        >
          {t('Edit and hear the dialogue')}
        </Button>
        <Button size='sm' variant='ghost' onClick={() => setActiveTab('plan')}>
          {t('Split a long scene in the storyboard')}
        </Button>
      </div>
      <ConfirmDialog
        open={review}
        onOpenChange={setReview}
        title={t('Review longer shot timings')}
        desc={
          <div className='space-y-2'>
            {long.map((item) => (
              <p key={item.shotId}>
                {item.title}: {item.seconds}s → {Math.ceil(item.required)}s
              </p>
            ))}
            <p>
              {t(
                'This updates planned duration only. Existing video and timeline remain unchanged. Make a new video version if the footage is too short, or shorten the script instead.'
              )}
            </p>
          </div>
        }
        handleConfirm={() => {
          props.onUpdate({
            ...props.project,
            nodes: props.project.nodes.map((node) => {
              const next = long.find((item) => item.nodeId === node.id)
              return next
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      seconds: Math.min(30, Math.ceil(next.required)),
                    },
                  }
                : node
            }),
          })
          setReview(false)
        }}
      />
    </section>
  )
}

export function StudioFilmFinish() {
  const { t } = useTranslation()
  const { props, writable, submit, mutate, preview } =
    useStudioProductionContext()
  const production =
    props.project.production || studioProductionSchema.parse({})
  const kit = {
    name: '',
    address: '',
    callToAction: '',
    color: '#ffffff',
    logoMediaId: '',
    endSeconds: 2,
    ...production.brandKit,
  }
  const mix = {
    voicePriority: false,
    musicGain: 0.2,
    fadeOut: 1,
    normalize: false,
    musicMediaIds: [],
    ...production.audioMix,
  }
  const [brands, setBrands] = useState<StudioCloudProject[]>([])
  const update = (patch: Partial<typeof production>) =>
    props.onUpdate({
      ...props.project,
      production: { ...production, ...patch },
    })
  return (
    <section
      className='space-y-3'
      aria-label={t('Finish the sound and closing card')}
    >
      <Collapsible>
        <CollapsibleTrigger render={<Button size='sm' variant='outline' />}>
          {t('Brand and closing card')}
        </CollapsibleTrigger>
        <CollapsibleContent className='space-y-3 pt-3'>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Exact text and your logo are editable overlays on the closing shot. Changing them does not regenerate video.'
            )}
          </p>
          <FieldGroup>
            {(['name', 'callToAction', 'address'] as const).map((key) => (
              <Field key={key}>
                <FieldLabel>
                  {t(
                    {
                      name: 'Brand or store name',
                      callToAction: 'Closing invitation',
                      address: 'Address or contact information',
                    }[key]
                  )}
                </FieldLabel>
                <Input
                  disabled={!writable}
                  aria-label={t(
                    {
                      name: 'Brand or store name',
                      callToAction: 'Closing invitation',
                      address: 'Address or contact information',
                    }[key]
                  )}
                  value={kit[key]}
                  maxLength={key === 'name' ? 120 : 300}
                  onChange={(event) =>
                    update({ brandKit: { ...kit, [key]: event.target.value } })
                  }
                />
              </Field>
            ))}
          </FieldGroup>
          <Field>
            <FieldLabel>{t('Brand text color')}</FieldLabel>
            <Input
              type='color'
              aria-label={t('Brand text color')}
              disabled={!writable}
              value={kit.color}
              onChange={(event) =>
                update({ brandKit: { ...kit, color: event.target.value } })
              }
            />
          </Field>
          <Field>
            <FieldLabel>{t('Closing card style')}</FieldLabel>
            <NativeSelect
              aria-label={t('Closing card style')}
              disabled={!writable}
              value={kit.font || 'sans'}
              onChange={(event) =>
                update({
                  brandKit: {
                    ...kit,
                    font: event.target.value as 'sans' | 'serif',
                  },
                })
              }
            >
              <NativeSelectOption value='sans'>
                {t('Clean title')}
              </NativeSelectOption>
              <NativeSelectOption value='serif'>
                {t('Editorial title')}
              </NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>{t('Closing card duration')}</FieldLabel>
            <Input
              type='number'
              aria-label={t('Closing card duration')}
              min={0.5}
              max={15}
              step={0.5}
              disabled={!writable}
              value={kit.endSeconds}
              onChange={(event) => {
                const endSeconds = Number(event.target.value)
                if (endSeconds >= 0.5 && endSeconds <= 15) {
                  update({ brandKit: { ...kit, endSeconds } })
                }
              }}
            />
          </Field>
          <div className='flex flex-wrap gap-2'>
            <Button
              size='sm'
              variant='outline'
              disabled={!writable}
              onClick={() => {
                void studioCloudRequest<StudioCloudProject[]>('/projects')
                  .then((projects) =>
                    setBrands(
                      projects.filter(
                        (item) => item.document.production?.brandKit
                      )
                    )
                  )
                  .catch(handleServerError)
              }}
            >
              {t('Reuse a saved brand')}
            </Button>
            {brands.map((item) => (
              <Button
                key={item.id}
                size='sm'
                variant='outline'
                disabled={!writable}
                onClick={() => {
                  const brandKit = item.document.production?.brandKit
                  if (brandKit) {
                    update({ brandKit: { ...brandKit, logoMediaId: '' } })
                  }
                }}
              >
                {item.document.production?.brandKit?.name ||
                  item.document.title}
              </Button>
            ))}
          </div>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Brand text is reusable across projects. Add a project image as its logo; copied text never grants access to another project’s media.'
            )}
          </p>
          <Field>
            <FieldLabel>{t('Logo image from this project')}</FieldLabel>
            <NativeSelect
              className='bg-background rounded-md border p-2 text-sm'
              aria-label={t('Logo image from this project')}
              disabled={!writable}
              value={kit.logoMediaId}
              onChange={(event) =>
                update({
                  brandKit: { ...kit, logoMediaId: event.target.value },
                })
              }
            >
              <NativeSelectOption value=''>{t('No logo')}</NativeSelectOption>
              {props.project.nodes
                .filter(
                  (node) => node.data.kind === 'image' && node.data.mediaId
                )
                .map((node) => (
                  <NativeSelectOption key={node.id} value={node.data.mediaId}>
                    {node.data.title}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </Field>
        </CollapsibleContent>
      </Collapsible>
      <Collapsible>
        <CollapsibleTrigger render={<Button size='sm' variant='outline' />}>
          {t('Voice-first sound mix')}
        </CollapsibleTrigger>
        <CollapsibleContent className='space-y-3 pt-3'>
          <Field orientation='horizontal'>
            <Checkbox
              id='voice-first-mix'
              disabled={!writable}
              checked={mix.voicePriority}
              onCheckedChange={(checked) =>
                update({ audioMix: { ...mix, voicePriority: !!checked } })
              }
            />
            <FieldLabel htmlFor='voice-first-mix'>
              {t('Lower music while dialogue plays')}
            </FieldLabel>
          </Field>
          <Field>
            <FieldLabel>{t('Music level during dialogue (%)')}</FieldLabel>
            <Input
              type='range'
              min={0}
              max={100}
              aria-label={t('Music level during dialogue (%)')}
              disabled={!writable}
              value={Math.round(mix.musicGain * 100)}
              onChange={(event) =>
                update({
                  audioMix: {
                    ...mix,
                    musicGain: Number(event.target.value) / 100,
                  },
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel>{t('Music fade at the end (seconds)')}</FieldLabel>
            <Input
              type='number'
              min={0}
              max={10}
              step={0.5}
              aria-label={t('Music fade at the end (seconds)')}
              disabled={!writable}
              value={mix.fadeOut}
              onChange={(event) => {
                const fadeOut = Number(event.target.value)
                if (fadeOut >= 0 && fadeOut <= 10) {
                  update({ audioMix: { ...mix, fadeOut } })
                }
              }}
            />
          </Field>
          <Field orientation='horizontal'>
            <Checkbox
              id='normalize-film-audio'
              disabled={!writable}
              checked={mix.normalize}
              onCheckedChange={(checked) =>
                update({ audioMix: { ...mix, normalize: !!checked } })
              }
            />
            <FieldLabel htmlFor='normalize-film-audio'>
              {t('Balance loudness in the finished mix')}
            </FieldLabel>
          </Field>
          <p className='text-muted-foreground text-xs'>
            {t(
              'The soundtrack is treated as music. Select any additional music below. Dialogue tracks keep their own volume. Use the exact mix preview to hear loudness balancing.'
            )}
          </p>
          {props.project.production?.audioTracks.map((track) => (
            <Field key={track.id} orientation='horizontal'>
              <Checkbox
                id={`music-track-${track.id}`}
                disabled={!writable}
                checked={mix.musicMediaIds.includes(track.mediaId)}
                onCheckedChange={(checked) =>
                  update({
                    audioMix: {
                      ...mix,
                      musicMediaIds: checked
                        ? [...new Set([...mix.musicMediaIds, track.mediaId])]
                        : mix.musicMediaIds.filter(
                            (id) => id !== track.mediaId
                          ),
                    },
                  })
                }
              />
              <FieldLabel htmlFor={`music-track-${track.id}`}>
                {t('Treat as music')}:{' '}
                {props.project.nodes.find(
                  (node) => node.data.mediaId === track.mediaId
                )?.data.title || t('Audio track')}
              </FieldLabel>
            </Field>
          ))}
          <Button
            size='sm'
            variant='outline'
            disabled={!writable || mutate.isPending}
            onClick={() => mutate.mutate(() => submit('render', true))}
          >
            {t('Hear the exact film mix')}
          </Button>
          {preview && (
            <Field>
              <FieldLabel>{t('Exact film mix preview')}</FieldLabel>
              <audio
                src={preview}
                controls
                aria-label={t('Exact film mix preview')}
                className='w-full'
              />
            </Field>
          )}
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}

export function StudioFilmChecks(props: {
  onStep: (step: 'story' | 'shots' | 'visual' | 'edit' | 'deliver') => void
}) {
  const { t } = useTranslation()
  const {
    props: workspace,
    writable,
    mutate,
    submit,
    jobs,
    record,
  } = useStudioProductionContext()
  const quality = jobs.data?.find(
    (job) =>
      job.kind === 'quality' &&
      job.status === 'succeeded' &&
      job.revision === record.data?.revision
  )
  const findings = studioFilmFindings(workspace.project)
  return (
    <section className='space-y-2' aria-label={t('Actionable film checks')}>
      <h3 className='font-medium'>{t('Actionable film checks')}</h3>
      <Button
        size='sm'
        variant='outline'
        disabled={
          !writable ||
          mutate.isPending ||
          jobs.data?.some(
            (job) =>
              job.kind === 'quality' &&
              ['queued', 'running', 'waiting'].includes(job.status)
          )
        }
        onClick={() => mutate.mutate(() => submit('quality'))}
      >
        {t('Check actual media files')}
      </Button>
      {quality && (
        <StudioQualityReport
          result={quality.result}
          project={workspace.project}
          onLocate={(id) => {
            workspace.onSelectNode?.(id)
            props.onStep('visual')
          }}
        />
      )}
      {findings.length ? (
        findings.map((item) => (
          <div
            key={item.code}
            className='flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm'
          >
            <p className='flex-1'>
              {t(item.blocking ? 'Fix before export' : 'Suggestion')}:{' '}
              {t(item.message)}
            </p>
            <Button
              size='xs'
              variant='outline'
              onClick={() => {
                if (item.nodeId) workspace.onSelectNode?.(item.nodeId)
                props.onStep(item.step)
              }}
            >
              {t('Go to the affected item')}
            </Button>
          </div>
        ))
      ) : (
        <p className='text-muted-foreground text-sm'>
          {t(
            'No issues found by these rules. Watch the full film to judge story, appearance and sound.'
          )}
        </p>
      )}
    </section>
  )
}
