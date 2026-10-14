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
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

export function StudioMediaThumbnail(props: {
  mediaId: string
  kind: string
  title: string
  getMedia: (id: string) => Promise<Blob | null>
  onDuration?: (id: string, seconds: number) => void
}) {
  const { t, i18n } = useTranslation()
  const [url, setUrl] = useState(''),
    [seconds, setSeconds] = useState(0)
  const access = useRef(props.getMedia)
  access.current = props.getMedia
  useEffect(() => {
    let closed = false,
      created = ''
    access
      .current(props.mediaId)
      .then((blob) => {
        if (!blob || closed) return
        created = URL.createObjectURL(blob)
        setUrl(created)
      })
      .catch(() => {
        if (!closed) setUrl('')
      })
    return () => {
      closed = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [props.mediaId])
  const metadata = (event: React.SyntheticEvent<HTMLMediaElement>): void => {
    if (Number.isFinite(event.currentTarget.duration)) {
      setSeconds(event.currentTarget.duration)
      props.onDuration?.(props.mediaId, event.currentTarget.duration)
    }
  }
  return (
    <div className='min-w-0 space-y-1'>
      {url && props.kind === 'image' && (
        <img
          src={url}
          alt={props.title}
          loading='lazy'
          className='h-16 w-24 rounded object-cover'
        />
      )}
      {url && props.kind === 'video' && (
        <video
          src={url}
          controls
          preload='metadata'
          aria-label={props.title}
          onLoadedMetadata={metadata}
          className='h-16 w-24 rounded bg-black'
        />
      )}
      {url && props.kind === 'audio' && (
        <audio
          src={url}
          controls
          preload='metadata'
          aria-label={props.title}
          onLoadedMetadata={metadata}
          className='h-8 max-w-full'
        />
      )}
      <p className='text-muted-foreground text-xs'>
        {t(`studio.kind.${props.kind}`)}
        {seconds > 0 && (
          <>
            {' '}
            · {t('Actual duration')}:{' '}
            {formatNumber(
              seconds,
              toIntlLocale(i18n.resolvedLanguage || i18n.language)
            )}
            s
          </>
        )}
      </p>
    </div>
  )
}
