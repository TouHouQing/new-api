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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { TabsContent } from '@/components/ui/tabs'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'

import { StudioBudgetSummary } from './studio-budget-summary'
import { studioCloudRequest } from './studio-cloud'
import { StudioConnectorRecovery } from './studio-connector-recovery'
import { StudioGenerationEstimate } from './studio-generation-estimate'
import { StudioGenerationSetup } from './studio-generation-setup'
import { studioMediaModelAction } from './studio-media-draft'
import { StudioMediaThumbnail } from './studio-media-thumbnail'
import {
  studioProductionSchema,
  studioProjectTimeline,
  studioTimelineClipSchema,
} from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import { StudioQualityReport } from './studio-quality-report'
import { StudioReferenceAnalysisPanel } from './studio-reference-analysis-panel'
import { StudioReworkPanel } from './studio-rework-panel'
import { StudioTimedFrames } from './studio-timed-frames'
import { StudioVideoObjectEdit } from './studio-video-object-edit'
import { studioWorkflowProblem } from './studio-workflow-problem'

export function StudioProductionWorkflowTab(options: { value?: string } = {}) {
  const { t, i18n } = useTranslation()
  const [schedule, setSchedule] = useState('')
  const runAfter = schedule
    ? Math.floor(new Date(schedule).getTime() / 1000)
    : 0
  const invalidSchedule =
    !!schedule &&
    (!Number.isFinite(runAfter) ||
      runAfter <= Date.now() / 1000 ||
      runAfter > Date.now() / 1000 + 7 * 86400)
  const [abandonJob, setAbandonJob] = useState('')
  const [abandonNote, setAbandonNote] = useState('')
  const {
    props,
    budget,
    setBudget,
    confirm,
    setConfirm,
    selectedNodes,
    setSelectedNodes,
    capabilities,
    jobs,
    writable,
    mutate,
    submit,
    setMediaDraftNodeId,
    setActiveTab,
    download,
  } = useStudioProductionContext()
  const selectedMediaTools = props.project.nodes.filter(
    (node) =>
      selectedNodes.includes(node.id) && studioMediaModelAction(node.data.model)
  )
  const invalidLocalClips = props.project.nodes.filter(
    (node) =>
      selectedNodes.includes(node.id) &&
      node.data.kind === 'video' &&
      ['wan2.2-ti2v-5b', 'wan2.1-vace-1.3b'].includes(node.data.model || '') &&
      ((node.data.seconds || 5) < 1 ||
        (node.data.seconds || 5) >
          (node.data.model === 'wan2.1-vace-1.3b' ? 30 : 10))
  )
  const scope = selectedNodes.map((id) => {
    const node = props.project.nodes.find((entry) => entry.id === id)
    const take = node?.data.takes?.find(
      (take) => take.id === node.data.selectedTakeId
    )
    const shot = props.project.shots?.find((shot) =>
      [shot.textNodeId, shot.imageNodeId, shot.videoNodeId].includes(id)
    )
    return {
      id,
      node,
      shot,
      hasResult: !!take?.mediaId || !!node?.data.mediaId,
    }
  })
  return (
    <TabsContent value={options.value || 'workflow'} className='space-y-4'>
      <StudioBudgetSummary />
      {capabilities.data?.storage_available === false && (
        <p role='status'>
          {t(
            'Studio storage is unavailable. Restore free space or reconnect storage before generating.'
          )}
        </p>
      )}
      {scope.length > 0 && (
        <div role='status' className='flex flex-col gap-1 text-sm'>
          <p className='font-medium'>{t('This run scope')}</p>
          {scope.map((item) => (
            <p key={item.id}>
              {item.shot
                ? `${t('Shot')} ${(props.project.shots || []).indexOf(item.shot) + 1} · `
                : ''}
              {item.node?.data.title} ·{' '}
              {t(
                item.hasResult
                  ? 'Existing Take retained; create another Take only if selected'
                  : 'New output needed'
              )}
            </p>
          ))}
          <p className='text-muted-foreground'>
            {t(
              'Unselected shots and their Takes stay in the project. The budget is a hard spending limit, not a quote.'
            )}
          </p>
        </div>
      )}
      {options.value !== 'visual' && (
        <>
          <StudioTimedFrames />
          <StudioVideoObjectEdit />
        </>
      )}
      {!!selectedMediaTools.length && (
        <div role='alert'>
          <p>
            {t(
              'Open the media production tool to confirm its operation and parameters before generating.'
            )}
          </p>
          {selectedMediaTools.map((node) => (
            <Button
              key={node.id}
              variant='outline'
              onClick={() => {
                setMediaDraftNodeId(node.id)
                setActiveTab('media')
              }}
            >
              {node.data.title}
            </Button>
          ))}
        </div>
      )}
      {options.value === 'visual' && <StudioGenerationSetup />}
      {options.value === 'visual' && <StudioReferenceAnalysisPanel />}
      {options.value === 'visual' && <StudioReworkPanel />}
      {!!invalidLocalClips.length && (
        <p role='alert' className='text-destructive text-sm'>
          {t(
            'Choose a supported duration before generating: local Wan supports 1–10 seconds and VACE supports 1–30 seconds. Longer VACE shots use a smaller native frame size.'
          )}{' '}
          {invalidLocalClips.map((node) => node.data.title).join(', ')}
        </p>
      )}
      <Field>
        <FieldLabel htmlFor='production-budget'>
          {t('studio.production.budget')}
        </FieldLabel>
        <Input
          id='production-budget'
          type='number'
          min='0.01'
          max='4000'
          step='0.01'
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
        />
      </Field>
      {options.value === 'visual' && !!props.project.shots?.length && (
        <div className='grid gap-3 sm:grid-cols-2'>
          {props.project.shots.map((shot, index) => (
            <section key={shot.id} className='space-y-2 rounded-md border p-3'>
              <h3 className='font-medium'>
                {t('Shot')} {index + 1} · {shot.title}
              </h3>
              <p className='text-muted-foreground text-xs'>
                {shot.dialogue ||
                  props.project.nodes.find(
                    (node) => node.id === shot.textNodeId
                  )?.data.outputText}
              </p>
              {(['image', 'video'] as const).map((kind) => {
                const id =
                  kind === 'image' ? shot.imageNodeId : shot.videoNodeId
                const node = props.project.nodes.find((node) => node.id === id)
                if (!node) return null
                return (
                  <label key={kind} className='flex items-center gap-2 text-sm'>
                    <Checkbox
                      disabled={!writable}
                      checked={selectedNodes.includes(id)}
                      onCheckedChange={(checked) =>
                        setSelectedNodes((ids) =>
                          checked
                            ? [...new Set([...ids, id])]
                            : ids.filter((item) => item !== id)
                        )
                      }
                    />
                    <span>
                      {t(`studio.kind.${kind}`)} ·{' '}
                      {t(
                        node.data.mediaId
                          ? 'Existing footage retained'
                          : 'Footage needed'
                      )}
                    </span>
                  </label>
                )
              })}
            </section>
          ))}
        </div>
      )}
      <Collapsible
        defaultOpen={options.value !== 'visual' || !props.project.shots?.length}
      >
        <CollapsibleTrigger render={<Button variant='outline' size='sm' />}>
          {t('Advanced: select individual nodes')}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className='grid gap-2 sm:grid-cols-2'>
            {props.project.nodes
              .filter(
                (node) =>
                  node.data.purpose !== 'assembly' &&
                  node.data.purpose !== 'note'
              )
              .map((node) => (
                <label
                  className='flex items-center gap-2 rounded-md border p-2'
                  key={node.id}
                >
                  <Checkbox
                    checked={selectedNodes.includes(node.id)}
                    onCheckedChange={(checked) =>
                      setSelectedNodes((ids) =>
                        checked
                          ? [...ids, node.id]
                          : ids.filter((id) => id !== node.id)
                      )
                    }
                  />
                  <span>{node.data.title}</span>
                </label>
              ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
      {options.value === 'visual' && (
        <div className='grid gap-3 sm:grid-cols-2'>
          {props.project.nodes
            .filter(
              (node) =>
                !!node.data.mediaId &&
                ['image', 'video', 'audio'].includes(node.data.kind)
            )
            .map((node) => {
              const takeNumber =
                (node.data.takes || []).findIndex(
                  (take) => take.id === node.data.selectedTakeId
                ) + 1
              const shot = props.project.shots?.find((shot) =>
                [shot.imageNodeId, shot.videoNodeId].includes(node.id)
              )
              const label = `${shot ? `${t('Shot')} ${(props.project.shots || []).indexOf(shot) + 1} · ` : ''}${node.data.title} · ${t('Take')} ${takeNumber || 1}`
              return (
                <div
                  key={node.id}
                  role='group'
                  aria-label={label}
                  className='flex flex-col gap-2 rounded border p-3'
                >
                  <p className='font-medium'>{label}</p>
                  <StudioMediaThumbnail
                    mediaId={node.data.mediaId || ''}
                    kind={node.data.kind}
                    title={label}
                    getMedia={props.getMedia}
                  />
                  <div className='flex flex-wrap gap-2'>
                    <Button
                      variant='outline'
                      size='xs'
                      onClick={() => props.onSelectNode?.(node.id)}
                    >
                      {t('Preview, compare and edit')}
                    </Button>
                    <Button
                      variant='outline'
                      size='xs'
                      disabled={mutate.isPending}
                      onClick={() =>
                        mutate.mutate(async () => {
                          const blob = await props.getMedia(
                            node.data.mediaId || ''
                          )
                          const extensions: Record<string, string> = {
                            'image/jpeg': 'jpg',
                            'image/png': 'png',
                            'image/webp': 'webp',
                            'video/mp4': 'mp4',
                            'audio/wav': 'wav',
                            'audio/mpeg': 'mp3',
                            'audio/ogg': 'ogg',
                          }
                          const ext = extensions[blob?.type || ''] || 'bin'
                          await download(
                            node.data.mediaId || '',
                            `${node.data.title}-take-${takeNumber || 1}.${ext}`
                          )
                        })
                      }
                    >
                      {t('Download')}
                    </Button>
                    {node.data.kind === 'video' && (
                      <Button
                        variant='outline'
                        size='xs'
                        disabled={
                          !writable ||
                          studioProjectTimeline(props.project).some(
                            (clip) =>
                              clip.nodeId === node.id &&
                              clip.takeId === node.data.selectedTakeId
                          )
                        }
                        onClick={() => {
                          const production =
                            props.project.production ||
                            studioProductionSchema.parse({})
                          const clip = studioTimelineClipSchema.parse({
                            id: crypto.randomUUID(),
                            nodeId: node.id,
                            takeId: node.data.selectedTakeId,
                          })
                          props.onUpdate({
                            ...props.project,
                            production: {
                              ...production,
                              timelineEdited: true,
                              timeline: [
                                ...studioProjectTimeline(props.project),
                                clip,
                              ],
                            },
                          })
                        }}
                      >
                        {t('Add to timeline')}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
        </div>
      )}
      {options.value === 'visual' && <StudioGenerationEstimate />}
      <label className='flex items-center gap-2'>
        <Checkbox
          checked={confirm}
          onCheckedChange={(checked) => setConfirm(checked === true)}
        />
        {t('studio.production.confirm')}
      </label>
      <div className='flex gap-2'>
        <Button
          disabled={
            !writable ||
            !confirm ||
            capabilities.data?.generation_credit_available !== true ||
            capabilities.data?.storage_available === false ||
            !selectedNodes.length ||
            !!selectedMediaTools.length ||
            !!invalidLocalClips.length ||
            !Number.isFinite(Number(budget)) ||
            Number(budget) <= 0 ||
            Number(budget) > 4000 ||
            invalidSchedule ||
            mutate.isPending
          }
          onClick={() =>
            mutate.mutate(() => submit('generate', false, runAfter))
          }
        >
          {schedule ? t('Schedule generation') : t('studio.production.run')}
        </Button>
        <Button
          variant='outline'
          disabled={
            !writable ||
            mutate.isPending ||
            !capabilities.data?.render_available
          }
          onClick={() => mutate.mutate(() => submit('quality'))}
        >
          {t('studio.production.check')}
        </Button>
      </div>
      <Field>
        <FieldLabel htmlFor='workflow-schedule'>
          {t('Start time (optional)')}
        </FieldLabel>
        <Input
          id='workflow-schedule'
          type='datetime-local'
          value={schedule}
          disabled={!writable || mutate.isPending}
          onChange={(event) => setSchedule(event.target.value)}
        />
        <p className='text-muted-foreground text-xs'>
          {t(
            'Schedule within seven days. The confirmed project version and budget are saved; execution continues with the browser closed.'
          )}
        </p>
        {invalidSchedule && (
          <p role='alert' className='text-destructive text-sm'>
            {t('Choose a future time within seven days.')}
          </p>
        )}
      </Field>
      {jobs.data?.map((job) => (
        <div key={job.id} className='space-y-2 rounded-lg border p-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge>{t(`studio.production.${job.kind}`)}</Badge>
            <span>
              {t(`studio.production.status.${job.status}`)} · {job.progress}%
            </span>
            {!!job.run_after && (
              <span className='text-xs'>
                {t('Scheduled for')}{' '}
                {new Date(job.run_after * 1000).toLocaleString(
                  toIntlLocale(i18n.resolvedLanguage || i18n.language)
                )}
              </span>
            )}
            {job.user_id === props.userId &&
              [
                'queued',
                'running',
                'waiting',
                'paused',
                'uncertain',
                'failed',
              ].includes(job.status) && (
                <div className='ml-auto flex gap-2'>
                  {['pause', 'resume', 'cancel'].map((action) => (
                    <Button
                      key={action}
                      size='xs'
                      variant='outline'
                      disabled={
                        mutate.isPending ||
                        (action === 'pause' &&
                          !['queued', 'running', 'waiting'].includes(
                            job.status
                          )) ||
                        (action === 'resume' &&
                          !['paused', 'uncertain', 'failed'].includes(
                            job.status
                          )) ||
                        (action === 'cancel' &&
                          !['queued', 'running', 'waiting', 'paused'].includes(
                            job.status
                          )) ||
                        (action === 'resume' &&
                          ['generate', 'transcribe', 'media'].includes(
                            job.kind
                          ) &&
                          !confirm)
                      }
                      onClick={() =>
                        mutate.mutate(() =>
                          studioCloudRequest(
                            `/jobs/${encodeURIComponent(job.id)}/control`,
                            'POST',
                            { action, confirm_generation: confirm }
                          )
                        )
                      }
                    >
                      {t(`studio.production.${action}`)}
                    </Button>
                  ))}
                  {job.status === 'uncertain' && (
                    <Button
                      size='xs'
                      variant='outline'
                      disabled={mutate.isPending}
                      onClick={() => {
                        setAbandonJob(job.id)
                        setAbandonNote('')
                      }}
                    >
                      {t('studio.production.abandonUncertain')}
                    </Button>
                  )}
                </div>
              )}
          </div>
          {job.budget !== undefined && (
            <p className='text-muted-foreground text-xs'>
              {t('Maximum spend')}: {formatQuotaWithCurrency(job.budget)} ·{' '}
              {t('Recorded platform spend')}:{' '}
              {job.used_quota === undefined
                ? t('Settlement unavailable')
                : formatQuotaWithCurrency(job.used_quota)}
              {!job.settlement_final && (
                <>
                  {' '}
                  ·{' '}
                  {t(
                    'Upstream settlement may still change; a failed request does not always mean zero cost.'
                  )}
                </>
              )}
            </p>
          )}
          {job.error && (
            <details className='text-destructive text-sm'>
              <summary className='cursor-pointer'>
                {t(studioWorkflowProblem(job.error))}
              </summary>
              <pre className='mt-2 max-h-48 overflow-auto text-xs break-all whitespace-pre-wrap'>
                {job.error}
              </pre>
            </details>
          )}
          {job.kind === 'connector' &&
            ['uncertain', 'failed'].includes(job.status) &&
            ['export_media', 'notify_delivery'].includes(
              job.connector?.action || ''
            ) &&
            job.user_id === props.userId && (
              <StudioConnectorRecovery job={job} />
            )}
          {job.kind === 'quality' && job.status === 'succeeded' && (
            <StudioQualityReport
              result={job.result}
              project={props.project}
              onLocate={(id) => setSelectedNodes([id])}
            />
          )}
        </div>
      ))}
      <ConfirmDialog
        open={!!abandonJob}
        onOpenChange={(open) => {
          if (!open) setAbandonJob('')
        }}
        title={t('studio.production.abandonUncertain')}
        desc={t('studio.production.abandonUncertainHint')}
        destructive
        confirmText={t('studio.production.abandonUncertain')}
        disabled={abandonNote.trim().length < 10}
        isLoading={mutate.isPending}
        handleConfirm={() =>
          mutate.mutate(async () => {
            await studioCloudRequest(
              `/jobs/${encodeURIComponent(abandonJob)}/control`,
              'POST',
              {
                action: 'abandon',
                acknowledge_uncertainty: true,
                note: abandonNote,
              }
            )
            setAbandonJob('')
          })
        }
      >
        <Input
          aria-label={t('studio.production.abandonNote')}
          placeholder={t('studio.production.abandonNote')}
          maxLength={1000}
          value={abandonNote}
          onChange={(event) => setAbandonNote(event.target.value)}
        />
      </ConfirmDialog>
    </TabsContent>
  )
}
