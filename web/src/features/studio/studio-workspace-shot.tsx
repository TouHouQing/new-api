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

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'

import { connectedGenerationInput } from './canvas-flow'
import { StudioMediaImport } from './studio-media-import'
import { StudioMediaThumbnail } from './studio-media-thumbnail'
import { useStudioProductionContext } from './studio-production-context'
import {
  pinStudioShotAssetVersion,
  recordStudioTake,
  selectStudioTake,
  setStudioShotAssets,
  updateStudioNode,
} from './workspace'

export function StudioWorkspaceShot(props: {
  onTool: (tool: 'assets' | 'previs' | 'media' | 'assistant') => void
}) {
  const { t } = useTranslation()
  const {
    props: workspace,
    writable,
    setSelectedNodes,
    mutate,
  } = useStudioProductionContext()
  const project = workspace.project
  const liveProject = useRef(project)
  liveProject.current = project
  const shot =
    project.shots?.find((shot) =>
      [shot.textNodeId, shot.imageNodeId, shot.videoNodeId].includes(
        workspace.selectedNodeId || ''
      )
    ) || project.shots?.[0]
  const initial = project.nodes.find(
    (node) => node.id === workspace.selectedNodeId
  )
  const [kind, setKind] = useState<'image' | 'video'>(
    initial?.data.kind === 'image' ? 'image' : 'video'
  )
  useEffect(() => {
    if (initial?.data.kind === 'image' || initial?.data.kind === 'video') {
      setKind(initial.data.kind)
    }
  }, [initial?.id, initial?.data.kind])
  let targetId = workspace.selectedNodeId
  if (shot) targetId = kind === 'image' ? shot.imageNodeId : shot.videoNodeId
  const node = project.nodes.find((node) => node.id === targetId)
  const [comparison, setComparison] = useState(false)
  const comparisonElement = useRef<HTMLDivElement>(null)
  const [candidate, setCandidate] = useState('')
  const [replacement, setReplacement] = useState('')
  const [advice, setAdvice] = useState('')
  const [direction, setDirection] = useState('')
  const takes =
    node?.data.takes?.filter(
      (take) => take.status === 'completed' && take.mediaId
    ) || []
  const currentTake = node?.data.selectedTakeId
  const compareTake =
    takes.find((take) => take.id === candidate && take.id !== currentTake) ||
    takes.find((take) => take.id !== currentTake)
  const references =
    project.assets?.filter((asset) =>
      node?.data.assetIds?.includes(asset.id)
    ) || []
  const affected =
    project.production?.timeline.filter(
      (clip) => clip.nodeId === node?.id && !clip.takeId
    ) || []
  const selectedShot = (next: 'image' | 'video') => {
    setKind(next)
    let id = node?.id
    if (shot) id = next === 'image' ? shot.imageNodeId : shot.videoNodeId
    if (id) workspace.onSelectNode?.(id)
    setSelectedNodes(
      id
        ? [id].filter(
            (id) =>
              project.nodes.find((node) => node.id === id)?.data.sourceMode !==
              'upload'
          )
        : []
    )
  }
  const choose = (id: string) => {
    if (!node) return
    setCandidate(currentTake || '')
    workspace.onUpdate(selectStudioTake(project, node.id, id))
    setReplacement('')
  }
  const adviceText: Record<string, string> = {
    closeup:
      'Close-up framing. Bring the subject closer while keeping the full face visible.',
    wider:
      'A wider view showing the subject and more of the surrounding scene.',
    push: 'A slow, steady camera push toward the subject, with one continuous action.',
    framing:
      'Keep the subject fully within the frame, with clear headroom and space in the direction of movement.',
    action:
      'One simple action, slow natural movement, a stable camera, no scene changes within this shot.',
    identity:
      'Preserve the referenced face, hairstyle and outfit. Keep lighting and proportions consistent.',
    rhythm:
      'Begin with the essential action immediately. Keep a clear start and end for the next cut.',
  }
  let prompt = node?.data.prompt || ''
  try {
    if (node) {
      prompt = connectedGenerationInput(
        project.nodes,
        project.edges,
        node.id
      ).prompt
    }
  } catch {
    /* Missing links are shown by generation validation. */
  }
  let status = kind === 'image' ? 'Key image needs review' : 'Video needed'
  if (node?.data.mediaId) status = 'Selected version'
  return (
    <section
      className='flex min-w-0 flex-col gap-3'
      aria-label={t('Current shot workspace')}
    >
      <div className='flex flex-wrap items-center gap-2'>
        <h3 className='mr-auto font-medium'>
          {shot?.title || node?.data.title || t('Choose a shot')}
        </h3>
        {shot && (
          <div
            className='flex gap-1'
            role='group'
            aria-label={t('Shot media type')}
          >
            <Button
              size='sm'
              variant={kind === 'image' ? 'secondary' : 'outline'}
              aria-pressed={kind === 'image'}
              onClick={() => selectedShot('image')}
            >
              {t('Key image')}
            </Button>
            <Button
              size='sm'
              variant={kind === 'video' ? 'secondary' : 'outline'}
              aria-pressed={kind === 'video'}
              onClick={() => selectedShot('video')}
            >
              {t('Video')}
            </Button>
          </div>
        )}
      </div>
      <div className='bg-muted flex min-h-48 items-center justify-center rounded-xl p-3'>
        {node?.data.mediaId ? (
          <StudioMediaThumbnail
            large
            mediaId={node.data.mediaId}
            kind={node.data.kind}
            title={t('Current shot preview')}
            getMedia={workspace.getMedia}
          />
        ) : (
          <p className='text-muted-foreground p-6 text-center text-sm'>
            {t(
              kind === 'image'
                ? 'Make or upload a key image, then review the composition.'
                : 'Review a key image first, or choose direct video generation when supported.'
            )}
          </p>
        )}
      </div>
      <div className='flex flex-wrap gap-2'>
        <Badge variant='secondary'>{t(status)}</Badge>
        {node?.data.kind === 'video' && (
          <Badge variant='outline'>
            {node.data.seconds || 5} {t('Seconds')}
          </Badge>
        )}
        <Button
          size='sm'
          variant='outline'
          disabled={takes.length === 0}
          onClick={() => setComparison(!comparison)}
          aria-expanded={comparison}
        >
          {t(
            takes.length < 2
              ? 'Review generated candidate'
              : 'Compare candidates'
          )}
        </Button>
        <Button
          size='sm'
          variant='outline'
          onClick={() => props.onTool('assets')}
        >
          {t('Characters and references')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          onClick={() => props.onTool('previs')}
        >
          {t('Stage people and camera')}
        </Button>
      </div>
      {shot && (
        <div className='flex flex-wrap gap-2'>
          <Button
            size='sm'
            variant='outline'
            disabled={
              !writable ||
              !project.nodes.find((node) => node.id === shot.imageNodeId)?.data
                .mediaId
            }
            onClick={() => {
              workspace.onUpdate({
                ...project,
                edges: project.edges.some(
                  (edge) =>
                    edge.source === shot.imageNodeId &&
                    edge.target === shot.videoNodeId
                )
                  ? project.edges
                  : [
                      ...project.edges,
                      {
                        id: `${shot.id}-iv`,
                        source: shot.imageNodeId,
                        target: shot.videoNodeId,
                      },
                    ],
              })
              selectedShot('video')
            }}
          >
            {t('Use this key image for video')}
          </Button>
          {project.nodes.find((node) => node.id === shot.videoNodeId)?.data
            .model === 'wan2.2-ti2v-5b' && (
            <Button
              size='sm'
              variant='ghost'
              disabled={!writable}
              onClick={() => {
                workspace.onUpdate({
                  ...project,
                  edges: project.edges.filter(
                    (edge) =>
                      !(
                        edge.source === shot.imageNodeId &&
                        edge.target === shot.videoNodeId
                      )
                  ),
                })
                selectedShot('video')
              }}
            >
              {t('Make video directly from text')}
            </Button>
          )}
        </div>
      )}
      {shot && kind === 'image' && (
        <Field>
          <FieldLabel>{t('Use my own key image')}</FieldLabel>
          <Input
            type='file'
            accept='image/png,image/jpeg,image/webp'
            disabled={!writable || mutate.isPending}
            aria-label={t('Use my own key image')}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              mutate.mutate(async () => {
                if (
                  !file.size ||
                  file.size > 20 * 1024 * 1024 ||
                  !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
                ) {
                  throw new Error(
                    t('Choose a PNG, JPEG or WebP image under 20 MiB')
                  )
                }
                await workspace.onSave()
                const mediaId = crypto.randomUUID()
                const response = await api.put(
                  `/api/studio/cloud/media/${mediaId}?project_id=${encodeURIComponent(project.id)}`,
                  file,
                  { headers: { 'Content-Type': file.type } }
                )
                if (!response.data?.success) {
                  throw new Error(
                    response.data?.message || t('studio.project.saveFailed')
                  )
                }
                workspace.onUpdate(
                  recordStudioTake(liveProject.current, shot.imageNodeId, {
                    id: crypto.randomUUID(),
                    prompt: '',
                    createdAt: new Date().toISOString(),
                    sourceMode: 'upload',
                    status: 'completed',
                    mediaId,
                  })
                )
                setSelectedNodes([])
              })
            }}
          />
        </Field>
      )}
      {comparison && (
        <div
          ref={comparisonElement}
          className='grid min-w-0 gap-3 sm:grid-cols-2'
        >
          <div className='col-span-full flex flex-wrap gap-2'>
            {takes.length > 1 && (
              <Select
                value={compareTake?.id || null}
                onValueChange={(value) => setCandidate(value || '')}
                items={takes
                  .filter((take) => take.id !== currentTake)
                  .map((take, index) => ({
                    value: take.id,
                    label: `${t('Candidate')} ${index + 1}`,
                  }))}
              >
                <SelectTrigger aria-label={t('Compare with candidate')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {takes
                      .filter((take) => take.id !== currentTake)
                      .map((take, index) => (
                        <SelectItem key={take.id} value={take.id}>
                          {t('Candidate')} {index + 1}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
            {node?.data.kind === 'video' && (
              <>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => {
                    for (const video of comparisonElement.current?.querySelectorAll(
                      'video'
                    ) || []) {
                      video.currentTime = 0
                      video.muted = true
                      void video.play().catch(handleServerError)
                    }
                  }}
                >
                  {t('Play both from start')}
                </Button>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => {
                    for (const video of comparisonElement.current?.querySelectorAll(
                      'video'
                    ) || []) {
                      video.pause()
                    }
                  }}
                >
                  {t('Pause both')}
                </Button>
              </>
            )}
          </div>
          {takes
            .filter(
              (take) => take.id === currentTake || take.id === compareTake?.id
            )
            .map((take, index) => (
              <div
                className='flex min-w-0 flex-col gap-2 rounded-lg border p-3'
                key={take.id}
              >
                <p>
                  {t('Candidate')} {index + 1}{' '}
                  {take.id === currentTake && `· ${t('Selected version')}`}
                </p>
                <StudioMediaThumbnail
                  large
                  mediaId={take.mediaId || ''}
                  kind={node?.data.kind || 'image'}
                  title={`${t('Candidate')} ${index + 1}`}
                  getMedia={workspace.getMedia}
                />
                <p className='text-muted-foreground line-clamp-3 text-xs'>
                  {take.prompt}
                </p>
                <Button
                  size='sm'
                  disabled={!writable || take.id === currentTake}
                  onClick={() => {
                    setCandidate(take.id)
                    setReplacement(take.id)
                  }}
                >
                  {t('Use this version')}
                </Button>
              </div>
            ))}
          {compareTake && (
            <p className='text-muted-foreground col-span-full text-xs'>
              {t(
                'Compare the pictures and input directions above. Pinned timeline clips keep their exact version.'
              )}
            </p>
          )}
        </div>
      )}
      {node && (
        <Collapsible>
          <CollapsibleTrigger render={<Button variant='ghost' size='sm' />}>
            {t('Current shot direction and improvements')}
          </CollapsibleTrigger>
          <CollapsibleContent className='flex flex-col gap-3 pt-3'>
            <Field>
              <FieldLabel>{t('Current shot direction')}</FieldLabel>
              <Textarea
                disabled={!writable || node.data.locked}
                maxLength={30000}
                value={node.data.prompt || ''}
                aria-label={t('Current shot direction')}
                onChange={(event) =>
                  workspace.onUpdate(
                    updateStudioNode(project, node.id, {
                      prompt: event.target.value,
                    })
                  )
                }
              />
            </Field>
            <div className='flex flex-wrap gap-2'>
              {Object.keys(adviceText).map((key) => (
                <Button
                  key={key}
                  size='sm'
                  variant='outline'
                  disabled={!writable || node.data.locked}
                  onClick={() => {
                    setAdvice(key)
                    setDirection(
                      `${node.data.prompt || ''}\n${t(adviceText[key])}`.trim()
                    )
                  }}
                >
                  {t(`studio.improve.${key}`)}
                </Button>
              ))}
            </div>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Suggestions change only this direction after confirmation. Image quality remains a creative decision.'
              )}
            </p>
            <p className='text-muted-foreground text-xs'>
              {t('Combined generation input')}: {prompt}
            </p>
          </CollapsibleContent>
        </Collapsible>
      )}
      {shot && (
        <Collapsible>
          <CollapsibleTrigger render={<Button variant='ghost' size='sm' />}>
            {t('References for this shot')} · {references.length}
          </CollapsibleTrigger>
          <CollapsibleContent className='flex flex-col gap-3 pt-3'>
            {(project.assets || []).map((asset) => {
              const pinned = asset.versions?.find(
                (version) =>
                  version.id === node?.data.assetVersionIds?.[asset.id]
              )
              const mediaId = pinned ? pinned.mediaId : asset.mediaId
              const profile = pinned ? pinned.profile : asset.profile
              return (
                <div
                  className='flex flex-col gap-2 rounded-lg border p-3'
                  key={asset.id}
                >
                  <Field orientation='horizontal'>
                    <Checkbox
                      id={`shot-ref-${asset.id}`}
                      disabled={!writable}
                      checked={!!node?.data.assetIds?.includes(asset.id)}
                      onCheckedChange={(checked) => {
                        const ids = node?.data.assetIds || []
                        workspace.onUpdate(
                          setStudioShotAssets(
                            project,
                            shot.id,
                            checked
                              ? [...ids, asset.id]
                              : ids.filter((id) => id !== asset.id)
                          )
                        )
                      }}
                    />
                    <FieldLabel htmlFor={`shot-ref-${asset.id}`}>
                      {asset.title}
                    </FieldLabel>
                  </Field>
                  {mediaId && (
                    <StudioMediaThumbnail
                      mediaId={mediaId}
                      kind='image'
                      title={asset.title}
                      getMedia={workspace.getMedia}
                    />
                  )}
                  <p className='text-muted-foreground text-xs'>
                    {profile?.wardrobe} {profile?.voice}
                  </p>
                  {!!asset.versions?.length && (
                    <div className='flex flex-wrap gap-1'>
                      {asset.versions.map((version, index) => (
                        <Button
                          size='xs'
                          key={version.id}
                          variant={
                            node?.data.assetVersionIds?.[asset.id] ===
                            version.id
                              ? 'secondary'
                              : 'outline'
                          }
                          disabled={
                            !writable ||
                            !node?.data.assetIds?.includes(asset.id)
                          }
                          onClick={() =>
                            workspace.onUpdate(
                              pinStudioShotAssetVersion(
                                project,
                                shot.id,
                                asset.id,
                                version.id
                              )
                            )
                          }
                        >
                          {t('Reference version')} {index + 1}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {!project.assets?.length && (
              <Button variant='outline' onClick={() => props.onTool('assets')}>
                {t('Add a character or scene')}
              </Button>
            )}
            {node?.data.model === 'wan2.2-ti2v-5b' && (
              <Alert>
                <AlertDescription>
                  {t(
                    'This model accepts one first frame. Character cards are instructions; review the key image to check which references are visible before making video.'
                  )}
                </AlertDescription>
              </Alert>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}
      <Collapsible>
        <CollapsibleTrigger render={<Button variant='ghost' size='sm' />}>
          {t('Upload existing footage')}
        </CollapsibleTrigger>
        <CollapsibleContent className='pt-3'>
          <StudioMediaImport />
        </CollapsibleContent>
      </Collapsible>
      <ConfirmDialog
        open={!!replacement}
        onOpenChange={(open) => {
          if (!open) setReplacement('')
        }}
        title={t('Use this version')}
        desc={t(
          'This changes the current selected version. {{count}} unpinned timeline clips follow this selection; pinned clips, trims, captions and audio are retained.',
          { count: affected.length }
        )}
        handleConfirm={() => choose(replacement)}
      />
      <ConfirmDialog
        open={!!advice}
        onOpenChange={(open) => {
          if (!open) setAdvice('')
        }}
        title={t('Review this shot change')}
        desc={
          <div className='flex flex-col gap-3'>
            <p>
              {t('Before')}: {node?.data.prompt}
            </p>
            <Field>
              <FieldLabel>{t('After')}</FieldLabel>
              <Textarea
                value={direction}
                maxLength={30000}
                onChange={(event) => setDirection(event.target.value)}
              />
            </Field>
            <p>
              {t(
                'Only this shot direction changes. Existing media, audio and timeline edits remain available; generating a new version needs separate confirmation.'
              )}
            </p>
          </div>
        }
        handleConfirm={() => {
          if (node) {
            workspace.onUpdate(
              updateStudioNode(project, node.id, { prompt: direction })
            )
          }
          setAdvice('')
        }}
      />
    </section>
  )
}
