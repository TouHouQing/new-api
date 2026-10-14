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
import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { TabsContent } from '@/components/ui/tabs'
import { toIntlLocale } from '@/i18n/languages'

import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import { StudioMediaThumbnail } from './studio-media-thumbnail'
import { studioProductionSchema } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import { StudioSeriesPanel } from './studio-series-panel'
import { studioProjectChanges } from './studio-version-diff'

export function StudioProductionVersionsTab() {
  const { t, i18n } = useTranslation()
  const { props, path, versions, writable, mutate } =
    useStudioProductionContext()
  const [selected, setSelected] = useState<number | null>(null)
  const [restore, setRestore] = useState<{
    revision: number
    expectedRevision: number
  } | null>(null)
  const [title, setTitle] = useState('')
  const [showAutomatic, setShowAutomatic] = useState(false)
  const milestones = props.project.production?.milestones || []
  const visibleVersions = (versions.data || []).filter(
    (item, index) =>
      showAutomatic ||
      index < 5 ||
      milestones.some((named) => named.revision === item.revision)
  )
  const version = useQuery({
    queryKey: ['studio-version-preview', props.project.id, selected],
    queryFn: () =>
      studioCloudRequest<{ document: StudioCloudProject['document'] }>(
        `${path}/versions/${selected}`
      ),
    enabled: selected !== null,
  })
  const trash = useQuery({
    queryKey: ['studio-project-trash'],
    queryFn: () =>
      studioCloudRequest<{ id: string; title: string }[]>('/trash'),
  })
  return (
    <TabsContent value='versions' className='space-y-2'>
      <h3 className='font-semibold'>{t('Named versions and recovery')}</h3>
      <div className='flex flex-wrap gap-2'>
        <Input
          aria-label={t('Version name')}
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('For example: before changing the voice')}
        />
        <Button
          disabled={
            !writable ||
            !title.trim() ||
            milestones.length >= 100 ||
            mutate.isPending
          }
          onClick={() =>
            mutate.mutate(async () => {
              await props.onSave()
              const current = await studioCloudRequest<StudioCloudProject>(path)
              const production =
                current.document.production || studioProductionSchema.parse({})
              const document = {
                ...current.document,
                production: {
                  ...production,
                  milestones: [
                    ...production.milestones.filter(
                      (item) => item.revision !== current.revision
                    ),
                    {
                      revision: current.revision,
                      title: title.trim(),
                      createdAt: new Date().toISOString(),
                    },
                  ],
                },
              }
              await studioCloudRequest(path, 'PUT', {
                revision: current.revision,
                document,
              })
              await props.onRefresh()
              setTitle('')
            })
          }
        >
          {t('Save a named version')}
        </Button>
        <Button
          variant='outline'
          onClick={() => setShowAutomatic(!showAutomatic)}
        >
          {t(
            showAutomatic
              ? 'Show named and recent versions'
              : 'Show all automatic saves'
          )}
        </Button>
      </div>
      {milestones
        .filter(
          (item) => !versions.data?.some((v) => v.revision === item.revision)
        )
        .map((item) => (
          <Button
            variant='outline'
            key={item.revision}
            onClick={() => setSelected(item.revision)}
          >
            {item.title} · v{item.revision}
          </Button>
        ))}
      {visibleVersions.map((version) => (
        <div
          className='flex items-center gap-3 rounded-lg border p-3'
          key={version.revision}
        >
          <span>
            {milestones.find((named) => named.revision === version.revision)
              ?.title || t('Automatic save')}{' '}
            · v{version.revision}
          </span>
          <span className='text-muted-foreground text-xs'>
            {new Date(version.created_at).toLocaleString(
              toIntlLocale(i18n.resolvedLanguage || i18n.language)
            )}
          </span>
          <Button
            size='sm'
            variant='ghost'
            onClick={() => setSelected(version.revision)}
          >
            {t('studio.production.previewVersion')}
          </Button>
          <Button
            className='ml-auto'
            size='sm'
            variant='outline'
            disabled={!writable || mutate.isPending}
            onClick={() => setSelected(version.revision)}
          >
            {t('studio.production.restore')}
          </Button>
        </div>
      ))}
      <p className='pt-4 text-sm font-medium'>{t('studio.production.trash')}</p>
      {trash.isError && (
        <ErrorState
          description={trash.error.message}
          onRetry={() => void trash.refetch()}
        />
      )}
      {trash.data?.map((project) => (
        <div
          key={project.id}
          className='flex items-center justify-between gap-3 rounded-lg border p-3'
        >
          <span>{project.title}</span>
          <Button
            size='sm'
            variant='outline'
            disabled={mutate.isPending}
            onClick={() =>
              mutate.mutate(async () => {
                await studioCloudRequest(
                  `/projects/${encodeURIComponent(project.id)}/undelete`,
                  'POST'
                )
                await trash.refetch()
                await props.onRefresh()
              })
            }
          >
            {t('studio.production.recoverProject')}
          </Button>
        </div>
      ))}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        title={`${t('studio.production.previewVersion')} v${selected}`}
        contentClassName='sm:max-w-3xl'
      >
        {version.isError && (
          <ErrorState
            description={version.error.message}
            onRetry={() => void version.refetch()}
          />
        )}
        {version.data && (
          <>
            <p className='text-muted-foreground text-sm'>
              {t('Changes compared with the current project')}
            </p>
            <Button
              disabled={!writable || mutate.isPending}
              variant='outline'
              onClick={() =>
                mutate.mutate(async () => {
                  const current =
                    await studioCloudRequest<StudioCloudProject>(path)
                  if (selected === null) return
                  setRestore({
                    revision: selected,
                    expectedRevision: current.revision,
                  })
                })
              }
            >
              {t('studio.production.restore')}
            </Button>
            {studioProjectChanges(version.data.document, props.project).map(
              (change) => (
                <div
                  key={JSON.stringify([
                    change.title,
                    change.field,
                    change.before,
                    change.after,
                  ])}
                  className='rounded border p-2 text-sm'
                >
                  <b>{change.title}</b> · {t(change.field)}
                  <p className='break-words'>
                    {t('Before')}: {t(change.before)} → {t('After')}:{' '}
                    {t(change.after)}
                  </p>
                </div>
              )
            )}
            {!studioProjectChanges(version.data.document, props.project)
              .length && <p>{t('The creative content is unchanged.')}</p>}
            <div className='grid gap-3 sm:grid-cols-2'>
              {[
                { label: t('Before'), document: version.data.document },
                { label: t('After'), document: props.project },
              ].map(({ label, document }) => (
                <div key={label} className='min-w-0 space-y-2'>
                  <p className='font-medium'>{label}</p>
                  {document.nodes
                    .filter((node) => node.data.mediaId)
                    .slice(0, 12)
                    .map((node) => (
                      <div
                        key={node.id}
                        className='flex min-w-0 items-start gap-2 rounded border p-2'
                      >
                        <StudioMediaThumbnail
                          mediaId={node.data.mediaId || ''}
                          kind={node.data.kind}
                          title={node.data.title}
                          getMedia={props.getMedia}
                        />
                        <span className='min-w-0 text-sm break-words'>
                          {node.data.title}
                        </span>
                      </div>
                    ))}
                </div>
              ))}
            </div>
            <Collapsible>
              <CollapsibleTrigger
                render={<Button variant='outline' size='sm' />}
              >
                {t('Advanced version JSON')}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CopyButton
                  value={JSON.stringify(version.data.document, null, 2)}
                  tooltip={t('studio.production.copySnapshot')}
                />
                <pre className='mt-3 max-h-96 overflow-auto text-xs whitespace-pre-wrap'>
                  {JSON.stringify(version.data.document, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!restore}
        onOpenChange={(open) => {
          if (!open) setRestore(null)
        }}
        title={t('Restore the reviewed version?')}
        desc={t(
          'The selected snapshot becomes the current project. Later edits remain in version history. If the project changes before confirmation, refresh and review again.'
        )}
        confirmText={t('studio.production.restore')}
        handleConfirm={() =>
          mutate.mutate(async () => {
            if (!restore) return
            await studioCloudRequest(`${path}/restore`, 'POST', {
              revision: restore.revision,
              expected_revision: restore.expectedRevision,
            })
            setRestore(null)
            setSelected(null)
            await props.onRefresh()
          })
        }
      />
      <Collapsible>
        <CollapsibleTrigger render={<Button size='sm' variant='outline' />}>
          {t('Advanced: series and regional deliveries')}
        </CollapsibleTrigger>
        <CollapsibleContent className='pt-4'>
          <StudioSeriesPanel />
        </CollapsibleContent>
      </Collapsible>
    </TabsContent>
  )
}
