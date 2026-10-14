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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import { applyStudioCanvasOperations } from './studio-canvas-commands'
import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import { useStudioProductionContext } from './studio-production-context'

const presets = [
  ['rain', 'Rain sound'],
  ['wind', 'Wind sound'],
  ['footsteps', 'Footstep sound'],
  ['whoosh', 'Whoosh sound'],
  ['impact', 'Impact sound'],
  ['notification', 'Notification sound'],
] as const

export function StudioSoundPresets() {
  const { t } = useTranslation()
  const { props, path, writable, mutate } = useStudioProductionContext()
  const [seconds, setSeconds] = useState('3')
  const [open, setOpen] = useState(false)
  const duration = Number(seconds)
  const valid =
    writable && Number.isFinite(duration) && duration >= 0.2 && duration <= 30
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className='space-y-3 rounded-lg border p-3'
    >
      <CollapsibleTrigger render={<Button variant='outline' />}>
        {t('Free synthesized sound presets')}
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-3'>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Create a sound clip immediately, preview it, and add it to the timeline. These are synthesized presets; AI soundscapes are separate drafts.'
          )}
        </p>
        <Field>
          <FieldLabel htmlFor='sound-preset-duration'>
            {t('Sound duration in seconds')}
          </FieldLabel>
          <Input
            id='sound-preset-duration'
            type='number'
            min='.2'
            max='30'
            step='.1'
            value={seconds}
            onChange={(event) => setSeconds(event.target.value)}
          />
        </Field>
        <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
          {presets.map(([preset, label]) => (
            <Button
              key={preset}
              variant='outline'
              disabled={!valid || mutate.isPending}
              onClick={() =>
                mutate.mutate(async () => {
                  const id = crypto.randomUUID()
                  const next = applyStudioCanvasOperations(props.project, [
                    { op: 'add_node', nodeType: 'audio', id, title: t(label) },
                  ])
                  props.onUpdate(next)
                  await props.onSave()
                  const stored =
                    await studioCloudRequest<StudioCloudProject>(path)
                  await studioCloudRequest(`${path}/jobs`, 'POST', {
                    request_id: crypto.randomUUID(),
                    revision: stored.revision,
                    kind: 'transform',
                    budget: 0,
                    operation: {
                      node_id: id,
                      action: 'sound_preset',
                      prompt: preset,
                      seconds: duration,
                    },
                  })
                })
              }
            >
              {t(label)}
            </Button>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
