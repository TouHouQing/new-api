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

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { studioPlanStoryDraft } from './studio-creation'
import { studioCreationTemplate } from './studio-creation-templates'
import { StudioMediaImport } from './studio-media-import'
import { studioProductionSchema } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import { StudioStoryPlanner } from './studio-story-planner'
import { studioWorkflowProblem } from './studio-workflow-problem'

export function StudioCreationBrief(props: {
  onDemo: () => Promise<void>
  onValidityChange?: (valid: boolean) => void
}) {
  const { t } = useTranslation()
  const { props: workspace, writable } = useStudioProductionContext()
  const production =
    workspace.project.production || studioProductionSchema.parse({})
  const [duration, setDuration] = useState(
    String(production.targetDuration || 30)
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [replacement, setReplacement] = useState<'manual' | 'template' | null>(
    null
  )
  const onValidityChange = props.onValidityChange
  const durationValid =
    Number.isInteger(Number(duration)) &&
    Number(duration) >= 1 &&
    Number(duration) <= 3600
  useEffect(() => {
    onValidityChange?.(durationValid)
  }, [durationValid, onValidityChange])
  const update = (patch: Partial<typeof production>): void =>
    workspace.onUpdate({
      ...workspace.project,
      production: { ...production, ...patch },
      updatedAt: new Date().toISOString(),
    })
  const goals = ['story', 'product', 'explain', 'presenter'] as const
  const createDraft = (kind: 'manual' | 'template') => {
    try {
      const draft =
        kind === 'template'
          ? studioCreationTemplate(
              workspace.project,
              production.guide?.goal || 'story',
              t
            )
          : studioPlanStoryDraft(
              workspace.project,
              production.brief || '',
              Number(duration),
              t('studio.shot.defaultName')
            )
      update({
        screenplayDraft: JSON.stringify(draft),
        brief: draft.brief,
        guide: { step: 'shots', goal: production.guide?.goal || 'story' },
      })
      setReplacement(null)
      setError('')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem))
    }
  }
  const requestDraft = (kind: 'manual' | 'template') =>
    production.screenplayDraft ? setReplacement(kind) : createDraft(kind)
  let outdated = false
  try {
    outdated =
      !!production.screenplayDraft &&
      JSON.parse(production.screenplayDraft).brief !== (production.brief || '')
  } catch {
    outdated = !!production.screenplayDraft
  }
  let shape = 'wide'
  if (production.height > production.width) shape = 'vertical'
  else if (production.height === production.width) shape = 'square'
  return (
    <div className='mx-auto max-w-3xl space-y-5'>
      <Field>
        <FieldLabel>{t('What are you making?')}</FieldLabel>
        <Select
          disabled={!writable}
          value={production.guide?.goal || 'story'}
          onValueChange={(value) => {
            const goal = goals.find((goal) => goal === value)
            if (goal) update({ guide: { step: 'story', goal } })
          }}
          items={goals.map((value) => ({
            value,
            label: t(`studio.creation.goal.${value}`),
          }))}
        >
          <SelectTrigger aria-label={t('What are you making?')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {goals.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`studio.creation.goal.${value}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>{t('Tell your story')}</FieldLabel>
        <Textarea
          aria-label={t('Tell your story')}
          disabled={!writable}
          className='min-h-36'
          value={production.brief || ''}
          maxLength={30000}
          placeholder={t(
            'A courier finds an unexpected letter after the rain.'
          )}
          onChange={(event) => update({ brief: event.target.value })}
        />
        <p className='text-muted-foreground text-xs'>
          {t(
            'This saves a draft. No model runs until you confirm a generation plan.'
          )}
        </p>
      </Field>
      <StudioStoryPlanner disabled={!durationValid} />
      <p className='text-muted-foreground text-sm'>
        {t(`studio.creation.goalHelp.${production.guide?.goal || 'story'}`)}
      </p>
      <StudioMediaImport />
      {outdated && (
        <Alert>
          <AlertDescription>
            <p>
              {t(
                'Your story changed. The pending shot draft still contains the previous story.'
              )}
            </p>
            <Button
              size='sm'
              variant='outline'
              disabled={!writable}
              onClick={() =>
                update({
                  guide: {
                    step: 'shots',
                    goal: production.guide?.goal || 'story',
                  },
                })
              }
            >
              {t('Keep and review pending draft')}
            </Button>
            <Button
              size='sm'
              variant='ghost'
              disabled={!writable}
              onClick={() => update({ screenplayDraft: '' })}
            >
              {t('Discard pending draft')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className='grid gap-4 sm:grid-cols-2'>
        <Field>
          <FieldLabel>{t('Target duration')}</FieldLabel>
          <Input
            aria-label={t('Target duration')}
            aria-invalid={!durationValid}
            aria-describedby={
              durationValid ? undefined : 'studio-story-duration-error'
            }
            disabled={!writable}
            type='number'
            min={1}
            max={3600}
            value={duration}
            onChange={(event) => {
              setDuration(event.target.value)
              const value = Number(event.target.value)
              if (Number.isInteger(value) && value >= 1 && value <= 3600) {
                update({ targetDuration: value })
              }
            }}
          />
          {!durationValid && (
            <FieldError id='studio-story-duration-error'>
              {t('Use a whole number from 1 to 3600 seconds')}
            </FieldError>
          )}
        </Field>
        <Field>
          <FieldLabel>{t('Frame shape')}</FieldLabel>
          <Select
            disabled={!writable}
            value={shape}
            onValueChange={(value) => {
              if (value === 'vertical') {
                update({ width: 1080, height: 1920, deliveryPreset: 'shorts' })
              } else if (value === 'square') {
                update({ width: 1080, height: 1080, deliveryPreset: 'custom' })
              } else if (value === 'wide') {
                update({ width: 1920, height: 1080, deliveryPreset: 'youtube' })
              }
            }}
            items={[
              { value: 'wide', label: t('Landscape 16:9') },
              { value: 'vertical', label: t('Portrait 9:16') },
              { value: 'square', label: t('Square 1:1') },
            ]}
          >
            <SelectTrigger aria-label={t('Frame shape')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value='wide'>{t('Landscape 16:9')}</SelectItem>
                <SelectItem value='vertical'>{t('Portrait 9:16')}</SelectItem>
                <SelectItem value='square'>{t('Square 1:1')}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>
      {error && (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className='flex flex-wrap gap-3'>
        <p className='text-muted-foreground w-full text-xs'>
          {t(
            'The free sample uses this project when it is empty; otherwise it opens a separate copy. Your work stays available.'
          )}
        </p>
        <Button
          variant='outline'
          disabled={!writable || !durationValid}
          onClick={() => requestDraft('template')}
        >
          {t('Load a complete creative template')}
        </Button>
        <Button
          variant='outline'
          disabled={!writable || !production.brief?.trim() || !durationValid}
          onClick={() => requestDraft('manual')}
        >
          {t('Make a manual shot draft')}
        </Button>
        <Button
          variant='outline'
          disabled={!writable || busy}
          onClick={() => {
            setBusy(true)
            setError('')
            void props
              .onDemo()
              .catch((error) =>
                setError(
                  t(
                    studioWorkflowProblem(
                      error instanceof Error ? error.message : String(error)
                    )
                  )
                )
              )
              .finally(() => setBusy(false))
          }}
        >
          {t(busy ? 'Loading free example…' : 'Try a free editing example')}
        </Button>
      </div>
      <ConfirmDialog
        open={replacement !== null}
        onOpenChange={(open) => {
          if (!open) setReplacement(null)
        }}
        title={t('Replace pending draft')}
        desc={t(
          'Only the pending plan is replaced. Existing footage and applied shots stay available until you review and apply the new plan. Your story, frame and requested duration are retained.'
        )}
        confirmText={t('Replace pending draft')}
        handleConfirm={() => {
          if (replacement) createDraft(replacement)
        }}
      />
    </div>
  )
}
