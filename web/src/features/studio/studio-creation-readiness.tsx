/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
For commercial licensing, please contact support@quantumnous.com
*/
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

import {
  studioCreationProgress,
  type StudioCreationStep,
} from './studio-creation'
import { studioProjectTimeline } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'

export function StudioCreationReadiness(props: {
  expanded?: boolean
  onStep: (step: StudioCreationStep) => void
}) {
  const { t } = useTranslation()
  const {
    props: context,
    jobs,
    deliveryPreview,
    timelinePreviewed,
  } = useStudioProductionContext()
  const project = context.project
  const clips = studioProjectTimeline(project)
  const progress = studioCreationProgress(project, !!deliveryPreview)
  const ownFootage =
    clips.length > 0 &&
    !project.production?.brief?.trim() &&
    project.nodes.some(
      (node) =>
        node.data.kind === 'video' &&
        node.data.mediaId &&
        node.data.sourceMode === 'upload'
    )
  const checks: {
    label: string
    ready: boolean
    step: StudioCreationStep
    optional?: boolean
  }[] = [
    {
      label: 'Write a story or use the free example',
      ready: progress.story || ownFootage,
      step: 'story',
      optional: ownFootage,
    },
    {
      label: 'Confirm the shot plan',
      ready: progress.shots || ownFootage,
      step: 'shots',
      optional: ownFootage,
    },
    {
      label: 'Generate, upload or choose footage for each shot',
      ready: progress.visual,
      step: 'visual',
    },
    {
      label: 'Timeline footage is ready to play',
      ready: progress.edit,
      step: 'edit',
    },
    {
      label: 'Preview the current timeline version',
      ready: timelinePreviewed,
      step: 'edit',
    },
    {
      label: 'Render the current delivery version',
      ready: !!deliveryPreview,
      step: 'deliver',
    },
    {
      label: 'Add voice, music or captions if needed',
      ready:
        project.production?.guide?.goal === 'presenter'
          ? progress.voice
          : !!project.production?.audioTracks.length || !!project.captionsText,
      step: 'voice',
      optional: project.production?.guide?.goal !== 'presenter',
    },
  ]
  const goal = project.production?.guide?.goal || 'story'
  if (goal === 'product') {
    checks.push({
      label: 'Add brand details and a closing invitation',
      ready:
        !!(
          project.production?.brandKit?.name ||
          project.production?.creativeBrief?.subject ||
          project.production?.props.length
        ) &&
        !!(
          project.production?.brandKit?.callToAction ||
          project.production?.creativeBrief?.callToAction ||
          project.shots?.at(-1)?.dialogue
        ),
      step: 'edit',
    })
  }
  if (goal === 'explain') {
    checks.push({
      label: 'Review the opening, key points and conclusion',
      ready: (project.shots?.length || 0) >= 3,
      step: 'shots',
    })
  }
  if (goal === 'presenter') {
    checks.push({
      label: 'Choose a presenter portrait',
      ready: project.nodes.some(
        (node) => node.data.kind === 'image' && !!node.data.mediaId
      ),
      step: 'visual',
    })
    checks.push({
      label: 'Bind the presenter voice and dialogue',
      ready:
        !!Object.keys(project.production?.voiceBindings || {}).length &&
        !!project.production?.dialogueCues.length,
      step: 'voice',
    })
    checks.push({
      label: 'Complete the presenter lip sync',
      ready: project.nodes.some(
        (node) => node.data.model === 'studio-lip-sync' && !!node.data.mediaId
      ),
      step: 'voice',
    })
  }
  const missing = checks.filter(
    (check) => !check.ready && !check.optional
  ).length
  const running =
    jobs.data?.filter((job) =>
      ['queued', 'running', 'waiting'].includes(job.status)
    ).length || 0
  return (
    <Collapsible className='mb-3' defaultOpen={props.expanded && missing > 0}>
      <CollapsibleTrigger render={<Button variant='outline' size='sm' />}>
        {t('Creation checklist')} ·{' '}
        {t('{{count}} items need attention', { count: missing })}
      </CollapsibleTrigger>
      <CollapsibleContent className='flex flex-col gap-2 pt-3'>
        {running > 0 && (
          <p role='status'>
            {t(
              '{{count}} tasks continue on the server. You can keep editing.',
              { count: running }
            )}
          </p>
        )}
        {checks.map((check) => (
          <div
            key={check.label}
            className='flex flex-wrap items-center gap-2 text-sm'
          >
            <span aria-label={t(check.ready ? 'Ready' : 'Needs attention')}>
              {check.ready ? '✓' : '○'}
            </span>
            <span className='mr-auto'>
              {t(check.label)}
              {check.optional && ` · ${t('Optional')}`}
            </span>
            <Button
              variant='outline'
              size='xs'
              aria-label={`${t('Go to this step')} · ${t(check.label)}`}
              onClick={() => props.onStep(check.step)}
            >
              {t('Go to this step')}
            </Button>
            {check.optional && !check.ready && (
              <Button
                variant='ghost'
                size='xs'
                onClick={() => props.onStep('edit')}
              >
                {t('Skip for now')}
              </Button>
            )}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}
