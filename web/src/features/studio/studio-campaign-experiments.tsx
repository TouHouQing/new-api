/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { markServerErrorHandled } from '@/lib/handle-server-error'
import { getServerErrorMessage } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import type { StudioProject } from './local-projects'
import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'

type AxisKind =
  | 'hook'
  | 'benefit'
  | 'audience'
  | 'scene'
  | 'duration'
  | 'language'
type CampaignAxis = {
  id: string
  label: string
  kind: AxisKind
  path: string
  values: Array<{ id: string; label: string; value: string | number }>
}
export type StudioCampaign = {
  id: string
  title: string
  revision: number
  source_project_id: string
  source_revision: number
  total_budget: number
  axes: CampaignAxis[]
  sample_variant_id: string
  sample_approved_revision?: number
  variants: Array<{
    id: string
    values: Record<string, string>
    budget: number
    project_id: string
    changed_node_ids: string[]
    job_id?: string
    job_status?: string
    needs_dialogue_review?: boolean
  }>
}

export function StudioCampaignExperiments(props: {
  project: StudioProject
  readOnly?: boolean
  onSave?: () => Promise<void>
  onOpenProject?: (projectId: string) => void
}) {
  const { t } = useTranslation()
  const actor = useAuthStore((state) => state.auth.user?.id)
  const client = useQueryClient()
  const sourceId = props.project.id
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [budget, setBudget] = useState('5')
  const [axes, setAxes] = useState<CampaignAxis[]>([
    {
      id: 'hook',
      label: '',
      kind: 'hook',
      path: '',
      values: [
        { id: 'a', label: 'A', value: '' },
        { id: 'b', label: 'B', value: '' },
      ],
    },
    {
      id: 'benefit',
      label: '',
      kind: 'benefit',
      path: '',
      values: [
        { id: 'a', label: 'A', value: '' },
        { id: 'b', label: 'B', value: '' },
      ],
    },
  ])
  const [selection, setSelection] = useState<string[] | null>(null)
  const [sampleId, setSampleId] = useState('v1')
  const [error, setError] = useState('')
  const createRequest = useRef<{ key: string; id: string } | undefined>(
    undefined
  )
  const [confirmation, setConfirmation] = useState<{
    campaign: StudioCampaign
    variantId?: string
    approve?: boolean
    batch?: boolean
  }>()
  const campaigns = useQuery({
    queryKey: ['studio-campaigns', actor, sourceId],
    queryFn: () =>
      studioCloudRequest<StudioCampaign[]>(
        `/projects/${encodeURIComponent(sourceId)}/campaigns`
      ),
    enabled: open,
    refetchInterval: open ? 5000 : false,
  })
  const capabilities = useQuery({
    queryKey: ['studio-cloud-capabilities', actor],
    queryFn: () =>
      studioCloudRequest<{ quota_per_unit: number }>('/capabilities'),
    enabled: open,
  })
  function kindLabel(kind: AxisKind) {
    switch (kind) {
      case 'hook':
        return t('Opening hook')
      case 'benefit':
        return t('Benefit to demonstrate')
      case 'audience':
        return t('Audience angle')
      case 'scene':
        return t('Scene direction')
      case 'duration':
        return t('Shot duration')
      case 'language':
        return t('Translated dialogue or captions')
    }
  }
  function targets(kind: AxisKind) {
    if (kind === 'language') {
      return (props.project.shots || []).flatMap((shot, index) => [
        {
          path: `/shots/${index}/dialogue`,
          label: `${shot.title} · ${t('studio.shot.dialogue')}`,
          value: shot.dialogue || '',
        },
        {
          path: `/shots/${index}/shotCaptionText`,
          label: `${shot.title} · ${t('Captions')}`,
          value: shot.shotCaptionText || '',
        },
      ])
    }
    return props.project.nodes.flatMap((node, index) => {
      if (
        node.data.locked ||
        node.data.sourceMode === 'upload' ||
        node.data.purpose === 'assembly' ||
        (kind === 'duration' && node.data.kind !== 'video')
      ) {
        return []
      }
      return [
        {
          path: `/nodes/${index}/data/${kind === 'duration' ? 'seconds' : 'prompt'}`,
          label: node.data.title,
          value:
            kind === 'duration'
              ? String(node.data.seconds || 5)
              : node.data.prompt,
        },
      ]
    })
  }
  let combinations: Array<{ id: string; values: Record<string, string> }> = [
    { id: 'v1', values: {} },
  ]
  for (const axis of axes) {
    combinations = combinations.flatMap((combination) =>
      axis.values.map((value) => ({
        id: '',
        values: { ...combination.values, [axis.id]: value.id },
      }))
    )
  }
  combinations = combinations.map((combination, index) => ({
    ...combination,
    id: `v${index + 1}`,
  }))
  const selected = combinations.filter((combination, index) =>
    selection ? selection.includes(combination.id) : index < 16
  )
  const totalBudget = Math.round(
    Number(budget) * (capabilities.data?.quota_per_unit || 0)
  )
  const validBudget =
    Number.isSafeInteger(totalBudget) &&
    totalBudget >= selected.length &&
    totalBudget <= 2_000_000_000 &&
    selected.length > 0
  const inputReady =
    axes.every(
      (axis) =>
        axis.path && axis.values.every((value) => String(value.value).trim())
    ) && new Set(axes.map((axis) => axis.path)).size === axes.length
  const validSample = selected.some(
    (combination) => combination.id === sampleId
  )
  const allocate = (index: number) =>
    Math.floor(totalBudget / selected.length) +
    (index < totalBudget % selected.length ? 1 : 0)
  const operation = useMutation({
    mutationFn: async (
      input:
        | { kind: 'create' }
        | {
            kind: 'submit' | 'approve' | 'resume' | 'batch'
            campaign: StudioCampaign
            variantId?: string
          }
    ) => {
      setError('')
      if (input.kind === 'create') {
        if (
          !inputReady ||
          !validBudget ||
          !validSample ||
          selected.length > 16 ||
          !title.trim()
        ) {
          throw new Error(
            t(
              'Complete the variable values, choose a sample and keep the selected variants within the total budget.'
            )
          )
        }
        await props.onSave?.()
        const master = await studioCloudRequest<StudioCloudProject>(
          `/projects/${encodeURIComponent(sourceId)}`
        )
        const request = {
          title: title.trim(),
          project_revision: master.revision,
          total_budget: totalBudget,
          axes: axes.map((axis) => ({
            ...axis,
            label: axis.label || kindLabel(axis.kind),
            values: axis.values.map((value) => ({
              ...value,
              value:
                axis.kind === 'duration'
                  ? Number(value.value)
                  : String(value.value),
            })),
          })),
          variants: selected.map((variant, index) => ({
            ...variant,
            budget: allocate(index),
          })),
          sample_variant_id: sampleId,
        }
        const key = JSON.stringify([actor, sourceId, request])
        if (createRequest.current?.key !== key) {
          createRequest.current = { key, id: crypto.randomUUID() }
        }
        return studioCloudRequest<StudioCampaign>(
          `/projects/${encodeURIComponent(sourceId)}/campaigns`,
          'POST',
          { id: createRequest.current.id, ...request }
        )
      }
      const campaignPath = `/campaigns/${encodeURIComponent(input.campaign.id)}`
      if (input.kind === 'batch') {
        for (const variant of input.campaign.variants.filter(
          (variant) =>
            !variant.job_id && variant.id !== input.campaign.sample_variant_id
        )) {
          await studioCloudRequest(
            `${campaignPath}/variants/${encodeURIComponent(variant.id)}/submit`,
            'POST',
            { confirm_generation: true }
          )
        }
        return
      }
      if (input.kind === 'approve') {
        return studioCloudRequest<StudioCampaign>(
          `${campaignPath}/approve-sample`,
          'POST',
          { revision: input.campaign.revision, confirm_sample: true }
        )
      }
      const variant = input.campaign.variants.find(
        (variant) => variant.id === input.variantId
      )
      if (!variant) throw new Error(t('Choose an available variant.'))
      if (input.kind === 'resume') {
        if (!variant.job_id) {
          throw new Error(
            t(
              'The saved workflow receipt is unavailable. Refresh before retrying.'
            )
          )
        }
        return studioCloudRequest(
          `/jobs/${encodeURIComponent(variant.job_id)}/control`,
          'POST',
          { action: 'resume', confirm_generation: true }
        )
      }
      return studioCloudRequest(
        `${campaignPath}/variants/${encodeURIComponent(variant.id)}/submit`,
        'POST',
        { confirm_generation: true }
      )
    },
    onSuccess: async () => {
      createRequest.current = undefined
      setConfirmation(undefined)
      await client.invalidateQueries({
        queryKey: ['studio-campaigns', actor, sourceId],
      })
    },
    onError: (problem) => {
      setError(
        getServerErrorMessage(
          problem,
          t(
            'The creative experiment could not be saved. Your inputs are retained.'
          )
        )
      )
      markServerErrorHandled(problem)
      void client.invalidateQueries({
        queryKey: ['studio-campaigns', actor, sourceId],
      })
    },
  })
  const disabled = props.readOnly || operation.isPending
  return (
    <section
      className='flex flex-col gap-3 rounded-lg border p-3'
      aria-label={t('Creative experiments')}
    >
      <Button
        variant='ghost'
        className='justify-start'
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {t('Compare opening hooks and creative variants')}
      </Button>
      {open && (
        <>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Freeze a master version, change only the selected creative fields, and compare independent drafts. Make and review one sample before starting the remaining variants.'
            )}
          </p>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor='campaign-title'>
                {t('Experiment name')}
              </FieldLabel>
              <Input
                id='campaign-title'
                value={title}
                maxLength={120}
                disabled={disabled}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='campaign-budget'>
                {t('Total generation budget (USD)')}
              </FieldLabel>
              <Input
                id='campaign-budget'
                type='number'
                min='0.01'
                step='0.01'
                value={budget}
                disabled={disabled}
                onChange={(event) => setBudget(event.target.value)}
              />
            </Field>
          </FieldGroup>
          {axes.map((axis, index) => (
            <fieldset
              key={axis.id}
              className='flex flex-col gap-3 rounded-lg border p-3'
            >
              <legend className='text-sm'>
                {t('Creative variable {{number}}', { number: index + 1 })}
              </legend>
              <NativeSelect
                aria-label={t('Variable {{number}} type', {
                  number: index + 1,
                })}
                value={axis.kind}
                disabled={disabled}
                onChange={(event) =>
                  setAxes(
                    axes.map((item) =>
                      item.id === axis.id
                        ? {
                            ...item,
                            kind: event.target.value as AxisKind,
                            path: '',
                            values: item.values.map((value) => ({
                              ...value,
                              value: '',
                            })),
                          }
                        : item
                    )
                  )
                }
              >
                {(
                  [
                    'hook',
                    'benefit',
                    'audience',
                    'scene',
                    'duration',
                    'language',
                  ] as const
                ).map((kind) => (
                  <NativeSelectOption key={kind} value={kind}>
                    {kindLabel(kind)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect
                aria-label={t('Variable {{number}} target', {
                  number: index + 1,
                })}
                value={axis.path}
                disabled={disabled}
                onChange={(event) =>
                  setAxes(
                    axes.map((item) =>
                      item.id === axis.id
                        ? { ...item, path: event.target.value }
                        : item
                    )
                  )
                }
              >
                <NativeSelectOption value=''>
                  {t('Choose the shot to change')}
                </NativeSelectOption>
                {targets(axis.kind).map((target) => (
                  <NativeSelectOption key={target.path} value={target.path}>
                    {target.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {axis.kind === 'language' && (
                <p className='text-muted-foreground text-sm'>
                  {t(
                    'Enter complete translated lines. Old voice and captions are cleared in the variant; finish and review its new voice and subtitles before export.'
                  )}
                </p>
              )}
              <FieldGroup>
                {axis.values.map((value) => (
                  <Field key={value.id}>
                    <FieldLabel htmlFor={`${axis.id}-${value.id}`}>
                      {kindLabel(axis.kind)} · {value.label}
                    </FieldLabel>
                    <Textarea
                      id={`${axis.id}-${value.id}`}
                      value={String(value.value)}
                      maxLength={30000}
                      disabled={disabled}
                      onChange={(event) =>
                        setAxes(
                          axes.map((item) =>
                            item.id === axis.id
                              ? {
                                  ...item,
                                  values: item.values.map((entry) =>
                                    entry.id === value.id
                                      ? { ...entry, value: event.target.value }
                                      : entry
                                  ),
                                }
                              : item
                          )
                        )
                      }
                    />
                  </Field>
                ))}
              </FieldGroup>
              <div className='flex flex-wrap gap-2'>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={disabled || !axis.path}
                  onClick={() => {
                    const current =
                      targets(axis.kind).find(
                        (target) => target.path === axis.path
                      )?.value || ''
                    setAxes(
                      axes.map((item) =>
                        item.id === axis.id
                          ? {
                              ...item,
                              values: item.values.map((value) => ({
                                ...value,
                                value: current,
                              })),
                            }
                          : item
                      )
                    )
                  }}
                >
                  {t('Start from the current shot direction')}
                </Button>
                <Button
                  size='sm'
                  variant='ghost'
                  disabled={disabled || axes.length <= 1}
                  onClick={() => {
                    setAxes(axes.filter((item) => item.id !== axis.id))
                    setSelection(null)
                  }}
                >
                  {t('Remove variable')}
                </Button>
              </div>
            </fieldset>
          ))}
          <Button
            size='sm'
            variant='outline'
            disabled={disabled || axes.length >= 6}
            onClick={() => {
              setAxes([
                ...axes,
                {
                  id: crypto.randomUUID(),
                  label: '',
                  kind: 'scene',
                  path: '',
                  values: [
                    { id: 'a', label: 'A', value: '' },
                    { id: 'b', label: 'B', value: '' },
                  ],
                },
              ])
              setSelection(null)
            }}
          >
            {t('Add creative variable')}
          </Button>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Choose up to 16 combinations. The total budget is divided between the selected variants, and unchanged media is shared. Creating drafts does not start generation.'
            )}
          </p>
          <fieldset className='flex max-h-64 flex-col gap-2 overflow-auto'>
            <legend>{t('Combinations to create')}</legend>
            {combinations.map((combination) => (
              <label key={combination.id} className='flex items-center gap-2'>
                <Checkbox
                  checked={selected.some((item) => item.id === combination.id)}
                  disabled={
                    disabled ||
                    (!selected.some((item) => item.id === combination.id) &&
                      selected.length >= 16)
                  }
                  onCheckedChange={(checked) =>
                    setSelection(
                      checked
                        ? [...selected.map((item) => item.id), combination.id]
                        : selected
                            .filter((item) => item.id !== combination.id)
                            .map((item) => item.id)
                    )
                  }
                />
                <span>
                  {axes
                    .map(
                      (axis) =>
                        `${kindLabel(axis.kind)} ${combination.values[axis.id].toUpperCase()}`
                    )
                    .join(' · ')}
                </span>
              </label>
            ))}
          </fieldset>
          <NativeSelect
            aria-label={t('First sample variant')}
            value={validSample ? sampleId : ''}
            disabled={disabled}
            onChange={(event) => setSampleId(event.target.value)}
          >
            <NativeSelectOption value=''>
              {t('Choose a sample to review first')}
            </NativeSelectOption>
            {selected.map((combination) => (
              <NativeSelectOption key={combination.id} value={combination.id}>
                {combination.id} ·{' '}
                {axes
                  .map(
                    (axis) =>
                      `${kindLabel(axis.kind)} ${combination.values[axis.id].toUpperCase()}`
                  )
                  .join(' · ')}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {validBudget && (
            <p className='text-sm'>
              {t('{{count}} independent drafts', { count: selected.length })} ·{' '}
              {t('Maximum spend')}: {formatQuotaWithCurrency(totalBudget)} ·{' '}
              {t('Per variant')}: {formatQuotaWithCurrency(allocate(0))}
            </p>
          )}
          <Button
            disabled={
              disabled ||
              !title.trim() ||
              !inputReady ||
              !validBudget ||
              !validSample
            }
            onClick={() => operation.mutate({ kind: 'create' })}
          >
            {t('Create independent experiment drafts')}
          </Button>
          {campaigns.isPending && <LoadingState />}
          {campaigns.isError && (
            <ErrorState
              description={t(
                'Experiments could not be loaded. Retry without losing your draft.'
              )}
              onRetry={() => campaigns.refetch()}
            />
          )}
          {campaigns.data?.map((campaign) => (
            <article
              key={campaign.id}
              className='flex flex-col gap-3 rounded-lg border p-3'
            >
              <h3 className='font-medium'>
                {campaign.title} ·{' '}
                {t('Master revision {{revision}}', {
                  revision: campaign.source_revision,
                })}
              </h3>
              <p className='text-muted-foreground text-sm'>
                {t('Maximum spend')}:{' '}
                {formatQuotaWithCurrency(campaign.total_budget)}
              </p>
              {!!campaign.sample_approved_revision &&
                campaign.variants.some(
                  (variant) =>
                    !variant.job_id && variant.id !== campaign.sample_variant_id
                ) && (
                  <Button
                    size='sm'
                    disabled={disabled}
                    onClick={() => setConfirmation({ campaign, batch: true })}
                  >
                    {t('Generate the remaining selected variants')}
                  </Button>
                )}
              {campaign.variants.map((variant) => (
                <div
                  key={variant.id}
                  className='flex flex-col gap-2 border-t pt-2'
                >
                  <p className='text-sm'>
                    {variant.id} ·{' '}
                    {campaign.axes
                      .map(
                        (axis) =>
                          `${axis.label}: ${axis.values.find((value) => value.id === variant.values[axis.id])?.label || ''}`
                      )
                      .join(' · ')}
                  </p>
                  <p className='text-muted-foreground text-xs'>
                    {t('Only these nodes need new material')}:{' '}
                    {variant.changed_node_ids
                      .map(
                        (id) =>
                          props.project.nodes.find((node) => node.id === id)
                            ?.data.title || t('Untitled shot')
                      )
                      .join(', ')}{' '}
                    · {formatQuotaWithCurrency(variant.budget)}
                  </p>
                  <div className='flex flex-wrap gap-2'>
                    <Badge variant='outline'>
                      {variant.job_status
                        ? t(`studio.production.status.${variant.job_status}`)
                        : t('Draft; generation has not started')}
                    </Badge>
                    {variant.needs_dialogue_review && (
                      <Badge variant='outline'>
                        {t('New voice and subtitles need review')}
                      </Badge>
                    )}
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    {props.onOpenProject && (
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() =>
                          props.onOpenProject?.(variant.project_id)
                        }
                      >
                        {t('Open variant for editing')}
                      </Button>
                    )}
                    {!variant.job_id && (
                      <Button
                        size='sm'
                        disabled={
                          disabled ||
                          (variant.id !== campaign.sample_variant_id &&
                            !campaign.sample_approved_revision)
                        }
                        onClick={() =>
                          setConfirmation({ campaign, variantId: variant.id })
                        }
                      >
                        {variant.id === campaign.sample_variant_id
                          ? t('Generate the sample')
                          : t('Generate this variant')}
                      </Button>
                    )}
                    {variant.job_id &&
                      ['failed', 'paused'].includes(
                        variant.job_status || ''
                      ) && (
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={disabled}
                          onClick={() =>
                            setConfirmation({ campaign, variantId: variant.id })
                          }
                        >
                          {t('Continue this saved variant workflow')}
                        </Button>
                      )}
                    {variant.id === campaign.sample_variant_id &&
                      variant.job_status === 'succeeded' && (
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={disabled}
                          onClick={() =>
                            setConfirmation({ campaign, approve: true })
                          }
                        >
                          {t('Approve the reviewed sample')}
                        </Button>
                      )}
                  </div>
                </div>
              ))}
            </article>
          ))}
          {error && (
            <p role='alert' className='text-destructive text-sm'>
              {error}
            </p>
          )}
        </>
      )}
      <ConfirmDialog
        open={!!confirmation}
        onOpenChange={(value) => {
          if (!value) setConfirmation(undefined)
        }}
        title={
          confirmation?.approve
            ? t('Approve the reviewed sample')
            : t('Confirm this variant generation')
        }
        desc={
          confirmation?.approve
            ? t(
                'Confirm that you reviewed the completed sample. Other variants will retain their own independent budgets and review status.'
              )
            : t(
                'Only the saved affected nodes will run, within this variant budget. Existing completed material on other branches is reused. Failed workflows continue using their original receipt.'
              )
        }
        disabled={disabled}
        isLoading={operation.isPending}
        confirmText={
          confirmation?.approve
            ? t('I reviewed and approve this sample')
            : t('Generate within this variant budget')
        }
        handleConfirm={() => {
          if (!confirmation) return
          const variant = confirmation.campaign.variants.find(
            (variant) => variant.id === confirmation.variantId
          )
          let kind: 'submit' | 'approve' | 'resume' | 'batch' = 'submit'
          if (confirmation.approve) kind = 'approve'
          else if (confirmation.batch) kind = 'batch'
          else if (variant?.job_id) kind = 'resume'
          operation.mutate({ kind, ...confirmation })
        }}
      >
        {confirmation?.variantId && (
          <p className='text-sm'>
            {t('Maximum spend')}:{' '}
            {formatQuotaWithCurrency(
              confirmation.campaign.variants.find(
                (variant) => variant.id === confirmation.variantId
              )?.budget
            )}
          </p>
        )}
        {confirmation?.batch && (
          <p className='text-sm'>
            {t('Maximum spend')}:{' '}
            {formatQuotaWithCurrency(
              confirmation.campaign.variants
                .filter(
                  (variant) =>
                    !variant.job_id &&
                    variant.id !== confirmation.campaign.sample_variant_id
                )
                .reduce((sum, variant) => sum + variant.budget, 0)
            )}
          </p>
        )}
      </ConfirmDialog>
    </section>
  )
}
