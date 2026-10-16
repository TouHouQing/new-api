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
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
import { api } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'

import { StudioAssetLibrary } from './studio-asset-library'
import { useStudioProductionContext } from './studio-production-context'
import { StudioProductionContinuity } from './studio-production-continuity'
import { setStudioShotAssets } from './workspace'

export function StudioWorkspaceAssets() {
  const { t } = useTranslation()
  const { props, writable } = useStudioProductionContext()
  const shot =
    props.project.shots?.find((shot) =>
      [shot.textNodeId, shot.imageNodeId, shot.videoNodeId].includes(
        props.selectedNodeId || ''
      )
    ) || props.project.shots?.[0]
  const [scope, setScope] = useState<string[]>(shot ? [shot.id] : [])
  const live = useRef(props.project)
  live.current = props.project
  const [removal, setRemoval] = useState('')
  const [appearances, setAppearances] = useState<Record<
    string,
    string[]
  > | null>(null)
  const update = (
    assetId: string,
    patch: Partial<NonNullable<typeof props.project.assets>[number]>
  ) =>
    props.onUpdate({
      ...live.current,
      assets: live.current.assets?.map((asset) =>
        asset.id === assetId ? { ...asset, ...patch } : asset
      ),
      updatedAt: new Date().toISOString(),
    })
  return (
    <div className='flex min-w-0 flex-col gap-3'>
      <p role='status' className='text-sm'>
        {t('Reference application scope')}:{' '}
        {scope
          .map(
            (id) => props.project.shots?.find((shot) => shot.id === id)?.title
          )
          .join('、') || t('Choose a shot')}
      </p>
      <Collapsible>
        <CollapsibleTrigger render={<Button size='sm' variant='outline' />}>
          {t('Choose multiple shots explicitly')}
        </CollapsibleTrigger>
        <CollapsibleContent className='flex flex-col gap-2 pt-3'>
          {props.project.shots?.map((shot) => (
            <Field orientation='horizontal' key={shot.id}>
              <Checkbox
                id={`asset-scope-${shot.id}`}
                checked={scope.includes(shot.id)}
                onCheckedChange={(checked) =>
                  setScope(
                    checked
                      ? [...scope, shot.id]
                      : scope.filter((id) => id !== shot.id)
                  )
                }
              />
              <FieldLabel htmlFor={`asset-scope-${shot.id}`}>
                {shot.title}
              </FieldLabel>
            </Field>
          ))}
        </CollapsibleContent>
      </Collapsible>
      <Button
        size='sm'
        variant='outline'
        disabled={
          !writable ||
          !props.project.assets?.length ||
          !props.project.shots?.length
        }
        onClick={() => {
          const proposed: Record<string, string[]> = {}
          for (const asset of props.project.assets || []) {
            const names = asset.title
              .split(/[：:、,，\s]+/)
              .filter((name) => name.length >= 2)
            proposed[asset.id] = (props.project.shots || [])
              .filter((shot) => {
                const text = props.project.nodes.find(
                  (node) => node.id === shot.textNodeId
                )?.data
                const description = [
                  text?.outputText,
                  text?.prompt,
                  shot.dialogue,
                ]
                  .filter(Boolean)
                  .join(' ')
                const existing =
                  props.project.nodes.find(
                    (node) => node.id === shot.videoNodeId
                  )?.data.assetIds || []
                return (
                  existing.includes(asset.id) ||
                  names.some((name) => description.includes(name))
                )
              })
              .map((shot) => shot.id)
          }
          setAppearances(proposed)
        }}
      >
        {t('Review suggested character and scene appearances')}
      </Button>
      <StudioAssetLibrary
        compact
        getMedia={props.getMedia}
        assets={props.project.assets || []}
        previews={{}}
        projectId={props.project.id}
        readOnly={!writable}
        applyLabel={t('Apply to selected shots')}
        onAdd={(kind, title, prompt) =>
          props.onUpdate({
            ...props.project,
            assets: [
              ...(props.project.assets || []),
              {
                id: crypto.randomUUID(),
                kind,
                title,
                prompt,
                ...(kind === 'character'
                  ? {
                      profile: {
                        appearance: prompt.slice(0, 2000),
                        wardrobe: prompt
                          .match(/(?:穿着|身穿|穿)([^，。；\n]+)/)?.[1]
                          ?.slice(0, 2000),
                        voice: prompt
                          .match(
                            /(?:声音|声线|voice)\s*[:：]\s*([^。；\n]+)/i
                          )?.[1]
                          ?.slice(0, 2000),
                      },
                    }
                  : {}),
              },
            ],
          })
        }
        onUpdate={update}
        onUpload={(id, file) => {
          void (async () => {
            if (
              !file.size ||
              file.size > 20 * 1024 * 1024 ||
              !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
            ) {
              throw new Error(
                t('Choose a PNG, JPEG or WebP image under 20 MiB')
              )
            }
            await props.onSave()
            const mediaId = crypto.randomUUID()
            const response = await api.put(
              `/api/studio/cloud/media/${mediaId}?project_id=${encodeURIComponent(props.project.id)}`,
              file,
              { headers: { 'Content-Type': file.type } }
            )
            if (!response.data?.success) {
              throw new Error(
                response.data?.message || t('studio.project.saveFailed')
              )
            }
            const asset = live.current.assets?.find((asset) => asset.id === id)
            if (asset) {
              update(id, {
                mediaId,
                outputUrl: undefined,
                versions: [
                  ...(asset.versions || []).slice(-29),
                  {
                    id: crypto.randomUUID(),
                    createdAt: new Date().toISOString(),
                    prompt: asset.prompt,
                    profile: asset.profile,
                    mediaId,
                  },
                ],
              })
            }
          })().catch(handleServerError)
        }}
        onDelete={setRemoval}
        onCreateVersion={(id) => {
          const asset = props.project.assets?.find((asset) => asset.id === id)
          if (asset) {
            update(id, {
              versions: [
                ...(asset.versions || []).slice(-29),
                {
                  id: crypto.randomUUID(),
                  createdAt: new Date().toISOString(),
                  prompt: asset.prompt,
                  profile: asset.profile,
                  mediaId: asset.mediaId,
                  outputUrl: asset.outputUrl,
                },
              ],
            })
          }
        }}
        onApplyToShots={(id) => {
          let project = props.project
          for (const shotId of scope) {
            const shot = project.shots?.find((shot) => shot.id === shotId)
            const ids =
              project.nodes.find((node) => node.id === shot?.videoNodeId)?.data
                .assetIds || []
            project = setStudioShotAssets(project, shotId, [
              ...new Set([...ids, id]),
            ])
          }
          props.onUpdate(project)
        }}
      />
      <Collapsible>
        <CollapsibleTrigger render={<Button size='sm' variant='ghost' />}>
          {t('Optional: character and scene continuity')}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <StudioProductionContinuity />
        </CollapsibleContent>
      </Collapsible>
      <ConfirmDialog
        open={appearances !== null}
        onOpenChange={(open) => {
          if (!open) setAppearances(null)
        }}
        title={t('Confirm who appears in each shot')}
        desc={
          <div className='space-y-4'>
            <p>
              {t(
                'Names mentioned in shot descriptions are suggestions. Confirm the scope, especially empty establishing shots. Existing media is preserved; changed references require a new generation confirmation.'
              )}
            </p>
            {(props.project.assets || []).map((asset) => (
              <div className='space-y-2' key={asset.id}>
                <p>{asset.title}</p>
                {props.project.shots?.map((shot) => (
                  <Field key={shot.id} orientation='horizontal'>
                    <Checkbox
                      id={`appearance-${asset.id}-${shot.id}`}
                      checked={
                        appearances?.[asset.id]?.includes(shot.id) || false
                      }
                      onCheckedChange={(checked) =>
                        setAppearances({
                          ...appearances,
                          [asset.id]: checked
                            ? [...(appearances?.[asset.id] || []), shot.id]
                            : (appearances?.[asset.id] || []).filter(
                                (id) => id !== shot.id
                              ),
                        })
                      }
                    />
                    <FieldLabel htmlFor={`appearance-${asset.id}-${shot.id}`}>
                      {shot.title}
                    </FieldLabel>
                  </Field>
                ))}
              </div>
            ))}
          </div>
        }
        handleConfirm={() => {
          if (!appearances) return
          let next = props.project
          for (const shot of next.shots || []) {
            next = setStudioShotAssets(
              next,
              shot.id,
              (next.assets || [])
                .filter((asset) => appearances[asset.id]?.includes(shot.id))
                .map((asset) => asset.id)
            )
          }
          props.onUpdate(next)
          setAppearances(null)
        }}
      />
      <ConfirmDialog
        open={!!removal}
        onOpenChange={(open) => {
          if (!open) setRemoval('')
        }}
        title={t('Remove reference card')}
        desc={t(
          'This removes the reference card from this project. Existing footage and saved versions remain available.'
        )}
        handleConfirm={() => {
          let project = props.project
          for (const shot of project.shots || []) {
            const ids =
              project.nodes.find((node) => node.id === shot.videoNodeId)?.data
                .assetIds || []
            if (ids.includes(removal)) {
              project = setStudioShotAssets(
                project,
                shot.id,
                ids.filter((id) => id !== removal)
              )
            }
          }
          props.onUpdate({
            ...project,
            assets: project.assets?.filter((asset) => asset.id !== removal),
          })
          setRemoval('')
        }}
      />
    </div>
  )
}
