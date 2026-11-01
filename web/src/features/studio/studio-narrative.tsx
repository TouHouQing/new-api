/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'

import type { StudioProject } from './local-projects'
import { studioProductionSchema } from './studio-production'

type Narrative = NonNullable<
  NonNullable<StudioProject['production']>['shotNarrative']
>[string]
type SuggestionCode =
  | 'missing_purpose'
  | 'missing_information'
  | 'missing_ending'
  | 'repeated_framing'
  | 'overloaded_action'
  | 'dialogue_overrun'

function studioNarrativeSuggestions(project: StudioProject): Array<{
  shotId: string
  code: SuggestionCode
}> {
  const suggestions: Array<{ shotId: string; code: SuggestionCode }> = []
  const shots = project.shots || []
  for (const [index, shot] of shots.entries()) {
    const narrative = project.production?.shotNarrative?.[shot.id]
    if (!narrative) {
      suggestions.push({ shotId: shot.id, code: 'missing_purpose' })
    }
    if (!narrative?.information.trim()) {
      suggestions.push({ shotId: shot.id, code: 'missing_information' })
    }
    if (
      index > 0 &&
      shot.shotType?.trim() &&
      shot.shotType.trim().toLowerCase() ===
        shots[index - 1].shotType?.trim().toLowerCase()
    ) {
      suggestions.push({ shotId: shot.id, code: 'repeated_framing' })
    }
    const video = project.nodes.find((node) => node.id === shot.videoNodeId)
    const seconds = video?.data.seconds
    // Reading-speed estimates are suggestions, never an automatic trim.
    if (
      typeof seconds === 'number' &&
      seconds > 0 &&
      (shot.dialogue || '').replaceAll(/\s/g, '').length > seconds * 6
    ) {
      suggestions.push({ shotId: shot.id, code: 'dialogue_overrun' })
    }
    if (
      (narrative?.visualBeat || '')
        .split(/[;；\n]+/)
        .filter((part) => part.trim()).length > 3
    ) {
      suggestions.push({ shotId: shot.id, code: 'overloaded_action' })
    }
  }
  const lastShot = shots.at(-1)
  if (
    lastShot &&
    shots.length > 1 &&
    !shots.some(
      (shot) =>
        project.production?.shotNarrative?.[shot.id]?.purpose === 'ending'
    )
  ) {
    suggestions.push({ shotId: lastShot.id, code: 'missing_ending' })
  }
  return suggestions
}

