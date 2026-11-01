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
import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import type { StudioProject } from './local-projects'
import { studioNodeAssetContext } from './studio-continuity'
import { StudioMediaThumbnail } from './studio-media-thumbnail'
import { studioProductionSchema } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'

const referenceReceipt = z.object({
  assets: z
    .array(
      z.object({
        id: z.string(),
        versionId: z.string().optional(),
        mediaId: z.string().optional(),
      })
    )
    .optional(),
  descriptionReferencesKnown: z.boolean().optional(),
  descriptionAssets: z
    .array(
      z.object({
        id: z.string(),
        versionId: z.string().optional(),
        conditioning: z.literal('description-only'),
      })
    )
    .optional(),
  references: z
    .array(
      z.object({
        sourceNodeId: z.string(),
        sourceTakeId: z.string().optional(),
        mediaId: z.string(),
        role: z.string(),
      })
    )
    .optional(),
})

/** Review the selected result, never whichever Take happens to be newest. */
function studioContinuityShotEvidence(
  project: StudioProject,
  shotId: string,
  assetId: string
) {
  const shot = project.shots?.find((item) => item.id === shotId)
  const node = project.nodes.find((item) => item.id === shot?.videoNodeId)
  const take = node?.data.takes?.find(
    (item) => item.id === node.data.selectedTakeId
  )
  let mediaId = node?.data.mediaId
  if (node?.data.selectedTakeId) {
    mediaId = take?.status === 'completed' ? take.mediaId : undefined
  }
  const context = node ? studioNodeAssetContext(project, node.id) : undefined
  const state = project.production?.continuityStates.find(
    (item) => item.shotId === shotId && item.assetId === assetId
  )
  const asset = project.assets?.find((item) => item.id === assetId)
  const referenceVersionId =
    state?.versionId || context?.assetVersionIds[assetId]
  const reference = referenceVersionId
    ? asset?.versions?.find((item) => item.id === referenceVersionId)
    : asset
  let standardMediaIds: string[] = []
  if (state?.referenceMediaIds.length) {
    standardMediaIds = state.referenceMediaIds
  } else if (reference?.mediaId) standardMediaIds = [reference.mediaId]
  const referenceMediaIds = [...new Set(standardMediaIds)].sort()
  let submitted: z.infer<typeof referenceReceipt>['assets']
  let submittedDescriptions: z.infer<
    typeof referenceReceipt
  >['descriptionAssets']
  let descriptionsKnown = false
  let submittedFrames: z.infer<typeof referenceReceipt>['references']
  if (take?.requestSnapshot) {
    try {
      const receipt = referenceReceipt.safeParse(
        JSON.parse(take.requestSnapshot)
      )
      if (receipt.success) {
        submitted = receipt.data.assets
        submittedDescriptions = receipt.data.descriptionAssets
        descriptionsKnown = receipt.data.descriptionReferencesKnown === true
        submittedFrames = receipt.data.references?.filter(
          (reference) => reference.role === 'first_frame'
        )
      }
    } catch {
      /* An unreadable historical receipt must stay unknown. */
    }
  }
  const submittedReference = submitted?.find((item) => item.id === assetId)
  const requirementsKey = JSON.stringify([
    state?.wardrobe || '',
    state?.emotion || '',
    state?.propState || '',
    state?.note || '',
    project.production?.shotNarrative?.[shotId]?.continuityNeeds || '',
  ])
  const reviews =
    project.production?.continuityReviews?.filter(
      (item) => item.shotId === shotId && item.assetId === assetId
    ) || []
  const latest = reviews.at(-1)
  const review =
    latest &&
    latest.nodeId === node?.id &&
    latest.mediaId === mediaId &&
    (latest.takeId || '') === (node?.data.selectedTakeId || '') &&
    (latest.referenceVersionId || '') === (referenceVersionId || '') &&
    JSON.stringify([...latest.referenceMediaIds].sort()) ===
      JSON.stringify(referenceMediaIds) &&
    latest.requirementsKey === requirementsKey
      ? latest
      : undefined
  return {
    shot,
    node,
    take,
    mediaId,
    referenceVersionId,
    referenceMediaIds,
    submittedReference,
    submittedDescription: descriptionsKnown
      ? submittedDescriptions?.find((item) => item.id === assetId)
      : undefined,
    submittedFrames,
    submittedKnown: submitted !== undefined,
    bound: !!context?.assetIds.includes(assetId),
    review,
    previousReview: latest,
    requirementsKey,
  }
}

