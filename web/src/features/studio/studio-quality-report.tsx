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

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { StudioProject } from './local-projects'

export function StudioQualityReport(props: {
  result: unknown
  project: StudioProject
  onLocate?: (nodeId: string) => void
}) {
  const { t } = useTranslation()
  const result = props.result as
    | {
        findings?: {
          node_id?: string
          code?: string
          severity?: string
          detail?: string
        }[]
      }
    | undefined
  if (!Array.isArray(result?.findings)) return null
  if (!result.findings.length) {
    return (
      <p className='text-muted-foreground text-sm'>
        {t('studio.production.qualityPassed')}
      </p>
    )
  }
  return (
    <ul className='space-y-2'>
      {result.findings.map((finding) => (
        <li
          key={`${finding.node_id}:${finding.code}:${finding.detail || ''}`}
          className='flex flex-wrap items-start gap-2 text-sm'
        >
          <Badge
            variant={finding.severity === 'error' ? 'destructive' : 'secondary'}
          >
            {t(`studio.production.severity.${finding.severity || 'warning'}`)}
          </Badge>
          <span>
            {props.project.nodes.find((node) => node.id === finding.node_id)
              ?.data.title || finding.node_id}
            : {t(`studio.production.issue.${finding.code || 'media_warning'}`)}
          </span>
          {finding.detail && (
            <span className='text-muted-foreground text-xs break-all'>
              {finding.detail}
            </span>
          )}
          {finding.node_id && props.onLocate && (
            <Button
              variant='outline'
              size='sm'
              onClick={() => props.onLocate?.(finding.node_id || '')}
            >
              {t('Select this shot for repair')}
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}
