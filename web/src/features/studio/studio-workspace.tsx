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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { handleServerError } from '@/lib/handle-server-error'

import { StudioApps } from './studio-apps'
import {
  studioCreationProgress,
  type StudioCreationStep,
} from './studio-creation'
import { StudioCreationBrief } from './studio-creation-brief'
import { StudioCreationReadiness } from './studio-creation-readiness'
import { StudioFilmChecks, StudioDialogueTiming } from './studio-film-finish'
import { studioProductionSchema } from './studio-production'
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
import { StudioProjectAssistant } from './studio-project-assistant'
import { StudioScreenplayEditor } from './studio-screenplay-editor'
import { StudioStoryboardOverview } from './studio-storyboard-overview'
import { StudioTimelinePreview } from './studio-timeline-preview'
import { StudioWorkspaceAssets } from './studio-workspace-assets'
import {
  STUDIO_WORKSPACE_STAGES as stages,
  STUDIO_WORKSPACE_TOOLS,
  studioWorkspaceEntry,
  studioWorkspaceStage,
  type StudioWorkspaceTool,
} from './studio-workspace-navigation'
import { StudioWorkspaceShot } from './studio-workspace-shot'

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
  const [previewStep, setPreviewStep] = useState<StudioCreationStep>(() =>
    studioWorkspaceEntry(props.project, props.selectedNodeId)
  )
  const [tool, setTool] = useState<StudioWorkspaceTool | null>(
    props.initialTab === 'media' ? 'media' : null
  )
  const [shotsOpen, setShotsOpen] = useState(false)
  const [screenplayValid, setScreenplayValid] = useState(true)
  const [storyValid, setStoryValid] = useState(true)
  const [exportDisabled, setExportDisabled] = useState(true)
  const exportButton = useRef<HTMLButtonElement>(null)
  const [runDisabled, setRunDisabled] = useState(true)
  const runButton = useRef<HTMLButtonElement>(null)
  const controller = useStudioProductionController({
    ...props,
    open: props.open && ready,
  })
  const access = useRef({ props, controller })
  access.current = { props, controller }
  const requested =
    props.initialStep ||
    (controller.writable
      ? props.project.production?.guide?.step || previewStep
      : previewStep)
  const step =
    studioWorkspaceStage(requested) ||
    (requested === 'assets' ? 'shots' : 'edit')
  const progress = studioCreationProgress(
    props.project,
    !!controller.deliveryPreview
  )
  const selectedShot = props.project.shots?.find((shot) =>
    [shot.textNodeId, shot.imageNodeId, shot.videoNodeId].includes(
      props.selectedNodeId || ''
    )
  )
  const selectedMedia = props.project.nodes.find(
    (node) => node.id === props.selectedNodeId
  )
  const completedVideo =
    selectedMedia?.data.kind === 'video' && !!selectedMedia.data.mediaId
  const completedImage =
    selectedMedia?.data.kind === 'image' && !!selectedMedia.data.mediaId
  let generationLabel = 'Generate selected footage'
  if (controller.selectedNodes.length === 1) {
    generationLabel = 'Try this shot first'
  }
  if (selectedMedia?.data.kind === 'image') {
    generationLabel = 'Make the key image'
  }
  const selectShot = (id: string) => {
    props.onSelectNode?.(id)
    const node = props.project.nodes.find((node) => node.id === id)
    controller.setSelectedNodes(node?.data.sourceMode === 'upload' ? [] : [id])
    const clip = controller.timeline.find((clip) => clip.nodeId === id)
    if (clip) controller.setSelectedClip(clip.id)
    setShotsOpen(false)
    try {
      localStorage.setItem(
        `studio-shot:${props.userId}:${props.project.id}`,
        id
      )
    } catch {
      /* Session selection remains usable. */
    }
  }
  useEffect(() => {
    if (
      props.selectedNodeId &&
      props.project.nodes.some((node) => node.id === props.selectedNodeId)
    ) {
      return
    }
    let saved = ''
    try {
      saved =
        localStorage.getItem(
          `studio-shot:${props.userId}:${props.project.id}`
        ) || ''
    } catch {
      /* Storage can be unavailable. */
    }
    const first = props.project.shots?.[0]
    let id = controller.timeline[0]?.nodeId
    if (first) {
      id = first.imageNodeId
      if (
        props.project.nodes.find((node) => node.id === first.imageNodeId)?.data
          .mediaId
      ) {
        id = first.videoNodeId
      }
    }
    if (props.project.nodes.some((node) => node.id === saved)) id = saved
    if (id) selectShot(id)
    // Restore on entry and when the first shot plan is applied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.project.id, props.project.shots?.length])
  const setStep = (value: StudioCreationStep) => {
    const next =
      studioWorkspaceStage(value) || (value === 'assets' ? 'shots' : 'edit')
    setPreviewStep(next)
    let nextTool: StudioWorkspaceTool | null = null
    if (value === 'assets') nextTool = 'assets'
    if (value === 'voice') nextTool = 'media'
    setTool(nextTool)
    props.onStepChange?.(next)
    if (controller.writable) {
      props.onUpdate({
        ...props.project,
        production: {
          ...(props.project.production || studioProductionSchema.parse({})),
          guide: {
            step: next,
            goal: props.project.production?.guide?.goal || 'story',
          },
        },
        updatedAt: new Date().toISOString(),
      })
    }
  }
  const setActiveTab = (action: React.SetStateAction<string>) => {
    const value = typeof action === 'function' ? action(tool || step) : action
    const stage = studioWorkspaceStage(value)
    if (stage) setStep(stage)
    else if (STUDIO_WORKSPACE_TOOLS.includes(value as StudioWorkspaceTool)) {
      setTool(value as StudioWorkspaceTool)
    }
  }
  const context = { ...controller, activeTab: tool || step, setActiveTab }
  const setControllerTab = controller.setActiveTab
  useEffect(() => {
    setControllerTab(tool || step)
  }, [tool, step, setControllerTab])
  const entered = useRef(false)
  useEffect(() => {
    if (entered.current || !controller.record.data) return
    entered.current = true
    if (props.initialStep === 'voice') setTool('media')
    if (props.initialStep === 'assets') setTool('assets')
    if (props.initialStep && controller.writable) {
      props.onUpdate({
        ...props.project,
        production: {
          ...(props.project.production || studioProductionSchema.parse({})),
          guide: {
            step,
            goal: props.project.production?.guide?.goal || 'story',
          },
        },
      })
    }
  }, [controller.record.data, controller.writable, props, step])
  useEffect(() => {
    let closed = false
    void access.current.props
      .onSave()
      .then(() => {
        if (!closed) setReady(true)
      })
      .catch((error) => {
        if (!closed) {
          setSaveError(
            `${t('studio.project.saveFailed')}: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      })
    return () => {
      closed = true
    }
  }, [props.project.id, t])
  const shotList = (
    <nav
      aria-label={t('Project shots')}
      className='flex min-w-0 flex-col gap-2 p-3'
    >
      <h3 className='font-medium'>
        {t('Project shots')} ·{' '}
        {props.project.shots?.length || controller.timeline.length}
      </h3>
      {(props.project.shots || []).map((shot, index) => {
        const image = props.project.nodes.find(
          (node) => node.id === shot.imageNodeId
        )
        const video = props.project.nodes.find(
          (node) => node.id === shot.videoNodeId
        )
        let status = 'Key image needs review'
        if (image?.data.mediaId) status = 'Video needed'
        if (video?.data.mediaId) status = 'Selected version'
        return (
          <Button
            key={shot.id}
            variant={selectedShot?.id === shot.id ? 'secondary' : 'ghost'}
            aria-pressed={selectedShot?.id === shot.id}
            className='h-auto w-full justify-start px-3 py-3 text-left whitespace-normal'
            onClick={() =>
              selectShot(
                image?.data.mediaId ? shot.videoNodeId : shot.imageNodeId
              )
            }
          >
            <span className='flex min-w-0 flex-col gap-1'>
              <span>
                {index + 1}. {shot.title}
              </span>
              <span className='text-muted-foreground text-xs'>
                {video?.data.seconds || 5}s · {t(status)}
              </span>
            </span>
          </Button>
        )
      })}
      {!props.project.shots?.length &&
        controller.timeline.map((clip, index) => (
          <Button
            key={clip.id}
            variant={
              props.selectedNodeId === clip.nodeId ? 'secondary' : 'ghost'
            }
            className='h-auto justify-start whitespace-normal'
            onClick={() => selectShot(clip.nodeId)}
          >
            {index + 1}.{' '}
            {
              props.project.nodes.find((node) => node.id === clip.nodeId)?.data
                .title
            }
          </Button>
        ))}
      {!props.project.shots?.length && !controller.timeline.length && (
        <p className='text-muted-foreground text-sm'>
          {t('Start with an idea or upload your footage.')}
        </p>
      )}
      <Button variant='outline' size='sm' onClick={() => setStep('shots')}>
        {t('Edit shot plan')}
      </Button>
    </nav>
  )
  return (
    <StudioProductionContext.Provider value={context}>
      <div
        className='studio-production-workspace flex h-full min-h-0 max-w-full min-w-0 flex-col overflow-hidden'
        data-stage={step}
      >
        <header className='flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2'>
          <div className='sr-only'>
            <h2 className='truncate font-semibold'>{props.project.title}</h2>
            <p className='text-muted-foreground text-xs'>
              {t('studio.production.title')} ·{' '}
              {saveError
                ? t('Draft save needs attention')
                : t('Draft changes save automatically.')}
            </p>
          </div>
          <Button
            size='sm'
            variant='outline'
            onClick={() => setTool('assistant')}
          >
            {t('Creative assistant')}
          </Button>
          <Button size='sm' variant='outline' onClick={() => setTool('share')}>
            {t('Share project')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size='sm' variant='ghost' />}>
              {t('Project tools')}
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuGroup>
                {(
                  [
                    'media',
                    'previs',
                    'review',
                    'versions',
                    'members',
                    'assets',
                    'planning',
                  ] as const
                ).map((key) => (
                  <DropdownMenuItem key={key} onClick={() => setTool(key)}>
                    {t(`studio.workspace.tool.${key}`)}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={props.onCanvas}>
                  {t('Open advanced canvas')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => controller.mutate.mutate(props.onRefresh)}
                >
                  {t('studio.production.refresh')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        {(saveError ||
          controller.record.isError ||
          controller.mutate.isError) && (
          <Alert variant='destructive'>
            <AlertDescription>
              {saveError ||
                controller.record.error?.message ||
                controller.mutate.error?.message}
              <Button
                size='sm'
                variant='outline'
                onClick={() => {
                  void props
                    .onSave()
                    .then(() => {
                      setSaveError('')
                      setReady(true)
                      return controller.record.refetch()
                    })
                    .catch(handleServerError)
                }}
              >
                {t('Retry')}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <Tabs
          value={step}
          onValueChange={(value) => {
            const next = studioWorkspaceStage(value || '')
            if (next) setStep(next)
          }}
          className='flex min-h-0 flex-1 flex-col gap-0'
        >
          <TabsList className='m-2 grid shrink-0 grid-cols-5 group-data-horizontal/tabs:h-auto'>
            {stages.map((key, index) => (
              <TabsTrigger
                key={key}
                value={key}
                className='min-w-0 px-1 py-2 text-xs sm:text-sm'
              >
                {progress[key] ? '✓' : index + 1}{' '}
                {t(`studio.workspace.stage.${key}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className='flex shrink-0 gap-2 px-3 pb-2 lg:hidden'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setShotsOpen(true)}
            >
              {t('Project shots')}
            </Button>
          </div>
          <div className='grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[220px_minmax(0,1fr)]'>
            <aside className='hidden min-h-0 overflow-y-auto border-r lg:block'>
              {shotList}
            </aside>
            <div
              className='min-h-0 min-w-0 overflow-y-auto overscroll-contain p-3 sm:p-4'
              data-workspace-scroll
            >
              <TabsContent value='story' className='mt-0'>
                <StudioCreationBrief
                  onDemo={props.onDemo}
                  onValidityChange={setStoryValid}
                />
              </TabsContent>
              <TabsContent value='shots' className='mt-0'>
                <div className='mb-3 flex flex-wrap gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => setTool('assets')}
                  >
                    {t('Characters and references')}
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => setTool('assistant')}
                  >
                    {t('Improve the story with AI')}
                  </Button>
                </div>
                <StudioStoryboardOverview />
                <StudioScreenplayEditor onValidityChange={setScreenplayValid} />
                <StudioDialogueTiming />
              </TabsContent>
              <TabsContent value='visual' className='mt-0'>
                <StudioStoryboardOverview />
                <div className='grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]'>
                  <div className='min-w-0 self-start xl:sticky xl:top-0'>
                    <StudioWorkspaceShot
                      key={selectedShot?.id || props.selectedNodeId || 'empty'}
                      onTool={setTool}
                    />
                  </div>
                  <div className='min-w-0'>
                    <StudioProductionWorkflowTab
                      value='visual'
                      compact
                      runButtonRef={runButton}
                      onRunAvailabilityChange={setRunDisabled}
                    />
                  </div>
                </div>
              </TabsContent>
              <StudioProductionTimelineTab value='edit' compact />
              <TabsContent value='deliver' className='mt-0'>
                <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]'>
                  <div className='min-w-0 self-start xl:sticky xl:top-0'>
                    <h3 className='mb-3 font-medium'>
                      {t('Whole film preview')}
                    </h3>
                    <StudioTimelinePreview
                      compact
                      project={props.project}
                      getMedia={props.getMedia}
                      onPreviewed={controller.markTimelinePreviewed}
                    />
                    <Collapsible className='mt-3'>
                      <CollapsibleTrigger
                        render={<Button variant='outline' size='sm' />}
                      >
                        {t('Whole film checks')}
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <StudioFilmChecks onStep={setStep} />
                        <StudioCreationReadiness onStep={setStep} expanded />
                      </CollapsibleContent>
                    </Collapsible>
                    <Button
                      className='mt-3'
                      variant='outline'
                      size='sm'
                      onClick={() => setTool('review')}
                    >
                      {t('Review and timepoint feedback')}
                    </Button>
                  </div>
                  <StudioProductionDeliveryTab
                    inline
                    exportButtonRef={exportButton}
                    onExportAvailabilityChange={setExportDisabled}
                  />
                </div>
                <Collapsible className='mt-3'>
                  <CollapsibleTrigger
                    render={<Button variant='ghost' size='sm' />}
                  >
                    {t('Delivery extensions')}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <StudioApps />
                  </CollapsibleContent>
                </Collapsible>
              </TabsContent>
            </div>
          </div>
        </Tabs>
        <footer className='bg-background flex shrink-0 items-center justify-between gap-2 border-t px-3 py-2'>
          <Button
            size='sm'
            variant='ghost'
            disabled={step === 'story'}
            onClick={() =>
              setStep(
                stages[
                  Math.max(
                    0,
                    stages.indexOf(step as (typeof stages)[number]) - 1
                  )
                ]
              )
            }
          >
            {t('Previous step')}
          </Button>
          <span className='text-muted-foreground hidden text-xs sm:block'>
            {selectedShot?.title || t('Entire project')}
          </span>
          {step === 'story' && (
            <Button
              size='sm'
              variant='outline'
              disabled={!storyValid || (!progress.story && !progress.edit)}
              onClick={() => setStep(progress.edit ? 'edit' : 'shots')}
            >
              {t(
                progress.edit
                  ? 'Continue editing imported footage'
                  : 'Review shot draft'
              )}
            </Button>
          )}
          {step === 'shots' && (
            <Button
              size='sm'
              disabled={
                !screenplayValid ||
                !progress.shots ||
                !!props.project.production?.screenplayDraft
              }
              onClick={() => setStep('visual')}
            >
              {t('Confirm shots and prepare pictures')}
            </Button>
          )}
          {step === 'visual' && (
            <div className='flex min-w-0 gap-2'>
              <Button
                size='sm'
                variant={completedVideo ? 'default' : 'outline'}
                disabled={!progress.edit}
                onClick={() => setStep('edit')}
              >
                {t('Edit completed footage')}
              </Button>
              {completedImage && selectedShot && (
                <Button
                  size='sm'
                  onClick={() => selectShot(selectedShot.videoNodeId)}
                >
                  {t('Continue to video')}
                </Button>
              )}
              {controller.selectedNodes.length > 0 &&
                !completedImage &&
                !completedVideo && (
                  <Button
                    size='sm'
                    aria-label={t('Review and generate selected footage')}
                    disabled={runDisabled}
                    onClick={() => runButton.current?.click()}
                  >
                    {t(generationLabel)}
                  </Button>
                )}
            </div>
          )}
          {step === 'edit' && (
            <Button
              size='sm'
              disabled={!controller.captionsReady || !progress.edit}
              onClick={() => setStep('deliver')}
            >
              {t('Check and export video')}
            </Button>
          )}
          {step === 'deliver' && (
            <Button
              size='sm'
              disabled={exportDisabled}
              onClick={() => exportButton.current?.click()}
            >
              {t('Export video')}
            </Button>
          )}
        </footer>
        <Sheet open={shotsOpen} onOpenChange={setShotsOpen}>
          <SheetContent side='left' className='w-full sm:max-w-sm'>
            <SheetHeader>
              <SheetTitle>{t('Project shots')}</SheetTitle>
            </SheetHeader>
            <div className='min-h-0 overflow-y-auto'>{shotList}</div>
          </SheetContent>
        </Sheet>
        <Sheet
          open={!!tool}
          onOpenChange={(open) => {
            if (!open) setTool(null)
          }}
        >
          <SheetContent className='w-full sm:max-w-2xl'>
            <SheetHeader>
              <SheetTitle>
                {t(`studio.workspace.tool.${tool || 'assistant'}`)} ·{' '}
                {selectedShot?.title || props.project.title}
              </SheetTitle>
            </SheetHeader>
            <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6'>
              <Tabs
                value={tool || ''}
                onValueChange={(value) => setActiveTab(value || '')}
              >
                {tool === 'assistant' && <StudioProjectAssistant inline />}
                {tool === 'assets' && <StudioWorkspaceAssets />}
                {tool === 'media' && <StudioProductionMediaTab active />}
                {tool === 'previs' && <StudioProductionPrevisTab />}
                {tool === 'review' && <StudioProductionReviewTab />}
                {tool === 'versions' && <StudioProductionVersionsTab />}
                {tool === 'members' && <StudioProductionMembersTab />}
                {tool === 'share' && (
                  <div className='space-y-4'>
                    <p>
                      {t(
                        'Choose whether someone should watch the film or help edit the project.'
                      )}
                    </p>
                    <StudioProductionDeliveryTab inline sharingOnly />
                    <Button
                      variant='outline'
                      onClick={() => setTool('members')}
                    >
                      {t('Invite someone to edit')}
                    </Button>
                  </div>
                )}
                {tool === 'planning' && (
                  <StudioProductionPlanTab value='planning' />
                )}
              </Tabs>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </StudioProductionContext.Provider>
  )
}
