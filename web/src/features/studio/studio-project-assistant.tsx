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
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
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

import { studioProjectSchema } from './local-projects'
import {
  STUDIO_BUILTIN_SKILLS,
  type StudioAssistantPlan,
  applyStudioAssistantPlan,
  importStudioSkill,
  exportStudioSkill,
  saveStudioDraftSkill,
  parseStudioAssistantPlan,
  studioAssistantPrompt,
  hashStudioAssistantProject,
  planStudioLiteralRename,
  restoreStudioBuiltinSkill,
} from './studio-assistant'
import { StudioAssistantPlanEditor } from './studio-assistant-plan-editor'
import { StudioBudgetSummary } from './studio-budget-summary'
import {
  studioCloudRequest,
  type StudioCloudProject,
  type StudioCloudJob,
} from './studio-cloud'
import { fetchStudioCreationModels } from './studio-creation-models'
import {
  studioProductionSchema,
  studioProjectRenderPlan,
} from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import { addStudioNode, updateStudioNode } from './workspace'

export function StudioProjectAssistant() {
  const { t } = useTranslation()
  const {
    props,
    path,
    writable,
    budget,
    setBudget,
    mutate,
    jobs,
    capabilities,
  } = useStudioProductionContext()
  const production =
    props.project.production || studioProductionSchema.parse({})
  const assistant = production.assistant || { messages: [], applied: false }
  const skills = [
    ...STUDIO_BUILTIN_SKILLS.filter(
      (skill) => !production.skills.some((saved) => saved.id === skill.id)
    ),
    ...production.skills,
  ]
  const selectedSkill = skills.find((skill) => skill.id === assistant.skillId)
  const [request, setRequest] = useState('')
  const [skillSearch, setSkillSearch] = useState('')
  const [allSkills, setAllSkills] = useState(false)
  const suggestedSkills = {
    story: ['writing', 'product-explainer', 'storyboard'],
    shots: ['storyboard', 'character', 'scene-director'],
    assets: ['character', 'scene-director', 'storyboard'],
    visual: ['video-prompt', 'scene-director', 'digital-presenter'],
    voice: ['digital-presenter', 'editing', 'review'],
    edit: ['editing', 'review', 'beat-motion'],
    deliver: ['review', 'editing', 'explain-production'],
  }[production.guide?.step || 'story']
  const visibleSkills = skills.filter(
    (skill) =>
      (allSkills ||
        skillSearch ||
        suggestedSkills.includes(skill.id) ||
        skill.id === assistant.skillId) &&
      `${t(skill.name)} ${t(skill.description)}`
        .toLowerCase()
        .includes(skillSearch.toLowerCase())
  )
  const localRename = planStudioLiteralRename(
    props.project,
    request,
    t('Local name change; no media generation.')
  )
  const [scopeShot, setScopeShot] = useState('all')
  const scopedShot = props.project.shots?.find((shot) => shot.id === scopeShot)
  const localOutsideScope =
    scopeShot !== 'all' &&
    localRename?.operations.some(
      (operation) =>
        'nodeId' in operation &&
        ![
          scopedShot?.textNodeId,
          scopedShot?.imageNodeId,
          scopedShot?.videoNodeId,
        ].includes(operation.nodeId)
    )
  const [error, setError] = useState('')
  const [approve, setApprove] = useState(false)
  const [textModel, setTextModel] = useState(
    props.project.defaults?.textModel || ''
  )
  const models = useQuery({
    queryKey: [
      'studio-assistant-models',
      props.userId,
      props.project.defaults?.videoGroup || 'default',
    ],
    queryFn: async () =>
      (
        await fetchStudioCreationModels(
          props.project.defaults?.videoGroup || 'default'
        )
      ).text,
  })
  const selectedModel = textModel || models.data?.[0] || ''
  const file = useRef<HTMLInputElement>(null)
  const folder = useRef<HTMLInputElement>(null)
  const setAssistant = (patch: Partial<typeof assistant>): void =>
    props.onUpdate({
      ...props.project,
      production: { ...production, assistant: { ...assistant, ...patch } },
      updatedAt: new Date().toISOString(),
    })
  const importFiles = async (files: FileList | null): Promise<void> => {
    if (!files) return
    try {
      const markdown = [...files].filter((file) => file.name.endsWith('.md'))
      const entries = markdown.filter((file) => file.name === 'SKILL.md')
      const shallowest = Math.min(
        ...entries.map((file) => file.webkitRelativePath.split('/').length)
      )
      const candidates = entries.length
        ? entries.filter(
            (file) => file.webkitRelativePath.split('/').length === shallowest
          )
        : markdown
      if (candidates.length !== 1) {
        throw new Error(
          'Choose one SKILL.md file or a folder containing one skill'
        )
      }
      const raw = await candidates[0].text()
      const parsed = importStudioSkill(raw)
      const skill = importStudioSkill(
        raw,
        production.skills.find((skill) => skill.id === parsed.id)
      )
      props.onUpdate({
        ...props.project,
        production: {
          ...production,
          skills: [
            ...production.skills.filter((saved) => saved.id !== skill.id),
            skill,
          ],
          assistant: { ...assistant, skillId: skill.id },
        },
      })
      await props.onSave()
      setError('')
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const importErrors: Record<string, string> = {
        'Choose one SKILL.md file or a folder containing one skill': t(
          'Choose one SKILL.md file or a folder containing one skill'
        ),
        'Skill exceeds the import limit': t('Skill exceeds the import limit'),
        'A SKILL.md file with name and description is required': t(
          'A SKILL.md file with name and description is required'
        ),
        'Skill identity changed': t('Skill identity changed'),
        'This skill version is already installed': t(
          'This skill version is already installed'
        ),
      }
      setError(
        importErrors[message] ||
          t('Skill import failed. Check the file format or try again.')
      )
    }
  }
  const send = async (): Promise<void> => {
    if (localOutsideScope) throw new Error(t('studio.plan.scopeConflict'))
    const snapshotHash = await hashStudioAssistantProject(props.project)
    if (localRename) {
      setAssistant({
        proposal: JSON.stringify(localRename, null, 2),
        proposalHash: snapshotHash,
        applied: false,
        messages: [
          ...assistant.messages.slice(-98),
          {
            id: crypto.randomUUID(),
            role: 'user',
            text: request,
            createdAt: new Date().toISOString(),
          },
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            text: localRename.summary,
            createdAt: new Date().toISOString(),
          },
        ],
      })
      setError('')
      return
    }
    const id = crypto.randomUUID()
    const shot = props.project.shots?.find((shot) => shot.id === scopeShot)
    const scopeIds = shot
      ? [shot.textNodeId, shot.imageNodeId, shot.videoNodeId]
      : undefined
    const prompt = studioAssistantPrompt(
      props.project,
      request,
      selectedSkill,
      scopeIds
    )
    const draft = updateStudioNode(
      addStudioNode(props.project, 'text', id),
      id,
      {
        title: `Assistant plan ${assistant.messages.length + 1}`,
        prompt,
        textMode: 'plain',
        assistantPlan: true,
        assistantSkillId: selectedSkill?.id,
        assistantScopeNodeIds: scopeIds,
        model: selectedModel,
      }
    )
    props.onUpdate({
      ...draft,
      production: {
        ...production,
        assistant: {
          ...assistant,
          applied: false,
          proposal: undefined,
          messages: [
            ...assistant.messages.slice(-98),
            {
              id: crypto.randomUUID(),
              role: 'user',
              snapshotHash,
              text: request,
              nodeId: id,
              createdAt: new Date().toISOString(),
            },
          ],
        },
      },
    })
    await props.onSave()
    const stored = await studioCloudRequest<StudioCloudProject>(path)
    await studioCloudRequest<StudioCloudJob>(`${path}/jobs`, 'POST', {
      request_id: crypto.randomUUID(),
      kind: 'generate',
      revision: stored.revision,
      node_ids: [id],
      budget: Math.round(
        Number(budget) * (capabilities.data?.quota_per_unit || 500000)
      ),
      confirm_generation: true,
    })
    setRequest('')
  }
  const planningNodeId = [...assistant.messages]
    .reverse()
    .find((message) => message.role === 'user')?.nodeId
  const planningNode = props.project.nodes.find(
    (node) => node.id === planningNodeId
  )
  const planningJob = jobs.data?.find(
    (job) =>
      job.kind === 'generate' &&
      (job.node_ids?.includes(planningNodeId || '') ||
        (job.result as { node_id?: string } | undefined)?.node_id ===
          planningNodeId)
  )
  const proposal = assistant.proposal || ''
  let plan: ReturnType<typeof parseStudioAssistantPlan> | undefined
  try {
    if (proposal) plan = parseStudioAssistantPlan(proposal)
  } catch {
    /* Editable draft validation is shown beside the plan. */
  }
  let planProblem =
    proposal && !plan ? t('Repair the plan JSON before applying it.') : ''
  if (plan && !assistant.applied) {
    try {
      applyStudioAssistantPlan(props.project, plan)
    } catch (problem) {
      planProblem = t(
        problem instanceof Error ? problem.message : String(problem)
      )
    }
  }
  const validBudget =
    capabilities.data?.generation_credit_available === true &&
    Number.isFinite(Number(budget)) &&
    Number(budget) > 0 &&
    Number(budget) <= 4000
  return (
    <Collapsible className='mb-3'>
      <CollapsibleTrigger render={<Button variant='outline' />}>
        {t('Project assistant and skills')}
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-4 pt-4'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'The assistant drafts a plan. Apply edits first, then approve image or video generation separately.'
          )}
        </p>
        <StudioBudgetSummary />
        <div className='grid gap-3 sm:grid-cols-2'>
          <Select
            value={scopeShot}
            onValueChange={(value) => setScopeShot(value || 'all')}
            items={[
              { value: 'all', label: t('Entire project') },
              ...(props.project.shots || []).map((shot) => ({
                value: shot.id,
                label: shot.title,
              })),
            ]}
          >
            <SelectTrigger aria-label={t('Assistant context range')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value='all'>{t('Entire project')}</SelectItem>
                {props.project.shots?.map((shot) => (
                  <SelectItem key={shot.id} value={shot.id}>
                    {shot.title}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={selectedModel || null}
            onValueChange={(value) => setTextModel(value || '')}
            items={(models.data || []).map((value) => ({
              value,
              label: value,
            }))}
          >
            <SelectTrigger aria-label={t('Planning model')}>
              <SelectValue placeholder={t('Choose a planning model')} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {models.data?.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input
            aria-label={t('Search creative tasks')}
            placeholder={t('Search creative tasks')}
            value={skillSearch}
            onChange={(event) => setSkillSearch(event.target.value)}
          />
          <Button
            variant='outline'
            aria-pressed={allSkills}
            onClick={() => setAllSkills(!allSkills)}
          >
            {t(
              allSkills
                ? 'Show recommended creative tasks'
                : 'Browse all creative tasks'
            )}
          </Button>
          <Select
            value={assistant.skillId || 'general'}
            onValueChange={(value) =>
              setAssistant({
                skillId: value === 'general' ? undefined : value || undefined,
              })
            }
            items={[
              { value: 'general', label: t('General creative assistant') },
              ...visibleSkills.map((skill) => ({
                value: skill.id,
                label: t(skill.name),
              })),
            ]}
          >
            <SelectTrigger aria-label={t('Choose a creative skill')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value='general'>
                  {t('General creative assistant')}
                </SelectItem>
                {visibleSkills.map((skill) => (
                  <SelectItem key={skill.id} value={skill.id}>
                    {t(skill.name)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Field>
            <FieldLabel>{t('studio.production.budget')}</FieldLabel>
            <Input
              type='number'
              min={0.01}
              max={4000}
              step={0.01}
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
            />
          </Field>
        </div>
        {selectedSkill && (
          <div className='space-y-2 text-sm'>
            <Button
              size='sm'
              variant='outline'
              disabled={
                !writable ||
                mutate.isPending ||
                !STUDIO_BUILTIN_SKILLS.some(
                  (skill) => skill.id === selectedSkill.id
                )
              }
              onClick={() =>
                mutate.mutate(async () => {
                  const original = STUDIO_BUILTIN_SKILLS.find(
                    (skill) => skill.id === selectedSkill.id
                  )
                  if (!original) return
                  props.onUpdate({
                    ...props.project,
                    production: {
                      ...production,
                      skills: [
                        ...production.skills.filter(
                          (skill) => skill.id !== original.id
                        ),
                        restoreStudioBuiltinSkill(selectedSkill),
                      ],
                    },
                  })
                  await props.onSave()
                })
              }
            >
              {t('Restore the built-in skill')}
            </Button>
            <p>
              {t(`studio.skill.help.${selectedSkill.id}`, {
                defaultValue: t(selectedSkill.description),
              })}
            </p>
            <p>
              {t('Inputs')}:{' '}
              {selectedSkill.inputs
                .map((input) =>
                  t(
                    (
                      {
                        story: 'studio.creation.step.story',
                        shots: 'studio.view.storyboard',
                        assets: 'studio.asset.title',
                        media: 'studio.production.media',
                        review: 'studio.production.review',
                      } as Record<string, string>
                    )[input] || input
                  )
                )
                .join('、')}{' '}
              · {t('Output')}: {t('Editable plan')} ·{' '}
              {t('Generation requires separate approval')}
            </p>
            <Select
              disabled={!writable || mutate.isPending}
              value={selectedSkill.activeVersion}
              onValueChange={(version) => {
                if (!version || version === selectedSkill.activeVersion) return
                const skill = { ...selectedSkill, activeVersion: version }
                mutate.mutate(async () => {
                  props.onUpdate({
                    ...props.project,
                    production: {
                      ...production,
                      skills: [
                        ...production.skills.filter(
                          (saved) => saved.id !== skill.id
                        ),
                        skill,
                      ],
                    },
                  })
                  await props.onSave()
                })
              }}
              items={selectedSkill.versions.map((version) => ({
                value: version.version,
                label: version.version,
              }))}
            >
              <SelectTrigger aria-label={t('Skill version')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {selectedSkill.versions.map((version) => (
                    <SelectItem key={version.version} value={version.version}>
                      {version.version}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className='flex flex-wrap gap-2'>
          {selectedSkill && (
            <Button
              variant='outline'
              disabled={mutate.isPending}
              onClick={() => {
                const version = selectedSkill.versions.find(
                  (item) => item.version === selectedSkill.activeVersion
                )
                if (!version) return
                const url = URL.createObjectURL(
                  new Blob(
                    [exportStudioSkill(selectedSkill, t(selectedSkill.name))],
                    { type: 'text/markdown;charset=utf-8' }
                  )
                )
                const anchor = document.createElement('a')
                anchor.href = url
                anchor.download = `${selectedSkill.id}-SKILL.md`
                anchor.click()
                window.setTimeout(() => URL.revokeObjectURL(url), 10000)
              }}
            >
              {t('Export selected skill')}
            </Button>
          )}
          <Button
            disabled={!writable}
            variant='outline'
            onClick={() => file.current?.click()}
          >
            {t('Import skill file')}
          </Button>
          <Button
            disabled={!writable}
            variant='outline'
            onClick={() => folder.current?.click()}
          >
            {t('Import skill folder')}
          </Button>
          <input
            ref={file}
            hidden
            type='file'
            accept='.md'
            onChange={(event) => void importFiles(event.target.files)}
          />
          <input
            ref={folder}
            hidden
            type='file'
            {...{ webkitdirectory: '' }}
            onChange={(event) => void importFiles(event.target.files)}
          />
        </div>
        <div
          className='max-h-64 space-y-3 overflow-y-auto'
          aria-label={t('Creative conversation')}
        >
          {assistant.messages.map((message) => (
            <div key={message.id} className='bg-muted rounded-md p-3 text-sm'>
              <p className='font-medium'>
                {t(message.role === 'user' ? 'You' : 'Assistant')}
              </p>
              <p className='whitespace-pre-wrap'>{message.text}</p>
            </div>
          ))}
        </div>
        <Textarea
          aria-label={t('Ask for a video change')}
          placeholder={t(
            'Change shot three to a close-up and keep the voiceover.'
          )}
          value={request}
          maxLength={6000}
          onChange={(event) => setRequest(event.target.value)}
        />
        <div className='flex flex-wrap gap-2'>
          <Button
            disabled={
              !writable ||
              localOutsideScope ||
              !request.trim() ||
              (!localRename && !selectedModel) ||
              (!localRename && !validBudget) ||
              mutate.isPending
            }
            onClick={() =>
              mutate.mutate(send, {
                onError: (error) => setError(error.message),
              })
            }
          >
            {t(localRename ? 'Prepare a local edit' : 'Draft an AI plan')}
          </Button>
          <Button
            variant='outline'
            onClick={() => mutate.mutate(props.onRefresh)}
          >
            {t('Refresh conversation result')}
          </Button>
          {planningJob &&
            ['queued', 'running', 'waiting'].includes(planningJob.status) && (
              <Button
                variant='outline'
                onClick={() =>
                  mutate.mutate(() =>
                    studioCloudRequest(
                      `/jobs/${planningJob.id}/control`,
                      'POST',
                      { action: 'pause' }
                    )
                  )
                }
              >
                {t('Stop assistant')}
              </Button>
            )}
        </div>
        {localOutsideScope && (
          <p role='status'>{t('studio.plan.scopeConflict')}</p>
        )}
        {planningNode?.data.outputText && (
          <Button
            variant='outline'
            disabled={!writable}
            onClick={async () => {
              try {
                const snapshotHash = await hashStudioAssistantProject(
                  props.project
                )
                const submitted = [...assistant.messages]
                  .reverse()
                  .find(
                    (message) =>
                      message.role === 'user' &&
                      message.nodeId === planningNode.id
                  )
                if (
                  submitted?.snapshotHash &&
                  submitted.snapshotHash !== snapshotHash
                ) {
                  throw new Error(
                    t(
                      'The project changed after planning. Ask the assistant for an updated plan.'
                    )
                  )
                }
                const parsed = parseStudioAssistantPlan(
                  planningNode.data.outputText || ''
                )
                setAssistant({
                  proposal: JSON.stringify(parsed, null, 2),
                  proposalSource: planningNode.id,
                  proposalHash: snapshotHash,
                  applied: false,
                  messages: [
                    ...assistant.messages.slice(-99),
                    {
                      id: crypto.randomUUID(),
                      role: 'assistant',
                      text: parsed.summary,
                      nodeId: planningNode.id,
                      createdAt: new Date().toISOString(),
                    },
                  ],
                })
                setError('')
              } catch (error) {
                setError(error instanceof Error ? error.message : String(error))
              }
            }}
          >
            {t('Review suggested plan')}
          </Button>
        )}
        {proposal && (
          <div className='space-y-3 rounded-md border p-3'>
            <p>{plan?.summary || t('Repair the plan before applying it')}</p>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Review the actual targets and before/after values below; the summary is only an explanation.'
              )}
            </p>
            <StudioAssistantPlanEditor
              project={props.project}
              value={proposal}
              disabled={!writable || assistant.applied}
              onChange={(proposal) =>
                setAssistant({ proposal, applied: false })
              }
            />
            {!!planProblem && (
              <p role='alert' className='text-destructive text-sm'>
                {planProblem}
              </p>
            )}
            {assistant.applied && (
              <Button
                variant='outline'
                onClick={() => setAssistant({ applied: false })}
              >
                {t('Edit this plan')}
              </Button>
            )}
            {assistant.applied && assistant.undoDocument && (
              <Button
                variant='outline'
                onClick={async () => {
                  try {
                    if (
                      assistant.proposalHash !==
                      (await hashStudioAssistantProject(props.project))
                    ) {
                      throw new Error(
                        t(
                          'The project changed after planning. Ask the assistant for an updated plan.'
                        )
                      )
                    }
                    const raw: unknown = JSON.parse(
                      assistant.undoDocument || ''
                    )
                    studioProjectSchema.parse(raw)
                    const restored = raw as typeof props.project
                    props.onUpdate({
                      ...restored,
                      production: {
                        ...(restored.production || production),
                        assistant: {
                          ...assistant,
                          applied: false,
                          undoDocument: undefined,
                          proposalHash:
                            await hashStudioAssistantProject(restored),
                        },
                      },
                    })
                    setError('')
                  } catch (problem) {
                    setError(
                      t(
                        problem instanceof Error
                          ? problem.message
                          : String(problem)
                      )
                    )
                  }
                }}
              >
                {t('Undo plan edits')}
              </Button>
            )}
            {plan?.skillDraft && (
              <div className='space-y-2 border-b pb-3'>
                <p className='font-medium'>
                  {t('Proposed production skill')}: {plan.skillDraft.name}
                </p>
                <p className='text-muted-foreground text-sm'>
                  {plan.skillDraft.description}
                </p>
                <Textarea
                  aria-label={t('Proposed skill instructions')}
                  value={plan.skillDraft.instructions}
                  readOnly
                  rows={6}
                />
                <Button
                  variant='outline'
                  disabled={!writable || mutate.isPending}
                  onClick={() =>
                    mutate.mutate(async () => {
                      if (!plan?.skillDraft) return
                      props.onUpdate(
                        saveStudioDraftSkill(props.project, plan.skillDraft)
                      )
                      await props.onSave()
                      setError('')
                    })
                  }
                >
                  {t('Save proposed production skill')}
                </Button>
              </div>
            )}
            <p>
              {t('Proposed edits')}: {plan?.operations.length || 0} ·{' '}
              {t('Generation targets')}: {plan?.generateNodeIds.length || 0} ·{' '}
              {t('Planned tasks')}: {plan?.workflowActions?.length || 0}
            </p>
            <Button
              disabled={
                !writable || !plan || assistant.applied || !!planProblem
              }
              onClick={async () => {
                try {
                  const currentHash = await hashStudioAssistantProject(
                    props.project
                  )
                  if (
                    assistant.proposalHash &&
                    assistant.proposalHash !== currentHash
                  ) {
                    throw new Error(
                      t(
                        'The project changed after planning. Ask the assistant for an updated plan.'
                      )
                    )
                  }
                  const next = applyStudioAssistantPlan(
                    props.project,
                    parseStudioAssistantPlan(proposal)
                  )
                  props.onUpdate({
                    ...next,
                    production: {
                      ...(next.production || production),
                      assistant: {
                        ...assistant,
                        applied: true,
                        undoDocument: JSON.stringify({
                          ...props.project,
                          production: {
                            ...production,
                            assistant: {
                              ...assistant,
                              undoDocument: undefined,
                            },
                          },
                        }),
                        proposalHash: await hashStudioAssistantProject(next),
                      },
                    },
                  })
                  setError('')
                } catch (error) {
                  setError(
                    error instanceof Error ? error.message : String(error)
                  )
                }
              }}
            >
              {t(assistant.applied ? 'Plan edits applied' : 'Apply plan edits')}
            </Button>
            {assistant.applied &&
              (!!plan?.generateNodeIds.length ||
                !!plan?.workflowActions?.length) && (
                <Button
                  disabled={
                    !writable ||
                    ((!!plan?.generateNodeIds.length ||
                      plan?.workflowActions?.some(
                        (action) => action.kind === 'media'
                      )) &&
                      !validBudget)
                  }
                  onClick={() => setApprove(true)}
                >
                  {t('Review generation cost and run')}
                </Button>
              )}
          </div>
        )}
        {error && (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <ConfirmDialog
          open={approve}
          onOpenChange={setApprove}
          title={t('Review generation cost and run')}
          desc={
            <p>
              {t('Generation targets')}: {plan?.generateNodeIds.length || 0} ·{' '}
              {t('Planned tasks')}: {plan?.workflowActions?.length || 0} ·{' '}
              {t('studio.production.budget')}: {budget}
            </p>
          }
          confirmText={t('studio.production.run')}
          handleConfirm={() => {
            setApprove(false)
            mutate.mutate(async () => {
              const currentHash = await hashStudioAssistantProject(
                props.project
              )
              if (
                assistant.proposalHash &&
                assistant.proposalHash !== currentHash
              ) {
                throw new Error(
                  t(
                    'The project changed after planning. Ask the assistant for an updated plan.'
                  )
                )
              }
              if (!plan || !assistant.applied) {
                throw new Error(t('Apply plan edits'))
              }
              applyStudioAssistantPlan(props.project, {
                ...plan,
                operations: [],
              })
              await props.onSave()
              const stored = await studioCloudRequest<StudioCloudProject>(path)
              const actions = plan.workflowActions || []
              const paidCount =
                Number(plan.generateNodeIds.length > 0) +
                actions.filter((action) => action.kind === 'media').length
              const totalBudget = Math.round(
                Number(budget) * (capabilities.data?.quota_per_unit || 500000)
              )
              const perTaskBudget = paidCount
                ? Math.floor(totalBudget / paidCount)
                : 0
              if (paidCount && perTaskBudget < 1) {
                throw new Error(t('Increase the budget for this task plan'))
              }
              const digest = await crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(
                  JSON.stringify([
                    props.project.id,
                    assistant.proposalHash,
                    plan,
                    totalBudget,
                  ])
                )
              )
              const prefix = `skill-${[...new Uint8Array(digest)]
                .map((byte) => byte.toString(16).padStart(2, '0'))
                .join('')}`
              const existing = await studioCloudRequest<
                (StudioCloudJob & { request_id: string })[]
              >(`${path}/jobs`)
              const requests: {
                request_id: string
                kind:
                  | 'generate'
                  | 'media'
                  | 'previs'
                  | 'graphics'
                  | 'render'
                  | 'quality'
                revision: number
                node_ids: string[]
                budget: number
                confirm_generation: boolean
                operation?: NonNullable<
                  StudioAssistantPlan['workflowActions']
                >[number]['operation']
                render?: ReturnType<typeof studioProjectRenderPlan>
              }[] = actions.map((action, index) => ({
                request_id: `${prefix}-${index}`,
                kind: action.kind,
                revision: stored.revision,
                node_ids: [],
                budget: action.kind === 'media' ? perTaskBudget : 0,
                confirm_generation: true,
                operation: action.operation,
                render:
                  action.kind === 'render'
                    ? studioProjectRenderPlan(stored.document)
                    : undefined,
              }))
              if (plan.generateNodeIds.length) {
                requests.unshift({
                  request_id: `${prefix}-generate`,
                  kind: 'generate',
                  revision: stored.revision,
                  node_ids: plan.generateNodeIds,
                  budget: perTaskBudget,
                  confirm_generation: true,
                  operation: undefined,
                  render: undefined,
                })
              }
              for (const request of requests) {
                if (
                  existing.some((job) => job.request_id === request.request_id)
                ) {
                  continue
                }
                await studioCloudRequest(`${path}/jobs`, 'POST', request)
              }
            })
          }}
        />
      </CollapsibleContent>
    </Collapsible>
  )
}
