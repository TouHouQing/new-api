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
import {
  MiniMap,
  NodeResizer,
  applyNodeChanges,
  type NodeProps,
  type ReactFlowInstance,
  type NodeChange,
} from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Canvas } from '@/components/ai-elements/canvas'
import { Dialog } from '@/components/dialog'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Input } from '@/components/ui/input'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import {
  type StudioCanvasEdge,
  type StudioCanvasNode,
  isValidStudioConnection,
} from './canvas-flow'
import type { StudioProject } from './local-projects'
import {
  STUDIO_NODE_CATALOG,
  STUDIO_WORKFLOW_TEMPLATES,
  applyStudioCanvasOperations,
  studioNodeBusy,
  type StudioCanvasHistory,
  type StudioCanvasOperation,
} from './studio-canvas-commands'
import { studioCanvasNodeVisible } from './studio-canvas-filters'
import {
  reconcileStudioFrames,
  planStudioFrameChanges,
  type StudioCanvasFrame,
} from './studio-canvas-frames'
import { StudioNode } from './studio-node'
import { StudioCanvasFilters } from './studio-node-organization'

export function StudioFrameNode(props: {
  data: StudioCanvasNode['data']
  selected?: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const frame = props.data.canvasFrame as StudioCanvasFrame
  const [title, setTitle] = useState(frame.title)
  const cancelBlur = useRef(false)
  useEffect(() => setTitle(frame.title), [frame.title])
  const readOnly = props.data.frameReadOnly === true
  return (
    <div
      className='bg-primary/5 h-full w-full rounded-xl border-2'
      style={{ borderColor: frame.color || 'var(--primary)' }}
    >
      <NodeResizer
        isVisible={props.selected && !readOnly}
        minWidth={160}
        minHeight={100}
      />
      <div className='flex h-10 items-center gap-2 px-3'>
        <Input
          className='nodrag nowheel h-7 min-w-0 border-none bg-transparent font-semibold shadow-none'
          aria-label={t('Canvas group name')}
          value={title}
          disabled={readOnly}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (cancelBlur.current) {
              cancelBlur.current = false
              return
            }
            const value = title.trim()
            if (!value) {
              setTitle(frame.title)
              return
            }
            if (value !== frame.title) {
              ;(props.data.renameFrame as (title: string) => void)(value)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              cancelBlur.current = true
              setTitle(frame.title)
              e.currentTarget.blur()
            }
          }}
        />
        <span className='text-muted-foreground text-xs'>
          {formatNumber(frame.nodeIds.length, locale)}
        </span>
      </div>
    </div>
  )
}
function StudioCanvasNodeView(props: NodeProps<StudioCanvasNode>) {
  return props.data.canvasFrame ? (
    <StudioFrameNode {...props} />
  ) : (
    <StudioNode {...props} />
  )
}
const nodeTypes = { studio: StudioCanvasNodeView }
type Props = {
  readOnly?: boolean
  project: StudioProject
  nodes: StudioCanvasNode[]
  history: StudioCanvasHistory
  onEdit: (
    edit: (project: StudioProject) => StudioProject,
    capture?: boolean
  ) => void
  onSelect: (nodeId: string | null) => void
  onRun: (nodeId: string) => void
  onError: (message: string) => void
}

