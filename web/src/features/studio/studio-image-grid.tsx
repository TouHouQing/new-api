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

import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

export function StudioImageGrid(props: {
  disabled?: boolean
  mediaId: string
  getMedia: (id: string) => Promise<Blob | null>
  onCell: (
    blob: Blob,
    index: number,
    bounds: { x: number; y: number; width: number; height: number }
  ) => Promise<void>
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [columns, setColumns] = useState(2)
  const [rows, setRows] = useState(2)
  const [done, setDone] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const split = async (): Promise<void> => {
    if (busy || props.disabled) return
    setBusy(true)
    setError('')
    let image: ImageBitmap | undefined
    try {
      const blob = await props.getMedia(props.mediaId)
      if (!blob) throw new Error(t('Image layer source is unavailable'))
      image = await createImageBitmap(blob)
      if (
        image.width < columns ||
        image.height < rows ||
        image.width > 8192 ||
        image.height > 8192
      ) {
        throw new Error(t('Image dimensions are not suitable for this grid'))
      }
      for (let index = done; index < columns * rows; index++) {
        const row = Math.floor(index / columns),
          column = index % columns
        const x = Math.floor((image.width * column) / columns),
          y = Math.floor((image.height * row) / rows)
        const width = Math.floor((image.width * (column + 1)) / columns) - x,
          height = Math.floor((image.height * (row + 1)) / rows) - y
        const canvas = window.document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) throw new Error(t('Image editor canvas is unavailable'))
        context.drawImage(image, x, y, width, height, 0, 0, width, height)
        const cell = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (blob) =>
              blob
                ? resolve(blob)
                : reject(new Error(t('Image export failed'))),
            'image/png'
          )
        )
        await props.onCell(cell, index + 1, { x, y, width, height })
        setDone(index + 1)
        canvas.width = 0
        canvas.height = 0
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      image?.close()
      setBusy(false)
    }
  }
  return (
    <>
      <Button
        size='sm'
        variant='outline'
        disabled={props.disabled}
        onClick={() => setOpen(true)}
      >
        {t('Split image into grid cells')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value)
        }}
        title={t('Split image into grid cells')}
        description={t(
          'Create separate stored images with source links. The original image remains available.'
        )}
        footer={
          <Button
            disabled={busy || props.disabled || done === columns * rows}
            onClick={() => void split()}
          >
            {t(
              done > 0
                ? 'Continue splitting remaining cells'
                : 'Split and save cells'
            )}
          </Button>
        }
      >
        <FieldGroup>
          <Field>
            <FieldLabel>{t('Grid columns')}</FieldLabel>
            <Input
              aria-label={t('Grid columns')}
              type='number'
              min={1}
              max={4}
              value={columns}
              disabled={busy || done > 0}
              onChange={(event) => {
                const value = Number(event.target.value)
                if (Number.isInteger(value) && value >= 1 && value <= 4) {
                  setColumns(value)
                }
              }}
            />
          </Field>
          <Field>
            <FieldLabel>{t('Grid rows')}</FieldLabel>
            <Input
              aria-label={t('Grid rows')}
              type='number'
              min={1}
              max={4}
              value={rows}
              disabled={busy || done > 0}
              onChange={(event) => {
                const value = Number(event.target.value)
                if (Number.isInteger(value) && value >= 1 && value <= 4) {
                  setRows(value)
                }
              }}
            />
          </Field>
        </FieldGroup>
        <p role='status'>
          {t('Saved {{done}} of {{total}} grid cells', {
            done,
            total: columns * rows,
          })}
        </p>
        {error && (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </Dialog>
    </>
  )
}
