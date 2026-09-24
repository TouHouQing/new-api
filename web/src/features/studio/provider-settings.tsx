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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import type { StudioProviderConfigs, StudioProviderKind } from './api'

type Props = {
  open: boolean
  initialKind: StudioProviderKind
  configs: StudioProviderConfigs
  modelCounts: Partial<Record<StudioProviderKind, number>>
  onOpenChange: (open: boolean) => void
  onSave: (
    kind: StudioProviderKind,
    baseUrl: string,
    key: string
  ) => Promise<void>
  onRefresh: (kind: StudioProviderKind) => Promise<void>
  onDelete: (kind: StudioProviderKind) => Promise<void>
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function StudioProviderSettings(props: Props) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<StudioProviderKind>(props.initialKind)
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (props.open) setKind(props.initialKind)
  }, [props.open, props.initialKind])

  useEffect(() => {
    setBaseUrl(props.configs[kind]?.baseUrl || '')
    setApiKey('')
    setError(null)
    setNotice(null)
  }, [kind, props.configs, props.open])

  const close = (open: boolean) => {
    if (!open) {
      setApiKey('')
      setError(null)
      setNotice(null)
    }
    props.onOpenChange(open)
  }

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      setApiKey('')
      setNotice(success)
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={close}
      title={t('studio.provider.settings')}
      description={t('studio.provider.description')}
      contentClassName='sm:max-w-lg'
    >
      <form
        className='flex flex-col gap-4'
        onSubmit={(event) => {
          event.preventDefault()
          void run(
            () => props.onSave(kind, baseUrl.trim(), apiKey),
            t('studio.provider.saved')
          )
        }}
      >
        <ToggleGroup
          value={[kind]}
          onValueChange={(values) => {
            if (values[0] === 'text' || values[0] === 'image') {
              setKind(values[0])
            }
          }}
          variant='outline'
          size='sm'
          aria-label={t('studio.provider.kind')}
        >
          {(['text', 'image'] as const).map((option) => (
            <ToggleGroupItem key={option} value={option}>
              {t(`studio.kind.${option}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor='studio-provider-url'>
              {t('studio.provider.baseUrl')}
            </FieldLabel>
            <Input
              id='studio-provider-url'
              type='url'
              placeholder='https://api.example.com/v1'
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              autoComplete='url'
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='studio-provider-key'>
              {t('studio.provider.apiKey')}
            </FieldLabel>
            <Input
              id='studio-provider-key'
              type='password'
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={
                props.configs[kind]?.hasKey
                  ? t('studio.provider.keepKey')
                  : t('studio.provider.enterKey')
              }
              autoComplete='new-password'
            />
            <p className='text-muted-foreground text-xs'>
              {t('studio.provider.keyHint')}
            </p>
          </Field>
        </FieldGroup>
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            type='submit'
            disabled={
              busy ||
              !baseUrl.trim() ||
              (!apiKey.trim() && !props.configs[kind]?.hasKey)
            }
          >
            {t('studio.provider.saveAndFetch')}
          </Button>
          <Button
            type='button'
            variant='outline'
            disabled={busy || !props.configs[kind]?.hasKey}
            onClick={() =>
              void run(
                () => props.onRefresh(kind),
                t('studio.provider.refreshed')
              )
            }
          >
            {t('studio.provider.refresh')}
          </Button>
          {props.configs[kind]?.hasKey && (
            <Button
              type='button'
              variant='ghost'
              disabled={busy}
              onClick={() =>
                void run(
                  () => props.onDelete(kind),
                  t('studio.provider.deleted')
                )
              }
            >
              {t('studio.provider.delete')}
            </Button>
          )}
        </div>
        {props.configs[kind]?.hasKey && (
          <p className='text-muted-foreground text-xs'>
            {t('studio.provider.availableCount', {
              count: props.modelCounts[kind] ?? 0,
            })}
          </p>
        )}
        {error && (
          <p role='alert' className='text-destructive text-sm'>
            {error}
          </p>
        )}
        {notice && (
          <p role='status' className='text-sm'>
            {notice}
          </p>
        )}
      </form>
    </Dialog>
  )
}