export function StudioCanvasEditor(props: Props) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const root = useRef<HTMLDivElement>(null)
  const instance = useRef<ReactFlowInstance<
    StudioCanvasNode,
    StudioCanvasEdge
  > | null>(null)
  const clipboard = useRef<{ project: StudioProject; ids: string[] } | null>(
    null
  )
  const dragCaptured = useRef(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [addPosition, setAddPosition] = useState<{ x: number; y: number }>()
  const [mouseMode, setMouseMode] = useState<'select' | 'hand'>('select')
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [contextNodeId, setContextNodeId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(props.project.canvas?.viewport?.zoom || 1)
  const edit: Props['onEdit'] = (update, capture) => {
    if (props.readOnly) return
    try {
      props.onEdit(update, capture)
    } catch (error) {
      props.onError(error instanceof Error ? error.message : String(error))
    }
  }
  const selectedIds = props.project.nodes
    .filter(
      (node) =>
        node.selected && studioCanvasNodeVisible(node, props.project.canvas)
    )
    .map((node) => node.id)
  const contextNode = props.project.nodes.find(
    (node) => node.id === contextNodeId
  )
  const contextIds =
    contextNodeId && !selectedIds.includes(contextNodeId)
      ? [contextNodeId]
      : selectedIds
  const canRemove =
    contextIds.length > 0 &&
    !props.project.nodes.some(
      (node) => contextIds.includes(node.id) && studioNodeBusy(node)
    )
  const apply = (operations: StudioCanvasOperation[]) => {
    edit((project) =>
      applyStudioCanvasOperations(project, operations, undefined, (key) =>
        t(key)
      )
    )
  }
  const focus = (nodeId?: string) => {
    void instance.current?.fitView({
      duration: 180,
      padding: 0.25,
      maxZoom: 1.1,
      ...(nodeId ? { nodes: [{ id: nodeId }] } : {}),
    })
    if (nodeId) props.onSelect(nodeId)
  }

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || !root.current?.contains(target)) {
        return
      }
      if (
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"]'
        )
      ) {
        return
      }
      if (paletteOpen) return
      const modifier = event.metaKey || event.ctrlKey
      const ids = props.project.nodes
        .filter(
          (node) =>
            node.selected && studioCanvasNodeVisible(node, props.project.canvas)
        )
        .map((node) => node.id)
      if (
        event.code === 'Space' &&
        !modifier &&
        !target.closest('button, [role="button"]')
      ) {
        event.preventDefault()
        setSpaceHeld(true)
        return
      }
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        edit(
          (project) =>
            event.shiftKey
              ? props.history.redo(project)
              : props.history.undo(project),
          false
        )
        return
      }
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (modifier && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        edit(
          (project) => ({
            ...project,
            nodes: project.nodes.map((node) => ({
              ...node,
              selected: studioCanvasNodeVisible(node, project.canvas),
            })),
          }),
          false
        )
        return
      }
      if (modifier && event.key.toLowerCase() === 'c' && ids.length) {
        event.preventDefault()
        clipboard.current = { project: structuredClone(props.project), ids }
        return
      }
      if (modifier && event.key.toLowerCase() === 'v' && clipboard.current) {
        event.preventDefault()
        const copy = clipboard.current
        edit((project) => {
          const duplicated = applyStudioCanvasOperations(copy.project, [
            { op: 'duplicate', nodeIds: copy.ids },
          ])
          const sourceIds = new Set(copy.project.nodes.map((node) => node.id))
          const copiedNodes = duplicated.nodes.filter(
            (node) => !sourceIds.has(node.id)
          )
          const copiedIds = new Set(copiedNodes.map((node) => node.id))
          const copiedEdges = duplicated.edges.filter(
            (edge) => copiedIds.has(edge.source) && copiedIds.has(edge.target)
          )
          if (
            project.nodes.length + copiedNodes.length > 500 ||
            project.edges.length + copiedEdges.length > 1000
          ) {
            throw new Error(t('studio.canvas.limit'))
          }
          return {
            ...project,
            nodes: [
              ...project.nodes.map((node) => ({ ...node, selected: false })),
              ...copiedNodes,
            ],
            edges: [...project.edges, ...copiedEdges],
            canvas: {
              ...project.canvas,
              frames: [
                ...(project.canvas?.frames || []),
                ...(duplicated.canvas?.frames || []).filter((frame) =>
                  frame.nodeIds.every((id) => copiedIds.has(id))
                ),
              ],
            },
            updatedAt: new Date().toISOString(),
          }
        })
        return
      }
      if (modifier && event.key.toLowerCase() === 'd' && ids.length) {
        event.preventDefault()
        apply([{ op: 'duplicate', nodeIds: ids }])
        return
      }
      if (modifier && event.key.toLowerCase() === 'g' && ids.length) {
        event.preventDefault()
        const frames = (props.project.canvas?.frames || []).filter((f) =>
          f.nodeIds.every((id) => ids.includes(id))
        )
        if (event.shiftKey && frames.length) {
          apply([{ op: 'ungroup_nodes', frameIds: frames.map((f) => f.id) }])
        } else if (!event.shiftKey && ids.length > 1) {
          apply([{ op: 'group_nodes', nodeIds: ids }])
        }
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        const edges = props.project.edges
          .filter((edge) => edge.selected)
          .map((edge) => edge.id)
        const operations: StudioCanvasOperation[] = []
        if (ids.length) operations.push({ op: 'remove_nodes', nodeIds: ids })
        if (edges.length) operations.push({ op: 'disconnect', edgeIds: edges })
        if (operations.length) apply(operations)
        return
      }
      if (!modifier && event.key.toLowerCase() === 'h') setMouseMode('hand')
      if (!modifier && event.key.toLowerCase() === 'v') setMouseMode('select')
      if (!modifier && event.key.toLowerCase() === 'f') focus()
    }
    const releaseSpace = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false)
    }
    const releaseFocus = () => setSpaceHeld(false)
    window.addEventListener('keydown', keyboard)
    window.addEventListener('keyup', releaseSpace)
    window.addEventListener('blur', releaseFocus)
    return () => {
      window.removeEventListener('keydown', keyboard)
      window.removeEventListener('keyup', releaseSpace)
      window.removeEventListener('blur', releaseFocus)
    }
  })

  const onNodesChange = (changes: NodeChange<StudioCanvasNode>[]) => {
    const batch = planStudioFrameChanges(props.project, changes)
    if (
      changes.some(
        (change) => change.type === 'dimensions' && change.resizing === false
      )
    ) {
      dragCaptured.current = false
    }
    if (!batch.nodeChanges.length && !batch.operations.length) return
    const frameIds = new Set(props.project.canvas?.frames?.map((f) => f.id))
    const moving = changes.some(
      (change) =>
        change.type === 'position' ||
        (change.type === 'dimensions' &&
          frameIds.has(change.id) &&
          change.resizing)
    )
    const capture = moving && !dragCaptured.current
    if (capture) dragCaptured.current = true
    edit((project) => {
      let next = {
        ...project,
        nodes: applyNodeChanges(batch.nodeChanges, project.nodes),
      }
      if (batch.operations.length) {
        next = applyStudioCanvasOperations(next, batch.operations)
      }
      if (
        changes.some((c) => c.type === 'dimensions' && c.resizing === false)
      ) {
        dragCaptured.current = false
      }
      return reconcileStudioFrames(next)
    }, capture)
  }
  const contextLocked = props.project.nodes
    .filter((node) => contextIds.includes(node.id))
    .every((node) => node.data.locked)
  useEffect(() => {
    clipboard.current = null
    setContextNodeId(null)
    dragCaptured.current = false
  }, [props.project.id])
  const pan = mouseMode === 'hand' || spaceHeld
  return (
    <div
      ref={root}
      data-studio-canvas
      className='relative h-full min-h-0'
      tabIndex={0}
      aria-label={t('studio.canvas.workspace')}
    >
      <ContextMenu>
        <ContextMenuTrigger className='block h-full'>
          <Canvas<StudioCanvasNode, StudioCanvasEdge>
            key={props.project.id}
            nodes={[
              ...(props.project.canvas?.frames || []).map(
                (frame): StudioCanvasNode => ({
                  id: frame.id,
                  type: 'studio',
                  position: { x: frame.x, y: frame.y },
                  width: frame.width,
                  height: frame.height,
                  style: { width: frame.width, height: frame.height },
                  selected: frame.nodeIds.every((id) =>
                    selectedIds.includes(id)
                  ),
                  zIndex: 0,
                  connectable: false,
                  draggable:
                    !props.readOnly &&
                    !props.project.nodes.some(
                      (n) => frame.nodeIds.includes(n.id) && n.data.locked
                    ),
                  hidden: !props.project.nodes.some(
                    (n) =>
                      frame.nodeIds.includes(n.id) &&
                      studioCanvasNodeVisible(n, props.project.canvas)
                  ),
                  data: {
                    kind: 'text',
                    title: frame.title,
                    prompt: '',
                    canvasFrame: frame,
                    frameReadOnly: props.readOnly,
                    renameFrame: (title: string) =>
                      apply([
                        {
                          op: 'update_frame',
                          frameId: frame.id,
                          patch: { title },
                        },
                      ]),
                  },
                })
              ),
              ...props.nodes.map((node) => ({
                ...node,
                hidden:
                  !!node.hidden ||
                  !studioCanvasNodeVisible(node, props.project.canvas),
                data: {
                  ...node.data,
                  presentationDensity:
                    props.project.canvas?.displayDensity || 'normal',
                },
                draggable: !node.data.locked,
                zIndex: 1,
              })),
            ]}
            edges={props.project.edges.map((edge) => ({
              ...edge,
              hidden:
                !!edge.hidden ||
                props.project.nodes.some(
                  (node) =>
                    (node.id === edge.source || node.id === edge.target) &&
                    !studioCanvasNodeVisible(node, props.project.canvas)
                ),
            }))}
            nodeTypes={nodeTypes}
            showControls={false}
            defaultViewport={props.project.canvas?.viewport}
            fitView={!props.project.canvas?.viewport}
            fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }}
            minZoom={0.1}
            maxZoom={4}
            deleteKeyCode={null}
            panOnDrag={pan ? true : [1, 2]}
            selectionOnDrag={!pan}
            nodesDraggable={!pan && !props.readOnly}
            nodesConnectable={!props.readOnly}
            edgesReconnectable={!props.readOnly}
            snapToGrid={props.project.canvas?.snapToGrid || false}
            snapGrid={[20, 20]}
            onInit={(flow) => {
              instance.current = flow
            }}
            onNodeClick={(_, node) => {
              const frame = props.project.canvas?.frames?.find(
                (f) => f.id === node.id
              )
              if (frame) {
                edit(
                  (project) => ({
                    ...project,
                    nodes: project.nodes.map((n) => ({
                      ...n,
                      selected: frame.nodeIds.includes(n.id),
                    })),
                  }),
                  false
                )
                props.onSelect(null)
              } else props.onSelect(node.id)
            }}
            onPaneClick={() => {
              props.onSelect(null)
              root.current?.focus({ preventScroll: true })
            }}
            onNodeContextMenu={(_, node) => {
              const frame = props.project.canvas?.frames?.find(
                (f) => f.id === node.id
              )
              if (frame) {
                setContextNodeId(null)
                edit(
                  (project) => ({
                    ...project,
                    nodes: project.nodes.map((n) => ({
                      ...n,
                      selected: frame.nodeIds.includes(n.id),
                    })),
                  }),
                  false
                )
                return
              }
              setContextNodeId(node.id)
              props.onSelect(node.id)
            }}
            onPaneContextMenu={(event) => {
              setContextNodeId(null)
              setAddPosition(
                instance.current?.screenToFlowPosition({
                  x: event.clientX,
                  y: event.clientY,
                })
              )
            }}
            onDoubleClick={(event) => {
              if (
                !(event.target instanceof HTMLElement) ||
                !event.target.closest('.react-flow__pane')
              ) {
                return
              }
              setAddPosition(
                instance.current?.screenToFlowPosition({
                  x: event.clientX,
                  y: event.clientY,
                })
              )
              setPaletteOpen(true)
            }}
            onMoveEnd={(_, viewport) => {
              setZoom(viewport.zoom)
              edit(
                (project) => ({
                  ...project,
                  canvas: { ...project.canvas, viewport },
                }),
                false
              )
            }}
            onNodesChange={onNodesChange}
            onNodeDragStop={() => {
              dragCaptured.current = false
            }}
            onEdgesChange={(changes) => {
              const removed = changes
                .filter((change) => change.type === 'remove')
                .map((change) => change.id)
              if (removed.length) {
                apply([{ op: 'disconnect', edgeIds: removed }])
              }
              const selection = new Map(
                changes
                  .filter((change) => change.type === 'select')
                  .map((change) => [change.id, change.selected])
              )
              if (selection.size) {
                edit(
                  (project) => ({
                    ...project,
                    edges: project.edges.map((edge) =>
                      selection.has(edge.id)
                        ? { ...edge, selected: selection.get(edge.id) }
                        : edge
                    ),
                  }),
                  false
                )
              }
            }}
            isValidConnection={(connection) =>
              isValidStudioConnection(
                props.project.nodes,
                props.project.edges,
                connection.source,
                connection.target,
                connection.sourceHandle,
                connection.targetHandle
              )
            }
            onConnect={(connection) =>
              apply([
                {
                  op: 'connect',
                  source: connection.source,
                  target: connection.target,
                  sourceHandle: connection.sourceHandle || undefined,
                  targetHandle: connection.targetHandle || undefined,
                },
              ])
            }
          >
            {props.project.canvas?.showMinimap && (
              <MiniMap
                pannable
                zoomable
                className='mb-16! rounded-lg! border!'
                maskColor='var(--muted)'
                nodeColor='var(--primary)'
              />
            )}
          </Canvas>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuGroup>
            <ContextMenuItem
              disabled={props.readOnly}
              onClick={() => setPaletteOpen(true)}
            >
              {t('studio.canvas.add')}
            </ContextMenuItem>
            {contextIds.length > 0 && (
              <>
                <ContextMenuItem
                  disabled={props.readOnly}
                  onClick={() =>
                    apply([{ op: 'duplicate', nodeIds: contextIds }])
                  }
                >
                  {t('studio.canvas.duplicate')}
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={props.readOnly}
                  onClick={() =>
                    apply(
                      contextIds.map((nodeId) => ({
                        op: 'update_node',
                        nodeId,
                        patch: { locked: !contextLocked },
                      }))
                    )
                  }
                >
                  {t(
                    contextLocked
                      ? 'studio.canvas.unlock'
                      : 'studio.canvas.lock'
                  )}
                </ContextMenuItem>
                {contextNode && (
                  <ContextMenuItem
                    disabled={props.readOnly || studioNodeBusy(contextNode)}
                    onClick={() => props.onRun(contextNode.id)}
                  >
                    {t('studio.generate')}
                  </ContextMenuItem>
                )}
                <ContextMenuItem
                  disabled={props.readOnly}
                  onClick={() => {
                    const edgeIds = props.project.edges
                      .filter(
                        (edge) =>
                          contextIds.includes(edge.source) ||
                          contextIds.includes(edge.target)
                      )
                      .map((edge) => edge.id)
                    if (edgeIds.length) apply([{ op: 'disconnect', edgeIds }])
                  }}
                >
                  {t('studio.canvas.disconnect')}
                </ContextMenuItem>
                <ContextMenuItem
                  variant='destructive'
                  disabled={props.readOnly || !canRemove}
                  onClick={() => {
                    apply([{ op: 'remove_nodes', nodeIds: contextIds }])
                    props.onSelect(null)
                  }}
                >
                  {t('studio.canvas.deleteSelection')}
                </ContextMenuItem>
              </>
            )}
            {contextIds.length > 1 && (
              <>
                <ContextMenuSeparator />
                {(
                  [
                    'align_left',
                    'align_top',
                    'distribute_horizontal',
                    'distribute_vertical',
                  ] as const
                ).map((mode) => (
                  <ContextMenuItem
                    key={mode}
                    disabled={props.readOnly}
                    onClick={() =>
                      apply([{ op: 'arrange', nodeIds: contextIds, mode }])
                    }
                  >
                    {t(`studio.canvas.${mode}`)}
                  </ContextMenuItem>
                ))}
              </>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem
              disabled={props.readOnly}
              onClick={() => apply([{ op: 'layout', direction: 'horizontal' }])}
            >
              {t('studio.canvas.layout')}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => focus()}>
              {t('studio.canvas.fit')}
            </ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
      <div
        className='bg-background/95 absolute top-3 left-3 flex max-w-[calc(100%-24px)] flex-wrap items-center gap-1 rounded-lg border p-1 shadow-sm'
        role='toolbar'
        aria-label={t('studio.canvas.tools')}
      >
        <Button
          size='xs'
          variant={mouseMode === 'select' ? 'secondary' : 'ghost'}
          aria-pressed={mouseMode === 'select'}
          onClick={() => setMouseMode('select')}
        >
          {t('studio.canvas.select')}
        </Button>
        <Button
          size='xs'
          variant={mouseMode === 'hand' ? 'secondary' : 'ghost'}
          aria-pressed={mouseMode === 'hand'}
          onClick={() => setMouseMode('hand')}
        >
          {t('studio.canvas.hand')}
        </Button>
        <Button
          size='xs'
          variant='ghost'
          onClick={() => {
            setAddPosition(undefined)
            setPaletteOpen(true)
          }}
        >
          {t('studio.canvas.search')}
        </Button>
        <Button
          size='xs'
          variant='ghost'
          aria-expanded={filtersOpen}
          disabled={props.readOnly}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          {t('Canvas filters')}
        </Button>
        <Button
          size='xs'
          variant='ghost'
          disabled={props.readOnly || selectedIds.length < 2}
          onClick={() => apply([{ op: 'group_nodes', nodeIds: selectedIds }])}
        >
          {t('Group selected nodes')}
        </Button>
        <Button
          size='xs'
          variant='ghost'
          disabled={
            props.readOnly ||
            !(props.project.canvas?.frames || []).some((f) =>
              f.nodeIds.every((id) => selectedIds.includes(id))
            )
          }
          onClick={() =>
            apply([
              {
                op: 'ungroup_nodes',
                frameIds: (props.project.canvas?.frames || [])
                  .filter((f) =>
                    f.nodeIds.every((id) => selectedIds.includes(id))
                  )
                  .map((f) => f.id),
              },
            ])
          }
        >
          {t('Ungroup selected nodes')}
        </Button>
        {filtersOpen && (
          <StudioCanvasFilters
            canvas={props.project.canvas}
            colors={[
              ...new Set(
                props.project.nodes.flatMap((node) =>
                  node.data.labelColor ? [node.data.labelColor] : []
                )
              ),
            ]}
            count={
              props.project.nodes.filter((node) =>
                studioCanvasNodeVisible(node, props.project.canvas)
              ).length
            }
            total={props.project.nodes.length}
            onChange={(canvas) => edit((project) => ({ ...project, canvas }))}
          />
        )}
      </div>
      <div
        className='bg-background/95 absolute bottom-3 left-1/2 flex max-w-[calc(100%-24px)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-xl border p-1.5 shadow-sm'
        role='toolbar'
        aria-label={t('studio.canvas.actions')}
      >
        <Button
          size='xs'
          disabled={props.readOnly}
          onClick={() => {
            setAddPosition(undefined)
            setPaletteOpen(true)
          }}
        >
          {t('studio.canvas.add')}
        </Button>
        <Button
          size='xs'
          variant='ghost'
          disabled={props.readOnly || !props.history.canUndo}
          onClick={() => edit((project) => props.history.undo(project), false)}
        >
          {t('studio.canvas.undo')}
        </Button>
        <Button
          size='xs'
          variant='ghost'
          disabled={props.readOnly || !props.history.canRedo}
          onClick={() => edit((project) => props.history.redo(project), false)}
        >
          {t('studio.canvas.redo')}
        </Button>
        <Button
          size='xs'
          variant='ghost'
          disabled={props.readOnly}
          onClick={() => apply([{ op: 'layout', direction: 'horizontal' }])}
        >
          {t('studio.canvas.layout')}
        </Button>
        <Button size='xs' variant='ghost' onClick={() => focus()}>
          {t('studio.canvas.fit')}
        </Button>
        <Button
          size='xs'
          variant='ghost'
          aria-label={t('studio.canvas.zoomOut')}
          onClick={() => void instance.current?.zoomOut({ duration: 120 })}
        >
          −
        </Button>
        <span className='text-muted-foreground min-w-10 text-center text-xs tabular-nums'>
          {formatNumber(Math.round(zoom * 100), locale)}%
        </span>
        <Button
          size='xs'
          variant='ghost'
          aria-label={t('studio.canvas.zoomIn')}
          onClick={() => void instance.current?.zoomIn({ duration: 120 })}
        >
          +
        </Button>
        <Button
          size='xs'
          variant={props.project.canvas?.snapToGrid ? 'secondary' : 'ghost'}
          aria-pressed={Boolean(props.project.canvas?.snapToGrid)}
          disabled={props.readOnly}
          onClick={() =>
            edit((project) => ({
              ...project,
              canvas: {
                ...project.canvas,
                snapToGrid: !project.canvas?.snapToGrid,
              },
            }))
          }
        >
          {t('studio.canvas.snap')}
        </Button>
        <Button
          size='xs'
          variant={props.project.canvas?.showMinimap ? 'secondary' : 'ghost'}
          aria-pressed={Boolean(props.project.canvas?.showMinimap)}
          disabled={props.readOnly}
          onClick={() =>
            edit(
              (project) => ({
                ...project,
                canvas: {
                  ...project.canvas,
                  showMinimap: !project.canvas?.showMinimap,
                },
              }),
              false
            )
          }
        >
          {t('studio.canvas.minimap')}
        </Button>
      </div>
      {props.project.nodes.length === 0 && (
        <div className='pointer-events-none absolute inset-0 flex items-center justify-center p-8 text-center'>
          <EmptyState
            title={t('studio.canvas.emptyTitle')}
            description={t('studio.canvas.emptyHint')}
            className='max-w-sm'
          />
        </div>
      )}
      <Dialog
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        title={t('studio.canvas.searchTitle')}
        description={t('studio.canvas.searchHint')}
      >
        <Command>
          <CommandInput placeholder={t('studio.canvas.searchPlaceholder')} />
          <CommandList>
            <CommandEmpty>{t('studio.canvas.noResults')}</CommandEmpty>
            <CommandGroup heading={t('studio.canvas.nodes')}>
              {STUDIO_NODE_CATALOG.map((entry) => (
                <CommandItem
                  key={entry.id}
                  disabled={props.readOnly}
                  value={`${entry.id} ${t(entry.titleKey)} ${t(entry.descriptionKey)}`}
                  onSelect={() => {
                    const id = crypto.randomUUID()
                    const position =
                      addPosition ||
                      instance.current?.screenToFlowPosition({
                        x:
                          (root.current?.getBoundingClientRect().left || 0) +
                          160,
                        y:
                          (root.current?.getBoundingClientRect().top || 0) +
                          120,
                      })
                    apply([
                      {
                        op: 'add_node',
                        id,
                        nodeType: entry.id,
                        title: t(entry.titleKey),
                        position,
                      },
                    ])
                    props.onSelect(id)
                    setPaletteOpen(false)
                  }}
                >
                  <div className='flex flex-col gap-1'>
                    <span>{t(entry.titleKey)}</span>
                    <span className='text-muted-foreground text-xs'>
                      {t(entry.descriptionKey)}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading={t('studio.canvas.templates')}>
              {STUDIO_WORKFLOW_TEMPLATES.map((template) => (
                <CommandItem
                  key={template.id}
                  disabled={props.readOnly}
                  value={`${template.id} ${t(template.titleKey)}`}
                  onSelect={() => {
                    apply([
                      {
                        op: 'apply_template',
                        templateId: template.id,
                        position: addPosition,
                      },
                    ])
                    setPaletteOpen(false)
                  }}
                >
                  {t(template.titleKey)}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading={t('studio.canvas.findNode')}>
              {props.project.nodes.map((node) => (
                <CommandItem
                  key={node.id}
                  value={`${node.id} ${node.data.title}`}
                  onSelect={() => {
                    focus(node.id)
                    setPaletteOpen(false)
                  }}
                >
                  {node.data.title}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </Dialog>
    </div>
  )
}
