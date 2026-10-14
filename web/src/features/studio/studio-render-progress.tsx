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

import { Progress } from '@/components/ui/progress'

import { useStudioProductionContext } from './studio-production-context'

export function StudioRenderProgress() {
  const { t } = useTranslation()
  const { activeRender } = useStudioProductionContext()
  if (!activeRender) return null
  return (
    <div role='status' className='flex flex-col gap-2'>
      <p className='text-muted-foreground text-sm'>
        {activeRender.status === 'queued'
          ? t('Your video is queued for rendering.')
          : t('Rendering your video: {{progress}}%', {
              progress: activeRender.progress,
            })}
      </p>
      <Progress
        aria-label={t('Render progress')}
        value={activeRender.progress}
      />
    </div>
  )
}
