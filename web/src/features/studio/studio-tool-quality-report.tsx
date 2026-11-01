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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Alert, AlertDescription } from '@/components/ui/alert'

import { studioCloudMedia } from './studio-cloud'

const schema = z.object({
  status: z.string(),
  warnings: z.array(z.string()).default([]),
  panels: z
    .array(z.object({ number: z.number(), direction: z.string() }))
    .optional(),
})
export function StudioToolQualityReport(props: {
  projectId: string
  mediaId: string
}) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['studio-tool-quality', props.projectId, props.mediaId],
    queryFn: async () =>
      schema.parse(
        JSON.parse(
          await (await studioCloudMedia(props.projectId, props.mediaId)).text()
        )
      ),
    staleTime: Infinity,
  })
  if (!query.data) {
    return (
      <p role='status'>
        {t(
          query.isError
            ? 'Quality report unavailable; inspect the result before approval.'
            : 'Loading result checks'
        )}
      </p>
    )
  }
  return (
    <Alert>
      <AlertDescription>
        <p className='font-medium'>{t('Result needs visual review')}</p>
        {query.data.warnings.map((warning) => (
          <p key={warning}>{t(warning)}</p>
        ))}
        {query.data.panels?.map((panel) => (
          <p key={panel.number}>
            {t('Panel {{number}}', { number: panel.number })}: {panel.direction}
          </p>
        ))}
      </AlertDescription>
    </Alert>
  )
}
