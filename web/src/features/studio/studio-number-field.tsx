/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
For commercial licensing, please contact support@quantumnous.com
*/
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

export function StudioNumberField(props: {
  id: string
  label: string
  value?: number
  min: number
  max: number
  disabled?: boolean
  optional?: boolean
  onChange: (value: number | undefined) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState({
    base: props.value,
    text: props.value === undefined ? '' : String(props.value),
  })
  const text =
    draft.base === props.value ? draft.text : String(props.value ?? '')
  const empty = !text.trim()
  const number = Number(text)
  const valid = empty
    ? !!props.optional
    : Number.isFinite(number) &&
      /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) &&
      number >= props.min &&
      number <= props.max
  return (
    <Field data-invalid={!valid}>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      <Input
        id={props.id}
        inputMode='decimal'
        value={text}
        disabled={props.disabled}
        aria-invalid={!valid}
        aria-describedby={!valid ? `${props.id}-error` : undefined}
        onChange={(event) =>
          setDraft({ base: props.value, text: event.target.value })
        }
        onBlur={() => {
          if (!valid) return
          const value = empty ? undefined : number
          if (value !== props.value) props.onChange(value)
          setDraft({ base: value, text: String(value ?? '') })
        }}
      />
      {!valid && (
        <FieldError id={`${props.id}-error`}>
          {t('Enter a number between {{min}} and {{max}}', {
            min: props.min,
            max: props.max,
          })}
        </FieldError>
      )}
    </Field>
  )
}
