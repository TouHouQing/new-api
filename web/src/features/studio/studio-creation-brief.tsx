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

import { StudioBriefGuide } from './studio-brief-guide'
import { studioPlanStoryDraft } from './studio-creation'
import { studioCreationTemplate } from './studio-creation-templates'
import {
  studioBriefNeedsReview,
  studioConfirmBrief,
} from './studio-creative-plan'
import { StudioMediaImport } from './studio-media-import'
import { studioProductionSchema } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import { studioProjectDisplayTitle } from './studio-project-identity'
import { StudioStoryPlanner } from './studio-story-planner'
import { StudioTemplateLibrary } from './studio-template-library'
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
  useEffect(
    () => setDuration(String(production.targetDuration || 30)),
    [production.targetDuration]
  )
  const [busy, setBusy] = useState(false)
  const [templates, setTemplates] = useState(false)
  const [start, setStart] = useState<'choose' | 'idea' | 'upload' | 'template'>(
    production.brief || workspace.project.shots?.length ? 'idea' : 'choose'
  )
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
    onValidityChange?.(
      durationValid && !studioBriefNeedsReview(workspace.project)
    )
  }, [durationValid, onValidityChange, workspace.project])
  const update = (patch: Partial<typeof production>): void =>
    workspace.onUpdate({
      ...workspace.project,
      production: { ...production, ...patch },
      updatedAt: new Date().toISOString(),
    })
  const goals = ['story', 'product', 'explain', 'presenter'] as const
  const createDraft = (kind: 'manual' | 'template') => {
    try {
      const reviewed = studioConfirmBrief(workspace.project, false)
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
      workspace.onUpdate({
        ...reviewed,
        title: studioProjectDisplayTitle(reviewed),
        production: {
          ...reviewed.production,
          screenplayDraft: JSON.stringify(draft),
          guide: { step: 'shots', goal: production.guide?.goal || 'story' },
        },
      })
      setReplacement(null)
      setError('')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem))
    }
  }
  const requestDraft = (kind: 'manual' | 'template') => {
    if (studioBriefNeedsReview(workspace.project)) {
      setError(t('Choose the video settings above before planning.'))
      return
    }
    if (production.screenplayDraft) setReplacement(kind)
    else createDraft(kind)
  }
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
  if (start !== 'idea') {
    return (
      <div className='mx-auto max-w-4xl space-y-6 py-4'>
        {error && (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {start !== 'choose' && (
          <Button variant='ghost' onClick={() => setStart('choose')}>
            {t('Change how to start')}
          </Button>
        )}
        {start === 'choose' && (
          <>
            <div>
              <h2 className='text-2xl font-semibold'>
                {t('What would you like to create?')}
              </h2>
              <p className='text-muted-foreground mt-2'>
                {t('Start with an idea, your footage or a visual example.')}
              </p>
            </div>
            <div className='grid gap-4 sm:grid-cols-3'>
              {(
                [
                  {
                    id: 'idea',
                    title: 'Describe a video',
                    detail:
                      'Write your idea. Review the shots before making pictures.',
                  },
                  {
                    id: 'upload',
                    title: 'Use my own footage',
                    detail:
                      'Import clips and start editing with sound and captions.',
                  },
                  {
                    id: 'template',
                    title: 'Browse visual templates',
                    detail:
                      'See an example, then adapt its editable storyboard.',
                  },
                ] as const
              ).map((item) => (
                <Button
                  key={item.id}
                  aria-label={t(item.title)}
                  variant='outline'
                  className='h-auto min-h-44 flex-col items-start justify-start gap-3 rounded-xl p-5 text-left whitespace-normal'
                  onClick={() => setStart(item.id)}
                >
                  <span className='text-lg font-semibold'>{t(item.title)}</span>
                  <span className='text-muted-foreground text-sm leading-relaxed'>
                    {t(item.detail)}
                  </span>
                </Button>
              ))}
            </div>
            <Button
              variant='ghost'
              disabled={!writable || busy}
              onClick={() => {
                setBusy(true)
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
              {t('Try a free editing example')}
            </Button>
          </>
        )}
        {start === 'upload' && (
          <>
            <h2 className='text-xl font-semibold'>{t('Use my own footage')}</h2>
            <p className='text-muted-foreground'>
              {t('Import clips and start editing with sound and captions.')}
            </p>
            <StudioMediaImport />
          </>
        )}
        {start === 'template' && (
          <StudioTemplateLibrary
            project={workspace.project}
            readOnly={!writable}
            onApply={workspace.onApplyRecipe || workspace.onUpdate}
            onClose={() => setStart('choose')}
          />
        )}
      </div>
    )
  }
  return (
    <div className='mx-auto max-w-3xl space-y-5'>
      <Button variant='ghost' onClick={() => setStart('choose')}>
        {t('Change how to start')}
      </Button>
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
                update({
                  width: 1080,
                  height: 1920,
                  deliveryPreset: 'shorts',
                  exportSizeMode: 'custom',
                })
              } else if (value === 'square') {
                update({
                  width: 1080,
                  height: 1080,
                  deliveryPreset: 'custom',
                  exportSizeMode: 'custom',
                })
              } else if (value === 'wide') {
                update({
                  width: 1920,
                  height: 1080,
                  deliveryPreset: 'youtube',
                  exportSizeMode: 'custom',
                })
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
      <StudioBriefGuide />
      <StudioStoryPlanner disabled={!durationValid} />
      {templates && (
        <StudioTemplateLibrary
          project={workspace.project}
          readOnly={!writable}
          onClose={() => setTemplates(false)}
          onApply={workspace.onApplyRecipe || workspace.onUpdate}
        />
      )}

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
          onClick={() => setTemplates(true)}
        >
          {t('Load a complete creative template')}
        </Button>
        <Button
          variant='outline'
          disabled={
            !writable ||
            !production.brief?.trim() ||
            !durationValid ||
            studioBriefNeedsReview(workspace.project)
          }
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
