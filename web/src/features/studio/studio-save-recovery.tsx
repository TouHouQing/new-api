/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
For commercial licensing, please contact support@quantumnous.com
*/
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import type { StudioProject } from './local-projects'
import { mergeStudioCloudDocument } from './studio-cloud-merge'

export function StudioSaveRecovery(props: {
  error: string
  conflict?: {
    path: string
    base: StudioProject
    local: StudioProject
    remote: { document: StudioProject }
  }
  onRetry: () => Promise<void>
  onResolve: (choice: 'local' | 'remote') => Promise<void>
  onBackup: () => void
}) {
  const { t } = useTranslation()
  const conflict = props.conflict
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const run = (action: () => Promise<void>) => {
    setBusy(true)
    setProblem('')
    void action()
      .catch((error) =>
        setProblem(error instanceof Error ? error.message : String(error))
      )
      .finally(() => setBusy(false))
  }
  const path = props.conflict?.path || ''
  const paths: string[] = []
  if (props.conflict) {
    mergeStudioCloudDocument(
      props.conflict.base,
      props.conflict.local,
      props.conflict.remote.document,
      'local',
      (path) => paths.push(path)
    )
  }
  const value = (project: StudioProject, path: string) => {
    const parts = path
      .replace(/^project\.?/, '')
      .replaceAll(/\[([^\]]+)\]/g, '.$1')
      .split('.')
    let result: unknown = project
    for (const part of parts) {
      if (Array.isArray(result)) {
        result = result.find((item: { id?: string }) => item?.id === part)
      } else if (result && typeof result === 'object') {
        result = (result as Record<string, unknown>)[part]
      } else return '—'
    }
    if (Array.isArray(result)) {
      return result
        .map(
          (entry: { data?: { title?: string }; title?: string; id?: string }) =>
            entry.data?.title || entry.title || t('Item')
        )
        .join(' · ')
    }
    if (result && typeof result === 'object') {
      return (
        Object.entries(result)
          .filter(
            ([key, value]) =>
              [
                'title',
                'prompt',
                'text',
                'brief',
                'status',
                'seconds',
              ].includes(key) && typeof value !== 'object'
          )
          .map(([, value]) => String(value))
          .join(' · ') || t('Project settings')
      )
    }
    return typeof result === 'string' ? result : JSON.stringify(result) || '—'
  }
  return (
    <Alert variant='destructive' className='mx-4 mt-2 w-auto'>
      <AlertDescription className='space-y-2'>
        <p>
          {t(
            props.conflict
              ? 'The same project field changed in two sessions. Your draft is retained on this device. Choose which conflicting value to keep; other edits are merged.'
              : 'The project could not sync. Your edits remain open here. Retry saving or download a recovery backup before leaving.'
          )}
        </p>
        {conflict &&
          [...new Set(paths.length ? paths : [path])].map((path) => (
            <dl key={path} className='grid gap-1 border-b pb-2 text-sm'>
              <dt>{t('My conflicting value')}</dt>
              <dd className='max-h-24 overflow-auto break-words whitespace-pre-wrap'>
                {value(conflict.local, path)}
              </dd>
              <dt>{t('Cloud conflicting value')}</dt>
              <dd className='max-h-24 overflow-auto break-words whitespace-pre-wrap'>
                {value(conflict.remote.document, path)}
              </dd>
            </dl>
          ))}
        <div className='flex flex-wrap gap-2'>
          {props.conflict ? (
            <>
              <Button
                size='sm'
                disabled={busy}
                onClick={() => run(() => props.onResolve('local'))}
              >
                {t('Keep my conflicting changes')}
              </Button>
              <Button
                variant='outline'
                size='sm'
                disabled={busy}
                onClick={() => run(() => props.onResolve('remote'))}
              >
                {t('Use cloud conflicting changes')}
              </Button>
            </>
          ) : (
            <Button
              size='sm'
              disabled={busy}
              onClick={() => run(props.onRetry)}
            >
              {t('Retry saving')}
            </Button>
          )}
          <Button size='sm' variant='outline' onClick={props.onBackup}>
            {t('Download recovery backup')}
          </Button>
        </div>
        {problem && <p role='alert'>{problem}</p>}
        <details>
          <summary>{t('Technical details')}</summary>
          <pre className='text-xs break-all whitespace-pre-wrap'>
            {props.error}
            {path ? `\n${path}` : ''}
          </pre>
        </details>
      </AlertDescription>
    </Alert>
  )
}
