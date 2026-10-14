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

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { StudioProductionContext } from './studio-production-context'
import {
  useStudioProductionController,
  type StudioProductionPanelProps,
} from './studio-production-controller'
import { StudioProductionDeliveryTab } from './studio-production-delivery-tab'
import { StudioProductionMediaTab } from './studio-production-media-tab'
import { StudioProductionMembersTab } from './studio-production-members-tab'
import { StudioProductionPlanTab } from './studio-production-plan-tab'
import { StudioProductionPrevisTab } from './studio-production-previs-tab'
import { StudioProductionReviewTab } from './studio-production-review-tab'
import { StudioProductionTimelineTab } from './studio-production-timeline-tab'
import { StudioProductionVersionsTab } from './studio-production-versions-tab'
import { StudioProductionWorkflowTab } from './studio-production-workflow-tab'

export function StudioProductionPanel(props: StudioProductionPanelProps) {
  const { t } = useTranslation()
  const production = useStudioProductionController(props)
  const { record, mutate } = production
  const failedQuery = [
    record,
    production.capabilities,
    production.jobs,
    production.versions,
    production.members,
    production.comments,
  ].find((query) => query.isError)
  return (
    <StudioProductionContext.Provider value={production}>
      <Dialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        title={t('studio.production.title')}
        contentClassName='sm:max-w-5xl'
        bodyClassName='min-h-0 overflow-y-auto'
      >
        {record.isPending && (
          <div aria-busy='true' className='space-y-3'>
            <Skeleton className='h-8 w-40' />
            <Skeleton className='h-20 w-full' />
          </div>
        )}
        {failedQuery && (
          <ErrorState
            description={failedQuery.error?.message}
            onRetry={() => void failedQuery.refetch()}
            className='min-h-32'
          />
        )}
        {mutate.isError && (
          <p role='alert' className='text-destructive mb-3 text-sm'>
            {mutate.error.message}
          </p>
        )}
        <div className='mb-4 flex flex-wrap items-center gap-2'>
          <Badge variant='secondary'>
            {t(`studio.production.role.${record.data?.role || 'owner'}`)}
          </Badge>
          <Button
            variant='outline'
            size='sm'
            disabled={mutate.isPending}
            onClick={() => mutate.mutate(props.onRefresh)}
          >
            {t('studio.production.refresh')}
          </Button>
          <CopyButton
            value={`${window.location.origin}${window.location.pathname}?project=${encodeURIComponent(props.project.id)}`}
            tooltip={t('studio.production.share')}
          />
        </div>
        <Tabs
          value={production.activeTab}
          onValueChange={(value) =>
            production.setActiveTab(value || 'workflow')
          }
        >
          <TabsList className='flex flex-wrap group-data-horizontal/tabs:h-auto'>
            {[
              'plan',
              'workflow',
              'media',
              'previs',
              'timeline',
              'review',
              'versions',
              'members',
              'delivery',
            ].map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {t(`studio.production.${tab}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          <StudioProductionPlanTab />
          <StudioProductionWorkflowTab />
          <StudioProductionMediaTab />
          <StudioProductionPrevisTab />
          <StudioProductionTimelineTab />
          <StudioProductionReviewTab />
          <StudioProductionVersionsTab />
          <StudioProductionMembersTab />
          <StudioProductionDeliveryTab />
        </Tabs>
      </Dialog>
    </StudioProductionContext.Provider>
  )
}
