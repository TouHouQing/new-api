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
*/
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'

import type { StudioCanvasNode } from './canvas-flow'

type TextOutput = { scene: string; imagePrompt: string; videoPrompt: string }

export function StudioTextResultEditor(props: {
  node: StudioCanvasNode
  onSave?: (output: TextOutput) => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<TextOutput>({
    scene: props.node.data.outputText || '',
    imagePrompt: props.node.data.outputImagePrompt || '',
    videoPrompt: props.node.data.outputVideoPrompt || '',
  })
  useEffect(() => {
    setEditing(false)
    setDraft({
      scene: props.node.data.outputText || '',
      imagePrompt: props.node.data.outputImagePrompt || '',
      videoPrompt: props.node.data.outputVideoPrompt || '',
    })
  }, [
    props.node.id,
    props.node.data.selectedTakeId,
    props.node.data.outputText,
    props.node.data.outputImagePrompt,
    props.node.data.outputVideoPrompt,
  ])
  const fields = [
    ['scene', 'studio.text.scene'],
    ['imagePrompt', 'studio.text.imagePrompt'],
    ['videoPrompt', 'studio.text.videoPrompt'],
  ] as const
  return (
    <div className='flex flex-col gap-3 rounded-lg border p-3'>
      <div className='flex items-center justify-between gap-2'>
        <h3 className='text-sm font-medium'>{t('studio.text.results')}</h3>
        {!editing && props.onSave && (
          <Button size='sm' variant='outline' onClick={() => setEditing(true)}>
            {t('studio.text.editResults')}
          </Button>
        )}
      </div>
      {fields.map(([key, label]) => (
        <Field key={key}>
          <FieldLabel htmlFor={`studio-result-${key}`}>{t(label)}</FieldLabel>
          {editing ? (
            <Textarea
              id={`studio-result-${key}`}
              value={draft[key]}
              maxLength={key === 'scene' ? 300000 : 30000}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
            />
          ) : (
            <pre className='bg-muted max-h-40 overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap'>
              {draft[key] || t('studio.text.emptyResult')}
            </pre>
          )}
        </Field>
      ))}
      {editing && (
        <div className='flex justify-end gap-2'>
          <Button
            size='sm'
            variant='outline'
            onClick={() => {
              setDraft({
                scene: props.node.data.outputText || '',
                imagePrompt: props.node.data.outputImagePrompt || '',
                videoPrompt: props.node.data.outputVideoPrompt || '',
              })
              setEditing(false)
            }}
          >
            {t('studio.text.cancelEdit')}
          </Button>
          <Button
            size='sm'
            disabled={!Object.values(draft).some((value) => value.trim())}
            onClick={() => props.onSave?.(draft)}
          >
            {t('studio.text.saveResults')}
          </Button>
        </div>
      )}
    </div>
  )
}
