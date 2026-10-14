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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import { studioProductionSchema } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import { StudioVoicePicker } from './studio-voice-picker'
import { addStudioNode, updateStudioNode } from './workspace'

export function StudioProductionDialogue(
  options: {
    voice?: string
    onVoice?: (voice: string) => void
    model?: string
    onModel?: (model: string) => void
  } = {}
) {
  const { t } = useTranslation()
  const { props, writable, path, mutate, budget, confirm, capabilities } =
    useStudioProductionContext()
  const production =
    props.project.production || studioProductionSchema.parse({})
  const characters =
    props.project.assets?.filter((asset) => asset.kind === 'character') || []
  const [characterId, setCharacterId] = useState(characters[0]?.id || '')
  const [localVoice, setLocalVoice] = useState('default')
  const voiceId = options.voice ?? localVoice
  const setVoiceId = options.onVoice || setLocalVoice
  const [localModel, setLocalModel] = useState('studio-voice-speech')
  const setModel = options.onModel || setLocalModel
  const model = options.model || localModel
  const [audioNode, setAudioNode] = useState('')
  const audioNodes = props.project.nodes.filter(
    (node) => node.data.kind === 'audio'
  )
  function updateCue(
    id: string,
    patch: Partial<(typeof production.dialogueCues)[number]>
  ) {
    props.onUpdate({
      ...props.project,
      production: {
        ...production,
        dialogueCues: production.dialogueCues.map((cue) =>
          cue.id === id ? { ...cue, ...patch } : cue
        ),
      },
    })
  }
  return (
    <div className='space-y-3 rounded-lg border p-3'>
      <p className='font-medium'>{t('studio.production.characterDialogue')}</p>
      <p className='text-muted-foreground text-xs'>
        {t('studio.production.dialogueReplacesAudio')}
      </p>
      <Select
        value={characterId}
        items={characters.map((asset) => ({
          value: asset.id,
          label: asset.title,
        }))}
        onValueChange={(value) => {
          setCharacterId(value || '')
          const binding = production.voiceBindings[value || '']
          if (binding) {
            setVoiceId(binding.voiceId)
            setModel(binding.model)
          }
        }}
      >
        <SelectTrigger aria-label={t('studio.production.character')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {characters.map((asset) => (
            <SelectItem key={asset.id} value={asset.id}>
              {asset.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {options.voice === undefined && (
        <StudioVoicePicker
          project={props.project}
          value={voiceId}
          disabled={!writable}
          onChange={setVoiceId}
          getMedia={props.getMedia}
        />
      )}
      <p className='text-muted-foreground text-xs'>
        {t('Dialogue affected by a voice change')}:{' '}
        {production.dialogueCues
          .filter((cue) => cue.characterId === characterId)
          .map(
            (cue) =>
              props.project.shots?.find((shot) => shot.id === cue.shotId)
                ?.title || cue.shotId
          )
          .join(', ') || t('None')}
      </p>
      <Collapsible>
        <CollapsibleTrigger render={<Button size='sm' variant='outline' />}>
          {t('Advanced voice settings')}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Field>
            <FieldLabel>{t('studio.production.voiceId')}</FieldLabel>
            <Input
              value={voiceId}
              aria-label={t('studio.production.voiceId')}
              maxLength={100}
              onChange={(event) => setVoiceId(event.target.value)}
              list='studio-dialogue-voices'
            />
            <datalist id='studio-dialogue-voices'>
              {props.project.nodes
                .flatMap((node) => node.data.takes || [])
                .filter((take) => take.voice)
                .map((take) => (
                  <option key={take.id} value={take.voice} />
                ))}
            </datalist>
          </Field>
          <Field>
            <FieldLabel>{t('studio.production.model')}</FieldLabel>
            <Input
              value={model}
              aria-label={t('studio.production.model')}
              maxLength={200}
              onChange={(event) => setModel(event.target.value)}
            />
          </Field>
        </CollapsibleContent>
      </Collapsible>
      <Button
        variant='outline'
        disabled={!writable || !characterId || !voiceId || !model}
        onClick={() =>
          props.onUpdate({
            ...props.project,
            production: {
              ...production,
              voiceBindings: {
                ...production.voiceBindings,
                [characterId]: { voiceId, model },
              },
            },
          })
        }
      >
        {t('studio.production.bindVoice')}
      </Button>
      {Object.entries(production.voiceBindings).map(([id, binding]) => (
        <p key={id} className='text-sm'>
          {characters.find((asset) => asset.id === id)?.title || id} ·{' '}
          {binding.voiceId} · {binding.model}
        </p>
      ))}
      <Button
        disabled={!writable}
        variant='outline'
        onClick={() => {
          const cues = (props.project.shots || [])
            .filter(
              (shot) =>
                shot.dialogue &&
                !production.dialogueCues.some((cue) => cue.shotId === shot.id)
            )
            .map((shot) => ({
              id: crypto.randomUUID(),
              shotId: shot.id,
              characterId: props.project.nodes
                .find((node) => node.id === shot.videoNodeId)
                ?.data.assetIds?.find((id) =>
                  characters.some((asset) => asset.id === id)
                ),
              text: shot.dialogue || '',
              offset: 0,
            }))
          props.onUpdate({
            ...props.project,
            production: {
              ...production,
              dialogueCues: [...production.dialogueCues, ...cues],
            },
          })
        }}
      >
        {t('studio.production.importDialogue')}
      </Button>
      <Collapsible>
        <CollapsibleTrigger render={<Button variant='outline' size='sm' />}>
          {t('Advanced dialogue output')}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Select
            value={audioNode}
            items={audioNodes.map((node) => ({
              value: node.id,
              label: node.data.title,
            }))}
            onValueChange={(value) => setAudioNode(value || '')}
          >
            <SelectTrigger aria-label={t('studio.production.audioTarget')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {audioNodes.map((node) => (
                <SelectItem key={node.id} value={node.id}>
                  {node.data.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CollapsibleContent>
      </Collapsible>
      {production.dialogueCues.map((cue) => (
        <div key={cue.id} className='space-y-2 border-t pt-3'>
          <p>
            {props.project.shots?.find((shot) => shot.id === cue.shotId)?.title}
          </p>
          <Select
            disabled={!writable}
            value={cue.characterId || 'narrator'}
            items={[
              { value: 'narrator', label: t('studio.production.narrator') },
              ...characters.map((asset) => ({
                value: asset.id,
                label: asset.title,
              })),
            ]}
            onValueChange={(value) =>
              updateCue(cue.id, {
                characterId:
                  value === 'narrator' ? undefined : value || undefined,
              })
            }
          >
            <SelectTrigger aria-label={t('studio.production.character')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='narrator'>
                {t('studio.production.narrator')}
              </SelectItem>
              {characters.map((asset) => (
                <SelectItem key={asset.id} value={asset.id}>
                  {asset.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            disabled={!writable}
            aria-label={t('studio.production.dialogueText')}
            maxLength={30000}
            value={cue.text}
            onChange={(event) =>
              updateCue(cue.id, { text: event.target.value })
            }
          />
          <Input
            disabled={!writable}
            aria-label={t('studio.production.dialogueOffset')}
            type='number'
            min='0'
            max='3600'
            step='0.1'
            value={cue.offset}
            onChange={(event) =>
              updateCue(cue.id, { offset: Number(event.target.value) })
            }
          />
          <Select
            disabled={!writable}
            value={cue.audioMediaId || 'none'}
            items={[
              { value: 'none', label: t('studio.production.none') },
              ...audioNodes
                .filter((node) => node.data.mediaId)
                .map((node) => ({
                  value: node.data.mediaId || '',
                  label: node.data.title,
                })),
            ]}
            onValueChange={(value) =>
              updateCue(cue.id, {
                audioMediaId: value === 'none' ? undefined : value || undefined,
                duration: undefined,
              })
            }
          >
            <SelectTrigger aria-label={t('studio.production.dialogueAudio')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='none'>
                {t('studio.production.none')}
              </SelectItem>
              {audioNodes
                .filter((node) => node.data.mediaId)
                .map((node) => (
                  <SelectItem key={node.id} value={node.data.mediaId || ''}>
                    {node.data.title}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            disabled={
              !writable ||
              !confirm ||
              (!audioNode && props.project.nodes.length >= 500) ||
              capabilities.data?.generation_credit_available !== true ||
              !production.voiceBindings[cue.characterId || ''] ||
              mutate.isPending
            }
            onClick={() =>
              mutate.mutate(async () => {
                let output = audioNode
                if (!output) {
                  output = crypto.randomUUID()
                  props.onUpdate(
                    updateStudioNode(
                      addStudioNode(props.project, 'audio', output),
                      output,
                      { title: `${t('Dialogue')} · ${cue.text.slice(0, 60)}` }
                    )
                  )
                  setAudioNode(output)
                }
                await props.onSave()
                const current =
                  await studioCloudRequest<StudioCloudProject>(path)
                const voice = production.voiceBindings[cue.characterId || '']
                await studioCloudRequest(`${path}/jobs`, 'POST', {
                  request_id: crypto.randomUUID(),
                  revision: current.revision,
                  kind: 'media',
                  budget: Math.round(
                    Number(budget) *
                      (capabilities.data?.quota_per_unit || 500000)
                  ),
                  confirm_generation: true,
                  operation: {
                    action: 'voice_speech',
                    node_id: output,
                    dialogue_cue_id: cue.id,
                    model: voice.model,
                    voice_id: voice.voiceId,
                    prompt: cue.text,
                    seconds: 10,
                  },
                })
              })
            }
          >
            {t('studio.production.generateDialogue')}
          </Button>
        </div>
      ))}
      <Button
        variant='outline'
        disabled={
          !writable ||
          mutate.isPending ||
          !production.dialogueCues.some((cue) => cue.audioMediaId)
        }
        onClick={() =>
          mutate.mutate(async () => {
            await props.onSave()
            const current = await studioCloudRequest<StudioCloudProject>(path)
            const aligned = await studioCloudRequest<StudioCloudProject>(
              `${path}/dialogue/align`,
              'POST',
              { revision: current.revision }
            )
            props.onUpdate(aligned.document)
            await props.onRefresh()
          })
        }
      >
        {t('studio.production.alignDialogue')}
      </Button>
    </div>
  )
}
