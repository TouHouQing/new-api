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
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { AuthRecoveryError } from '@/lib/auth-session'

export function AuthRecovery(props: ErrorComponentProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const retryAt =
    props.error instanceof AuthRecoveryError
      ? props.error.retryAt
      : Date.now() + 5000
  const [now, setNow] = useState(Date.now())
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000))
  useEffect(() => {
    if (!(props.error instanceof AuthRecoveryError)) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    const retry = window.setTimeout(
      () => void router.invalidate(),
      Math.max(0, retryAt - Date.now())
    )
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(retry)
    }
  }, [retryAt, router, props.error])
  if (!(props.error instanceof AuthRecoveryError)) {
    return <ErrorState onRetry={() => void router.invalidate()} />
  }
  return (
    <ErrorState
      title={t('Restoring your session')}
      description={t(
        'Please wait {{seconds}} seconds. Your project address is preserved.',
        { seconds: remaining }
      )}
      action={
        <Button
          disabled={remaining > 0}
          onClick={() => void router.invalidate()}
        >
          {t('Retry')}
        </Button>
      }
    />
  )
}
