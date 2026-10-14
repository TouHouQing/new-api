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

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import { applyStudioCanvasOperations } from './studio-canvas-commands'
import { studioProductionSchema } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'

export function StudioShotGroups() {
  const { t } = useTranslation()
  const { props, writable } = useStudioProductionContext()
  const production =
    props.project.production || studioProductionSchema.parse({})
  const [title, setTitle] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [remove, setRemove] = useState('')
  const [removeMembers, setRemoveMembers] = useState(false)
  const group = production.shotGroups.find((group) => group.id === remove)
  const update = (groups: typeof production.shotGroups): void =>
    props.onUpdate({
      ...props.project,
      production: { ...production, shotGroups: groups },
      updatedAt: new Date().toISOString(),
    })
  return (
    <Collapsible className='rounded-lg border p-3'>
      <CollapsibleTrigger render={<Button variant='outline' />}>
        {t('Shot work groups')}
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-3 pt-3'>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Groups organize different shots. Candidate versions stay inside each node. Folding either view keeps its references unchanged.'
          )}
        </p>
        <Input
          disabled={!writable}
          aria-label={t('Group name')}
          placeholder={t('Group name')}
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
        />
        <div className='flex flex-wrap gap-3'>
          {props.project.shots?.map((shot) => (
            <Field key={shot.id} orientation='horizontal'>
              <Checkbox
                id={`group-${shot.id}`}
                disabled={!writable}
                checked={selected.includes(shot.id)}
                onCheckedChange={(checked) =>
                  setSelected((current) =>
                    checked
                      ? [...current, shot.id]
                      : current.filter((id) => id !== shot.id)
                  )
                }
              />
              <FieldLabel htmlFor={`group-${shot.id}`}>{shot.title}</FieldLabel>
            </Field>
          ))}
        </div>
        <Button
          disabled={
            !writable ||
            !title.trim() ||
            !selected.length ||
            production.shotGroups.length >= 100
          }
          onClick={() => {
            update([
              ...production.shotGroups,
              {
                id: crypto.randomUUID(),
                title: title.trim(),
                shotIds: selected,
                collapsed: false,
              },
            ])
            setTitle('')
            setSelected([])
          }}
        >
          {t('Create shot group')}
        </Button>
        {production.shotGroups.map((group) => (
          <Collapsible
            key={group.id}
            open={!group.collapsed}
            onOpenChange={(open) =>
              update(
                production.shotGroups.map((item) =>
                  item.id === group.id ? { ...item, collapsed: !open } : item
                )
              )
            }
            className='border-t pt-3'
          >
            <div className='flex items-center gap-2'>
              <CollapsibleTrigger render={<Button variant='ghost' />}>
                {group.title} · {group.shotIds.length}
              </CollapsibleTrigger>
              <Button
                disabled={!writable}
                variant='ghost'
                onClick={() => {
                  setRemove(group.id)
                  setRemoveMembers(false)
                }}
              >
                {t('Remove group')}
              </Button>
            </div>
            <CollapsibleContent>
              <ul className='space-y-1 text-sm'>
                {group.shotIds.map((id) => (
                  <li key={id}>
                    {props.project.shots?.find((shot) => shot.id === id)
                      ?.title || id}
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        ))}
        <ConfirmDialog
          open={Boolean(group)}
          onOpenChange={(open) => {
            if (!open) setRemove('')
          }}
          title={t('Remove group')}
          desc={
            <div className='space-y-3'>
              <p>
                {group?.title} · {group?.shotIds.length} {t('shots')}
              </p>
              <Field orientation='horizontal'>
                <Checkbox
                  id='group-delete-members'
                  checked={removeMembers}
                  onCheckedChange={(value) => setRemoveMembers(value === true)}
                />
                <FieldLabel htmlFor='group-delete-members'>
                  {t('Also delete member shot nodes and their connections')}
                </FieldLabel>
              </Field>
              <p>
                {t(
                  'Leaving this unchecked removes only the group. Undo restores the project structure.'
                )}
              </p>
            </div>
          }
          handleConfirm={() => {
            if (!group) return
            let next = props.project
            if (removeMembers) {
              const nodes = (props.project.shots || [])
                .filter((shot) => group.shotIds.includes(shot.id))
                .flatMap((shot) => [
                  shot.textNodeId,
                  shot.imageNodeId,
                  shot.videoNodeId,
                ])
              next = applyStudioCanvasOperations(next, [
                { op: 'remove_nodes', nodeIds: nodes },
              ])
            }
            props.onUpdate({
              ...next,
              production: {
                ...(next.production || production),
                shotGroups: production.shotGroups.filter(
                  (item) => item.id !== group.id
                ),
              },
            })
            setRemove('')
          }}
          confirmText={t('Remove group')}
        />
      </CollapsibleContent>
    </Collapsible>
  )
}
