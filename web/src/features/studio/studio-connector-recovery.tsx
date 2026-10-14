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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { studioCloudRequest, type StudioCloudJob } from './studio-cloud'
import { useStudioProductionContext } from './studio-production-context'

export function StudioConnectorRecovery(props: { job: StudioCloudJob }) {
  const { t } = useTranslation()
  const { mutate, record } = useStudioProductionContext()
  const [remoteID, setRemoteID] = useState('')
  return (
    <div className='space-y-2 border-t pt-2'>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Check the destination for an existing file before retrying. Verification downloads that file and compares its bytes with the frozen source. It does not upload again.'
        )}
      </p>
      <CopyButton value={props.job.id} variant='outline' size='sm'>
        {t('Copy saved connection event ID')}
      </CopyButton>
      <Input
        aria-label={t('Existing remote file or Notion block ID')}
        placeholder={t('Existing remote file or Notion block ID')}
        value={remoteID}
        onChange={(event) => setRemoteID(event.target.value)}
        maxLength={2000}
      />
      <Button
        variant='outline'
        disabled={
          record.data?.role !== 'owner' ||
          mutate.isPending ||
          (!remoteID.trim() && props.job.connector?.provider !== 'webhook')
        }
        onClick={() =>
          mutate.mutate(() =>
            studioCloudRequest(
              `/jobs/${encodeURIComponent(props.job.id)}/control`,
              'POST',
              { action: 'reconcile', external_resource_id: remoteID.trim() }
            )
          )
        }
      >
        {t('Verify the existing remote result')}
      </Button>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Delivery webhooks require a signed receipt lookup supported by the receiver. Unverified receipts remain unresolved.'
        )}
      </p>
    </div>
  )
}
