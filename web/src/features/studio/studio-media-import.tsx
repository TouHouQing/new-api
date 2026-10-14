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

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'

import { studioProductionSchema } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'
import { studioWorkflowProblem } from './studio-workflow-problem'
import { addStudioNode, recordStudioTake, updateStudioNode } from './workspace'

export function StudioMediaImport() {
  const { t } = useTranslation()
  const { props, writable } = useStudioProductionContext()
  const file = useRef<HTMLInputElement>(null)
  const folder = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const projectAccess = useRef(props.project)
  projectAccess.current = props.project
  const controller = useRef<AbortController | undefined>(undefined)
  useEffect(
    () => () => controller.current?.abort(),
    [props.project.id, props.userId]
  )
  const importFiles = async (files: FileList | null): Promise<void> => {
    if (!files?.length) return
    if (files.length > 20) {
      setError(t('Import at most 20 media files at a time'))
      return
    }
    setBusy(true)
    setError('')
    const pending = new AbortController()
    controller.current = pending
    let next = props.project
    try {
      for (const item of files) {
        if (pending.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }
        const kind = item.type.split('/')[0]
        if (
          !['image', 'video', 'audio'].includes(kind) ||
          item.type === 'image/svg+xml'
        ) {
          continue
        }
        if (!item.size || item.size > 512 * 1024 * 1024) {
          throw new Error(
            t('Each media file must be between 1 byte and 512 MiB')
          )
        }
        const id = crypto.randomUUID()
        const response = await api.put(
          `/api/studio/cloud/media/${id}?project_id=${encodeURIComponent(next.id)}`,
          item,
          {
            signal: pending.signal,
            timeout: 180000,
            headers: { 'Content-Type': item.type },
          }
        )
        if (!response.data?.success) {
          throw new Error(
            response.data?.message || t('studio.project.saveFailed')
          )
        }
        const nodeId = crypto.randomUUID()
        next = projectAccess.current
        next = recordStudioTake(
          updateStudioNode(
            addStudioNode(next, kind as 'image' | 'video' | 'audio', nodeId),
            nodeId,
            { title: item.name.slice(0, 200), sourceMode: 'upload' }
          ),
          nodeId,
          {
            id: crypto.randomUUID(),
            prompt: '',
            createdAt: new Date().toISOString(),
            sourceMode: 'upload',
            status: 'completed',
            mediaId: id,
          }
        )
        props.onUpdate(next)
      }
      if (
        !next.shots?.length &&
        next.nodes.some(
          (node) => node.data.kind === 'video' && node.data.mediaId
        )
      ) {
        next = {
          ...next,
          production: {
            ...(next.production || studioProductionSchema.parse({})),
            guide: {
              step: 'edit',
              goal: next.production?.guide?.goal || 'story',
            },
          },
        }
        props.onUpdate(next)
      }
      await props.onSave()
      if (next.nodes.length === props.project.nodes.length) {
        setError(t('Choose supported image, video or audio files'))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const mapped = studioWorkflowProblem(message)
      setError(mapped.startsWith('The task failed.') ? message : t(mapped))
    } finally {
      setBusy(false)
      if (file.current) file.current.value = ''
      if (folder.current) folder.current.value = ''
    }
  }
  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap gap-2'>
        <Button
          variant='outline'
          disabled={!writable || busy}
          onClick={() => file.current?.click()}
        >
          {t('Use your own footage or audio')}
        </Button>
        <Button
          variant='outline'
          disabled={!writable || busy}
          onClick={() => folder.current?.click()}
        >
          {t('Import a media folder')}
        </Button>
      </div>
      <input
        ref={file}
        type='file'
        hidden
        multiple
        accept='image/*,video/*,audio/*'
        onChange={(event) => void importFiles(event.target.files)}
      />
      <input
        ref={folder}
        type='file'
        hidden
        {...{ webkitdirectory: '' }}
        onChange={(event) => void importFiles(event.target.files)}
      />
      {busy && <p role='status'>{t('Saving selected media…')}</p>}
      {error && (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
