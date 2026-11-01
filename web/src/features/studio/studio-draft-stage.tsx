/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

import { studioSetDraftStage } from './studio-draft-profile'
import { useStudioProductionContext } from './studio-production-context'

export function StudioDraftStage() {
  const { t } = useTranslation()
  const { props, writable, selectedNodes } = useStudioProductionContext()
  const [stage, setStage] = useState<'draft' | 'final' | null>(null)
  const [error, setError] = useState('')
  const node = props.project.nodes.find(
    (node) =>
      selectedNodes.length === 1 &&
      node.id === selectedNodes[0] &&
      node.data.kind === 'video'
  )
  if (!node) return null
  const available = node.data.model === 'wan2.2-ti2v-5b'
  return (
    <Collapsible>
      <CollapsibleTrigger render={<Button size='sm' variant='ghost' />}>
        {t('Draft and final production')}
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-2 pt-2'>
        <p className='text-sm'>
          {t('Current generation size: {{size}}', {
            size:
              node.data.resolution ||
              (node.data.ratio === '9:16' ? '384x640' : '640x384'),
          })}
        </p>
        <p className='text-muted-foreground text-xs'>
          {t(
            available
              ? 'Try up to 2 seconds at the current frame size to check the subject and motion. Final generation restores the requested duration and keeps your trial Take. Check the price before starting either version.'
              : 'This model has no separate draft profile configured. Use the free storyboard rhythm preview or test one shot without silently changing duration or model.'
          )}
        </p>
        {available && (
          <div className='flex flex-wrap gap-2'>
            <Button
              size='sm'
              variant='outline'
              disabled={!writable}
              onClick={() => setStage('draft')}
            >
              {t('Prepare a short trial')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={
                !writable ||
                !props.project.production?.finalResolutions[node.id]
              }
              onClick={() => setStage('final')}
            >
              {t('Prepare the final version')}
            </Button>
          </div>
        )}
        {error && <p role='alert'>{t(error)}</p>}
        <ConfirmDialog
          open={!!stage}
          onOpenChange={(open) => {
            if (!open) setStage(null)
          }}
          title={t(
            stage === 'draft'
              ? 'Prepare a short trial'
              : 'Prepare the final version'
          )}
          desc={t(
            'A trial limits the duration to 2 seconds and keeps a verified frame size. The final version restores your requested duration. Review the actual settings and price before starting; existing Takes are retained.'
          )}
          handleConfirm={() => {
            if (!stage) return
            try {
              props.onUpdate(studioSetDraftStage(props.project, node.id, stage))
              setStage(null)
              setError('')
            } catch (problem) {
              setError(
                problem instanceof Error ? problem.message : String(problem)
              )
              setStage(null)
            }
          }}
        />
      </CollapsibleContent>
    </Collapsible>
  )
}
