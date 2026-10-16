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

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import { fetchStudioCreationModels } from './studio-creation-models'
import { studioCreativeBriefText } from './studio-creative-plan'
import { studioProductionSchema } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import { parseStudioScreenplayResponse } from './studio-screenplay-response'
import { addStudioNode, updateStudioNode } from './workspace'

export function StudioStoryPlanner(props: { disabled?: boolean }) {
  const { t } = useTranslation()
  const {
    props: workspace,
    path,
    writable,
    mutate,
    budget,
    capabilities,
    jobs,
  } = useStudioProductionContext()
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState('')
  const production =
    workspace.project.production || studioProductionSchema.parse({})
  const catalog = useQuery({
    queryKey: [
      'studio-story-models',
      workspace.userId,
      workspace.project.defaults?.videoGroup,
    ],
    queryFn: () =>
      fetchStudioCreationModels(
        workspace.project.defaults?.videoGroup || 'default'
      ),
  })
  const model = workspace.project.defaults?.textModel || catalog.data?.text[0]
  const node = [...workspace.project.nodes]
    .reverse()
    .find((node) => node.data.assistantSkillId === 'screenplay-draft')
  const job = jobs.data?.find((job) => job.node_ids?.includes(node?.id || ''))
  const pending =
    !!job &&
    ['queued', 'running', 'waiting', 'paused', 'uncertain'].includes(job.status)
  const validBudget =
    Number.isFinite(Number(budget)) &&
    Number(budget) > 0 &&
    Number(budget) <= 4000
  const submit = async () => {
    setConfirm(false)
    const id = crypto.randomUUID()
    const prompt = `Return ONLY valid JSON, no markdown. Create an editable video screenplay in the user's language. Respect explicit shot numbering; do not split a shot at sentence boundaries. Keep global identity, wardrobe, style and negative requirements in brief and appropriate reference descriptions, not extra shots. Return {"title":"...","brief":"original idea and global requirements","characters":[{"id":"character_1","title":"...","description":"...","voice":"..."}],"scenes":[{"id":"scene_1","title":"...","description":"..."}],"props":[],"shots":[{"id":"shot_1","title":"...","text":"visible action","imagePrompt":"composition and appearance","videoPrompt":"one clear action and camera motion","seconds":4,"camera":"...","shotType":"...","dialogue":"spoken words only","characterIds":[],"propIds":[],"sceneId":"scene_1"}]}. IDs must match /^[A-Za-z0-9_-]{1,80}$/. Use existing referenced IDs where possible, omit sceneId if none. At most 12 shots. Every shot 1-30 whole seconds, total target ${production.targetDuration || 30} seconds, split actions when needed. Do not generate images/video or invent downloaded references. User idea: ${studioCreativeBriefText(workspace.project, t)}\n${/[\u4e00-\u9fff]/.test(production.brief || '') ? '请用中文填写标题、角色名称、场景名称、text、dialogue、camera、shotType 和 brief。JSON 键名保持英文，图像和视频提示词可以使用英文。没有台词时 dialogue 必须是空字符串，不要使用 null。保留原文明确指定的每个镜头，整体要求不能变成新镜头。' : 'Use empty strings for absent optional dialogue, camera and shotType; do not use null.'}`
    workspace.onUpdate(
      updateStudioNode(addStudioNode(workspace.project, 'text', id), id, {
        title: t('AI shot plan'),
        model,
        prompt,
        textMode: 'plain',
        assistantSkillId: 'screenplay-draft',
      })
    )
    await workspace.onSave()
    const stored = await studioCloudRequest<StudioCloudProject>(path)
    await studioCloudRequest(`${path}/jobs`, 'POST', {
      request_id: crypto.randomUUID(),
      kind: 'generate',
      revision: stored.revision,
      node_ids: [id],
      budget: Math.round(
        Number(budget) * (capabilities.data?.quota_per_unit || 500000)
      ),
      confirm_generation: true,
    })
  }
  const review = () => {
    try {
      const draft = parseStudioScreenplayResponse(
        node?.data.outputText || '',
        production.brief || '',
        t('studio.shot.defaultName'),
        production.targetDuration || 30
      )
      workspace.onUpdate({
        ...workspace.project,
        production: {
          ...production,
          screenplayDraft: JSON.stringify(draft),
          guide: { step: 'shots', goal: production.guide?.goal || 'story' },
        },
      })
      setError('')
    } catch {
      setError(
        t(
          'The AI draft needs correction. Open its text in the advanced canvas or use a manual draft. Your story is retained.'
        )
      )
    }
  }
  return (
    <div className='flex flex-col gap-2'>
      <Button
        disabled={
          !writable ||
          props.disabled ||
          !production.brief?.trim() ||
          !model ||
          pending ||
          mutate.isPending ||
          !validBudget ||
          capabilities.data?.generation_credit_available !== true
        }
        onClick={() => setConfirm(true)}
      >
        {t('Help me plan the shots')}
      </Button>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Creates an editable text draft. Review it before making any pictures or videos.'
        )}
      </p>
      {capabilities.data?.generation_credit_available === false && (
        <Alert>
          <AlertDescription>
            {t(
              'Insufficient generation credit. Add credit or continue with free editing.'
            )}{' '}
            <Button size='sm' variant='outline' render={<a href='/wallet' />}>
              {t('Add generation credit')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {!catalog.isPending && !model && (
        <p role='status'>
          {t(
            'No text planning service is available. Use a manual draft or upload existing footage.'
          )}
        </p>
      )}
      {catalog.isError && <p role='alert'>{catalog.error.message}</p>}
      {pending && (
        <p role='status'>
          {t(
            'Planning continues in the background. You can reopen this project to review the result.'
          )}
        </p>
      )}
      {job?.error && <p role='alert'>{job.error}</p>}
      {!!node?.data.outputText && (
        <Button variant='outline' onClick={review}>
          {t('Review AI shot draft')}
        </Button>
      )}
      {error && (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('Confirm AI shot planning')}
        desc={
          <div className='flex flex-col gap-2'>
            <p>
              {t('One text model request')}: {model}
            </p>
            <p>
              {t('Maximum spend')}: ${budget}
            </p>
            <p>
              {t(
                'Pricing follows this model; the limit is not a quote. No image, video or audio generation will start. Existing shot plans stay until you apply the new draft.'
              )}
            </p>
          </div>
        }
        handleConfirm={() =>
          mutate.mutate(submit, { onError: (error) => setError(error.message) })
        }
      />
    </div>
  )
}
