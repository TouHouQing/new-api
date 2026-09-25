/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Props = {
  busy: boolean
  progress: number
  previewUrl?: string
  error?: string
  onAssemble: () => void
  onCancel: () => void
  onDownload: () => void
}

export function StudioAssemblyPanel(props: Props) {
  const { t } = useTranslation()
  return (
    <Card className='gap-3 py-3'>
      <CardHeader className='px-4'>
        <CardTitle className='text-sm'>{t('studio.assembly.title')}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3 px-4'>
        <p className='text-muted-foreground text-xs'>
          {t('studio.assembly.description')}
        </p>
        {props.previewUrl && (
          <video
            aria-label={t('studio.assembly.preview')}
            src={props.previewUrl}
            controls
            preload='metadata'
            className='aspect-video max-h-64 w-full rounded object-contain'
          />
        )}
        {props.busy && (
          <progress
            aria-label={t('studio.assembly.progress')}
            value={props.progress}
            max={100}
            className='h-2 w-full'
          />
        )}
        {props.error && (
          <p role='alert' className='text-destructive text-xs'>
            {props.error}
          </p>
        )}
        <div className='flex flex-wrap gap-2'>
          <Button size='sm' disabled={props.busy} onClick={props.onAssemble}>
            {props.busy
              ? t('studio.assembly.working')
              : t('studio.assembly.create')}
          </Button>
          {props.busy && (
            <Button size='sm' variant='outline' onClick={props.onCancel}>
              {t('studio.assembly.cancel')}
            </Button>
          )}
          {props.previewUrl && !props.busy && (
            <Button size='sm' variant='outline' onClick={props.onDownload}>
              {t('studio.assembly.download')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
