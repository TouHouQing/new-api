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

import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { formatQuotaWithCurrency, formatCurrencyFromUSD } from '@/lib/currency'

import { useStudioProductionContext } from './studio-production-context'

export function StudioBudgetSummary() {
  const { t } = useTranslation()
  const { budget, capabilities } = useStudioProductionContext()
  if (capabilities.isError) {
    return (
      <ErrorState
        description={t(
          'Could not read balance and service access. Retry before generating.'
        )}
        onRetry={() => void capabilities.refetch()}
      />
    )
  }
  if (!capabilities.data) {
    return (
      <p role='status' className='text-muted-foreground text-sm'>
        {t('Loading balance and service access')}
      </p>
    )
  }
  return (
    <div className='rounded-md border p-3 text-sm' role='status'>
      <Collapsible>
        <CollapsibleTrigger render={<Button size='sm' variant='ghost' />}>
          {t('Balance and spending limit')}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p>
            {t('Available balance')}:{' '}
            {formatQuotaWithCurrency(capabilities.data?.available_quota)} ·{' '}
            {t('Maximum spend')}: {formatCurrencyFromUSD(Number(budget) || 0)}
          </p>
        </CollapsibleContent>
      </Collapsible>
      {capabilities.data.generation_credit_available === false && (
        <p className='text-destructive'>
          {t(
            'Insufficient generation credit. Add credit or continue with free editing.'
          )}
        </p>
      )}
      <Collapsible>
        <CollapsibleTrigger render={<Button size='sm' variant='ghost' />}>
          {t('Spending and service details')}
        </CollapsibleTrigger>
        <CollapsibleContent className='flex flex-col gap-2 pt-2'>
          <p className='text-muted-foreground text-xs'>
            {t(
              'The budget is a hard upper limit, not a price estimate. Only actual model usage is billed; free editing, backups and local exports do not run models.'
            )}
          </p>
          <p className='text-muted-foreground mt-2 text-xs'>
            {t(
              'Platform generation uses the services configured by your administrator, including local models. A zero model price does not grant platform credit. Your own API connection uses that providers billing. Check model pricing before confirming; the maximum spend is not an estimate.'
            )}
          </p>
          <div className='mt-2 flex flex-wrap gap-2'>
            <Button size='sm' variant='outline' render={<a href='/wallet' />}>
              {t('Add generation credit')}
            </Button>
            <Button size='sm' variant='ghost' render={<a href='/pricing' />}>
              {t('View model pricing')}
            </Button>
            <Button
              size='sm'
              variant='ghost'
              render={<a href='/studio?workspace=guided&step=story' />}
            >
              {t('Try a free editing example')}
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
