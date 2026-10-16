/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import { studioBriefSuggestions } from './studio-creative-plan'
import { studioProductionSchema } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'

export function StudioBriefGuide() {
  const { t } = useTranslation()
  const { props, writable } = useStudioProductionContext()
  const production =
    props.project.production || studioProductionSchema.parse({})
  const details = {
    recipeId: '',
    subject: '',
    audience: '',
    benefit: '',
    callToAction: '',
    ...production.creativeBrief,
  }
  const goal = production.guide?.goal || 'story'
  const suggested = studioBriefSuggestions(production.brief || '')
  const labelsByGoal = {
    product: {
      subject: 'Brand, store or product',
      audience: 'Who is this for?',
      benefit: 'One reason to choose it',
      callToAction: 'What should viewers do next?',
    },
    story: {
      subject: 'Main character or theme',
      audience: 'Who is this for?',
      benefit: 'What changes in the story?',
      callToAction: 'What should the ending leave with viewers?',
    },
    explain: {
      subject: 'Topic to explain',
      audience: 'Who is this for?',
      benefit: 'One useful takeaway',
      callToAction: 'What should viewers do next?',
    },
    presenter: {
      subject: 'Topic to explain',
      audience: 'Who is this for?',
      benefit: 'One useful takeaway',
      callToAction: 'What should viewers do next?',
    },
  }
  const labels = labelsByGoal[goal]
  return (
    <section
      className='space-y-3'
      aria-label={t('Confirm the creative direction')}
    >
      {(suggested.duration ||
        suggested.vertical ||
        suggested.goal ||
        Object.values(suggested.details).some(Boolean)) && (
        <div className='flex flex-wrap items-center gap-2 text-sm'>
          <span>{t('Suggested from your brief')}:</span>
          {suggested.duration && <span>{suggested.duration}s</span>}
          {suggested.vertical && <span>9:16</span>}
          {suggested.goal && (
            <span>{t(`studio.creation.goal.${suggested.goal}`)}</span>
          )}
          {Object.entries(suggested.details)
            .filter(([, value]) => !!value)
            .map(([key, value]) => (
              <span key={key} className='bg-muted rounded px-2 py-1'>
                {t(labels[key as keyof typeof labels])}: {value}
              </span>
            ))}
          <Button
            size='sm'
            variant='outline'
            disabled={!writable}
            onClick={() =>
              props.onUpdate({
                ...props.project,
                production: {
                  ...production,
                  ...(suggested.duration
                    ? { targetDuration: suggested.duration }
                    : {}),
                  ...(suggested.vertical ? { width: 1080, height: 1920 } : {}),
                  creativeBrief: Object.fromEntries(
                    Object.entries(details).map(([key, value]) => [
                      key,
                      value ||
                        suggested.details[
                          key as keyof typeof suggested.details
                        ] ||
                        '',
                    ])
                  ) as typeof details,
                  guide: { step: 'story', goal: suggested.goal || goal },
                },
              })
            }
          >
            {t('Apply these suggestions')}
          </Button>
        </div>
      )}
      <Collapsible key={goal} defaultOpen={goal !== 'story'}>
        <CollapsibleTrigger render={<Button variant='outline' size='sm' />}>
          {t('Confirm the creative direction')}
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
          <p className='text-muted-foreground mt-2 text-xs'>
            {t(
              'Fill only what matters. These requirements stay with the project and are included in planning; exact brand text is added during editing.'
            )}
          </p>
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}
