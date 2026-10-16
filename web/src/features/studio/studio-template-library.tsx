/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import type { StudioProject } from './local-projects'
import { STUDIO_RECIPES, studioRecipeDraft } from './studio-creative-plan'
import { studioProductionSchema } from './studio-production'

export function StudioTemplateLibrary(props: {
  project: StudioProject
  readOnly?: boolean
  onApply: (project: StudioProject) => void
  onClose?: () => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('')
  const recipe = STUDIO_RECIPES.find((item) => item.id === selected)
  return (
    <section
      className='min-w-0 space-y-4 p-4'
      aria-label={t('Creative recipes')}
    >
      <div className='flex items-center justify-between gap-3'>
        <h2 className='text-lg font-semibold'>
          {t('Start from the video you want to make')}
        </h2>
        {props.onClose && (
          <Button variant='ghost' onClick={props.onClose}>
            {t('Back to project')}
          </Button>
        )}
      </div>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Preview the structure, prepare the required assets and adapt it to your story. Existing footage stays in your project.'
        )}
      </p>
      <Field>
        <FieldLabel>{t('Find a creative recipe')}</FieldLabel>
        <Input
          aria-label={t('Find a creative recipe')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </Field>
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        {STUDIO_RECIPES.filter((item) =>
          [t(item.title), t(item.description)]
            .join(' ')
            .toLowerCase()
            .includes(search.toLowerCase())
        ).map((item) => (
          <Card key={item.id}>
            <div className='bg-muted overflow-hidden rounded-t-xl'>
              <img
                src={`/studio-examples/${item.id === 'store' ? 'store-cover-b66a5672.jpg' : `${item.id}.svg`}`}
                alt={t(item.title)}
                className='h-36 w-full object-cover'
              />
              <p className='px-4 py-2 text-sm'>
                {t(
                  item.id === 'store'
                    ? 'Local model example'
                    : 'Storyboard illustration'
                )}{' '}
                · {item.id === 'store' ? '12s' : '15s'} · 9:16
              </p>
            </div>
            <CardHeader>
              <CardTitle>{t(item.title)}</CardTitle>
              <CardDescription>{t(item.description)}</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <p className='text-muted-foreground text-sm'>
                {t('Prepare')}: {t(item.needs)}
              </p>
            </CardContent>
            <CardFooter>
              <Button
                disabled={props.readOnly}
                onClick={() => setSelected(item.id)}
              >
                {t('Preview and use recipe')}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      <ConfirmDialog
        open={!!recipe}
        onOpenChange={(open) => {
          if (!open) setSelected('')
        }}
        title={recipe ? t(recipe.title) : t('Creative recipe')}
        desc={
          <div className='space-y-3'>
            {recipe?.id === 'store' ? (
              <figure>
                <video
                  src='/studio-examples/store.mp4'
                  poster='/studio-examples/store-cover-b66a5672.jpg'
                  controls
                  playsInline
                  preload='none'
                  className='mx-auto max-h-72 rounded-lg'
                />
                <figcaption className='text-sm'>
                  {t('Local model example')} · 12s
                </figcaption>
              </figure>
            ) : (
              recipe && (
                <figure>
                  <img
                    src={`/studio-examples/${recipe.id}.svg`}
                    alt={t(recipe.title)}
                    className='w-full rounded-lg'
                  />
                  <figcaption className='text-muted-foreground text-sm'>
                    {t(
                      'Storyboard illustration. Your result depends on your media and models.'
                    )}
                  </figcaption>
                </figure>
              )
            )}
            <p>{recipe && t(recipe.description)}</p>
            <ol className='list-inside list-decimal'>
              {recipe?.beats.map((beat) => (
                <li key={beat}>{t(beat)}</li>
              ))}
            </ol>
            <p>
              {t(
                'This opens an editable storyboard in a new draft project. Your original project, footage and edits are preserved. Review the draft before applying shots. No model runs.'
              )}
            </p>
          </div>
        }
        confirmText={t('Use as editable draft')}
        handleConfirm={() => {
          if (!recipe || props.readOnly) return
          const production =
            props.project.production || studioProductionSchema.parse({})
          const draft = studioRecipeDraft(props.project, recipe.id, t)
          props.onApply({
            ...props.project,
            title: production.creativeBrief?.subject || props.project.title,
            production: {
              ...production,
              creativeBrief: {
                subject: '',
                audience: '',
                benefit: '',
                callToAction: '',
                ...production.creativeBrief,
                recipeId: recipe.id,
              },
              screenplayDraft: JSON.stringify(draft),
              guide: { goal: recipe.goal, step: 'shots' },
            },
          })
          setSelected('')
        }}
      />
    </section>
  )
}
