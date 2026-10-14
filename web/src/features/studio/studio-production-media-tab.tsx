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
import { useEffect, useRef, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import { StudioBudgetSummary } from './studio-budget-summary'
import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import {
  STUDIO_MEDIA_MODELS as models,
  studioMediaTakeDraft,
  studioMediaModelAction,
  studioMediaDraftSchema,
  type StudioMediaAction as MediaAction,
} from './studio-media-draft'
import { StudioMediaThumbnail } from './studio-media-thumbnail'
import { StudioMotionReference } from './studio-motion-reference'
import { studioProductionSchema } from './studio-production'
import { StudioProductionChanges } from './studio-production-changes'
import { useStudioProductionContext } from './studio-production-context'
import { StudioProductionDialogue } from './studio-production-dialogue'
import { studioSongDuration } from './studio-song-duration'
import { StudioSoundPresets } from './studio-sound-presets'
import { StudioToolArtifacts } from './studio-tool-artifacts'
import {
  StudioToolParameters,
  type StudioToolOptions,
} from './studio-tool-parameters'
import { StudioVoiceLibrary } from './studio-voice-library'
import { StudioVoicePicker } from './studio-voice-picker'
import { addStudioNode, updateStudioNode } from './workspace'

export function StudioProductionMediaTab(
  options: { value?: string; active?: boolean; voice?: boolean } = {}
) {
  const { t } = useTranslation()
  const {
    props,
    path,
    writable,
    mutate,
    budget,
    setBudget,
    confirm,
    setConfirm,
    capabilities,
    mediaDraftNodeId,
    activeTab,
  } = useStudioProductionContext()
  const editing =
    props.open && (options.active ?? activeTab === (options.value || 'media'))
  const [action, setAction] = useState<MediaAction>(
    options.value === 'voice' || options.voice ? 'voice_speech' : 'music'
  )
  const [model, setModel] = useState<string>(
    options.value === 'voice' || options.voice
      ? models.voice_speech
      : models.music
  )
  const [prompt, setPrompt] = useState('')
  const [seconds, setSeconds] = useState('10')
  const [nodeId, setNodeId] = useState('')
  const [references, setReferences] = useState<string[]>([])
  const [voice, setVoice] = useState('default')
  const [rights, setRights] = useState(false)
  const [toolOptions, setToolOptions] = useState<StudioToolOptions>({
    width: 1024,
    height: 1024,
    scale: 2,
    rows: 2,
    columns: 2,
    speed: 1,
    pitch: 0,
    pause: 0,
    expression: 0.5,
    translation: '',
  })
  const [language, setLanguage] = useState('zh')
  const languageEdited = useRef(false)
  const durationEdited = useRef(false)
  const [referenceSearch, setReferenceSearch] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [sourceDurations, setSourceDurations] = useState<
    Record<string, number>
  >({})
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (!editing) {
      setHydrated(false)
      return
    }
    const selected = props.project.nodes.find(
      (node) => node.id === mediaDraftNodeId
    )
    const saved =
      props.project.production?.mediaDrafts?.find(
        (draft) => draft.node_id === mediaDraftNodeId
      ) || props.project.production?.mediaDraft
    const source = studioMediaTakeDraft(selected)
    const currentAction = studioMediaModelAction(selected?.data.model)
    const draft =
      saved &&
      ((!source && !currentAction) ||
        !mediaDraftNodeId ||
        (saved.node_id === mediaDraftNodeId &&
          (!currentAction || saved.action === currentAction)))
        ? saved
        : source
    const selectedAction = draft?.action || currentAction
    if (!selectedAction) {
      setHydrated(true)
      return
    }
    setAction(selectedAction)
    setModel(draft?.model || models[selectedAction])
    setPrompt(draft?.prompt ?? selected?.data.prompt ?? '')
    setSeconds(String(draft?.seconds ?? selected?.data.seconds ?? 10))
    durationEdited.current = !!draft
    setNodeId(draft?.node_id || selected?.id || '')
    setVoice(draft?.voice_id || 'default')
    setLanguage(draft?.language || 'zh')
    languageEdited.current = !!draft?.language
    setToolOptions((current) => ({ ...current, ...draft?.options }))
    setReferences(draft?.reference_media_ids || [])
    setRights(false)
    setConfirm(false)
    setHydrated(true)
    // Reload only when the user changes the source node. Completed tasks must
    // not overwrite edits made while a generation is running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaDraftNodeId, editing, props.project.id])
  const duration = action.startsWith('image_') ? 1 : Number(seconds)
  const draft = studioMediaDraftSchema.safeParse({
    action,
    model,
    prompt,
    seconds: duration || 0,
    node_id: nodeId,
    language,
    voice_id: voice,
    reference_media_ids: references,
    options: toolOptions,
  })
  const draftFingerprint = draft.success ? JSON.stringify(draft.data) : ''
  useEffect(() => {
    if (
      !editing ||
      !writable ||
      !hydrated ||
      !draftFingerprint ||
      (JSON.stringify(props.project.production?.mediaDraft) ===
        draftFingerprint &&
        (!nodeId ||
          JSON.stringify(
            props.project.production?.mediaDrafts?.find(
              (item) => item.node_id === nodeId
            )
          ) === draftFingerprint))
    ) {
      return
    }
    const production = studioProductionSchema.parse(
      props.project.production || {}
    )
    const savedDraft = JSON.parse(draftFingerprint)
    props.onUpdate({
      ...props.project,
      production: {
        ...production,
        mediaDraft: savedDraft,
        mediaDrafts: nodeId
          ? [
              ...production.mediaDrafts.filter(
                (item) => item.node_id !== nodeId
              ),
              savedDraft,
            ]
          : production.mediaDrafts,
      },
    })
    // State fields are serialized above. Do not save initial empty state before
    // restoring the selected Take or the project's previously saved draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftFingerprint, writable, hydrated, editing])
  useEffect(
    () => setConfirm(false),
    [
      action,
      model,
      prompt,
      seconds,
      references,
      voice,
      rights,
      nodeId,
      language,
      toolOptions,
      setConfirm,
    ]
  )
  let kind: 'image' | 'audio' | 'video' = 'audio'
  if (action === 'lip_sync' || action === 'video_depth') kind = 'video'
  if (action.startsWith('image_')) kind = 'image'
  const targets = props.project.nodes.filter(
    (node) => node.data.kind === kind && node.data.purpose !== 'assembly'
  )
  let referenceKinds: string[] = []
  if (action.startsWith('image_')) referenceKinds = ['image']
  else if (action === 'music' && toolOptions.repair_end !== undefined) {
    referenceKinds = ['audio']
  } else if (action === 'video_depth') referenceKinds = ['video']
  else if (action === 'lip_sync') referenceKinds = ['audio', 'video']
  else if (
    ['voice_clone', 'audio_separate', 'audio_translate'].includes(action)
  ) {
    referenceKinds = ['audio']
  }
  const sources = props.project.nodes
    .filter(
      (node) => referenceKinds.includes(node.data.kind) && node.data.mediaId
    )
    .flatMap((node) => [
      { ...node, id: node.data.mediaId || node.id },
      ...(node.data.takes || [])
        .filter(
          (take) =>
            take.status === 'completed' &&
            take.mediaId &&
            take.mediaId !== node.data.mediaId &&
            references.includes(take.mediaId)
        )
        .map((take, index) => ({
          ...node,
          id: take.mediaId || take.id,
          data: {
            ...node.data,
            title: `${node.data.title} · ${t('Take')} ${index + 1}`,
            mediaId: take.mediaId,
          },
        })),
    ])
    .filter(
      (node, index, all) =>
        all.findIndex((item) => item.id === node.id) === index
    )
  const selectedReferences = references.flatMap((id) => {
    const node = sources.find((node) => node.data.mediaId === id)
    return node ? [node] : []
  })
  const hasAudio = selectedReferences.some((node) => node.data.kind === 'audio')
  const hasVideo = selectedReferences.some((node) => node.data.kind === 'video')
  const hasImage = selectedReferences.some((node) => node.data.kind === 'image')
  const depthSources = selectedReferences.filter(
    (node) => node.data.kind === 'video'
  )
  const depthDuration =
    depthSources.length === 1
      ? sourceDurations[depthSources[0].data.mediaId || '']
      : undefined
  const validDepth =
    action !== 'video_depth' ||
    (depthSources.length === 1 &&
      !!depthDuration &&
      duration >= 1 &&
      duration <= Math.min(30, depthDuration))
  const validGrid =
    action !== 'image_grid' ||
    (Number.isInteger(toolOptions.rows) &&
      toolOptions.rows >= 1 &&
      toolOptions.rows <= 4 &&
      Number.isInteger(toolOptions.columns) &&
      toolOptions.columns >= 1 &&
      toolOptions.columns <= 4 &&
      toolOptions.width >= 64 * toolOptions.columns &&
      toolOptions.height >= 64 * toolOptions.rows &&
      toolOptions.width <= 2048 &&
      toolOptions.height <= 2048)
  const validImageRepair =
    action !== 'image_layers' ||
    toolOptions.mask_source !== 'second_reference' ||
    selectedReferences.filter((node) => node.data.kind === 'image').length === 2
  const validPanelRepair =
    action !== 'image_grid' ||
    !toolOptions.redo_panel ||
    selectedReferences.filter((node) => node.data.kind === 'image').length === 2
  const validSongRepair =
    action !== 'music' ||
    toolOptions.repair_end === undefined ||
    (hasAudio &&
      selectedReferences.length === 1 &&
      Number.isFinite(toolOptions.repair_start) &&
      (toolOptions.repair_start || 0) >= 0 &&
      toolOptions.repair_end > (toolOptions.repair_start || 0) &&
      toolOptions.repair_end - (toolOptions.repair_start || 0) <=
        duration + 0.001)
  const validSongLength =
    action !== 'music' ||
    toolOptions.music_mode !== 'song' ||
    studioSongDuration(toolOptions.lyrics || '') <= 30
  const candidatePatch =
    action === 'audio_separate' && toolOptions.repair_end !== undefined
  const patchSource = selectedReferences[0]?.data.mediaId
  const patchCandidate = selectedReferences[1]?.data.mediaId
  const patchSourceSeconds = patchSource
    ? sourceDurations[patchSource]
    : undefined
  const patchCandidateSeconds = patchCandidate
    ? sourceDurations[patchCandidate]
    : undefined
  const validCandidatePatch =
    !candidatePatch ||
    (selectedReferences.length === 2 &&
      selectedReferences.every((n) => n.data.kind === 'audio') &&
      !!patchSourceSeconds &&
      !!patchCandidateSeconds &&
      Number.isFinite(toolOptions.repair_start) &&
      (toolOptions.repair_start ?? -1) >= 0 &&
      (toolOptions.repair_end ?? 0) > (toolOptions.repair_start ?? 0) &&
      (toolOptions.repair_end ?? Infinity) <= patchSourceSeconds &&
      Number.isFinite(toolOptions.candidate_start) &&
      (toolOptions.candidate_start ?? -1) >= 0 &&
      (toolOptions.candidate_end ?? 0) > (toolOptions.candidate_start ?? 0) &&
      (toolOptions.candidate_end ?? Infinity) <= patchCandidateSeconds &&
      duration + 0.001 >= patchSourceSeconds + patchCandidateSeconds)
  useEffect(() => {
    if (candidatePatch && patchSourceSeconds && patchCandidateSeconds) {
      setSeconds(
        String(
          Math.ceil((patchSourceSeconds + patchCandidateSeconds) * 1000) / 1000
        )
      )
    }
  }, [candidatePatch, patchSourceSeconds, patchCandidateSeconds])
  const valid =
    validCandidatePatch &&
    validSongLength &&
    validGrid &&
    validImageRepair &&
    validPanelRepair &&
    validSongRepair &&
    validDepth &&
    capabilities.data?.storage_available !== false &&
    writable &&
    capabilities.data?.generation_credit_available === true &&
    confirm &&
    model.trim() &&
    (targets.some((node) => node.id === nodeId) ||
      (!nodeId && props.project.nodes.length < 500)) &&
    Number.isFinite(duration) &&
    duration > 0 &&
    duration <= 3600 &&
    Number.isFinite(Number(budget)) &&
    Number(budget) > 0 &&
    Number(budget) <= 4000 &&
    (action !== 'music' ||
      (Number(seconds) <= 30 &&
        (toolOptions.music_mode !== 'song' || !!toolOptions.lyrics?.trim()) &&
        Number.isInteger(toolOptions.bpm ?? 90) &&
        (toolOptions.bpm ?? 90) >= 30 &&
        (toolOptions.bpm ?? 90) <= 240 &&
        Number.isInteger(toolOptions.seed ?? 0) &&
        (toolOptions.seed ?? 0) >= 0 &&
        (toolOptions.seed ?? 0) <= 2147483647)) &&
    (action !== 'voice_clone' || (hasAudio && rights)) &&
    (action !== 'lip_sync' || (hasAudio && hasVideo)) &&
    (action !== 'voice_speech' || voice.trim()) &&
    (!['voice_speech', 'voice_clone'].includes(action) || !!prompt.trim()) &&
    (!['audio_separate', 'audio_translate'].includes(action) || hasAudio) &&
    (action !== 'video_depth' ||
      (hasVideo && Number(seconds) >= 1 && Number(seconds) <= 30)) &&
    (!action.startsWith('image_') || action === 'image_grid' || hasImage) &&
    Object.entries(toolOptions).every(
      ([key, value]) =>
        [
          'translation',
          'lyrics',
          'music_mode',
          'panel_prompts',
          'outpaint_mode',
          'mask_source',
          'background_prompt',
        ].includes(key) ||
        (typeof value === 'number' && Number.isFinite(value))
    )
  let blockingReason =
    'Check required references, duration, lyrics and permissions before generating.'
  if (capabilities.data?.storage_available === false) {
    blockingReason =
      'Studio storage is unavailable. Restore free space or reconnect storage before generating.'
  } else if (!validCandidatePatch) {
    blockingReason =
      'Choose original audio first and candidate audio second. Confirm both intervals before applying to a new version.'
  } else if (!validSongLength) {
    blockingReason =
      'These lyrics exceed a 30-second song. Split them into shorter sections before generating.'
  } else if (!validGrid) {
    blockingReason =
      'Choose 1–4 rows and columns, with at least 64 pixels per panel.'
  } else if (!validImageRepair || !validPanelRepair) {
    blockingReason =
      'Choose the source first and then the mask or original grid.'
  } else if (!validSongRepair) {
    blockingReason =
      'Choose the original song and allow enough generation time for the repair interval.'
  } else if (!writable) blockingReason = 'Read-only project'
  else if (!capabilities.data) {
    blockingReason = 'Loading balance and service access'
  } else if (capabilities.data?.generation_credit_available === false) {
    blockingReason =
      'Insufficient generation credit. Add credit or continue with free editing.'
  } else if (!nodeId && props.project.nodes.length >= 500) {
    blockingReason = 'Choose or create a compatible output node.'
  } else if (action === 'lip_sync' && (!hasAudio || !hasVideo)) {
    blockingReason = 'Choose one completed video and its dialogue audio.'
  } else if (
    ['voice_clone', 'audio_separate', 'audio_translate'].includes(action) &&
    !hasAudio
  ) {
    blockingReason = 'Choose a completed audio reference.'
  } else if (action === 'voice_clone' && !rights) {
    blockingReason = 'Confirm that you have permission to use this voice.'
  } else if (
    action.startsWith('image_') &&
    action !== 'image_grid' &&
    !hasImage
  ) {
    blockingReason = 'Choose a completed image reference.'
  } else if (action === 'video_depth' && hasVideo && !validDepth) {
    blockingReason = depthDuration
      ? 'Requested duration exceeds the source video. Use its valid duration.'
      : 'Reading source video duration. Choose one decodable video.'
  } else if (action === 'video_depth' && !hasVideo) {
    blockingReason = 'Choose a completed video reference.'
  } else if (
    ['voice_speech', 'voice_clone'].includes(action) &&
    !prompt.trim()
  ) {
    blockingReason = 'Enter the dialogue text before generating.'
  } else if (
    action === 'music' &&
    toolOptions.music_mode === 'song' &&
    !toolOptions.lyrics?.trim()
  ) {
    blockingReason = 'Enter lyrics or choose instrumental music.'
  } else if (!Number.isFinite(duration) || duration <= 0 || duration > 3600) {
    blockingReason = 'Enter a valid duration.'
  } else if (!confirm) blockingReason = 'Confirm the budget before generating.'
  const audioLength = selectedReferences.find(
    (node) => node.data.kind === 'audio'
  )?.data.mediaId
  const videoLength = selectedReferences.find(
    (node) => node.data.kind === 'video'
  )?.data.mediaId
  const actualAudio = audioLength ? sourceDurations[audioLength] : undefined
  const actualVideo = videoLength ? sourceDurations[videoLength] : undefined
  useEffect(() => {
    if (
      action === 'lip_sync' &&
      actualAudio &&
      actualVideo &&
      !durationEdited.current
    ) {
      setSeconds(
        String(
          Math.max(
            0.001,
            Math.round(Math.min(actualAudio, actualVideo, 30) * 1000) / 1000
          )
        )
      )
    }
  }, [action, actualAudio, actualVideo])
  useEffect(() => {
    if (action === 'video_depth' && depthDuration && !durationEdited.current) {
      setSeconds(String(Math.floor(Math.min(30, depthDuration) * 1000) / 1000))
    }
  }, [action, depthDuration])
  return (
    <TabsContent value={options.value || 'media'} className='space-y-4'>
      {kind === 'audio' && <StudioSoundPresets />}
      {['voice_speech', 'voice_clone', 'audio_translate', 'lip_sync'].includes(
        action
      ) && <StudioVoiceLibrary />}
      {action === 'sound_effects' && (
        <p className='text-muted-foreground text-xs'>
          {t(
            'Preview AI soundscape drafts before using them. For individual effects, choose a synthesized preset above or upload an authorized recording.'
          )}
        </p>
      )}
      {(options.value === 'voice' || options.voice) && (
        <>
          <Button
            variant='outline'
            disabled={!writable}
            onClick={() => {
              setAction('lip_sync')
              setModel(models.lip_sync)
              setNodeId('')
            }}
          >
            {t('Make a digital presenter')}
          </Button>
          <StudioMotionReference />
        </>
      )}
      {['voice_speech', 'audio_translate'].includes(action) && (
        <StudioVoicePicker
          project={props.project}
          value={voice}
          disabled={!writable}
          onChange={setVoice}
          getMedia={props.getMedia}
        />
      )}
      {action === 'video_depth' && depthSources.length > 0 && (
        <div
          className='flex flex-wrap items-center gap-2 text-sm'
          role='status'
        >
          <span>
            {depthDuration
              ? t('Source video: {{seconds}} seconds', {
                  seconds: Math.round(depthDuration * 100) / 100,
                })
              : t('Reading source video duration. Choose one decodable video.')}
          </span>
          <Button
            variant='outline'
            size='sm'
            disabled={!writable || !depthDuration || depthDuration < 1}
            onClick={() =>
              setSeconds(
                String(
                  Math.floor(Math.min(30, depthDuration || 0) * 1000) / 1000
                )
              )
            }
          >
            {t('Use the source duration')}
          </Button>
        </div>
      )}
      {action === 'lip_sync' && (
        <p className='text-muted-foreground text-sm'>
          {t(
            'Digital presenter: choose a completed character video and its dialogue audio. MuseTalk changes the mouth while retaining the source scene; motion transfer requires a model that supports motion references.'
          )}
        </p>
      )}
      {action === 'lip_sync' && actualAudio && actualVideo && (
        <div className='space-y-2 text-sm'>
          <p>
            {t('Dialogue audio: {{audio}}s; source video: {{video}}s.', {
              audio: Math.round(actualAudio * 100) / 100,
              video: Math.round(actualVideo * 100) / 100,
            })}
          </p>
          {Math.abs(actualAudio - actualVideo) > 0.3 && (
            <p role='status'>
              {t(
                'The source durations differ. Lip sync is bounded by the shorter reference; extend the video or shorten the dialogue to retain all words.'
              )}
            </p>
          )}
          <Button
            variant='outline'
            disabled={!writable}
            onClick={() =>
              setSeconds(
                String(Math.max(0.001, Math.min(actualAudio, actualVideo, 30)))
              )
            }
          >
            {t('Use the shared reference duration')}
          </Button>
        </div>
      )}
      {['voice_speech', 'voice_clone', 'audio_translate', 'lip_sync'].includes(
        action
      ) && (
        <StudioProductionDialogue
          voice={
            ['voice_speech', 'audio_translate'].includes(action)
              ? voice
              : undefined
          }
          onVoice={setVoice}
          model={action === 'voice_speech' ? model : undefined}
          onModel={action === 'voice_speech' ? setModel : undefined}
        />
      )}
      <StudioProductionChanges />
      <p className='text-muted-foreground text-sm'>
        {t('studio.production.mediaHelp')}
      </p>
      <Field>
        <FieldLabel>{t('studio.production.mediaAction')}</FieldLabel>
        <Select
          value={action}
          onValueChange={(value) => {
            if (value && value in models) {
              const next = value as MediaAction
              setAction(next)
              setModel(models[next])
              languageEdited.current = false
              durationEdited.current = false
              setLanguage(/[\u4e00-\u9fff]/.test(prompt) ? 'zh' : 'en')
              setReferences([])
              setConfirm(false)
              if (next.startsWith('image_')) setSeconds('1')
              if (next === 'video_depth') {
                setToolOptions((value) => ({
                  ...value,
                  width: 640,
                  height: 384,
                }))
                setSeconds('3')
              }
              setNodeId('')
            }
          }}
        >
          <SelectTrigger aria-label={t('studio.production.mediaAction')}>
            <SelectValue>
              {t(`studio.production.mediaAction.${action}`)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(models) as MediaAction[]).map((value) => (
              <SelectItem value={value} key={value}>
                {t(`studio.production.mediaAction.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <StudioBudgetSummary />
      <StudioToolParameters
        seconds={Number(seconds)}
        onSeconds={(value) => {
          durationEdited.current = true
          setSeconds(String(value))
        }}
        action={action}
        value={toolOptions}
        onChange={setToolOptions}
        language={language}
        onLanguage={(value) => {
          languageEdited.current = true
          setLanguage(value)
        }}
        disabled={!writable || mutate.isPending}
      />
      {['voice_speech', 'voice_clone', 'audio_translate'].includes(action) && (
        <p className='text-muted-foreground text-sm'>
          {t(
            'Voice length follows the text and speaking speed. Timing settings do not stretch or loop dialogue; check the actual length before delivery.'
          )}
        </p>
      )}
      <div className='grid gap-3 sm:grid-cols-2'>
        <Collapsible>
          <CollapsibleTrigger render={<Button size='sm' variant='outline' />}>
            {t('Advanced model settings')}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Field>
              <FieldLabel>{t('studio.model')}</FieldLabel>
              <Input
                aria-label={t('studio.model')}
                value={model}
                maxLength={200}
                onChange={(event) => setModel(event.target.value)}
              />
            </Field>
          </CollapsibleContent>
        </Collapsible>
        {kind !== 'image' &&
          !['voice_speech', 'voice_clone', 'audio_translate'].includes(
            action
          ) && (
            <Field>
              <FieldLabel>{t('studio.production.mediaSeconds')}</FieldLabel>
              <Input
                aria-label={t('studio.production.mediaSeconds')}
                type='number'
                min={action === 'lip_sync' ? 0.001 : 1}
                step={action === 'lip_sync' ? 0.001 : 1}
                max={3600}
                value={seconds}
                onChange={(event) => {
                  durationEdited.current = true
                  setSeconds(event.target.value)
                }}
              />
            </Field>
          )}
      </div>
      <Field>
        <FieldLabel>{t('studio.production.mediaPrompt')}</FieldLabel>
        <Textarea
          aria-label={t('studio.production.mediaPrompt')}
          value={prompt}
          maxLength={30000}
          onChange={(event) => {
            setPrompt(event.target.value)
            if (
              !languageEdited.current &&
              /[\u4e00-\u9fff]/.test(event.target.value)
            ) {
              setLanguage('zh')
            }
          }}
        />
      </Field>
      <p className='text-muted-foreground text-xs'>
        {t(
          'A new output copy is created automatically. Existing footage stays available.'
        )}
      </p>
      <Collapsible>
        <CollapsibleTrigger render={<Button variant='outline' size='sm' />}>
          {t('Advanced output settings')}
        </CollapsibleTrigger>
        <CollapsibleContent className='space-y-2'>
          <Field>
            <FieldLabel>{t('studio.production.mediaTarget')}</FieldLabel>
            <Select
              value={nodeId}
              onValueChange={(value) => setNodeId(value || '')}
            >
              <SelectTrigger aria-label={t('studio.production.mediaTarget')}>
                <SelectValue>
                  {targets.find((node) => node.id === nodeId)?.data.title ||
                    t('Create a new output copy automatically')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {targets.map((node) => (
                  <SelectItem key={node.id} value={node.id}>
                    {node.data.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button
            variant='outline'
            disabled={!writable || props.project.nodes.length >= 500}
            onClick={() => {
              const id = crypto.randomUUID()
              const last = props.project.nodes.at(-1)
              props.onUpdate({
                ...props.project,
                nodes: [
                  ...props.project.nodes,
                  {
                    id,
                    type: 'studio',
                    position: {
                      x: (last?.position.x || 0) + 360,
                      y: last?.position.y || 0,
                    },
                    data: {
                      kind,
                      title: `${t(`studio.production.mediaAction.${action}`)} · ${t('Draft')} ${props.project.nodes.length + 1}`,
                      model,
                      prompt,
                      status: 'idle',
                    },
                  },
                ],
                updatedAt: new Date().toISOString(),
              })
              setNodeId(id)
            }}
          >
            {t('studio.production.createMediaNode')}
          </Button>
        </CollapsibleContent>
      </Collapsible>
      {targets.find((node) => node.id === nodeId)?.data.mediaId && (
        <StudioMediaThumbnail
          mediaId={
            targets.find((node) => node.id === nodeId)?.data.mediaId || ''
          }
          kind={kind}
          title={t('Current output preview')}
          getMedia={props.getMedia}
        />
      )}
      {referenceKinds.length > 0 && (
        <fieldset className='space-y-2'>
          <label className='flex items-center gap-2'>
            <Checkbox
              checked={showHistory}
              onCheckedChange={(value) => setShowHistory(value === true)}
            />
            {t('Include derived and historical references')}
          </label>
          <legend className='mb-2 text-sm font-medium'>
            {t('studio.production.mediaReferences')}
          </legend>
          <Input
            aria-label={t('Search compatible references')}
            placeholder={t('Search compatible references')}
            value={referenceSearch}
            onChange={(event) => setReferenceSearch(event.target.value)}
          />
          <p className='text-muted-foreground text-xs'>
            {t(
              'Only compatible, stored references are shown. Selected historical Takes remain pinned.'
            )}
          </p>
          {sources
            .filter(
              (node) =>
                (showHistory ||
                  !node.data.derivedFrom ||
                  references.includes(node.id)) &&
                node.data.title
                  .toLowerCase()
                  .includes(referenceSearch.toLowerCase())
            )
            .map((node) => (
              <div
                key={node.id}
                className='flex min-w-0 items-start gap-2 rounded border p-2'
              >
                <Checkbox
                  id={`reference-${node.id}`}
                  aria-label={node.data.title}
                  checked={references.includes(node.data.mediaId || '')}
                  disabled={
                    !references.includes(node.data.mediaId || '') &&
                    references.length >= 12
                  }
                  onCheckedChange={(checked) => {
                    const id = node.data.mediaId || ''
                    setReferences((ids) =>
                      checked
                        ? [
                            ...new Set([
                              ...ids.filter(
                                (value) =>
                                  action !== 'lip_sync' ||
                                  sources.find(
                                    (source) => source.data.mediaId === value
                                  )?.data.kind !== node.data.kind
                              ),
                              id,
                            ]),
                          ]
                        : ids.filter((value) => value !== id)
                    )
                  }}
                />
                <div className='min-w-0'>
                  <label
                    htmlFor={`reference-${node.id}`}
                    className='break-words'
                  >
                    {node.data.title}
                  </label>
                  <StudioMediaThumbnail
                    mediaId={node.data.mediaId || ''}
                    kind={node.data.kind}
                    title={node.data.title}
                    getMedia={props.getMedia}
                    onDuration={(id, length) =>
                      setSourceDurations((current) =>
                        current[id] === length
                          ? current
                          : { ...current, [id]: length }
                      )
                    }
                  />
                </div>
              </div>
            ))}
          {!sources.length && (
            <p className='text-muted-foreground text-sm'>
              {t('studio.production.uploadReferenceFirst')}
            </p>
          )}
        </fieldset>
      )}
      {action === 'voice_clone' && (
        <label className='flex items-center gap-2'>
          <Checkbox
            checked={rights}
            onCheckedChange={(checked) => setRights(checked === true)}
          />
          {t('studio.production.voiceRights')}
        </label>
      )}
      <Field>
        <FieldLabel>{t('studio.production.budget')}</FieldLabel>
        <Input
          aria-label={t('studio.production.budget')}
          type='number'
          min='0.01'
          max='4000'
          step='0.01'
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
        />
      </Field>
      <label className='flex items-center gap-2'>
        <Checkbox
          checked={confirm}
          onCheckedChange={(checked) => setConfirm(checked === true)}
        />
        {t('studio.production.confirm')}
      </label>
      {!valid && (
        <p role='status' className='text-sm'>
          {t(blockingReason)}
        </p>
      )}
      <Button
        disabled={!valid || mutate.isPending}
        onClick={() =>
          mutate.mutate(async () => {
            let outputId = nodeId
            if (!outputId) {
              outputId = crypto.randomUUID()
              props.onUpdate(
                updateStudioNode(
                  addStudioNode(props.project, kind, outputId),
                  outputId,
                  {
                    title: t(`studio.production.mediaAction.${action}`),
                    model,
                    prompt,
                  }
                )
              )
              setNodeId(outputId)
            }
            await props.onSave()
            const current = await studioCloudRequest<StudioCloudProject>(path)
            const target = current.document.nodes.find(
              (node) => node.id === outputId
            )
            let operationOptions: Partial<StudioToolOptions> = {
              speed: toolOptions.speed,
              pitch: toolOptions.pitch,
              pause: toolOptions.pause,
              expression: toolOptions.expression,
              translation: toolOptions.translation,
            }
            if (action.startsWith('image_')) {
              operationOptions = {
                width: toolOptions.width,
                height: toolOptions.height,
                scale: toolOptions.scale,
                rows: toolOptions.rows,
                columns: toolOptions.columns,
                ...(action === 'image_grid'
                  ? {
                      panel_prompts: Array.from(
                        { length: toolOptions.rows * toolOptions.columns },
                        (_, i) =>
                          toolOptions.panel_prompts?.[i]?.trim() ||
                          [
                            'Wide establishing shot: introduce the location',
                            'Medium shot: the character takes action',
                            'Close-up: show a reaction or important detail',
                            'Wide closing shot: reveal the outcome',
                          ][i % 4]
                      ),
                      redo_panel: toolOptions.redo_panel,
                    }
                  : {}),
                ...(action === 'image_outpaint'
                  ? { outpaint_mode: toolOptions.outpaint_mode || 'strict' }
                  : {}),
                ...(action === 'image_layers'
                  ? {
                      mask_source: toolOptions.mask_source || 'automatic',
                      background_prompt: toolOptions.background_prompt || '',
                    }
                  : {}),
              }
            } else if (action === 'audio_separate' && candidatePatch) {
              operationOptions = {
                repair_start: toolOptions.repair_start,
                repair_end: toolOptions.repair_end,
                candidate_start: toolOptions.candidate_start,
                candidate_end: toolOptions.candidate_end,
              }
            } else if (action === 'music') {
              operationOptions = {
                music_mode: toolOptions.music_mode || 'instrumental',
                lyrics:
                  toolOptions.music_mode === 'song'
                    ? toolOptions.lyrics
                    : undefined,
                bpm: toolOptions.bpm ?? 90,
                seed: toolOptions.seed ?? 0,
                repair_start: toolOptions.repair_start,
                repair_end: toolOptions.repair_end,
              }
            }
            await studioCloudRequest(`${path}/jobs`, 'POST', {
              request_id: crypto.randomUUID(),
              kind: 'media',
              revision: current.revision,
              budget: Math.round(
                Number(budget) * (capabilities.data?.quota_per_unit || 500000)
              ),
              confirm_generation: true,
              operation: {
                action,
                node_id: outputId,
                model,
                prompt,
                seconds: duration,
                reference_media_ids: references,
                voice_id: voice,
                group: target?.data.group || '',
                confirm_voice_rights: rights,
                language,
                options: operationOptions,
              },
            })
          })
        }
      >
        {t('studio.production.runMedia')}
      </Button>
      <StudioToolArtifacts />
    </TabsContent>
  )
}
