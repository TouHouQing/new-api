/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { markServerErrorHandled } from '@/lib/handle-server-error'
import { getServerErrorMessage } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import type { StudioProject } from './local-projects'
import { STUDIO_RECIPES } from './studio-creative-plan'
import {
  importStudioSampleFilm,
  readStudioSampleImport,
  saveStudioSampleImport,
  studioSampleManifestSchema,
  type StudioSampleFilm,
  type StudioSampleImportState,
} from './studio-video-recipes'

export function StudioRecipeGallery(props: {
  readOnly?: boolean
  onInstantiate?: (project: StudioProject) => void
}) {
  const { t } = useTranslation()
  const actor = useAuthStore((state) => state.auth.user?.id)
  const currentActor = useRef(actor)
  currentActor.current = actor
  function sampleMethodLabel(method: StudioSampleFilm['method']) {
    if (method === 'image-edit') return t('Controlled image edit')
    if (method === 'speech-portrait') return t('Speech-driven portrait')
    return t('Real local model output')
  }
  function sampleInputLabel(input: StudioSampleFilm['inputs'][number]) {
    if (input.key === 'subject') return t('Subject')
    if (input.key === 'caption') return t('Captions')
    return input.label
  }
  const [selected, setSelected] = useState<StudioSampleFilm>()
  const [error, setError] = useState('')
  const importing = useRef<
    { key: string; state: StudioSampleImportState } | undefined
  >(undefined)
  const manifest = useQuery({
    queryKey: ['studio-real-sample-films'],
    queryFn: async () => {
      const response = await fetch('/studio-examples/manifest.json')
      if (!response.ok) {
        throw new Error(
          t(
            'Real sample films are not available yet. You can continue with the planning recipes.'
          )
        )
      }
      return studioSampleManifestSchema.parse(await response.json())
    },
    retry: false,
  })
  const copy = useMutation({
    mutationFn: async () => {
      if (!selected || props.readOnly || !props.onInstantiate) {
        throw new Error(t('Choose an editable sample first.'))
      }
      if (!actor || !Number.isSafeInteger(actor) || actor <= 0) {
        throw new Error(t('Sign in before copying a sample.'))
      }
      const key = `newapi:studio:sample-import:v1:user:${actor}:${selected.id}:${selected.version}`
      if (importing.current?.key !== key) {
        importing.current = {
          key,
          state: readStudioSampleImport(localStorage, key) || {
            projectId: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            media: {},
            uploaded: new Set(),
          },
        }
      }
      const state = importing.current.state
      saveStudioSampleImport(localStorage, key, state)
      return importStudioSampleFilm(
        selected,
        state,
        () => {
          if (currentActor.current !== actor) {
            throw new Error(
              t(
                'The account changed. Open the example again in the current account.'
              )
            )
          }
        },
        () => saveStudioSampleImport(localStorage, key, state)
      )
    },
    onSuccess: (project) => {
      if (importing.current) localStorage.removeItem(importing.current.key)
      props.onInstantiate?.(project)
      setSelected(undefined)
      importing.current = undefined
      setError('')
    },
    onError: (problem) => {
      setError(
        getServerErrorMessage(
          problem,
          t(
            'The sample could not be copied. Its import receipt and your current project are retained.'
          )
        )
      )
      markServerErrorHandled(problem)
    },
  })
  return (
    <section
      className='flex flex-col gap-4'
      aria-label={t('Real editable sample films')}
    >
      <h3 className='font-medium'>
        {t('Watch a real example, then edit a copy')}
      </h3>
      <p className='text-muted-foreground text-sm'>
        {t(
          'These films include their real source clips, sound and editable timeline. Copying an example uses no model; generating your own material requires a separate confirmation.'
        )}
      </p>
      {manifest.isPending && <LoadingState />}
      {manifest.isError && (
        <ErrorState
          description={t(
            'Real sample films are not available yet. You can continue with the planning recipes.'
          )}
          onRetry={() => manifest.refetch()}
        />
      )}
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        {manifest.data?.samples.map((sample) => {
          const recipe = STUDIO_RECIPES.find((item) => item.id === sample.id)
          return (
            <Card key={sample.id}>
              <CardHeader>
                <CardTitle>{recipe ? t(recipe.title) : sample.id}</CardTitle>
                <CardDescription>
                  {recipe && t(recipe.description)}
                </CardDescription>
              </CardHeader>
              <CardContent className='flex flex-col gap-3'>
                <video
                  src={sample.film_url}
                  poster={sample.poster_url}
                  controls
                  playsInline
                  preload='none'
                  aria-label={recipe ? t(recipe.title) : sample.id}
                  className='aspect-video w-full rounded-lg'
                />
                <div className='flex flex-wrap gap-2'>
                  <Badge variant='outline'>
                    {sampleMethodLabel(sample.method)}
                  </Badge>
                  <Badge variant='outline'>
                    {t('{{seconds}} second sample', {
                      seconds: sample.duration,
                    })}
                  </Badge>
                </div>
                <details className='text-muted-foreground text-sm'>
                  <summary className='cursor-pointer'>
                    {t('What this sample demonstrates')}
                  </summary>
                  <p>{sample.notes}</p>
                </details>
                <p className='text-muted-foreground text-sm'>
                  {t('Prepare')}: {recipe && t(recipe.needs)}
                </p>
              </CardContent>
              <CardFooter>
                <Button
                  disabled={
                    props.readOnly ||
                    copy.isPending ||
                    !props.onInstantiate ||
                    sample.verification !== 'verified'
                  }
                  onClick={() => {
                    setSelected(sample)
                    setError('')
                  }}
                >
                  {sample.verification === 'verified'
                    ? t('Copy film as an editable project')
                    : t('Sample awaits review')}
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>
      <ConfirmDialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !copy.isPending) setSelected(undefined)
        }}
        title={t('Copy this complete sample project')}
        desc={t(
          'The example will be saved as an independent project with immutable source clips and editable cuts, captions and audio. Your current project is retained. Replace the subject, wording and references before confirming your own generation.'
        )}
        disabled={props.readOnly || !props.onInstantiate}
        isLoading={copy.isPending}
        confirmText={t('Copy without model generation')}
        handleConfirm={() => copy.mutate()}
      >
        {selected && (
          <div className='flex flex-col gap-2 text-sm'>
            <p>
              {t('Source')}: {selected.source}
            </p>
            <p>
              {t('Commercial use note')}: {selected.license}
            </p>
            {selected.inputs.map((input) => (
              <p key={input.key}>
                {sampleInputLabel(input)}: {input.value}
              </p>
            ))}
          </div>
        )}
        {error && (
          <p role='alert' className='text-destructive text-sm'>
            {error}
          </p>
        )}
      </ConfirmDialog>
    </section>
  )
}
