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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { fetchStudioModels } from './api'
import { inferStudioVideoFamily } from './model-profiles'
import { applyStudioCanvasOperations } from './studio-canvas-commands'
import { useStudioProductionContext } from './studio-production-context'

export function StudioMotionReference() {
  const { t } = useTranslation()
  const { props, writable } = useStudioProductionContext()
  const [open, setOpen] = useState(false)
  const [character, setCharacter] = useState('')
  const [motion, setMotionId] = useState('')
  const [model, setModel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [control, setControl] = useState('edges')
  const group = props.project.defaults?.videoGroup || 'default'
  const catalog = useQuery({
    queryKey: ['studio-creation-video-models', props.userId, group],
    queryFn: () => fetchStudioModels(group),
    enabled: open,
  })
  const choices = (catalog.data || []).filter((model) => {
    const family = inferStudioVideoFamily(model)
    if (control === 'depth') return family === 'wan-vace'
    return (
      family === 'wan-vace' ||
      family === 'seedance-2' ||
      family === 'minimax-h3'
    )
  })
  const images = props.project.nodes.filter(
    (node) => node.data.kind === 'image' && node.data.mediaId
  )
  const videos = props.project.nodes.filter(
    (node) =>
      node.data.kind === 'video' &&
      node.data.mediaId &&
      node.data.purpose !== 'assembly'
  )
  const setMotion = (value: string) => {
    setMotionId(value)
    const data = videos.find((node) => node.id === value)?.data
    const take = data?.takes?.find(
      (item) => item.id === data.selectedTakeId && item.mediaId === data.mediaId
    )
    if (
      take?.model === 'studio-video-depth' ||
      data?.model === 'studio-video-depth'
    ) {
      setControl('depth')
      setModel(
        (catalog.data || []).find(
          (item) => inferStudioVideoFamily(item) === 'wan-vace'
        ) || ''
      )
    }
  }
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className='rounded-lg border p-3'
    >
      <CollapsibleTrigger render={<Button variant='outline' />}>
        {t('Create video with a motion reference')}
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-3 pt-3'>
        <Select
          value={control}
          onValueChange={(value) => {
            setControl(value || 'edges')
            setModel('')
          }}
          disabled={!writable}
        >
          <SelectTrigger aria-label={t('Motion control method')}>
            <SelectValue>
              {control === 'depth'
                ? t('Depth reference video')
                : t('Movement outline')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='edges'>{t('Movement outline')}</SelectItem>
            <SelectItem value='depth'>{t('Depth reference video')}</SelectItem>
          </SelectContent>
        </Select>
        {control === 'depth' && (
          <p className='text-muted-foreground text-xs'>
            {t(
              'First extract a depth reference with the production tool, then select that video here. Depth guides relative space and movement; review the generated character before delivery.'
            )}
          </p>
        )}
        <p className='text-muted-foreground text-xs'>
          {t(
            'Choose an authorized character image and a movement clip. Review the draft and budget before generating. Local VACE transfers the movement outline and composition; review identity and motion in the resulting Take.'
          )}
        </p>
        {choices.length === 0 && (
          <p role='status' className='text-muted-foreground'>
            {t(
              'No model with declared video-reference support is configured for this account.'
            )}
          </p>
        )}
        {[
          {
            key: 'character',
            value: character,
            set: setCharacter,
            choices: images.map((node) => ({
              value: node.id,
              label: node.data.title,
            })),
            label: 'Character reference image',
          },
          {
            key: 'motion',
            value: motion,
            set: setMotion,
            choices: videos.map((node) => ({
              value: node.id,
              label: node.data.title,
            })),
            label: 'Motion reference video',
          },
          {
            key: 'model',
            value: model,
            set: setModel,
            choices: choices.map((value) => ({ value, label: value })),
            label: 'Video-reference model',
          },
        ].map((field) => (
          <Select
            key={field.key}
            value={field.value || null}
            onValueChange={(value) => field.set(value || '')}
            items={field.choices}
          >
            <SelectTrigger aria-label={t(field.label)}>
              <SelectValue placeholder={t(field.label)} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {field.choices.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ))}
        <Textarea
          aria-label={t('Describe the intended movement')}
          value={prompt}
          maxLength={6000}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <Button
          disabled={
            !writable ||
            !character ||
            !motion ||
            !choices.includes(model) ||
            !prompt.trim()
          }
          onClick={() => {
            const id = crypto.randomUUID()
            props.onUpdate(
              applyStudioCanvasOperations(props.project, [
                {
                  op: 'add_node',
                  nodeType: 'video',
                  id,
                  title: t('Motion reference draft'),
                  prompt,
                  model,
                  group,
                },
                {
                  op: 'connect',
                  source: character,
                  target: id,
                  sourceHandle: 'image',
                  targetHandle: 'reference_image',
                },
                {
                  op: 'connect',
                  source: motion,
                  target: id,
                  sourceHandle: 'video',
                  targetHandle: 'reference_video',
                },
                ...(control === 'depth'
                  ? [
                      {
                        op: 'update_node' as const,
                        nodeId: id,
                        patch: {
                          referenceControl: 'depth' as const,
                          resolution: '640x384',
                          seconds: 3,
                        },
                      },
                    ]
                  : []),
              ])
            )
          }}
        >
          {t('Prepare a motion-reference draft')}
        </Button>
      </CollapsibleContent>
    </Collapsible>
  )
}
