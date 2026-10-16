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
  const available =
    node.data.model === 'wan2.2-ti2v-5b' &&
    node.data.ratio !== '1:1' &&
    node.data.resolution !== '512x512'
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
              ? 'This local model supports a smaller draft size at the same duration and with the same references. It reduces processing size, not necessarily your bill. Final generation keeps the draft Take and may produce different motion.'
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
              {t('Prepare a smaller draft')}
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
              ? 'Prepare a smaller draft'
              : 'Prepare the final version'
          )}
          desc={t(
            'Only output size changes. The prompt, duration, seed, references and existing versions remain. Review the generation confirmation and price before starting.'
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