export function StudioProductionContinuity() {
  const { t } = useTranslation()
  const { props, writable } = useStudioProductionContext()
  const defaultShotId =
    props.project.shots?.find((shot) =>
      [shot.textNodeId, shot.imageNodeId, shot.videoNodeId].includes(
        props.selectedNodeId || ''
      )
    )?.id ||
    props.project.shots?.[0]?.id ||
    ''
  const scopeKey = JSON.stringify([props.project.id, props.selectedNodeId])
  const previousScope = useRef(scopeKey)
  const [shotId, setShotId] = useState(defaultShotId)
  useEffect(() => {
    if (previousScope.current === scopeKey) return
    previousScope.current = scopeKey
    setShotId(defaultShotId)
  }, [scopeKey, defaultShotId])
  const [assetId, setAssetId] = useState(props.project.assets?.[0]?.id || '')
  const [contactOpen, setContactOpen] = useState(false)
  const [contactPage, setContactPage] = useState(0)
  const production =
    props.project.production || studioProductionSchema.parse({})
  const selectedShotId = props.project.shots?.some((shot) => shot.id === shotId)
    ? shotId
    : props.project.shots?.[0]?.id || ''
  const selectedAssetId = props.project.assets?.some(
    (asset) => asset.id === assetId
  )
    ? assetId
    : props.project.assets?.[0]?.id || ''
  const state = production.continuityStates.find(
    (item) => item.shotId === selectedShotId && item.assetId === selectedAssetId
  ) || {
    shotId: selectedShotId,
    assetId: selectedAssetId,
    wardrobe: '',
    emotion: '',
    propState: '',
    note: '',
    referenceMediaIds: [],
  }
  const asset = props.project.assets?.find(
    (asset) => asset.id === selectedAssetId
  )
  const selectedShot = props.project.shots?.find(
    (shot) => shot.id === selectedShotId
  )
  const locked = props.project.nodes.some(
    (node) =>
      [
        selectedShot?.textNodeId,
        selectedShot?.imageNodeId,
        selectedShot?.videoNodeId,
      ].includes(node.id) && node.data.locked
  )
  const stateDisabled = !writable || locked
  const page = Math.min(
    contactPage,
    Math.max(0, Math.ceil((props.project.shots?.length || 0) / 6) - 1)
  )
  function update(patch: Partial<typeof state>) {
    if (stateDisabled) return
    const next = { ...state, ...patch }
    const shot = selectedShot
    const changeId = `continuity-${selectedShotId}-${selectedAssetId}`
    props.onUpdate({
      ...props.project,
      production: {
        ...production,
        continuityStates: [
          ...production.continuityStates.filter(
            (item) =>
              item.shotId !== selectedShotId || item.assetId !== selectedAssetId
          ),
          next,
        ],
        changes: [
          ...production.changes.filter((change) => change.id !== changeId),
          {
            id: changeId,
            kind: 'script' as const,
            message: `${t('studio.production.continuityChanged')}: ${shot?.title || shotId}`,
            nodeIds: shot ? [shot.imageNodeId, shot.videoNodeId] : [],
            status: 'pending' as const,
            createdAt: new Date().toISOString(),
          },
        ].slice(-200),
      },
    })
  }
  if (!props.project.shots?.length || !props.project.assets?.length) return null
  return (
    <div className='flex flex-col gap-3 rounded-lg border p-3'>
      <p className='font-medium'>{t('studio.production.shotContinuity')}</p>
      <Select
        value={selectedShotId}
        onValueChange={(value) => setShotId(value || '')}
        items={props.project.shots.map((shot) => ({
          value: shot.id,
          label: shot.title,
        }))}
      >
        <SelectTrigger aria-label={t('studio.production.shot')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {props.project.shots.map((shot) => (
              <SelectItem key={shot.id} value={shot.id}>
                {shot.title}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select
        value={selectedAssetId}
        items={props.project.assets.map((asset) => ({
          value: asset.id,
          label: asset.title,
        }))}
        onValueChange={(value) => setAssetId(value || '')}
      >
        <SelectTrigger aria-label={t('studio.production.character')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {props.project.assets.map((asset) => (
              <SelectItem key={asset.id} value={asset.id}>
                {asset.title}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select
        disabled={stateDisabled}
        value={state.versionId || 'current'}
        items={[
          { value: 'current', label: t('studio.production.currentTake') },
          ...(asset?.versions || []).map((version, index) => ({
            value: version.id,
            label: `${t('Take')} ${index + 1}`,
          })),
        ]}
        onValueChange={(value) =>
          update({
            versionId: value === 'current' ? undefined : value || undefined,
          })
        }
      >
        <SelectTrigger aria-label={t('studio.production.referenceVersion')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value='current'>
              {t('studio.production.currentTake')}
            </SelectItem>
            {asset?.versions?.map((version, index) => (
              <SelectItem key={version.id} value={version.id}>
                {t('Take')} {index + 1}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {locked && (
        <p role='status' className='text-muted-foreground text-sm'>
          {t(
            'This shot is locked. Unlock it in the storyboard before changing its continuity requirements.'
          )}
        </p>
      )}
      <FieldGroup>
        {(['wardrobe', 'emotion', 'propState', 'note'] as const).map(
          (field) => (
            <Field key={field}>
              <FieldLabel>{t(`studio.production.${field}`)}</FieldLabel>
              <Textarea
                disabled={stateDisabled}
                aria-label={t(`studio.production.${field}`)}
                value={state[field]}
                maxLength={2000}
                onChange={(event) => update({ [field]: event.target.value })}
              />
            </Field>
          )
        )}
      </FieldGroup>
      <fieldset className='flex flex-wrap gap-3'>
        <legend>{t('studio.production.multiviewReferences')}</legend>
        {asset?.versions
          ?.filter((version) => version.mediaId)
          .map((version, index) => (
            <label key={version.id} className='flex items-center gap-2'>
              <Checkbox
                disabled={
                  stateDisabled ||
                  (state.referenceMediaIds.length >= 12 &&
                    !state.referenceMediaIds.includes(version.mediaId || ''))
                }
                checked={state.referenceMediaIds.includes(
                  version.mediaId || ''
                )}
                onCheckedChange={(checked) =>
                  update({
                    referenceMediaIds: checked
                      ? [
                          ...new Set([
                            ...state.referenceMediaIds,
                            ...(version.mediaId ? [version.mediaId] : []),
                          ]),
                        ]
                      : state.referenceMediaIds.filter(
                          (id) => id !== version.mediaId
                        ),
                  })
                }
              />
              {t('Take')} {index + 1}
            </label>
          ))}
      </fieldset>
      <Button
        size='sm'
        variant='outline'
        aria-expanded={contactOpen}
        onClick={() => setContactOpen(!contactOpen)}
      >
        {t('Continuity contact sheet')}
      </Button>
      {contactOpen && (
        <section
          aria-label={t('Continuity contact sheet')}
          className='flex flex-col gap-3'
        >
          <p className='text-muted-foreground text-sm'>
            {t(
              'Compare the reference standard, each shot requirement, and the actual selected Take. Manual approval records a visual decision; it does not certify automatic identity matching.'
            )}
          </p>
          {props.project.shots.length > 6 && (
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                size='sm'
                variant='outline'
                disabled={!page}
                onClick={() => setContactPage(page - 1)}
              >
                {t('Previous shots')}
              </Button>
              <span className='text-muted-foreground text-sm'>
                {t('Shots {{start}}–{{end}} of {{count}}', {
                  start: page * 6 + 1,
                  end: Math.min((page + 1) * 6, props.project.shots.length),
                  count: props.project.shots.length,
                })}
              </span>
              <Button
                size='sm'
                variant='outline'
                disabled={(page + 1) * 6 >= props.project.shots.length}
                onClick={() => setContactPage(page + 1)}
              >
                {t('Next shots')}
              </Button>
            </div>
          )}
          {props.project.shots
            .slice(page * 6, (page + 1) * 6)
            .map((shot, index) => {
              const evidence = studioContinuityShotEvidence(
                props.project,
                shot.id,
                selectedAssetId
              )
              const requirement = production.continuityStates.find(
                (item) =>
                  item.shotId === shot.id && item.assetId === selectedAssetId
              )
              const keyImage = production.approvedKeyImages[shot.id]
              const rowLocked = props.project.nodes.some(
                (node) =>
                  [
                    shot.textNodeId,
                    shot.imageNodeId,
                    shot.videoNodeId,
                  ].includes(node.id) && node.data.locked
              )
              function decide(status: 'approved' | 'retake' | 'unreviewed') {
                if (!writable || !evidence.node || !evidence.mediaId) return
                const review = {
                  shotId: shot.id,
                  assetId: selectedAssetId,
                  nodeId: evidence.node.id,
                  ...(evidence.node.data.selectedTakeId
                    ? { takeId: evidence.node.data.selectedTakeId }
                    : {}),
                  mediaId: evidence.mediaId,
                  status,
                  note: requirement?.note || '',
                  referenceMediaIds: evidence.referenceMediaIds,
                  requirementsKey: evidence.requirementsKey,
                  ...(evidence.referenceVersionId
                    ? { referenceVersionId: evidence.referenceVersionId }
                    : {}),
                  reviewedAt: new Date().toISOString(),
                }
                const changeId = `continuity-review-${shot.id}-${selectedAssetId}`
                props.onUpdate({
                  ...props.project,
                  production: {
                    ...production,
                    documentVersion: 2,
                    continuityReviews: [
                      ...(production.continuityReviews || []),
                      review,
                    ].slice(-1000),
                    changes:
                      status === 'retake'
                        ? [
                            ...production.changes.filter(
                              (item) => item.id !== changeId
                            ),
                            {
                              id: changeId,
                              kind: 'review' as const,
                              message: `${t('Continuity needs correction')}: ${shot.title} · ${asset?.title || ''}`,
                              nodeIds: [evidence.node.id],
                              status: 'pending' as const,
                              createdAt: review.reviewedAt,
                              action: 'edit' as const,
                              takeId: review.takeId,
                            },
                          ].slice(-200)
                        : production.changes.map((item) =>
                            item.id === changeId
                              ? { ...item, status: 'resolved' }
                              : item
                          ),
                  },
                })
              }
              return (
                <article
                  key={shot.id}
                  className='flex flex-col gap-3 rounded-lg border p-3'
                >
                  <div className='flex flex-wrap items-center gap-2'>
                    <h4 className='font-medium'>
                      {page * 6 + index + 1}. {shot.title}
                    </h4>
                    <Badge variant='secondary'>
                      {evidence.review
                        ? t(`studio.review.${evidence.review.status}`)
                        : t('Needs a continuity review')}
                    </Badge>
                    {evidence.previousReview && !evidence.review && (
                      <Badge variant='outline'>
                        {t('Previous decision is out of date')}
                      </Badge>
                    )}
                    {!evidence.bound && (
                      <Badge variant='outline'>
                        {t('Asset is not bound to this video draft')}
                      </Badge>
                    )}
                    {rowLocked && (
                      <Badge variant='outline'>{t('Locked')}</Badge>
                    )}
                  </div>
                  <div className='grid gap-3 sm:grid-cols-3'>
                    <div className='flex flex-col gap-2'>
                      <p className='text-sm font-medium'>
                        {t('Reference standard for this shot')}
                      </p>
                      <p className='text-muted-foreground text-xs break-all'>
                        {evidence.referenceVersionId ||
                          t('Current asset reference')}
                      </p>
                      {evidence.referenceMediaIds.length ? (
                        evidence.referenceMediaIds.map((id) => (
                          <StudioMediaThumbnail
                            key={id}
                            mediaId={id}
                            kind='image'
                            title={`${asset?.title || ''} ${t('Reference standard for this shot')}`}
                            getMedia={props.getMedia}
                          />
                        ))
                      ) : (
                        <p className='text-muted-foreground text-sm'>
                          {t('No reference standard selected')}
                        </p>
                      )}
                      {keyImage && (
                        <>
                          <p className='text-xs'>
                            {t('Approved shot keyframe')}
                          </p>
                          <StudioMediaThumbnail
                            mediaId={keyImage}
                            kind='image'
                            title={`${shot.title} ${t('Approved shot keyframe')}`}
                            getMedia={props.getMedia}
                          />
                        </>
                      )}
                    </div>
                    <div className='flex flex-col gap-2'>
                      <p className='text-sm font-medium'>
                        {t('Actual selected Take')}
                      </p>
                      {evidence.mediaId ? (
                        <StudioMediaThumbnail
                          mediaId={evidence.mediaId}
                          kind='video'
                          title={`${shot.title} ${t('Actual selected Take')}`}
                          getMedia={props.getMedia}
                          large
                        />
                      ) : (
                        <p className='text-muted-foreground text-sm'>
                          {t(
                            'No completed selected video. A draft or another Take is not treated as the current result.'
                          )}
                        </p>
                      )}
                      {evidence.mediaId && (
                        <>
                          <p className='text-muted-foreground text-xs break-all'>
                            {evidence.node?.data.selectedTakeId ||
                              t('Legacy result without a Take ID')}
                          </p>
                          <p className='text-muted-foreground text-xs'>
                            {evidence.take?.model ||
                              (evidence.take?.sourceMode === 'upload'
                                ? t(
                                    'Uploaded media; generation model not recorded'
                                  )
                                : t('Generation model not recorded'))}
                          </p>
                          <p className='text-xs'>{t('Submitted reference')}</p>
                          {evidence.submittedDescription && (
                            <>
                              <Badge variant='outline'>
                                {t(
                                  'Description guidance only; the asset image was not submitted'
                                )}
                              </Badge>
                              <p className='text-muted-foreground text-xs break-all'>
                                {evidence.submittedDescription.versionId ||
                                  t('Asset description at submission')}
                              </p>
                            </>
                          )}
                          {!evidence.submittedDescription &&
                            evidence.submittedReference?.mediaId && (
                              <>
                                <StudioMediaThumbnail
                                  mediaId={evidence.submittedReference.mediaId}
                                  kind='image'
                                  title={`${shot.title} ${t('Submitted reference')}`}
                                  getMedia={props.getMedia}
                                />
                                <p className='text-muted-foreground text-xs break-all'>
                                  {evidence.submittedReference.versionId}
                                </p>
                              </>
                            )}
                          {!evidence.submittedDescription &&
                            !evidence.submittedReference?.mediaId && (
                              <p className='text-muted-foreground text-xs'>
                                {evidence.submittedKnown
                                  ? t(
                                      'This asset is not present in the saved submission receipt.'
                                    )
                                  : t(
                                      'The submitted reference is not recorded for this result. Verify the visual output before approving.'
                                    )}
                              </p>
                            )}
                          {evidence.submittedFrames !== undefined && (
                            <section
                              aria-label={t('Actual submitted first frame')}
                              className='flex flex-col gap-2'
                            >
                              <p className='text-xs font-medium'>
                                {t('Actual submitted first frame')}
                              </p>
                              {evidence.submittedFrames.length ? (
                                evidence.submittedFrames.map((reference) => (
                                  <div
                                    key={`${reference.sourceNodeId}:${reference.mediaId}`}
                                    className='flex flex-col gap-1'
                                  >
                                    <StudioMediaThumbnail
                                      mediaId={reference.mediaId}
                                      kind='image'
                                      title={`${shot.title} ${t('Actual submitted first frame')}`}
                                      getMedia={props.getMedia}
                                    />
                                    <p className='text-muted-foreground text-xs break-all'>
                                      {t('First frame source: {{name}}', {
                                        name:
                                          props.project.nodes.find(
                                            (node) =>
                                              node.id === reference.sourceNodeId
                                          )?.data.title ||
                                          reference.sourceNodeId,
                                      })}
                                    </p>
                                    <p className='text-muted-foreground text-xs break-all'>
                                      {reference.sourceTakeId
                                        ? t('Input Take: {{id}}', {
                                            id: reference.sourceTakeId,
                                          })
                                        : t(
                                            'Submission without a source Take ID'
                                          )}
                                    </p>
                                    <p className='text-muted-foreground text-xs break-all'>
                                      {reference.mediaId}
                                    </p>
                                  </div>
                                ))
                              ) : (
                                <p className='text-muted-foreground text-xs'>
                                  {t(
                                    'The saved receipt contains no first-frame image input.'
                                  )}
                                </p>
                              )}
                            </section>
                          )}
                        </>
                      )}
                    </div>
                    <div className='flex flex-col gap-2'>
                      <p className='text-sm font-medium'>
                        {t('Shot continuity requirements')}
                      </p>
                      {(
                        ['wardrobe', 'emotion', 'propState', 'note'] as const
                      ).map((field) => (
                        <p key={field} className='text-sm'>
                          <span className='text-muted-foreground'>
                            {t(`studio.production.${field}`)}:{' '}
                          </span>
                          {requirement?.[field] || t('Not specified')}
                        </p>
                      ))}
                      {production.shotNarrative?.[shot.id]?.continuityNeeds && (
                        <p className='text-sm'>
                          {production.shotNarrative[shot.id].continuityNeeds}
                        </p>
                      )}
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => setShotId(shot.id)}
                      >
                        {t('Edit this shot continuity')}
                      </Button>
                      {(props.onInspectNode || props.onSelectNode) && (
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() =>
                            (props.onInspectNode || props.onSelectNode)?.(
                              shot.videoNodeId
                            )
                          }
                        >
                          {t('Open this shot')}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    <Button
                      size='sm'
                      disabled={
                        !writable ||
                        !evidence.mediaId ||
                        !evidence.referenceMediaIds.length
                      }
                      onClick={() => decide('approved')}
                    >
                      {t('Approve continuity of this Take')}
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={!writable || !evidence.mediaId}
                      onClick={() => decide('retake')}
                    >
                      {t('Mark continuity for correction')}
                    </Button>
                    <Button
                      size='sm'
                      variant='ghost'
                      disabled={
                        !writable || !evidence.mediaId || !evidence.review
                      }
                      onClick={() => decide('unreviewed')}
                    >
                      {t('Withdraw continuity decision')}
                    </Button>
                  </div>
                </article>
              )
            })}
        </section>
      )}
    </div>
  )
}
