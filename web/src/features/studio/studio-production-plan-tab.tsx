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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import { studioEditableScreenplay } from './studio-creation'
import { studioProductionSchema } from './studio-production'
import { StudioProductionChanges } from './studio-production-changes'
import { useStudioProductionContext } from './studio-production-context'
import { StudioProductionContinuity } from './studio-production-continuity'
import { StudioReferenceAnalysisPanel } from './studio-reference-analysis-panel'
import {
  applyStudioScreenplay,
  studioScreenplaySchema,
  planStudioScreenplayChange,
  allocateStudioShotDurations,
} from './studio-screenplay'
import { StudioScreenplayEditor } from './studio-screenplay-editor'

export function StudioProductionPlanTab(options: { value?: string } = {}) {
  const { t } = useTranslation()
  const { props, screenplay, setScreenplay, writable } =
    useStudioProductionContext()
  const [target, setTarget] = useState(
    String(props.project.production?.targetDuration || 30)
  )
  const impact = useMemo(() => {
    try {
      return planStudioScreenplayChange(props.project, JSON.parse(screenplay))
    } catch {
      return null
    }
  }, [props.project, screenplay])
  return (
    <TabsContent value={options.value || 'plan'} className='space-y-4'>
      <StudioReferenceAnalysisPanel />
      <Field>
        <FieldLabel>{t('studio.production.targetDuration')}</FieldLabel>
        <Input
          aria-label={t('studio.production.targetDuration')}
          type='number'
          min='1'
          max='3600'
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        />
        <Button
          variant='outline'
          disabled={
            !writable ||
            !Number.isInteger(Number(target)) ||
            Number(target) < 1 ||
            Number(target) > 3600
          }
          onClick={() => {
            try {
              const allocated = allocateStudioShotDurations(
                studioEditableScreenplay(props.project),
                Number(target)
              )
              const draft = JSON.stringify(allocated, null, 2)
              setScreenplay(draft)
              props.onUpdate({
                ...props.project,
                production: {
                  ...(props.project.production ||
                    studioProductionSchema.parse({})),
                  targetDuration: Number(target),
                  screenplayDraft: draft,
                },
              })
            } catch (error) {
              handleServerError(error)
            }
          }}
        >
          {t('studio.production.allocateDuration')}
        </Button>
      </Field>
      <Field>
        <FieldLabel>{t('studio.production.brief')}</FieldLabel>
        <Textarea
          aria-label={t('studio.production.brief')}
          disabled={!writable}
          value={props.project.production?.brief || ''}
          maxLength={30000}
          onChange={(event) =>
            props.onUpdate({
              ...props.project,
              production: {
                ...(props.project.production ||
                  studioProductionSchema.parse({})),
                brief: event.target.value,
              },
            })
          }
        />
      </Field>
      <StudioScreenplayEditor />
      <Collapsible>
        <CollapsibleTrigger render={<Button variant='outline' />}>
          {t('Advanced screenplay JSON')}
        </CollapsibleTrigger>
        <CollapsibleContent className='space-y-3 pt-3'>
          <Field>
            <FieldLabel>{t('studio.production.screenplay')}</FieldLabel>
            <Textarea
              aria-label={t('studio.production.screenplay')}
              value={screenplay}
              maxLength={1000000}
              className='min-h-48 font-mono text-xs'
              onChange={(event) => setScreenplay(event.target.value)}
            />
          </Field>
          <div className='flex flex-wrap gap-2'>
            <Button
              disabled={!writable || !screenplay.trim()}
              onClick={() => {
                try {
                  props.onUpdate(
                    applyStudioScreenplay(props.project, JSON.parse(screenplay))
                  )
                } catch (error) {
                  handleServerError(error)
                }
              }}
            >
              {t('studio.production.applyScreenplay')}
            </Button>
            <CopyButton
              value={JSON.stringify(
                studioScreenplaySchema.toJSONSchema(),
                null,
                2
              )}
              tooltip={t('studio.production.copyPlanSchema')}
            />
            {props.project.nodes
              .filter(
                (node) => node.data.purpose === 'script' && node.data.outputText
              )
              .map((node) => (
                <Button
                  key={node.id}
                  variant='outline'
                  onClick={() => setScreenplay(node.data.outputText || '')}
                >
                  {t('studio.production.useScript')}: {node.data.title}
                </Button>
              ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
      {impact && (
        <p role='status'>
          {t('studio.production.scriptImpact')}:{' '}
          {[...impact.shotIds, ...impact.removedShotIds].join(', ') ||
            t('studio.production.noChanges')}
        </p>
      )}
      <StudioProductionChanges />
      <StudioProductionContinuity />
      {props.project.production?.scenes.map((scene) => (
        <div key={scene.id} className='rounded-lg border p-3'>
          <p className='font-medium'>
            {scene.title} · {scene.shotIds.length}
          </p>
          <p className='text-muted-foreground text-sm whitespace-pre-wrap'>
            {scene.description}
          </p>
        </div>
      ))}
      {props.project.production?.props.map((prop) => (
        <Field key={prop.id}>
          <FieldLabel>{prop.title}</FieldLabel>
          <Textarea
            aria-label={prop.title}
            disabled={!writable}
            value={prop.description}
            onChange={(event) => {
              const production =
                props.project.production || studioProductionSchema.parse({})
              props.onUpdate({
                ...props.project,
                production: {
                  ...production,
                  props: production.props.map((item) =>
                    item.id === prop.id
                      ? { ...item, description: event.target.value }
                      : item
                  ),
                },
              })
            }}
          />
        </Field>
      ))}
    </TabsContent>
  )
}
