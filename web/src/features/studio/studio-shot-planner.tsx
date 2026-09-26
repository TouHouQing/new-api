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
import { nanoid } from 'nanoid'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import type { StudioShotDraft } from './api'
import { planLocalStudioShots } from './studio-shot-planning'

export function StudioShotPlanner(props: {
  scopeKey: string
  models: string[]
  defaultModel?: string
  onPlan: (
    model: string,
    prompt: string,
    count: number
  ) => Promise<StudioShotDraft[]>
  onConfirm: (
    drafts: StudioShotDraft[],
    sourcePrompt: string,
    model?: string
  ) => boolean | void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [count, setCount] = useState(3)
  const [model, setModel] = useState(props.defaultModel || '')
  const plannerRevision = useRef(0)
  const [drafts, setDrafts] = useState<
    Array<StudioShotDraft & { uiId: string }>
  >([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    plannerRevision.current += 1
    setModel(props.defaultModel || '')
    setDrafts([])
  }, [props.defaultModel])
  const activeScope = useRef(props.scopeKey)
  const defaultModel = useRef(props.defaultModel)
  activeScope.current = props.scopeKey
  defaultModel.current = props.defaultModel
  useEffect(() => {
    plannerRevision.current += 1
    setOpen(false)
    setPrompt('')
    setDrafts([])
    setBusy(false)
    setError('')
    setModel(defaultModel.current || '')
  }, [props.scopeKey])
  const updateDraft = (
    index: number,
    key: keyof StudioShotDraft,
    value: string
  ) => {
    setDrafts((current) =>
      current.map((item, i) => (i === index ? { ...item, [key]: value } : item))
    )
  }
  return (
    <div className='mb-4 rounded-lg border'>
      <Button
        type='button'
        variant='ghost'
        className='w-full justify-start rounded-lg'
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {t('studio.planner.title')}
      </Button>
      {open && (
        <div className='flex flex-col gap-4 border-t p-3'>
          <p className='text-muted-foreground text-xs'>
            {t('studio.planner.hint')}
          </p>
          <div
            className='flex flex-wrap gap-2'
            aria-label={t('studio.template.title')}
          >
            {(['drama', 'product', 'social'] as const).map((template) => (
              <Button
                key={template}
                type='button'
                size='xs'
                variant='outline'
                disabled={busy}
                onClick={() => {
                  plannerRevision.current += 1
                  setPrompt(t(`studio.template.${template}Brief`))
                  setCount(3)
                  setDrafts([])
                }}
              >
                {t(`studio.template.${template}`)}
              </Button>
            ))}
          </div>
          <Textarea
            aria-label={t('studio.planner.brief')}
            placeholder={t('studio.planner.placeholder')}
            maxLength={30000}
            value={prompt}
            disabled={busy}
            onChange={(event) => {
              plannerRevision.current += 1
              setPrompt(event.target.value)
              setDrafts([])
            }}
          />
          <div className='flex flex-wrap items-end gap-3'>
            <label className='text-muted-foreground flex flex-col gap-1 text-xs'>
              {t('studio.planner.count')}
              <Input
                type='number'
                min={1}
                max={12}
                className='w-24'
                value={count}
                disabled={busy}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (Number.isInteger(value) && value >= 1 && value <= 12) {
                    plannerRevision.current += 1
                    setCount(value)
                    setDrafts([])
                  }
                }}
              />
            </label>
            <div className='min-w-52 flex-1'>
              <span className='text-muted-foreground mb-1 block text-xs'>
                {t('studio.planner.model')}
              </span>
              <Select
                value={model || null}
                disabled={busy}
                onValueChange={(value) => {
                  plannerRevision.current += 1
                  setModel(value || '')
                  setDrafts([])
                }}
                items={props.models.map((id) => ({ value: id, label: id }))}
              >
                <SelectTrigger aria-label={t('studio.planner.model')}>
                  <SelectValue placeholder={t('studio.planner.manual')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {props.models.map((id) => (
                      <SelectItem key={id} value={id}>
                        {id}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {model && (
                <Button
                  size='xs'
                  variant='ghost'
                  disabled={busy}
                  onClick={() => {
                    plannerRevision.current += 1
                    setModel('')
                    setDrafts([])
                  }}
                >
                  {t('studio.planner.manual')}
                </Button>
              )}
            </div>
            <Button
              disabled={busy || !prompt.trim()}
              onClick={async () => {
                const scope = props.scopeKey
                const revision = plannerRevision.current
                setBusy(true)
                setError('')
                setDrafts([])
                try {
                  const planned = model
                    ? await props.onPlan(model, prompt.trim(), count)
                    : planLocalStudioShots(prompt, count)
                  if (
                    activeScope.current !== scope ||
                    plannerRevision.current !== revision
                  ) {
                    return
                  }
                  if (!planned.length) {
                    throw new Error(t('studio.planner.noShots'))
                  }
                  setDrafts(
                    planned.map((draft) => ({ ...draft, uiId: nanoid() }))
                  )
                } catch (cause) {
                  if (activeScope.current === scope) {
                    setError(
                      cause instanceof Error ? cause.message : String(cause)
                    )
                  }
                } finally {
                  if (activeScope.current === scope) setBusy(false)
                }
              }}
            >
              {busy ? t('studio.generating') : t('studio.planner.preview')}
            </Button>
          </div>
          {error && (
            <p role='alert' className='text-destructive text-sm'>
              {error}
            </p>
          )}
          {drafts.length > 0 && (
            <div className='flex flex-col gap-3'>
              <p className='text-muted-foreground text-xs'>
                {t('studio.planner.review')}
              </p>
              {drafts.map((draft, index) => (
                <div
                  key={draft.uiId}
                  className='grid gap-2 rounded-lg border p-3 sm:grid-cols-2'
                >
                  <label className='text-xs'>
                    {t('studio.planner.shotTitle')}
                    <Input
                      value={draft.title}
                      maxLength={200}
                      onChange={(event) =>
                        updateDraft(index, 'title', event.target.value)
                      }
                    />
                  </label>
                  <div className='flex justify-end'>
                    <Button
                      size='xs'
                      variant='ghost'
                      onClick={() =>
                        setDrafts((current) =>
                          current.filter((_, i) => i !== index)
                        )
                      }
                    >
                      {t('studio.planner.remove')}
                    </Button>
                  </div>
                  {(
                    [
                      ['text', 'studio.text.scene'],
                      ['imagePrompt', 'studio.text.imagePrompt'],
                      ['videoPrompt', 'studio.text.videoPrompt'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className='text-xs sm:col-span-2'>
                      {t(label)}
                      <Textarea
                        value={draft[key]}
                        maxLength={30000}
                        onChange={(event) =>
                          updateDraft(index, key, event.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
              ))}
              <Button
                disabled={drafts.some(
                  (item) =>
                    !item.title.trim() ||
                    !item.text.trim() ||
                    !item.imagePrompt.trim() ||
                    !item.videoPrompt.trim()
                )}
                onClick={() => {
                  const created = props.onConfirm(
                    drafts.map(({ title, text, imagePrompt, videoPrompt }) => ({
                      title,
                      text,
                      imagePrompt,
                      videoPrompt,
                    })),
                    prompt.trim(),
                    model || undefined
                  )
                  if (created !== false) {
                    setDrafts([])
                    setOpen(false)
                  }
                }}
              >
                {t('studio.planner.create', { count: drafts.length })}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
