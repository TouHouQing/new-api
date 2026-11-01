/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'

import {
  studioAssessCapability,
  type StudioModelCapabilityEntry,
} from './studio-capabilities'

export function StudioCapabilityStatus(props: {
  modelId: string
  action: string
  profiles?: StudioModelCapabilityEntry[]
  seconds?: number
}) {
  const { t } = useTranslation()
  const entry = props.profiles?.find(
    (item) => item.modelId === props.modelId && item.action === props.action
  )
  const assessment = studioAssessCapability(entry, { seconds: props.seconds })
  let support = 'Support needs checking'
  if (assessment.support === 'supported') support = 'Input support declared'
  if (assessment.support === 'unsupported') support = 'Input is not supported'
  let readiness = 'Runtime needs checking'
  if (assessment.readiness === 'ready') readiness = 'Runtime ready'
  if (assessment.readiness === 'unavailable') readiness = 'Runtime unavailable'
  if (assessment.readiness === 'stale') readiness = 'Runtime check expired'
  return (
    <span
      className='mt-2 flex flex-wrap gap-1'
      aria-label={t('Model capability evidence')}
    >
      <Badge variant='outline'>{t(support)}</Badge>
      <Badge variant='outline'>{t(readiness)}</Badge>
      <Badge variant='outline'>
        {t(
          assessment.verification === 'verified'
            ? 'Output reviewed'
            : 'Output quality not yet verified'
        )}
      </Badge>
      {assessment.evidence?.artifactUrl?.startsWith('/') && (
        <a
          className='text-primary text-xs underline'
          href={assessment.evidence.artifactUrl}
          target='_blank'
          rel='noreferrer'
          title={assessment.evidence.scope}
        >
          {t('View tested output and scope')}
        </a>
      )}
      {assessment.evidence?.scope && (
        <span className='text-muted-foreground basis-full text-xs'>
          {assessment.evidence.scope}
        </span>
      )}
    </span>
  )
}
