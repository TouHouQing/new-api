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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import { parseStudioProjectImport, type StudioProject } from './local-projects'
import { parseStudioAssistantPlan } from './studio-assistant'

export function StudioAssistantPlanEditor(props: {
  project: StudioProject
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  let beforeProject = props.project
  const assistant = props.project.production?.assistant
  if (assistant?.applied && assistant.undoDocument) {
    try {
      beforeProject = parseStudioProjectImport(assistant.undoDocument)
    } catch {
      /* Old snapshots remain accessible via project versions. */
    }
  }
  const [editing, setEditing] = useState<{
    source: string
    plan: ReturnType<typeof parseStudioAssistantPlan>
    numbers: Record<string, string>
  } | null>(null)
  const displayValue = (value: unknown): string => {
    if (value === undefined || value === null || value === '') return t('Empty')
    if (typeof value === 'boolean') return t(value ? 'Enabled' : 'Disabled')
    if (Array.isArray(value)) {
      return value.map((item) => displayValue(item)).join(' · ')
    }
    if (typeof value === 'object') {
      return Object.entries(value)
        .map(
          ([field, entry]) =>
            `${t(`studio.plan.${field}`, { defaultValue: t(field) })}: ${displayValue(entry)}`
        )
        .join(' · ')
    }
    const text = String(value)
    return (
      props.project.nodes.find(
        (node) => node.id === text || node.data.mediaId === text
      )?.data.title ||
      props.project.assets?.find((asset) => asset.id === text)?.title ||
      props.project.shots?.find((shot) => shot.id === text)?.title ||
      text
    )
  }
  const beforeValue = (
    operation: ReturnType<
      typeof parseStudioAssistantPlan
    >['operations'][number],
    field: string
  ): string => {
    let target: object | undefined
    if ('nodeId' in operation) {
      target = beforeProject.nodes.find(
        (node) => node.id === operation.nodeId
      )?.data
    } else if ('shotId' in operation) {
      target = beforeProject.shots?.find((shot) => shot.id === operation.shotId)
    }
    return displayValue(
      target
        ? (Object.entries(target).find(([key]) => key === field)?.[1] ?? '')
        : ''
    )
  }
  let plan: ReturnType<typeof parseStudioAssistantPlan> | undefined
  try {
    plan = parseStudioAssistantPlan(props.value)
  } catch {
    /* The original model response remains available for repair. */
  }
  const current = editing?.source === props.value ? editing.plan : plan
  const updatePlan = (
    next: ReturnType<typeof parseStudioAssistantPlan>,
    numbers = {}
  ): void => {
    const source = JSON.stringify(next, null, 2)
    setEditing({ source, plan: next, numbers })
    props.onChange(source)
  }
  const updatePatch = (
    index: number,
    field: string,
    value: unknown,
    numberText?: string
  ): void => {
    if (!current) return
    updatePlan(
      {
        ...current,
        operations: current.operations.map((operation, operationIndex) => {
          if (operationIndex !== index) return operation
          if (operation.op === 'update_node') {
            return {
              ...operation,
              patch: { ...operation.patch, [field]: value },
            }
          }
          if (operation.op === 'update_shot') {
            return {
              ...operation,
              patch: { ...operation.patch, [field]: value },
            }
          }
          return operation
        }),
      },
      numberText === undefined ? {} : { [`${index}:${field}`]: numberText }
    )
  }
  return (
    <div className='space-y-3'>
      {current?.workflowActions?.map((action) => (
        <div key={action.id} className='space-y-2 rounded-md border p-2'>
          <p className='text-sm'>{action.title}</p>
          <p className='text-muted-foreground text-xs'>
            {t('Saved workflow action')} ·{' '}
            {t(`studio.production.${action.kind}`)}
          </p>
          <Button
            variant='outline'
            size='sm'
            disabled={props.disabled}
            onClick={() =>
              updatePlan({
                ...current,
                workflowActions: current.workflowActions?.filter(
                  (item) => item.id !== action.id
                ),
              })
            }
          >
            {t('Remove proposed task')}
          </Button>
        </div>
      ))}
      {current?.operations.map((operation, index) => (
        <div
          key={JSON.stringify([
            index,
            operation.op,
            'nodeId' in operation ? operation.nodeId : '',
            'shotId' in operation ? operation.shotId : '',
            'title' in operation ? operation.title : '',
            'patch' in operation ? Object.keys(operation.patch).sort() : [],
          ])}
          className='space-y-2 rounded-md border p-3'
        >
          <p className='text-sm font-medium'>
            {t('Proposed edit')} {index + 1} ·{' '}
            {t(`studio.plan.op.${operation.op}`, {
              defaultValue: t('Proposed change'),
            })}{' '}
            ·{' '}
            {'nodeId' in operation
              ? props.project.nodes.find((node) => node.id === operation.nodeId)
                  ?.data.title || operation.nodeId
              : props.project.shots?.find(
                  (shot) =>
                    'shotId' in operation && shot.id === operation.shotId
                )?.title || t('Project')}
          </p>
          {!('patch' in operation) && (
            <dl className='space-y-1 text-sm'>
              {Object.entries(operation)
                .filter(([key]) => !['op', 'nodeId', 'shotId'].includes(key))
                .map(([field, value]) => (
                  <div key={field}>
                    <dt className='font-medium'>
                      {t(`studio.plan.${field}`, { defaultValue: t(field) })}
                    </dt>
                    <dd className='break-words'>{displayValue(value)}</dd>
                  </div>
                ))}
            </dl>
          )}
          {'patch' in operation &&
            Object.entries(operation.patch)
              .filter(([, value]) => typeof value !== 'string')
              .map(([field, value]) => (
                <div className='rounded border p-2 text-sm' key={field}>
                  <b>{t(`studio.plan.${field}`, { defaultValue: t(field) })}</b>
                  <p>
                    {t('Before')}: {beforeValue(operation, field)} →{' '}
                    {t('After')}: {displayValue(value)}
                  </p>
                  {typeof value === 'number' && (
                    <Input
                      type='number'
                      step='any'
                      disabled={props.disabled}
                      aria-label={`${t('Proposed edit')} ${index + 1} ${t(`studio.plan.${field}`, { defaultValue: t(field) })}`}
                      value={
                        editing?.source === props.value
                          ? (editing.numbers[`${index}:${field}`] ??
                            String(value))
                          : String(value)
                      }
                      onChange={(event) =>
                        updatePatch(
                          index,
                          field,
                          Number(event.target.value),
                          event.target.value
                        )
                      }
                    />
                  )}
                  {typeof value === 'boolean' && (
                    <Checkbox
                      disabled={props.disabled}
                      aria-label={`${t('Proposed edit')} ${index + 1} ${t(`studio.plan.${field}`, { defaultValue: t(field) })}`}
                      checked={value}
                      onCheckedChange={(checked) =>
                        updatePatch(index, field, checked === true)
                      }
                    />
                  )}
                </div>
              ))}
          {'patch' in operation &&
            Object.entries(operation.patch)
              .filter(([, value]) => typeof value === 'string')
              .map(([field, value]) => (
                <Field key={field}>
                  <FieldLabel>
                    {t(`studio.plan.${field}`, { defaultValue: t(field) })}
                  </FieldLabel>
                  <p className='text-muted-foreground text-xs'>
                    {t('Before')}: {beforeValue(operation, field)}
                    {' → '}
                    {t('After')}: {String(value)}
                  </p>
                  <Textarea
                    disabled={props.disabled}
                    aria-label={`${t('Proposed edit')} ${index + 1} ${t(`studio.plan.${field}`, { defaultValue: t(field) })}`}
                    value={String(value)}
                    maxLength={30000}
                    onChange={(event) =>
                      updatePatch(index, field, event.target.value)
                    }
                  />
                </Field>
              ))}
        </div>
      ))}
      {current && (
        <div className='flex flex-wrap gap-3'>
          {props.project.nodes
            .filter((node) => current.generateNodeIds.includes(node.id))
            .map((node) => (
              <Field key={node.id} orientation='horizontal'>
                <Checkbox
                  id={`plan-generate-${node.id}`}
                  disabled={props.disabled}
                  checked
                  onCheckedChange={(checked) => {
                    if (!checked) {
                      updatePlan({
                        ...current,
                        generateNodeIds: current.generateNodeIds.filter(
                          (id) => id !== node.id
                        ),
                      })
                    }
                  }}
                />
                <FieldLabel htmlFor={`plan-generate-${node.id}`}>
                  {t('Generate')}: {node.data.title}
                </FieldLabel>
              </Field>
            ))}
        </div>
      )}
      <Collapsible defaultOpen={!current}>
        <CollapsibleTrigger render={<Button variant='outline' size='sm' />}>
          {t('Advanced plan JSON')}
        </CollapsibleTrigger>
        <CollapsibleContent className='pt-3'>
          <Textarea
            disabled={props.disabled}
            aria-label={t('Editable plan')}
            className='min-h-40 font-mono text-xs'
            value={props.value}
            maxLength={100000}
            onChange={(event) => props.onChange(event.target.value)}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
