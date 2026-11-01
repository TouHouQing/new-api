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
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
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

import type { StudioProject } from './local-projects'
import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import { studioProjectTimeline } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import { acceptStudioReworkImage, prepareStudioRework } from './studio-rework'
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
import { applyStudioEditWithUndo } from './studio-timeline-history'
import { StudioTimelinePreview } from './studio-timeline-preview'

export function StudioReworkPanel() {
  const { t } = useTranslation()
  const {
    props,
    path,
    writable,
    setSelectedNodes,
    setConfirm,
    mutate,
    timelineHistory,
  } = useStudioProductionContext()
  const [sourceId, setSourceId] = useState(props.selectedNodeId || '')
  const [mode, setMode] = useState<'angle' | 'light' | 'region' | 'range'>(
    'angle'
  )
  const [instructions, setInstructions] = useState('')
  const [values, setValues] = useState({
    start: 0,
    end: 3,
    x: 0,
    y: 0,
    width: 256,
    height: 256,
  })
  const [error, setError] = useState('')
  const comparisonGroup = useId()
  const [comparisonTime, setComparisonTime] = useState(0)
  const [comparisonSound, setComparisonSound] = useState<
    'current' | 'replacement'
  >('current')
  const [occurrences, setOccurrences] = useState<Record<string, string>>({})
  const timelineOccurrences = studioProjectTimeline(props.project).map(
    (clip, index) => ({
      clip,
      label: `${index + 1}. ${props.project.nodes.find((item) => item.id === clip.nodeId)?.data.title || t('Original shot or image')} · ${clip.trimStart.toFixed(2)}–${clip.trimEnd?.toFixed(2) || '?'} s · ${clip.speed}×`,
    })
  )
  const [plan, setPlan] = useState<{
    id: string
    revision: number
    document: {
      next_document: StudioProject
      impact: { output_seconds: number }
    }
  }>()
  const compare = (seconds: number, playing = false) => {
    const value = Math.max(
      0,
      Math.min(plan?.document.impact.output_seconds || 0, seconds)
    )
    setComparisonTime(value)
    window.dispatchEvent(
      new CustomEvent('studio-timeline-transport', {
        detail: { group: comparisonGroup, seconds: value, playing },
      })
    )
  }
  const sources = props.project.nodes.filter(
    (node) =>
      ['image', 'video'].includes(node.data.kind) &&
      node.data.mediaId &&
      node.data.purpose !== 'assembly'
  )
  useEffect(() => {
    if (props.selectedNodeId) setSourceId(props.selectedNodeId)
  }, [props.selectedNodeId])
  const source = sources.find((node) => node.id === sourceId)
  let editFields: (keyof typeof values)[] = []
  if (mode === 'range') editFields = ['start', 'end']
  else if (mode === 'region') editFields = ['x', 'y', 'width', 'height']
  const choices =
    source?.data.kind === 'image'
      ? ['angle', 'light', 'region']
      : ['angle', 'light', 'range']
  const replace = async (targetId: string): Promise<void> => {
    const target = props.project.nodes.find((node) => node.id === targetId)
    const range = target?.data.reworkRange
    if (!range || !target?.data.mediaId) {
      throw new Error(t('Finish the replacement clip first'))
    }
    await props.onSave()
    const current = await studioCloudRequest<StudioCloudProject>(path)
    const choices = studioProjectTimeline(current.document).filter(
      (clip) => clip.nodeId === range.sourceNodeId
    )
    const clipId =
      occurrences[targetId] || (choices.length === 1 ? choices[0].id : '')
    if (!clipId) {
      throw new Error(t('Choose the exact timeline occurrence to replace.'))
    }
    setPlan(
      await studioCloudRequest(`${path}/edit-plans`, 'POST', {
        request_id: crypto.randomUUID(),
        revision: current.revision,
        action: 'replace_source_range',
        clip_id: clipId,
        replacement_node_id: targetId,
        review_confirmed: true,
      })
    )
  }
  return (
    <Collapsible className='rounded-lg border p-3'>
      <CollapsibleTrigger render={<Button variant='outline' />}>
        {t('Rework one part of a shot')}
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-3 pt-3'>
        <p className='text-muted-foreground text-xs'>
          {t(
            'New results keep the original Take and audio. Region edits change only the selected image rectangle. Time edits replace only the selected video interval after you review the result.'
          )}
        </p>
        <Select
          value={sourceId || null}
          onValueChange={(value) => {
            setSourceId(value || '')
            setMode('angle')
          }}
          items={sources.map((node) => ({
            value: node.id,
            label: node.data.title,
          }))}
        >
          <SelectTrigger aria-label={t('Original shot or image')}>
            <SelectValue placeholder={t('Original shot or image')} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {sources.map((node) => (
                <SelectItem key={node.id} value={node.id}>
                  {node.data.title}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          value={mode}
          onValueChange={(value) => {
            if (choices.includes(value || '')) setMode(value as typeof mode)
          }}
          items={choices.map((value) => ({
            value,
            label: t(`studio.rework.${value}`),
          }))}
        >
          <SelectTrigger aria-label={t('Rework purpose')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {choices.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`studio.rework.${value}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Textarea
          aria-label={t('Describe the requested change')}
          placeholder={t('Describe the requested change')}
          value={instructions}
          maxLength={6000}
          onChange={(event) => setInstructions(event.target.value)}
        />
        <div className='grid gap-3 sm:grid-cols-4'>
          {editFields.map((field) => (
            <Field key={field}>
              <FieldLabel>{t(`studio.edit.${field}`)}</FieldLabel>
              <Input
                type='number'
                min={0}
                max={field === 'start' || field === 'end' ? 3600 : 4096}
                step={field === 'start' || field === 'end' ? 0.1 : 1}
                value={values[field]}
                aria-label={t(`studio.edit.${field}`)}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field]: Number(event.target.value),
                  }))
                }
              />
            </Field>
          ))}
        </div>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Local Wan supports first-frame guidance. Motion transfer and whole-video region tracking need a compatible motion model; they are not enabled by this model.'
          )}
        </p>
        <Button
          disabled={!writable || !source || !instructions.trim()}
          onClick={() => {
            try {
              const id = crypto.randomUUID()
              props.onUpdate(
                prepareStudioRework(
                  props.project,
                  sourceId,
                  id,
                  instructions,
                  mode,
                  values
                )
              )
              setSelectedNodes([id])
              props.onSelectNode?.(id)
              setConfirm(false)
              setError('')
            } catch (error) {
              setError(String(error))
            }
          }}
        >
          {t('Prepare rework and review its budget')}
        </Button>
        {props.project.nodes
          .filter(
            (node) =>
              node.data.reworkRange &&
              node.data.mediaId &&
              node.data.status === 'completed'
          )
          .map((node) => (
            <div key={node.id} className='flex flex-wrap items-center gap-3'>
              <span>{node.data.title}</span>
              <Select
                value={occurrences[node.id] || null}
                onValueChange={(value) => {
                  setOccurrences({ ...occurrences, [node.id]: value || '' })
                  setPlan(undefined)
                }}
              >
                <SelectTrigger
                  aria-label={`${t('Replacement timeline occurrence')}: ${node.data.title}`}
                >
                  <SelectValue
                    placeholder={t('Choose the exact timeline occurrence')}
                  >
                    {timelineOccurrences.find(
                      ({ clip }) =>
                        clip.id === occurrences[node.id] &&
                        clip.nodeId === node.data.reworkRange?.sourceNodeId
                    )?.label || t('Choose the exact timeline occurrence')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {timelineOccurrences.map(({ clip, label }) =>
                      clip.nodeId === node.data.reworkRange?.sourceNodeId ? (
                        <SelectItem key={clip.id} value={clip.id}>
                          {label}
                        </SelectItem>
                      ) : null
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                disabled={!writable || mutate.isPending}
                variant='outline'
                onClick={() =>
                  mutate.mutate(() => replace(node.id), {
                    onError: (error) => setError(error.message),
                  })
                }
              >
                {t('Preview replacement in the timeline')}
              </Button>
            </div>
          ))}
        {plan && (
          <div className='space-y-3 rounded-md border p-3' role='status'>
            <div className='flex flex-wrap items-center gap-2'>
              <Input
                type='range'
                className='min-w-40 flex-1'
                aria-label={t('Compare both edits at the same time')}
                min={0}
                max={plan.document.impact.output_seconds}
                step={0.01}
                value={Math.min(
                  comparisonTime,
                  plan.document.impact.output_seconds
                )}
                onChange={(event) => compare(Number(event.target.value))}
              />
              <span className='text-xs tabular-nums'>
                {comparisonTime.toFixed(2)} s
              </span>
              <Button
                variant='outline'
                onClick={() => compare(comparisonTime, true)}
              >
                {t('Play both from this position')}
              </Button>
              <Button variant='outline' onClick={() => compare(comparisonTime)}>
                {t('Pause and return both to this position')}
              </Button>
              <Button
                variant='outline'
                onClick={() =>
                  setComparisonSound(
                    comparisonSound === 'current' ? 'replacement' : 'current'
                  )
                }
              >
                {t(
                  comparisonSound === 'current'
                    ? 'Listen to the replacement'
                    : 'Listen to the current edit'
                )}
              </Button>
            </div>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Shared controls seek both previews. Listen to one version at a time to avoid doubled sound.'
              )}
            </p>
            <div className='grid gap-3 lg:grid-cols-2'>
              <div>
                <p>{t('Current edit')}</p>
                <StudioTimelinePreview
                  project={props.project}
                  getMedia={props.getMedia}
                  compact
                  syncGroup={comparisonGroup}
                  muted={comparisonSound !== 'current'}
                />
              </div>
              <div>
                <p>{t('Replacement preview')}</p>
                <StudioTimelinePreview
                  project={plan.document.next_document}
                  getMedia={props.getMedia}
                  compact
                  syncGroup={comparisonGroup}
                  muted={comparisonSound !== 'replacement'}
                />
              </div>
            </div>
            <p>
              {t('Video duration stays unchanged')}:{' '}
              {plan.document.impact.output_seconds.toFixed(2)} s
            </p>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Only the chosen occurrence changes. Original sound, subtitles, music and graphics keep their timing. Sound attached to the replaced clip stays on the project clock. The replacement needs its own framing review.'
              )}
            </p>
            <div className='flex gap-2'>
              <Button
                disabled={!writable || mutate.isPending}
                onClick={() =>
                  mutate.mutate(
                    async () => {
                      await applyStudioEditWithUndo(path, plan, timelineHistory)
                      await props.onRefresh()
                      setPlan(undefined)
                    },
                    { onError: (error) => setError(error.message) }
                  )
                }
              >
                {t('Apply this edit')}
              </Button>
              <Button variant='outline' onClick={() => setPlan(undefined)}>
                {t('Keep current edit')}
              </Button>
            </div>
          </div>
        )}
        {props.project.nodes
          .filter(
            (node) =>
              node.data.kind === 'image' &&
              node.data.derivedFrom &&
              node.data.mediaId &&
              node.data.status === 'completed'
          )
          .map((node) => (
            <div key={node.id} className='flex items-center gap-3'>
              <span>{node.data.title}</span>
              <Button
                disabled={!writable}
                variant='outline'
                onClick={() => {
                  try {
                    props.onUpdate(
                      acceptStudioReworkImage(props.project, node.id)
                    )
                    setError('')
                  } catch (error) {
                    setError(String(error))
                  }
                }}
              >
                {t('Use this image result as a new Take of the original')}
              </Button>
            </div>
          ))}
        {error && (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
