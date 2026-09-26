/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'

import { fetchStudioAttempts, type StudioAttempt } from './api'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: number
}

export function StudioAttempts(props: Props) {
  const { t } = useTranslation()
  const [attempts, setAttempts] = useState<StudioAttempt[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!props.open || !props.userId) {
      setAttempts([])
      return
    }
    let cancelled = false
    setAttempts([])
    setError(null)
    setLoading(true)
    void fetchStudioAttempts()
      .then((items) => {
        if (!cancelled) setAttempts(items)
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [props.open, props.userId, revision])

  const stageLabel = (stage: string): string => {
    switch (stage) {
      case 'started':
        return t('studio.attempt.started')
      case 'submitted':
        return t('studio.attempt.submitted')
      case 'accepted':
        return t('studio.attempt.accepted')
      case 'rejected_before_channel':
        return t('studio.attempt.rejectedBeforeChannel')
      case 'rejected_after_channel':
        return t('studio.attempt.rejectedAfterChannel')
      default:
        return stage
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('studio.attempt.title')}
      description={t('studio.attempt.description')}
      contentClassName='sm:max-w-xl'
    >
      <div className='space-y-3'>
        <Button
          size='sm'
          variant='outline'
          onClick={() => setRevision((value) => value + 1)}
        >
          {t('studio.attempt.refresh')}
        </Button>
        {loading && (
          <p className='text-muted-foreground text-sm'>{t('studio.loading')}</p>
        )}
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
        {!loading && !error && attempts.length === 0 && (
          <p className='text-muted-foreground text-sm'>
            {t('studio.attempt.empty')}
          </p>
        )}
        <div className='max-h-[60vh] space-y-3 overflow-y-auto'>
          {attempts.map((attempt) => (
            <div
              key={attempt.id}
              className='space-y-2 rounded-lg border p-3 text-sm'
            >
              <div className='flex items-start justify-between gap-3'>
                <strong className='break-all'>
                  {attempt.model || t('studio.model.empty')}
                </strong>
                <span className='text-muted-foreground shrink-0'>
                  {stageLabel(attempt.stage)}
                </span>
              </div>
              <p className='text-muted-foreground break-all'>
                {attempt.group || '—'} · {t('studio.attempt.channel')}{' '}
                {attempt.channelId || '—'} · HTTP {attempt.httpStatus || '—'}
              </p>
              {attempt.errorCode && (
                <code className='text-destructive block break-all'>
                  {attempt.errorCode}
                </code>
              )}
              {attempt.taskId && (
                <p className='break-all'>
                  {t('studio.attempt.task')} {attempt.taskId}
                </p>
              )}
              <div className='flex items-center gap-2'>
                <code className='text-muted-foreground min-w-0 flex-1 truncate text-xs'>
                  {attempt.id}
                </code>
                <CopyButton
                  value={attempt.id}
                  aria-label={t('studio.attempt.copyId')}
                />
              </div>
              <p className='text-muted-foreground text-xs'>
                {attempt.createdAt}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  )
}
