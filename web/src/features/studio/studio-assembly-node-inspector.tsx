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
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import type { StudioProject } from './local-projects'
import type { StudioCanvasOperation } from './studio-canvas-commands'

type Props = {
  readOnly?: boolean
  project: StudioProject
  nodeId: string
  busy: boolean
  progress: number
  error?: string
  previewUrl?: string
  onEdit: (operations: StudioCanvasOperation[]) => void
  onAssemble: () => void
  onCancel: () => void
  onDownload: () => void
  onStoryboard: () => void
  onClose: () => void
  onDelete: () => void
}
export function StudioAssemblyNodeInspector(props: Props) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const assembly = props.project.nodes.find((node) => node.id === props.nodeId)
  const takeItems = (assembly?.data.takes || []).map((take, index) => ({
    value: take.id,
    label: `${formatNumber(index + 1, locale)} · ${t(`studio.status.${take.status}`)}`,
  }))
  const clips = props.project.edges.filter(
    (edge) =>
      edge.target === props.nodeId &&
      props.project.nodes.some(
        (node) => node.id === edge.source && node.data.kind === 'video'
      )
  )
  const audio = props.project.edges.filter(
    (edge) =>
      edge.target === props.nodeId &&
      props.project.nodes.some(
        (node) => node.id === edge.source && node.data.kind === 'audio'
      )
  )
  const ready =
    clips.length > 0 &&
    clips.every((edge) => {
      const node = props.project.nodes.find((node) => node.id === edge.source)
      if (edge.data?.sourceTakeId) {
        return node?.data.takes?.some(
          (take) =>
            take.id === edge.data?.sourceTakeId && take.status === 'completed'
        )
      }
      return (
        node?.data.status === 'completed' &&
        Boolean(node.data.mediaId || node.data.taskId)
      )
    })
  return (
    <Card className='h-full overflow-y-auto rounded-none border-0 ring-0'>
      <CardHeader className='border-b'>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle>{t('studio.catalog.assembly')}</CardTitle>
          <Button size='xs' variant='ghost' onClick={props.onClose}>
            {t('studio.inspector.close')}
          </Button>
        </div>
        <p className='text-muted-foreground text-xs'>
          {t('studio.assembly.nodeHint')}
        </p>
      </CardHeader>
      <CardContent className='flex flex-col gap-3 py-4'>
        {props.readOnly && <p role='status'>{t('Read-only project')}</p>}
        <fieldset disabled={props.readOnly} className='contents'>
          {clips.length === 0 && (
            <EmptyState
              title={t('studio.assembly.noClips')}
              description={t('studio.assembly.connectClips')}
              className='min-h-40'
            />
          )}
          <ol className='flex flex-col gap-2'>
            {clips.map((edge, index) => (
              <li
                key={edge.id}
                className='flex items-center gap-2 rounded-lg border p-2'
              >
                <span className='text-muted-foreground text-xs tabular-nums'>
                  {formatNumber(index + 1, locale)}
                </span>
                <span className='min-w-0 flex-1 truncate text-sm'>
                  {
                    props.project.nodes.find((node) => node.id === edge.source)
                      ?.data.title
                  }
                </span>
                {(['up', 'down'] as const).map((direction) => (
                  <Button
                    key={direction}
                    size='xs'
                    variant='ghost'
                    disabled={
                      props.busy ||
                      (direction === 'up'
                        ? index === 0
                        : index === clips.length - 1)
                    }
                    aria-label={t(
                      direction === 'up'
                        ? 'studio.assembly.moveClipUp'
                        : 'studio.assembly.moveClipDown'
                    )}
                    onClick={() => {
                      const ids = clips.map((edge) => edge.id)
                      const target = index + (direction === 'up' ? -1 : 1)
                      const id = ids[index]
                      ids[index] = ids[target]
                      ids[target] = id
                      props.onEdit([
                        {
                          op: 'reorder_clips',
                          nodeId: props.nodeId,
                          edgeIds: ids,
                        },
                      ])
                    }}
                  >
                    {direction === 'up' ? '↑' : '↓'}
                  </Button>
                ))}
              </li>
            ))}
          </ol>
          {audio.map((edge) => (
            <p key={edge.id} className='text-muted-foreground text-xs'>
              {t(
                edge.targetHandle === 'voiceover'
                  ? 'studio.audio.useVoiceover'
                  : 'studio.audio.useSoundtrack'
              )}
              :{' '}
              {
                props.project.nodes.find((node) => node.id === edge.source)
                  ?.data.title
              }
            </p>
          ))}
          <Button variant='outline' onClick={props.onStoryboard}>
            {t('studio.assembly.editTimeline')}
          </Button>
          <Button disabled={!ready || props.busy} onClick={props.onAssemble}>
            {t(
              props.busy
                ? 'studio.assembly.exporting'
                : 'studio.assembly.exportMp4'
            )}
            {props.busy
              ? ` · ${formatNumber(Math.round(props.progress), locale)}%`
              : ''}
          </Button>
          {props.busy && (
            <Button variant='outline' onClick={props.onCancel}>
              {t('studio.assembly.cancel')}
            </Button>
          )}
          {props.error && (
            <p role='alert' className='text-destructive text-sm'>
              {props.error}
            </p>
          )}
          {takeItems.length > 0 && (
            <Field>
              <FieldLabel>{t('studio.take.title')}</FieldLabel>
              <Select
                items={takeItems}
                value={assembly?.data.selectedTakeId || null}
                disabled={props.busy}
                onValueChange={(value) => {
                  if (value) {
                    props.onEdit([
                      {
                        op: 'select_take',
                        nodeId: props.nodeId,
                        takeId: value,
                      },
                    ])
                  }
                }}
              >
                <SelectTrigger
                  className='w-full'
                  aria-label={t('studio.take.title')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {takeItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Button
            variant='ghost'
            disabled={props.busy}
            onClick={props.onDelete}
          >
            {t('studio.deleteNode')}
          </Button>
        </fieldset>
        {props.previewUrl && (
          <>
            <video
              src={props.previewUrl}
              controls
              aria-label={t('studio.catalog.assembly')}
              className='w-full rounded-lg'
            />
            <Button variant='outline' onClick={props.onDownload}>
              {t('studio.assembly.download')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