export function StudioNarrative(props: {
  project: StudioProject
  disabled?: boolean
  onUpdate?: (project: StudioProject) => void
  onSelectNode?: (nodeId: string) => void
}) {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState('')
  const [notice, setNotice] = useState('')
  const shots = props.project.shots || []
  const shot = shots.find((item) => item.id === selectedId) || shots[0]
  if (!shot) return null
  const production =
    props.project.production || studioProductionSchema.parse({})
  const shotNodes = new Set([
    shot.textNodeId,
    shot.imageNodeId,
    shot.videoNodeId,
  ])
  const locked = props.project.nodes.some(
    (node) => shotNodes.has(node.id) && node.data.locked
  )
  const working = props.project.nodes.some(
    (node) =>
      shotNodes.has(node.id) &&
      ['submitting', 'queued', 'processing'].includes(node.data.status || '')
  )
  const readonly = props.disabled || !props.onUpdate
  const disabled = readonly || locked || working
  const index = shots.findIndex((item) => item.id === shot.id)
  let suggestedPurpose: Narrative['purpose'] = 'action'
  if (index === 0) suggestedPurpose = 'opening'
  else if (index === shots.length - 1) suggestedPurpose = 'ending'
  else if (production.guide?.goal === 'product') suggestedPurpose = 'benefit'
  else if (production.guide?.goal !== 'story') suggestedPurpose = 'establish'
  const narrative: Narrative = production.shotNarrative?.[shot.id] || {
    purpose: suggestedPurpose,
    information: '',
    emotion: '',
    visualBeat: '',
    continuityNeeds: '',
  }
  const suggestions = studioNarrativeSuggestions(props.project)
  const currentSuggestions = suggestions.filter(
    (item) => item.shotId === shot.id
  )
  const video = props.project.nodes.find((node) => node.id === shot.videoNodeId)
  function update(patch: Partial<Narrative>) {
    if (disabled) return
    props.onUpdate?.({
      ...props.project,
      production: {
        ...production,
        documentVersion: 2,
        shotNarrative: {
          ...production.shotNarrative,
          [shot.id]: { ...narrative, ...patch },
        },
      },
    })
    setNotice(
      t(
        'Shot purpose saved. Existing prompts, references and Takes are retained.'
      )
    )
  }
  function explain(code: SuggestionCode) {
    switch (code) {
      case 'missing_purpose':
        return t('Choose what this shot contributes before generating it.')
      case 'missing_information':
        return t('Write one new thing the viewer should learn from this shot.')
      case 'missing_ending':
        return t(
          'Choose an ending shot that resolves the story or gives the next step.'
        )
      case 'repeated_framing':
        return t(
          'This framing repeats the previous shot. Consider a detail or a wider view if the information also repeats.'
        )
      case 'overloaded_action':
        return t(
          'Several visual actions compete in this shot. Keep one main action or split it in the storyboard.'
        )
      case 'dialogue_overrun':
        return t(
          'The dialogue may exceed this shot at a natural pace. Shorten the line or extend the shot after checking the voice preview.'
        )
    }
  }
  return (
    <section
      aria-label={t('Shot purpose and rhythm')}
      className='mb-4 rounded-lg border p-3'
    >
      <details>
        <summary className='cursor-pointer font-medium'>
          {t('Shot purpose and rhythm')} ·{' '}
          {t('{{count}} suggestions', { count: suggestions.length })}
        </summary>
        <div className='mt-3 flex flex-col gap-3'>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Explain why each shot exists, then adjust only the shot you choose. Suggestions are a guide; your story can use its own structure.'
            )}
          </p>
          <div
            className='flex flex-wrap gap-2'
            aria-label={t('Shots to review')}
          >
            {shots.map((item, itemIndex) => (
              <Button
                key={item.id}
                size='sm'
                variant={item.id === shot.id ? 'secondary' : 'outline'}
                aria-pressed={item.id === shot.id}
                onClick={() => {
                  setSelectedId(item.id)
                  setNotice('')
                }}
              >
                {itemIndex + 1}. {item.title}
              </Button>
            ))}
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            {locked && <Badge variant='secondary'>{t('Locked')}</Badge>}
            {working && (
              <Badge variant='secondary'>{t('studio.generating')}</Badge>
            )}
            <Button
              size='sm'
              variant='outline'
              disabled={readonly || working}
              onClick={() =>
                props.onUpdate?.({
                  ...props.project,
                  nodes: props.project.nodes.map((node) =>
                    shotNodes.has(node.id)
                      ? { ...node, data: { ...node.data, locked: !locked } }
                      : node
                  ),
                })
              }
            >
              {locked ? t('Unlock this shot') : t('Lock this shot')}
            </Button>
            {props.onSelectNode && (
              <Button
                size='sm'
                variant='ghost'
                onClick={() => props.onSelectNode?.(shot.videoNodeId)}
              >
                {t('Open this shot')}
              </Button>
            )}
          </div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`purpose-${shot.id}`}>
                {t('What should this shot do?')}
              </FieldLabel>
              <NativeSelect
                id={`purpose-${shot.id}`}
                value={narrative.purpose}
                disabled={disabled}
                onChange={(event) =>
                  update({
                    purpose: event.target.value as Narrative['purpose'],
                  })
                }
              >
                <NativeSelectOption value='opening'>
                  {t('Capture attention')}
                </NativeSelectOption>
                <NativeSelectOption value='establish'>
                  {t('Establish the situation')}
                </NativeSelectOption>
                <NativeSelectOption value='action'>
                  {t('Move the action forward')}
                </NativeSelectOption>
                <NativeSelectOption value='emotion'>
                  {t('Show an emotional change')}
                </NativeSelectOption>
                <NativeSelectOption value='benefit'>
                  {t('Demonstrate a benefit')}
                </NativeSelectOption>
                <NativeSelectOption value='ending'>
                  {t('Resolve or give the next step')}
                </NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor={`information-${shot.id}`}>
                {t('New information for the viewer')}
              </FieldLabel>
              <Textarea
                id={`information-${shot.id}`}
                value={narrative.information}
                maxLength={2000}
                disabled={disabled}
                onChange={(event) =>
                  update({ information: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`emotion-${shot.id}`}>
                {t('Emotional change')}
              </FieldLabel>
              <Textarea
                id={`emotion-${shot.id}`}
                value={narrative.emotion}
                maxLength={500}
                disabled={disabled}
                onChange={(event) => update({ emotion: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`beat-${shot.id}`}>
                {t('Main visual action and rhythm')}
              </FieldLabel>
              <Textarea
                id={`beat-${shot.id}`}
                value={narrative.visualBeat}
                maxLength={2000}
                disabled={disabled}
                onChange={(event) => update({ visualBeat: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`continuity-${shot.id}`}>
                {t('What must stay consistent?')}
              </FieldLabel>
              <Textarea
                id={`continuity-${shot.id}`}
                value={narrative.continuityNeeds}
                maxLength={2000}
                disabled={disabled}
                onChange={(event) =>
                  update({ continuityNeeds: event.target.value })
                }
              />
            </Field>
          </FieldGroup>
          {!!currentSuggestions.length && (
            <ul className='flex list-disc flex-col gap-2 pl-5 text-sm'>
              {currentSuggestions.map((item) => (
                <li key={item.code}>{explain(item.code)}</li>
              ))}
            </ul>
          )}
          <div className='flex flex-wrap gap-2'>
            <Button
              size='sm'
              variant='outline'
              disabled={disabled}
              onClick={() => update({ purpose: suggestedPurpose })}
            >
              {t('Use suggested purpose for this shot')}
            </Button>
            {currentSuggestions.some(
              (item) => item.code === 'missing_ending'
            ) && (
              <Button
                size='sm'
                variant='outline'
                disabled={disabled}
                onClick={() => update({ purpose: 'ending' })}
              >
                {t('Make this the ending shot')}
              </Button>
            )}
            <Button
              size='sm'
              disabled={
                disabled ||
                !video ||
                !narrative.visualBeat.trim() ||
                !!video.data.prompt.includes(narrative.visualBeat.trim()) ||
                video.data.prompt.length +
                  narrative.visualBeat.trim().length +
                  1 >
                  30000
              }
              onClick={() => {
                if (disabled || !video || !narrative.visualBeat.trim()) return
                props.onUpdate?.({
                  ...props.project,
                  nodes: props.project.nodes.map((node) =>
                    node.id === video.id
                      ? {
                          ...node,
                          data: {
                            ...node.data,
                            prompt: [
                              node.data.prompt,
                              narrative.visualBeat.trim(),
                            ]
                              .filter(Boolean)
                              .join('\n'),
                          },
                        }
                      : node
                  ),
                })
                setNotice(
                  t(
                    'Visual direction added to this shot. Review it before generating a new Take.'
                  )
                )
              }}
            >
              {t('Add this visual action to this shot draft')}
            </Button>
          </div>
          {notice && (
            <p role='status' className='text-muted-foreground text-sm'>
              {notice}
            </p>
          )}
        </div>
      </details>
    </section>
  )
}
