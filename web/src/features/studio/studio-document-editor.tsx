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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'

import {
  studioDocumentForText,
  studioDocumentSchema,
  studioDocumentText,
  type StudioDocument,
} from './studio-document'

export function StudioDocumentPreview(props: { value: StudioDocument }) {
  const { t } = useTranslation()
  let number = 0
  return (
    <div className='space-y-1 break-words' aria-label={t('Document preview')}>
      {studioDocumentForText(studioDocumentText(props.value), props.value).map(
        (block) => {
          const style = {
            color: block.color,
            fontWeight: block.bold || block.kind === 'heading' ? 700 : 400,
            fontStyle: block.italic ? 'italic' : 'normal',
          }
          if (block.kind === 'heading') {
            return (
              <h3 key={block.id} className='text-lg' style={style}>
                {block.text || '\u00a0'}
              </h3>
            )
          }
          let prefix = ''
          if (block.kind === 'bullet') prefix = '• '
          if (block.kind === 'numbered') {
            number++
            prefix = `${number}. `
          } else number = 0
          return (
            <p key={block.id} className='whitespace-pre-wrap' style={style}>
              {prefix}
              {block.text || '\u00a0'}
            </p>
          )
        }
      )}
    </div>
  )
}

export function StudioDocumentEditor(props: {
  value: StudioDocument
  onChange: (value: StudioDocument) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [history, setHistory] = useState<StudioDocument[]>([])
  const [error, setError] = useState('')
  const change = (next: StudioDocument) => {
    const parsed = studioDocumentSchema.safeParse(next)
    if (!parsed.success || studioDocumentText(next).length > 30000) {
      setError(t('Keep the document within 100 blocks and 30000 characters.'))
      return
    }
    setHistory((previous) => [
      ...previous.slice(-19),
      structuredClone(props.value),
    ])
    setError('')
    props.onChange(parsed.data)
  }
  return (
    <div className='space-y-3 rounded-lg border p-3'>
      <p className='text-muted-foreground text-xs'>
        {t('Format your draft. Only plain text is copied or sent to a model.')}
      </p>
      {studioDocumentForText(studioDocumentText(props.value), props.value).map(
        (block, index) => (
          <div key={block.id} className='space-y-2 border-b pb-3'>
            <div className='flex flex-wrap items-center gap-2'>
              <NativeSelect
                aria-label={t('Block style')}
                value={block.kind}
                disabled={props.disabled}
                onChange={(event) =>
                  change(
                    props.value.map((item, position) =>
                      position === index
                        ? {
                            ...item,
                            kind: event.target.value as typeof block.kind,
                          }
                        : item
                    )
                  )
                }
              >
                {(['paragraph', 'heading', 'bullet', 'numbered'] as const).map(
                  (kind) => (
                    <NativeSelectOption key={kind} value={kind}>
                      {t(`studio.document.${kind}`)}
                    </NativeSelectOption>
                  )
                )}
              </NativeSelect>
              {(['bold', 'italic'] as const).map((key) => (
                <Button
                  key={key}
                  size='sm'
                  variant={block[key] ? 'secondary' : 'outline'}
                  aria-pressed={block[key]}
                  disabled={props.disabled}
                  onClick={() =>
                    change(
                      props.value.map((item, position) =>
                        position === index
                          ? { ...item, [key]: !item[key] }
                          : item
                      )
                    )
                  }
                >
                  {t(key === 'bold' ? 'Bold' : 'Italic')}
                </Button>
              ))}
              <Input
                type='color'
                className='w-12'
                aria-label={t('Text color')}
                value={block.color}
                disabled={props.disabled}
                onChange={(event) =>
                  change(
                    props.value.map((item, position) =>
                      position === index
                        ? { ...item, color: event.target.value }
                        : item
                    )
                  )
                }
              />
              <Button
                size='sm'
                variant='ghost'
                disabled={props.disabled || props.value.length === 1}
                onClick={() =>
                  change(
                    props.value.filter((_, position) => position !== index)
                  )
                }
              >
                {t('Remove block')}
              </Button>
            </div>
            <Textarea
              id={index === 0 ? 'studio-prompt' : undefined}
              aria-label={t('Draft block {{number}}', { number: index + 1 })}
              value={block.text}
              maxLength={30000}
              disabled={props.disabled}
              onChange={(event) =>
                change(
                  props.value.map((item, position) =>
                    position === index
                      ? { ...item, text: event.target.value }
                      : item
                  )
                )
              }
            />
          </div>
        )
      )}
      <div className='flex flex-wrap gap-2'>
        <Button
          size='sm'
          variant='outline'
          disabled={props.disabled || props.value.length >= 100}
          onClick={() =>
            change([
              ...props.value,
              {
                id: crypto.randomUUID(),
                kind: 'paragraph',
                text: '',
                bold: false,
                italic: false,
                color: '#64748b',
              },
            ])
          }
        >
          {t('Add block')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          disabled={props.disabled || !history.length}
          onClick={() => {
            const previous = history.at(-1)
            if (previous) {
              setHistory(history.slice(0, -1))
              props.onChange(previous)
              setError('')
            }
          }}
        >
          {t('Undo formatting')}
        </Button>
        <CopyButton
          value={studioDocumentText(props.value)}
          size='sm'
          variant='outline'
          aria-label={t('Copy plain text')}
        >
          {t('Copy plain text')}
        </CopyButton>
      </div>
      {error && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
      <StudioDocumentPreview value={props.value} />
    </div>
  )
}
