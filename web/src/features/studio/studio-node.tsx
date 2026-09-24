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
import type { NodeProps } from '@xyflow/react'
import { useTranslation } from 'react-i18next'

import {
  Node,
  NodeContent,
  NodeHeader,
  NodeTitle,
} from '@/components/ai-elements/node'

import type { StudioCanvasNode } from './canvas-flow'

export function StudioNode(props: NodeProps<StudioCanvasNode>) {
  const { t } = useTranslation()
  const data = props.data
  const imageUrl =
    typeof data.previewUrl === 'string' ? data.previewUrl : data.outputUrl
  return (
    <Node
      handles={{ target: true, source: true }}
      className='w-72 border-0'
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
    </Node>
  )
}
