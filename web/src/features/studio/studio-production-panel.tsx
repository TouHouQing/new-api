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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { StudioCreationReadiness } from './studio-creation-readiness'
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
import { studioWorkflowProblem } from './studio-workflow-problem'

export function StudioProductionPanel(props: StudioProductionPanelProps) {
  const { t } = useTranslation()
  const production = useStudioProductionController(props)
  const { record, mutate } = production
  const steps = ['plan', 'workflow', 'timeline', 'delivery']
  const nextLabels: Record<string, string> = {
    plan: 'Go to generation',
    workflow: 'Go to editing',
    timeline: 'Go to review and export',
  }
  const failedNode = props.project.nodes.find((node) =>
    mutate.error?.message.includes(node.id)
  )
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
        footer={
          steps.includes(production.activeTab) ? (
            <div className='flex w-full items-center justify-between gap-2'>
              <Button
                variant='outline'
                disabled={production.activeTab === 'plan'}
                onClick={() => {
                  production.setActiveTab(
                    steps[Math.max(0, steps.indexOf(production.activeTab) - 1)]
                  )
                }}
              >
                {t('Previous step')}
              </Button>
              {production.activeTab !== 'delivery' && (
                <Button
                  onClick={() => {
                    production.setActiveTab(
                      steps[steps.indexOf(production.activeTab) + 1]
                    )
                  }}
                >
                  {t(nextLabels[production.activeTab])}
                </Button>
              )}
            </div>
          ) : undefined
        }
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
          <div
            role='alert'
            className='text-destructive mb-3 flex flex-col gap-2 text-sm'
          >
            <details>
              <summary>
                {t(studioWorkflowProblem(mutate.error.message))}
              </summary>
              <pre className='max-h-40 overflow-auto text-xs break-all whitespace-pre-wrap'>
                {mutate.error.message}
              </pre>
            </details>
            {failedNode && (
              <Button
                variant='outline'
                size='sm'
                onClick={() =>
                  (props.onInspectNode || props.onSelectNode)?.(failedNode.id)
                }
              >
                {t('Edit settings for {{title}}', {
                  title: failedNode.data.title,
                })}
              </Button>
            )}
          </div>
        )}
        <Collapsible className='mb-3'>
          <CollapsibleTrigger render={<Button variant='ghost' size='sm' />}>
            {t('Project management and sharing')}
          </CollapsibleTrigger>
          <CollapsibleContent className='flex flex-wrap items-center gap-2 pt-2'>
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
          </CollapsibleContent>
        </Collapsible>
        <StudioCreationReadiness
          onStep={(step) => {
            const pages = {
              story: 'plan',
              shots: 'plan',
              assets: 'plan',
              visual: 'workflow',
              voice: 'media',
              edit: 'timeline',
              deliver: 'delivery',
            }
            production.setActiveTab(pages[step])
          }}
        />
        <Tabs
          value={production.activeTab}
          onValueChange={(value) =>
            production.setActiveTab(value || 'workflow')
          }
        >
          <TabsList className='flex w-full justify-start overflow-x-auto group-data-horizontal/tabs:h-auto'>
            {[
              ['plan', '1 Story and shots'],
              ['workflow', '2 Generate footage'],
              ['timeline', '3 Edit and sound'],
              ['delivery', '4 Review and export'],
            ].map(([tab, label]) => (
              <TabsTrigger key={tab} value={tab} className='shrink-0'>
                {t(label)}
              </TabsTrigger>
            ))}
          </TabsList>
          <Collapsible
            className='mt-2'
            key={
              ['media', 'previs', 'review', 'versions', 'members'].includes(
                production.activeTab
              )
                ? 'advanced'
                : 'main'
            }
            defaultOpen={[
              'media',
              'previs',
              'review',
              'versions',
              'members',
            ].includes(production.activeTab)}
          >
            <CollapsibleTrigger render={<Button variant='ghost' size='sm' />}>
              {t('More production tools')}
            </CollapsibleTrigger>
            <CollapsibleContent className='pt-2'>
              <TabsList className='flex flex-wrap justify-start group-data-horizontal/tabs:h-auto'>
                {['media', 'previs', 'review', 'versions', 'members'].map(
                  (tab) => (
                    <TabsTrigger key={tab} value={tab}>
                      {t(`studio.production.${tab}`)}
                    </TabsTrigger>
                  )
                )}
              </TabsList>
            </CollapsibleContent>
          </Collapsible>
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
