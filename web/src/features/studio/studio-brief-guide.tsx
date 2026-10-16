/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import {
  studioBriefNeedsReview,
  studioBriefSuggestions,
  studioConfirmBrief,
} from './studio-creative-plan'
import { studioProductionSchema } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'

export function StudioBriefGuide() {
  const { t } = useTranslation()
  const { props, writable } = useStudioProductionContext()
  const production =
    props.project.production || studioProductionSchema.parse({})
  const suggested = studioBriefSuggestions(production.brief || '')
  const conflict = studioBriefNeedsReview(props.project)
  const details = {
    recipeId: '',
    subject: suggested.details.subject || '',
    audience: suggested.details.audience || '',
    benefit: suggested.details.benefit || '',
    callToAction: suggested.details.callToAction || '',
    ...production.creativeBrief,
  }
  const goal = production.guide?.goal || 'story'
  let subject = 'Main character or theme',
    benefit = 'What changes in the story?',
    ending = 'What should the ending leave with viewers?'
  if (goal === 'product') {
    subject = 'Brand, store or product'
    benefit = 'One reason to choose it'
    ending = 'What should viewers do next?'
  }
  if (goal === 'explain' || goal === 'presenter') {
    subject = 'Topic to explain'
    benefit = 'One useful takeaway'
    ending = 'What should viewers do next?'
  }
  const labels = {
    subject,
    audience: 'Who is this for?',
    benefit,
    callToAction: ending,
  }
  let frame = 'Landscape 16:9'
  if (production.height > production.width) frame = 'Portrait 9:16'
  if (production.height === production.width) frame = 'Square 1:1'
  let suggestedFrame = 'Landscape 16:9'
  if (suggested.frame === 'vertical') suggestedFrame = 'Portrait 9:16'
  if (suggested.frame === 'square') suggestedFrame = 'Square 1:1'
  return (
    <section className='space-y-3' aria-label={t('Creative brief summary')}>
      <p className='text-sm font-medium'>
        {t('Current video settings')}: {production.targetDuration || 30}s ·{' '}
        {t(frame)} · {t(`studio.creation.goal.${goal}`)}
      </p>
      {conflict && (
        <Alert>
          <AlertDescription className='space-y-3'>
            <p>
              {t(
                'Your description and settings differ. Choose which to use before planning.'
              )}
            </p>
            <p>
              {t('Suggested from your brief')}:{' '}
              {suggested.duration && `${suggested.duration}s · `}
              {suggested.frame && t(suggestedFrame)}
              {suggested.goal &&
                ` · ${t(`studio.creation.goal.${suggested.goal}`)}`}
            </p>
            <div className='flex flex-wrap gap-2'>
              <Button
                disabled={!writable}
                onClick={() =>
                  props.onUpdate(studioConfirmBrief(props.project, true))
                }
              >
                {t('Use the described settings')}
              </Button>
              <Button
                variant='outline'
                disabled={!writable}
                onClick={() =>
                  props.onUpdate(studioConfirmBrief(props.project, false))
                }
              >
                {t('Keep my current settings')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      <Collapsible>
        <CollapsibleTrigger render={<Button variant='ghost' />}>
          {t('Add or edit creative requirements')}
        </CollapsibleTrigger>
        <CollapsibleContent className='pt-3'>
          <FieldGroup className='grid gap-3 sm:grid-cols-2'>
            {(['subject', 'audience', 'benefit', 'callToAction'] as const).map(
              (key) => (
                <Field key={key}>
                  <FieldLabel>{t(labels[key])}</FieldLabel>
                  <Input
                    aria-label={t(labels[key])}
                    value={details[key]}
                    maxLength={
                      {
                        subject: 300,
                        audience: 300,
                        benefit: 1000,
                        callToAction: 500,
                      }[key]
                    }
                    disabled={!writable}
                    onChange={(event) =>
                      props.onUpdate({
                        ...props.project,
                        production: {
                          ...production,
                          creativeBrief: {
                            ...details,
                            [key]: event.target.value,
                          },
                        },
                      })
                    }
                  />
                </Field>
              )
            )}
          </FieldGroup>
          <p className='text-muted-foreground mt-3 text-sm'>
            {t(
              'Only add details that matter to this video. You can edit brand titles later.'
            )}
          </p>
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}
