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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { handleServerError } from '@/lib/handle-server-error'

import { StudioApps } from './studio-apps'
import {
  studioCreationProgress,
  type StudioCreationStep,
} from './studio-creation'
import { StudioCreationBrief } from './studio-creation-brief'
import { StudioCreationReadiness } from './studio-creation-readiness'
import { studioProductionSchema } from './studio-production'
import { StudioProductionContext } from './studio-production-context'
import { StudioProductionContinuity } from './studio-production-continuity'
import {
  useStudioProductionController,
  type StudioProductionPanelProps,
} from './studio-production-controller'
import { StudioProductionDeliveryTab } from './studio-production-delivery-tab'
import { StudioProductionMediaTab } from './studio-production-media-tab'
import { StudioProductionReviewTab } from './studio-production-review-tab'
import { StudioProductionTimelineTab } from './studio-production-timeline-tab'
import { StudioProductionWorkflowTab } from './studio-production-workflow-tab'
import { StudioProjectAssistant } from './studio-project-assistant'
import { StudioScreenplayEditor } from './studio-screenplay-editor'

type Props = StudioProductionPanelProps & {
  onAssets: () => void
  onCanvas: () => void
  onDemo: () => Promise<void>
  initialStep?: StudioCreationStep
  onStepChange?: (step: StudioCreationStep) => void
}
export function StudioCreationWorkspace(props: Props) {
  const { t } = useTranslation()
  const [ready, setReady] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [screenplayValid, setScreenplayValid] = useState(true)
  const [storyValid, setStoryValid] = useState(true)
  const [previewStep, setPreviewStep] = useState<StudioCreationStep>(
    props.project.production?.guide?.step || 'story'
  )
  const controller = useStudioProductionController({
    ...props,
    open: props.open && ready,
  })
  const entry = useRef(controller)
  entry.current = controller
  const progress = studioCreationProgress(
    props.project,
    Boolean(controller.result?.package_media_id)
  )
  const step =
    props.initialStep ||
    (controller.writable
      ? props.project.production?.guide?.step || 'story'
      : previewStep)
  const goals = ['story', 'shots', 'visual', 'edit', 'deliver'] as const
  let goal: (typeof goals)[number] = 'story'
  if (step === 'assets') goal = 'shots'
  else if (step === 'voice') goal = 'visual'
  else goal = step
  const setStep = (step: StudioCreationStep): void => {
    setPreviewStep(step)
    props.onStepChange?.(step)
    if (!controller.writable) return
    props.onUpdate({
      ...props.project,
      production: {
        ...(props.project.production || studioProductionSchema.parse({})),
        guide: { step, goal: props.project.production?.guide?.goal || 'story' },
      },
      updatedAt: new Date().toISOString(),
    })
  }
  const entryStep = useRef('')
  useEffect(() => {
    if (!props.initialStep) {
      entryStep.current = ''
      return
    }
    if (!controller.record.data) return
    const key = `${props.project.id}:${props.initialStep}`
    if (entryStep.current === key) return
    entryStep.current = key
    setPreviewStep(props.initialStep)
    if (controller.writable) {
      entry.current.props.onUpdate({
        ...entry.current.props.project,
        production: {
          ...(entry.current.props.project.production ||
            studioProductionSchema.parse({})),
          guide: {
            step: props.initialStep,
            goal:
              entry.current.props.project.production?.guide?.goal || 'story',
          },
        },
      })
    }
  }, [
    props.initialStep,
    props.project.id,
    controller.record.data,
    controller.writable,
  ])
  useEffect(() => {
    void entry.current.props
      .onSave()
      .then(() => setReady(true))
      .catch((error) => {
        setSaveError(
          `${t('studio.project.saveFailed')}: ${error instanceof Error ? error.message : String(error)}`
        )
        handleServerError(error)
      })
  }, [props.project.id, t])
  return (
    <StudioProductionContext.Provider value={controller}>
      <div className='h-full max-w-full min-w-0 overflow-y-auto p-4 sm:p-6'>
        <header className='mb-3 flex flex-wrap items-start gap-3'>
          <div className='mr-auto'>
            <h2 className='text-xl font-semibold'>
              {t('Make your first video')}
            </h2>
            <p className='text-muted-foreground text-sm'>
              {t('Plan, make and refine a video one step at a time.')}
            </p>
          </div>
          <Button size='sm' variant='outline' onClick={props.onCanvas}>
            {t('Open advanced canvas')}
          </Button>
        </header>
        {controller.record.isLoading && (
          <Skeleton className='mb-4 h-10 w-full' />
        )}
        {saveError && (
          <Alert variant='destructive'>
            <AlertDescription>
              {saveError}
              <Button
                variant='outline'
                size='sm'
                onClick={() => {
                  void props
                    .onSave()
                    .then(() => {
                      setSaveError('')
                      setReady(true)
                    })
                    .catch(handleServerError)
                }}
              >
                {t('Retry saving')}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {controller.record.isError && (
          <Alert variant='destructive' className='mb-4'>
            <AlertDescription>
              {controller.record.error.message}
              <Button
                variant='outline'
                size='sm'
                onClick={() => void controller.record.refetch()}
              >
                {t('Retry')}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {controller.mutate.isError && (
          <Alert variant='destructive' className='mb-4'>
            <AlertDescription>
              {controller.mutate.error.message}
            </AlertDescription>
          </Alert>
        )}
        <StudioCreationReadiness onStep={setStep} />
        <StudioProjectAssistant />
        <Tabs
          value={goal}
          onValueChange={(value) => {
            const next = goals.find((step) => step === value)
            if (next) setStep(next)
          }}
        >
          <TabsList className='mb-3 flex w-full max-w-full flex-nowrap! gap-1 overflow-x-auto group-data-horizontal/tabs:h-auto sm:grid sm:grid-cols-5'>
            {goals.map((value, index) => (
              <TabsTrigger
                value={value}
                key={value}
                className='h-9 min-w-max flex-none px-3 py-2 whitespace-nowrap! sm:min-w-0 sm:flex-1'
              >
                {progress[value] ? '✓' : index + 1}{' '}
                {t(`studio.creation.step.${value}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value='story'>
            <StudioCreationBrief
              onDemo={props.onDemo}
              onValidityChange={setStoryValid}
            />
          </TabsContent>
          <TabsContent value='shots'>
            <Button variant='outline' size='sm' onClick={props.onAssets}>
              {t('Manage characters and scene references')}
            </Button>
            <Collapsible defaultOpen={step === 'assets'}>
              <CollapsibleTrigger
                render={<Button variant='outline' size='sm' />}
              >
                {t('Optional: character and scene continuity')}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <StudioProductionContinuity />
              </CollapsibleContent>
            </Collapsible>
            <StudioScreenplayEditor onValidityChange={setScreenplayValid} />
          </TabsContent>
          {goal === 'visual' && (
            <div className='mb-3 flex flex-wrap gap-2'>
              <Button
                variant={step === 'voice' ? 'outline' : 'default'}
                size='sm'
                onClick={() => setStep('visual')}
              >
                {t('Make shot images and videos')}
              </Button>
              <Button
                variant={step === 'voice' ? 'default' : 'outline'}
                size='sm'
                onClick={() => setStep('voice')}
              >
                {t(
                  props.project.production?.guide?.goal === 'presenter'
                    ? 'Presenter voice, dialogue and lip sync'
                    : 'Optional: voice, music and image tools'
                )}
              </Button>
            </div>
          )}
          {step !== 'voice' && <StudioProductionWorkflowTab value='visual' />}
          {step === 'voice' && (
            <StudioProductionMediaTab value='visual' active voice />
          )}
          <StudioProductionTimelineTab value='edit' />
          <TabsContent value='deliver'>
            <StudioProductionDeliveryTab inline />
            <StudioProductionReviewTab inline />
            <StudioApps />
          </TabsContent>
        </Tabs>
        <footer className='bg-background sticky bottom-0 z-10 mt-6 flex items-center justify-between gap-3 border-t py-3'>
          <Button
            variant='outline'
            disabled={step === 'story'}
            onClick={() => setStep(goals[Math.max(0, goals.indexOf(goal) - 1)])}
          >
            {t('Previous step')}
          </Button>
          <span className='text-muted-foreground text-xs'>
            {saveError
              ? t('Draft save needs attention')
              : t('Draft changes save automatically.')}
          </span>
          <Button
            disabled={
              step === 'deliver' ||
              (controller.writable && step === 'story' && !storyValid) ||
              (controller.writable &&
                step === 'story' &&
                !props.project.production?.brief?.trim() &&
                !progress.edit) ||
              (step === 'edit' && !controller.captionsReady) ||
              (controller.writable &&
                step === 'shots' &&
                (!screenplayValid ||
                  !progress.shots ||
                  !!props.project.production?.screenplayDraft))
            }
            onClick={() =>
              setStep(
                goals[Math.min(goals.length - 1, goals.indexOf(goal) + 1)]
              )
            }
          >
            {t('Next step')}
          </Button>
        </footer>
      </div>
    </StudioProductionContext.Provider>
  )
}
