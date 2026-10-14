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

import { Button } from '@/components/ui/button'

import { studioMediaModelAction } from './studio-media-draft'
import { studioProductionSchema } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'

export function StudioProductionChanges() {
  const { t } = useTranslation()
  const {
    props,
    writable,
    setSelectedNodes,
    setMediaDraftNodeId,
    setActiveTab,
    setConfirm,
  } = useStudioProductionContext()
  return (
    <div className='space-y-2'>
      {props.project.production?.changes
        .filter((change) => change.status === 'pending')
        .map((change) => (
          <div
            key={change.id}
            className='flex flex-wrap items-center gap-2 rounded-lg border p-3'
          >
            <p className='grow'>
              {change.kind === 'review' && change.action
                ? `${t(`studio.production.rework.${change.action}`)} · ${change.seconds || 0}s · ${change.message.replace(/^(regenerate|edit|audio) at [\d.]+s: /, '')}`
                : change.message}
            </p>
            <Button
              disabled={!writable}
              variant='outline'
              onClick={() => {
                setSelectedNodes(change.nodeIds)
                setConfirm(false)
                const target = props.project.nodes.find(
                  (node) => node.id === change.nodeIds[0]
                )
                if (target && studioMediaModelAction(target.data.model)) {
                  setMediaDraftNodeId(target.id)
                  setActiveTab('media')
                }
              }}
            >
              {t('studio.production.selectAffected')}
            </Button>
            <Button
              disabled={!writable}
              variant='outline'
              onClick={() =>
                props.onUpdate({
                  ...props.project,
                  production: {
                    ...(props.project.production ||
                      studioProductionSchema.parse({})),
                    changes: (props.project.production?.changes || []).map(
                      (item) =>
                        item.id === change.id
                          ? { ...item, status: 'resolved' }
                          : item
                    ),
                  },
                })
              }
            >
              {t('studio.production.acceptCurrentVersion')}
            </Button>
          </div>
        ))}
    </div>
  )
}
