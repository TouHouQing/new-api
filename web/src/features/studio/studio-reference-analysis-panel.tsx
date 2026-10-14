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
import { ALL_FORMATS, BlobSource, Input as MediaInput } from 'mediabunny'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
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

import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import { fetchStudioCreationModels } from './studio-creation-models'
import { useStudioProductionContext } from './studio-production-context'
import {
  adoptStudioReferenceShots,
  studioReferenceAnalysisSchema,
  type StudioReferenceAnalysis,
} from './studio-reference-analysis'
import { addStudioNode, updateStudioNode } from './workspace'

export function StudioReferenceAnalysisPanel() {
  const { t, i18n } = useTranslation()
  const { props, writable, mutate, capabilities, path, jobs } =
    useStudioProductionContext()
  const [sourceId, setSourceId] = useState('')
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(3)
  const [samples, setSamples] = useState(3)
  const [model, setModel] = useState('')
  const [budget, setBudget] = useState('5')
  const [confirmed, setConfirmed] = useState(false)
  const [dimensions, setDimensions] = useState(['shots', 'motion'])
  const [resultId, setResultId] = useState('')
  const [edited, setEdited] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [error, setError] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const getMedia = useRef(props.getMedia)
  getMedia.current = props.getMedia
  const models = useQuery({
    queryKey: [
      'studio-creation-services',
      props.userId,
      props.project.defaults?.videoGroup || 'default',
    ],
    queryFn: () =>
      fetchStudioCreationModels(
        props.project.defaults?.videoGroup || 'default'
      ),
  })
  const available = models.data?.text || []
  const chosen =
    model || props.project.defaults?.textModel || available[0] || ''
  const sources = props.project.nodes.filter(
    (node) => node.data.kind === 'video' && node.data.mediaId
  )
  const source = sources.find((node) => node.id === sourceId)
  const results = props.project.nodes.filter(
    (node) => node.data.derivedFrom?.action === 'analyze'
  )
  const result = results.find((node) => node.id === resultId) || results.at(-1)
  useEffect(() => {
    setConfirmed(false)
  }, [sourceId, start, end, samples, chosen, budget, dimensions])
  useEffect(() => {
    if (!source?.data.mediaId) return
    let disposed = false
    let owned = ''
    setSourceUrl('')
    void getMedia
      .current(source.data.mediaId)
      .then(async (blob) => {
        if (!blob || disposed) return
        owned = URL.createObjectURL(blob)
        setSourceUrl(owned)
        const input = new MediaInput({
          source: new BlobSource(blob),
          formats: ALL_FORMATS,
        })
        try {
          const video = await input.getPrimaryVideoTrack()
          const duration = video ? await video.computeDuration() : 0
          if (duration && !disposed) {
            setStart(0)
            setEnd(Math.min(60, duration))
          }
        } finally {
          input.dispose()
        }
      })
      .catch((error) => {
        if (!disposed) setError(String(error))
      })
    return () => {
      disposed = true
      if (owned) URL.revokeObjectURL(owned)
    }
  }, [source?.data.mediaId])
  let analysis: StudioReferenceAnalysis | undefined
  const raw = edited || result?.data.outputText || ''
  try {
    if (raw) analysis = studioReferenceAnalysisSchema.parse(JSON.parse(raw))
  } catch {
    /* Keep the saved text editable for correction. */
  }
  const active = jobs.data?.find(
    (job) =>
      job.kind === 'analyze' &&
      ['queued', 'running', 'waiting', 'paused', 'uncertain'].includes(
        job.status
      )
  )
  const allowed =
    writable &&
    capabilities.data?.generation_credit_available === true &&
    source &&
    chosen &&
    confirmed &&
    !active &&
    !mutate.isPending &&
    Number(budget) > 0 &&
    Number(budget) <= 4000 &&
    Number.isInteger(samples) &&
    samples >= 2 &&
    samples <= 8 &&
    end - start >= 0.1 &&
    end - start <= 60 &&
    start >= 0 &&
    dimensions.length > 0
  const run = async (): Promise<void> => {
    if (!source?.data.mediaId) return
    const id = crypto.randomUUID()
    const next = updateStudioNode(
      addStudioNode(props.project, 'text', id),
      id,
      {
        title: t('studio.production.analyze'),
        purpose: 'note',
        model: chosen,
        textMode: 'plain',
        derivedFrom: {
          nodeId: source.id,
          mediaId: source.data.mediaId,
          takeId: source.data.selectedTakeId,
          action: 'analyze',
        },
      }
    )
    props.onUpdate(next)
    await props.onSave()
    const record = await studioCloudRequest<StudioCloudProject>(path)
    await studioCloudRequest(`${path}/jobs`, 'POST', {
      request_id: crypto.randomUUID(),
      revision: record.revision,
      kind: 'analyze',
      confirm_generation: true,
      budget: Math.round(
        Number(budget) * (capabilities.data?.quota_per_unit || 500000)
      ),
      operation: {
        node_id: id,
        media_id: source.data.mediaId,
        model: chosen,
        group: props.project.defaults?.videoGroup || 'default',
        language: i18n.language,
        samples,
        dimensions,
        edit: { start, end },
      },
    })
    setResultId(id)
    setEdited('')
    setSelected([])
    setConfirmed(false)
  }
  return (
    <Collapsible className='rounded-lg border p-3'>
      <CollapsibleTrigger render={<Button variant='outline' />}>
        {t('studio.production.analyze')}
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-3 pt-3'>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Analyze your reference video into editable suggestions. The local Qwen setup can also analyze the actual audio for speech, music and ambience candidates and estimated beats. Review these estimates before applying; other model setups provide technical audio checks.'
          )}
        </p>
        <Select
          value={sourceId || null}
          onValueChange={(value) => setSourceId(value || '')}
          items={sources.map((node) => ({
            value: node.id,
            label: node.data.title,
          }))}
        >
          <SelectTrigger aria-label={t('Reference video source')}>
            <SelectValue placeholder={t('Reference video source')} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {sources.map((node) => (
                <SelectItem value={node.id} key={node.id}>
                  {node.data.title}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {sourceUrl && (
          <video
            src={sourceUrl}
            controls
            aria-label={t('Reference video preview')}
            className='max-h-64 w-full rounded-lg bg-black'
          />
        )}
        <div className='grid grid-cols-3 gap-3'>
          {[
            {
              name: 'start',
              label: t('Start time (seconds)'),
              value: start,
              set: setStart,
            },
            {
              name: 'end',
              label: t('End time (seconds)'),
              value: end,
              set: setEnd,
            },
            {
              name: 'samples',
              label: t('Picture samples'),
              value: samples,
              set: setSamples,
            },
          ].map((field) => (
            <Field key={field.name}>
              <FieldLabel>{field.label}</FieldLabel>
              <Input
                disabled={!writable}
                type='number'
                aria-label={field.label}
                step={field.name === 'samples' ? 1 : 0.1}
                min={field.name === 'samples' ? 2 : 0}
                max={field.name === 'samples' ? 8 : undefined}
                value={field.value}
                onChange={(event) => field.set(Number(event.target.value))}
              />
            </Field>
          ))}
        </div>
        <div className='flex flex-wrap gap-3'>
          {[
            { id: 'shots', label: t('Shot breakdown') },
            { id: 'motion', label: t('Visible camera and subject motion') },
            { id: 'audio', label: t('Audio content and timing') },
          ].map((dimension) => (
            <label key={dimension.id} className='flex items-center gap-2'>
              <Checkbox
                checked={dimensions.includes(dimension.id)}
                onCheckedChange={(checked) =>
                  setDimensions((current) =>
                    checked
                      ? [...current, dimension.id]
                      : current.filter((value) => value !== dimension.id)
                  )
                }
              />
              {dimension.label}
            </label>
          ))}
        </div>
        <Select
          value={chosen || null}
          onValueChange={(value) => setModel(value || '')}
          items={available.map((value) => ({ value, label: value }))}
        >
          <SelectTrigger
            aria-label={t('Model that accepts reference pictures')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {available.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Field>
          <FieldLabel>{t('studio.production.budget')}</FieldLabel>
          <Input
            type='number'
            min='.01'
            max='4000'
            step='.01'
            value={budget}
            aria-label={t('Reference analysis budget')}
            onChange={(event) => setBudget(event.target.value)}
          />
        </Field>
        <label className='flex items-center gap-2'>
          <Checkbox
            checked={confirmed}
            disabled={!writable}
            onCheckedChange={(value) => setConfirmed(value === true)}
          />
          {t('Allow only reference analysis within this budget')}
        </label>
        <Button
          disabled={!allowed}
          onClick={() =>
            mutate.mutate(run, { onError: (error) => setError(error.message) })
          }
        >
          {t('Analyze this reference')}
        </Button>
        {active && (
          <p role='status'>
            {t(`studio.production.status.${active.status}`)} · {active.progress}
            %
          </p>
        )}
        {!!results.length && (
          <Select
            value={result?.id || null}
            onValueChange={(value) => {
              setResultId(value || '')
              setEdited('')
              setSelected([])
            }}
            items={results.map((node) => ({
              value: node.id,
              label: node.data.title,
            }))}
          >
            <SelectTrigger aria-label={t('Saved reference analyses')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {results.map((node) => (
                  <SelectItem key={node.id} value={node.id}>
                    {node.data.title}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
        {analysis && (
          <div className='space-y-3'>
            <p>{analysis.summary}</p>
            <p className='text-muted-foreground text-sm'>{analysis.motion}</p>
            <p className='text-muted-foreground text-sm'>{analysis.audio}</p>
            <p className='text-muted-foreground text-xs'>
              {analysis.limitations}
            </p>
            {analysis.shots.map((shot, index) => (
              <div
                className='space-y-2 rounded-md border p-3'
                key={shot.id || `${shot.start}-${shot.end}`}
              >
                <label className='flex items-center gap-2'>
                  <Checkbox
                    disabled={!writable}
                    checked={selected.includes(index)}
                    onCheckedChange={(checked) =>
                      setSelected((current) =>
                        checked
                          ? [...current, index]
                          : current.filter((value) => value !== index)
                      )
                    }
                  />
                  {shot.start}–{shot.end} {t('seconds')}
                </label>
                {(
                  [
                    'title',
                    'text',
                    'imagePrompt',
                    'videoPrompt',
                    'camera',
                  ] as const
                ).map((field) => (
                  <Field key={field}>
                    <FieldLabel>{t(`studio.plan.${field}`)}</FieldLabel>
                    <Textarea
                      aria-label={`${t('Reference shot')} ${index + 1} ${field}`}
                      disabled={!writable}
                      value={shot[field]}
                      onChange={(event) => {
                        if (!analysis) return
                        setEdited(
                          JSON.stringify({
                            ...analysis,
                            shots: analysis.shots.map((item, position) =>
                              position === index
                                ? { ...item, [field]: event.target.value }
                                : item
                            ),
                          })
                        )
                      }}
                    />
                  </Field>
                ))}
              </div>
            ))}
            <Button
              disabled={!writable || !selected.length || !result}
              onClick={() => {
                try {
                  if (analysis && result) {
                    props.onUpdate(
                      adoptStudioReferenceShots(
                        props.project,
                        result.id,
                        analysis,
                        selected
                      )
                    )
                  }
                  setSelected([])
                } catch (error) {
                  setError(String(error))
                }
              }}
            >
              {t('Append selected reference shots to the plan')}
            </Button>
          </div>
        )}
        {raw && !analysis && (
          <Field>
            <FieldLabel>{t('Repair reference analysis JSON')}</FieldLabel>
            <Textarea
              disabled={!writable}
              value={raw}
              onChange={(event) => setEdited(event.target.value)}
            />
          </Field>
        )}
        {error && (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
