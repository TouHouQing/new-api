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
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { fetchStudioGroups } from './api'
import type { StudioProject } from './local-projects'
import {
  applyStudioRecommendedModels,
  fetchStudioCreationModels,
} from './studio-creation-models'
import { useStudioProductionContext } from './studio-production-context'
import { updateStudioNode } from './workspace'

export function StudioGenerationSetup() {
  const { t } = useTranslation()
  const { props, writable } = useStudioProductionContext()
  const [group, setGroup] = useState(
    props.project.defaults?.videoGroup || 'default'
  )
  const groups = useQuery({
    queryKey: ['studio-creation-groups', props.userId],
    queryFn: fetchStudioGroups,
  })
  const catalog = useQuery({
    queryKey: ['studio-creation-services', props.userId, group],
    queryFn: () => fetchStudioCreationModels(group),
  })
  const [chosen, setChosen] = useState<
    Partial<Record<'text' | 'image' | 'video', string>>
  >({})
  const available = catalog.data || { text: [], image: [], video: [] }
  const defaults = {
    text:
      chosen.text ||
      props.project.defaults?.textModel ||
      available.text[0] ||
      '',
    image:
      chosen.image ||
      props.project.defaults?.imageModel ||
      available.image[0] ||
      '',
    video:
      chosen.video ||
      props.project.defaults?.videoModel ||
      available.video[0] ||
      '',
  }
  useEffect(() => {
    if (!writable || !catalog.data) return
    const available = catalog.data
    if (
      (!available.text.length || props.project.defaults?.textModel) &&
      (!available.image.length || props.project.defaults?.imageModel) &&
      (!available.video.length || props.project.defaults?.videoModel)
    ) {
      return
    }
    props.onUpdate(
      applyStudioRecommendedModels(props.project, available, group)
    )
  }, [catalog.data, writable, props, group])
  return (
    <Collapsible>
      <CollapsibleTrigger render={<Button size='sm' variant='outline' />}>
        {t('Model and generation settings')}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className='space-y-3 rounded-lg border p-3'>
          {catalog.isError && <p role='alert'>{catalog.error.message}</p>}
          <p className='font-medium'>{t('Recommended platform services')}</p>
          <p className='text-sm'>
            {t(
              'Story writing, reference images and shot videos use the available platform services.'
            )}
          </p>
          {!available.video.length && !catalog.isLoading && (
            <p role='status'>
              {t(
                'No video service is available for this account. Upload footage or ask the administrator to configure a service.'
              )}
            </p>
          )}
          <Button
            variant='outline'
            disabled={!writable || !defaults.video}
            onClick={() =>
              props.onUpdate(
                applyStudioRecommendedModels(props.project, available, group)
              )
            }
          >
            {t('Apply recommended model settings')}
          </Button>
          {defaults.video === 'wan2.2-ti2v-5b' && (
            <p className='text-muted-foreground text-xs'>
              {t(
                'The local video model supports clips of up to 10 seconds and one first frame. Split longer shots before editing them together.'
              )}
            </p>
          )}
          <p className='text-muted-foreground text-xs'>
            {t(
              'Available services are loaded from your account. Applying choices configures unfinished nodes and does not generate media.'
            )}
          </p>
          <Collapsible>
            <CollapsibleTrigger render={<Button variant='outline' size='sm' />}>
              {t('Advanced model selection')}
            </CollapsibleTrigger>
            <CollapsibleContent className='space-y-3 pt-3'>
              <Select
                value={group}
                onValueChange={(value) => {
                  if (value) {
                    setGroup(value)
                    setChosen((current) => ({ ...current, video: undefined }))
                  }
                }}
                items={(groups.data || []).map((item) => ({
                  value: item.id,
                  label: item.description || item.id,
                }))}
              >
                <SelectTrigger aria-label={t('Service group')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {groups.data?.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.description || item.id}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <div className='grid gap-3 sm:grid-cols-3'>
                {(['text', 'image', 'video'] as const).map((kind) => (
                  <Field key={kind}>
                    <FieldLabel>{t(`studio.kind.${kind}`)}</FieldLabel>
                    <Select
                      disabled={!writable}
                      value={defaults[kind] || null}
                      onValueChange={(value) =>
                        setChosen((current) => ({
                          ...current,
                          [kind]: value || undefined,
                        }))
                      }
                      items={available[kind].map((value) => ({
                        value,
                        label: value,
                      }))}
                    >
                      <SelectTrigger aria-label={t(`studio.kind.${kind}`)}>
                        <SelectValue
                          placeholder={t('Choose an available model')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {available[kind].map((value) => (
                            <SelectItem key={value} value={value}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                ))}
              </div>
              <Button
                variant='outline'
                disabled={!writable}
                onClick={() => {
                  let next: StudioProject = {
                    ...props.project,
                    defaults: {
                      ...props.project.defaults,
                      textModel: defaults.text || undefined,
                      imageModel: defaults.image || undefined,
                      videoModel: defaults.video || undefined,
                      videoGroup: group,
                    },
                  }
                  for (const node of next.nodes) {
                    if (
                      node.data.model ||
                      node.data.sourceMode === 'upload' ||
                      node.data.locked ||
                      node.data.purpose === 'assembly' ||
                      node.data.purpose === 'note' ||
                      node.data.outputText ||
                      node.data.kind === 'audio'
                    ) {
                      continue
                    }
                    const model = defaults[node.data.kind]
                    if (model) {
                      next = updateStudioNode(next, node.id, {
                        model,
                        ...(node.data.kind === 'video' ? { group } : {}),
                      })
                    }
                  }
                  props.onUpdate(next)
                }}
              >
                {t('Apply models to unconfigured nodes')}
              </Button>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
