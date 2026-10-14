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
import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export const Route = createFileRoute('/studio-review')({
  component: StudioSharedReview,
})

function StudioSharedReview() {
  const { t } = useTranslation()
  const [credential] = useState(
    () => new URLSearchParams(window.location.hash.slice(1))
  )
  const id = credential.get('id') || ''
  const token = credential.get('token') || ''
  const [videoUrl, setVideoUrl] = useState('')
  const [name, setName] = useState('')
  const [comment, setComment] = useState('')
  const [seconds, setSeconds] = useState(0)
  const player = useRef<HTMLVideoElement>(null)
  const query = useQuery({
    queryKey: ['studio-shared-review', id],
    retry: false,
    queryFn: async () => {
      const response = await fetch(
        `/api/studio/review/${encodeURIComponent(id)}`,
        { headers: { 'X-Studio-Review-Token': token }, credentials: 'omit' }
      )
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(t('studio.production.reviewUnavailable'))
      }
      return result.data as {
        title: string
        share: { media_id: string; revision: number; allow_comments: boolean }
      }
    },
  })
  const mediaId = query.data?.share.media_id
  useEffect(() => {
    if (!mediaId) return
    const controller = new AbortController()
    let url = ''
    void fetch(
      `/api/studio/review/${encodeURIComponent(id)}/media/${encodeURIComponent(mediaId)}`,
      {
        headers: { 'X-Studio-Review-Token': token },
        credentials: 'omit',
        signal: controller.signal,
      }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(t('studio.production.reviewUnavailable'))
        }
        const blob = await response.blob()
        if (!controller.signal.aborted) {
          url = URL.createObjectURL(blob)
          setVideoUrl(url)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setVideoUrl('')
      })
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [mediaId, id, token, t])
  const submit = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/studio/review/${encodeURIComponent(id)}/comments`,
        {
          method: 'POST',
          headers: {
            'X-Studio-Review-Token': token,
            'Content-Type': 'application/json',
          },
          credentials: 'omit',
          body: JSON.stringify({ name, message: comment, seconds }),
        }
      )
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(
          result.message || t('studio.production.reviewUnavailable')
        )
      }
      setComment('')
    },
  })
  if (query.isError) {
    return <ErrorState description={t('studio.production.reviewUnavailable')} />
  }
  return (
    <main className='mx-auto max-w-4xl space-y-5 p-6'>
      <h1 className='text-2xl font-semibold'>
        {query.data?.title || t('studio.production.reviewLink')}
      </h1>
      <p>v{query.data?.share.revision}</p>
      <video
        ref={player}
        src={videoUrl}
        controls
        playsInline
        className='aspect-video w-full rounded-lg bg-black'
        onPause={() => setSeconds(player.current?.currentTime || 0)}
      />
      {query.data?.share.allow_comments && (
        <div className='space-y-3'>
          <Field>
            <FieldLabel>{t('studio.production.reviewerName')}</FieldLabel>
            <Input
              aria-label={t('studio.production.reviewerName')}
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>{t('studio.production.time')}</FieldLabel>
            <Input
              aria-label={t('studio.production.time')}
              type='number'
              min='0'
              max='3600'
              step='0.1'
              value={seconds}
              onChange={(event) => setSeconds(Number(event.target.value))}
            />
          </Field>
          <Textarea
            aria-label={t('studio.production.comment')}
            maxLength={2000}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
          <Button
            disabled={!comment.trim() || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {t('studio.production.addComment')}
          </Button>
          {submit.isSuccess && (
            <p role='status'>{t('studio.production.feedbackSaved')}</p>
          )}
        </div>
      )}
    </main>
  )
}
