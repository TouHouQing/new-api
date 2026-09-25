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
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from '@xyflow/react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Node,
  NodeContent,
  NodeFooter,
  NodeHeader,
  NodeTitle,
} from '@/components/ai-elements/node'
import { Button } from '@/components/ui/button'

import type { StudioCanvasNode } from './canvas-flow'

const PORTS = {
  text: {
    inputs: [{ id: 'brief', label: 'studio.port.brief' }],
    outputs: [
      { id: 'scene', label: 'studio.port.scene' },
      { id: 'image_prompt', label: 'studio.port.imagePrompt' },
      { id: 'video_prompt', label: 'studio.port.videoPrompt' },
    ],
  },
  image: {
    inputs: [
      { id: 'prompt', label: 'studio.port.prompt' },
      { id: 'reference_image', label: 'studio.port.referenceImage' },
    ],
    outputs: [{ id: 'image', label: 'studio.port.image' }],
  },
  video: {
    inputs: [
      { id: 'prompt', label: 'studio.port.prompt' },
      { id: 'first_frame', label: 'studio.port.firstFrame' },
      { id: 'reference_image', label: 'studio.port.referenceImage' },
      { id: 'reference_video', label: 'studio.port.referenceVideo' },
      { id: 'extend_video', label: 'studio.port.extendVideo' },
    ],
    outputs: [{ id: 'video', label: 'studio.port.video' }],
  },
} as const

const OPTIONAL_PORTS = {
  text: { inputs: [], outputs: ['image_prompt', 'video_prompt'] },
  image: { inputs: [], outputs: [] },
  video: { inputs: ['reference_image', 'extend_video'], outputs: [] },
} as const

const inputHandleClass =
  'size-3! border-2! border-primary! bg-background! transition-transform hover:scale-125'
const outputHandleClass =
  'size-3! border-2! border-background! bg-primary! transition-transform hover:scale-125'

export function StudioNode(props: NodeProps<StudioCanvasNode>) {
  const { t } = useTranslation()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const updateNodeInternals = useUpdateNodeInternals()
  const data = props.data
  const imageUrl =
    typeof data.previewUrl === 'string' ? data.previewUrl : data.outputUrl
  const ports = PORTS[data.kind]
  const optional = OPTIONAL_PORTS[data.kind]
  const usedInputs = new Set(data.usedTargetHandles || [])
  const usedOutputs = new Set(data.usedSourceHandles || [])
  const visibleInputs = ports.inputs.filter(
    (port) =>
      usedInputs.has(port.id) ||
      (advancedOpen && (optional.inputs as readonly string[]).includes(port.id))
  )
  const visibleOutputs = ports.outputs.filter(
    (port) =>
      usedOutputs.has(port.id) ||
      (advancedOpen &&
        (optional.outputs as readonly string[]).includes(port.id))
  )
  const portSignature = [
    advancedOpen,
    ...visibleInputs.map((port) => port.id),
    ...visibleOutputs.map((port) => port.id),
  ].join(':')
  useEffect(() => {
    updateNodeInternals(props.id)
  }, [props.id, portSignature, updateNodeInternals])
  return (
    <Node
      handles={{ target: false, source: false }}
      className='w-72 overflow-visible border-0'
      aria-label={data.title}
    >
      <NodeHeader>
        <NodeTitle className='flex items-center justify-between gap-2 text-sm'>
          <span className='truncate'>{data.title}</span>
          <span className='text-muted-foreground shrink-0 text-xs'>
            {t(`studio.kind.${data.kind}`)}
          </span>
        </NodeTitle>
      </NodeHeader>
      <NodeContent className='space-y-2'>
        {(data.kind !== 'image' || data.model) && (
          <p className='text-muted-foreground line-clamp-3 min-h-10 text-xs'>
            {data.prompt || t('studio.node.emptyPrompt')}
          </p>
        )}
        {data.outputText && (
          <p className='bg-muted line-clamp-4 rounded-md p-2 text-xs whitespace-pre-wrap'>
            {data.outputText}
          </p>
        )}
        {data.kind === 'image' && imageUrl && (
          <img
            src={imageUrl}
            alt={data.title}
            className='max-h-28 w-full rounded-md object-contain'
          />
        )}
        {data.kind === 'video' && data.status === 'completed' && (
          <div className='bg-muted rounded-md p-2 text-xs'>
            {t('studio.node.videoReady')}
          </div>
        )}
        {data.status && data.status !== 'idle' && (
          <span className='text-muted-foreground text-xs'>
            {t(`studio.status.${data.status}`)}
            {typeof data.progress === 'number' ? ` · ${data.progress}%` : ''}
          </span>
        )}
        {data.error && (
          <span className='text-destructive block text-xs'>{data.error}</span>
        )}
      </NodeContent>
      <NodeFooter className='flex flex-col gap-1 p-2!'>
        <div className='text-muted-foreground relative flex min-h-7 w-full items-center justify-between gap-2 text-xs'>
          <Handle
            type='target'
            position={Position.Left}
            className={inputHandleClass}
            style={{ left: -12, top: '50%' }}
            aria-label={t('studio.port.input')}
            title={t('studio.port.input')}
          />
          <span>{t('studio.port.input')}</span>
          <span>{t(`studio.kind.${data.kind}`)}</span>
          <Handle
            type='source'
            position={Position.Right}
            className={outputHandleClass}
            style={{ right: -12, top: '50%' }}
            aria-label={t('studio.port.output')}
            title={t('studio.port.output')}
          />
        </div>
        {Array.from(
          { length: Math.max(visibleInputs.length, visibleOutputs.length) },
          (_, index) => {
            const input = visibleInputs[index]
            const output = visibleOutputs[index]
            return (
              <div
                key={index}
                className='text-muted-foreground relative flex min-h-5 w-full items-center justify-between gap-2 text-[10px]'
              >
                {input ? (
                  <>
                    <Handle
                      id={input.id}
                      type='target'
                      position={Position.Left}
                      className={inputHandleClass}
                      style={{ left: -12, top: '50%' }}
                      aria-label={t(input.label)}
                      title={t(input.label)}
                    />
                    <span>{t(input.label)}</span>
                  </>
                ) : (
                  <span />
                )}
                {output && (
                  <>
                    <span className='text-right'>{t(output.label)}</span>
                    <Handle
                      id={output.id}
                      type='source'
                      position={Position.Right}
                      className={outputHandleClass}
                      style={{ right: -12, top: '50%' }}
                      aria-label={t(output.label)}
                      title={t(output.label)}
                    />
                  </>
                )}
              </div>
            )
          }
        )}
        {(optional.inputs.length > 0 || optional.outputs.length > 0) && (
          <Button
            type='button'
            variant='ghost'
            size='xs'
            className='nodrag nopan text-muted-foreground h-6 self-start px-1 text-[10px]'
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            {t(
              advancedOpen ? 'studio.port.hideAdvanced' : 'studio.port.advanced'
            )}
          </Button>
        )}
      </NodeFooter>
    </Node>
  )
}
