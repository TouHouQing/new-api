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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import {
  studioEditableScreenplay,
  applyStudioEditableScreenplay,
  type StudioEditableScreenplay,
} from './studio-creation'
import {
  studioProductionSchema,
  studioProjectTimeline,
} from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import { planStudioScreenplayChange } from './studio-screenplay'
import { StudioScreenplayAssets } from './studio-screenplay-assets'
import { StudioScreenplayShot } from './studio-screenplay-shot'
import { StudioShotGroups } from './studio-shot-groups'

export function StudioScreenplayEditor(
  options: { onValidityChange?: (valid: boolean) => void } = {}
) {
  const { t } = useTranslation()
  const { props, writable, setActiveTab, activeTab } =
    useStudioProductionContext()
  const state = useMemo(() => {
    try {
      return { draft: studioEditableScreenplay(props.project), error: '' }
    } catch (error) {
      return {
        draft: null,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }, [props.project])
  const [invalidDurations, setInvalidDurations] = useState<Set<string>>(
    new Set()
  )
  const onDurationValidityChange = useCallback((id: string, valid: boolean) => {
    setInvalidDurations((previous) => {
      if (previous.has(id) === !valid) return previous
      const next = new Set(previous)
      if (valid) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const impact = useMemo(() => {
    if (!state.draft) return null
    try {
      return planStudioScreenplayChange(props.project, state.draft)
    } catch {
      return null
    }
  }, [props.project, state.draft])
  const valid = !!impact && invalidDurations.size === 0
  const onValidityChange = options.onValidityChange
  useEffect(() => onValidityChange?.(valid), [onValidityChange, valid])
  if (
    !props.project.shots?.length &&
    !props.project.production?.screenplayDraft &&
    !props.project.production?.brief?.trim() &&
    studioProjectTimeline(props.project).some(
      (clip) =>
        props.project.nodes.find((node) => node.id === clip.nodeId)?.data
          .mediaId
    )
  ) {
    return (
      <div className='space-y-3'>
        <p>
          {t(
            'Your imported footage is ready for editing. A story and shot plan are optional.'
          )}
        </p>
        <Button
          onClick={() => {
            props.onUpdate({
              ...props.project,
              production: {
                ...(props.project.production ||
                  studioProductionSchema.parse({})),
                guide: {
                  step: 'edit',
                  goal: props.project.production?.guide?.goal || 'story',
                },
              },
            })
            setActiveTab(activeTab === 'plan' ? 'timeline' : 'edit')
          }}
        >
          {t('Continue editing imported footage')}
        </Button>
      </div>
    )
  }
  if (!state.draft) {
    return (
      <div className='space-y-4'>
        <Alert variant='destructive'>
          <AlertDescription>
            {t('The screenplay draft needs repair in advanced JSON.')}
          </AlertDescription>
        </Alert>
        <Collapsible>
          <CollapsibleTrigger render={<Button variant='outline' />}>
            {t('Repair imported screenplay JSON')}
          </CollapsibleTrigger>
          <CollapsibleContent className='space-y-3 pt-3'>
            <p className='text-muted-foreground text-xs'>{state.error}</p>
            <Textarea
              aria-label={t('Repair imported screenplay JSON')}
              className='min-h-60 font-mono text-xs'
              value={props.project.production?.screenplayDraft || ''}
              maxLength={1000000}
              disabled={!writable}
              onChange={(event) =>
                props.onUpdate({
                  ...props.project,
                  production: {
                    ...(props.project.production ||
                      studioProductionSchema.parse({})),
                    screenplayDraft: event.target.value,
                  },
                })
              }
            />
          </CollapsibleContent>
        </Collapsible>
      </div>
    )
  }
  const draft = state.draft
  const update = (next: StudioEditableScreenplay): void =>
    props.onUpdate({
      ...props.project,
      production: {
        ...(props.project.production || studioProductionSchema.parse({})),
        screenplayDraft: JSON.stringify(next),
      },
      updatedAt: new Date().toISOString(),
    })
  const apply = (): void => {
    if (!valid) return
    try {
      const next = applyStudioEditableScreenplay(props.project, draft)
      props.onUpdate({
        ...next,
        production: {
          ...(next.production || studioProductionSchema.parse({})),
          screenplayDraft: undefined,
        },
      })
    } catch (error) {
      handleServerError(error)
    }
  }
  return (
    <form
      className='space-y-4'
      onSubmit={(event) => {
        event.preventDefault()
        apply()
      }}
    >
      <StudioShotGroups />
      <p className='text-muted-foreground text-sm'>
        {t(
          'Review the pending shot plan, then apply it. Image and video directions can be added later.'
        )}
      </p>
      <Collapsible>
        <CollapsibleTrigger render={<Button variant='outline' />}>
          {t('Characters, scenes and props')}
        </CollapsibleTrigger>
        <CollapsibleContent className='pt-4'>
          <StudioScreenplayAssets
            draft={draft}
            disabled={!writable}
            onChange={update}
          />
        </CollapsibleContent>
      </Collapsible>
      {draft.shots.map((shot, index) => (
        <StudioScreenplayShot
          key={shot.id}
          shot={shot}
          draft={draft}
          index={index}
          disabled={!writable}
          onChange={(patch) =>
            update({
              ...draft,
              shots: draft.shots.map((item) =>
                item.id === shot.id ? { ...item, ...patch } : item
              ),
            })
          }
          onMove={(direction) => {
            const shots = [...draft.shots]
            ;[shots[index], shots[index + direction]] = [
              shots[index + direction],
              shots[index],
            ]
            update({ ...draft, shots })
          }}
          onRemove={() =>
            update({
              ...draft,
              shots: draft.shots.filter((item) => item.id !== shot.id),
            })
          }
          onDurationValidityChange={onDurationValidityChange}
        />
      ))}
      <div className='flex flex-wrap items-center gap-3'>
        <Button
          variant='outline'
          disabled={!writable || draft.shots.length >= 100}
          onClick={() =>
            update({
              ...draft,
              shots: [
                ...draft.shots,
                {
                  id: `shot_${crypto.randomUUID()}`,
                  title: t('New shot'),
                  text: '',
                  imagePrompt: '',
                  videoPrompt: '',
                  seconds: 5,
                  camera: '',
                  dialogue: '',
                  shotType: '',
                  characterIds: [],
                  propIds: [],
                },
              ],
            })
          }
        >
          {t('Add shot draft')}
        </Button>
        <Button type='submit' disabled={!writable || !valid}>
          {t('Apply shot plan')}
        </Button>
        <span role='status' className='text-muted-foreground text-sm'>
          {t('Total duration: {{seconds}} seconds', {
            seconds: draft.shots.reduce((sum, shot) => sum + shot.seconds, 0),
          })}
        </span>
      </div>
      {impact && (
        <p className='text-muted-foreground text-sm'>
          {t('Affected shots: {{count}}', {
            count: impact.shotIds.length + impact.removedShotIds.length,
          })}
        </p>
      )}
    </form>
  )
}
