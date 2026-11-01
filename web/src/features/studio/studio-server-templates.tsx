/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import { studioProjectSchema, type StudioProject } from './local-projects'
import {
  studioCloudMedia,
  studioCloudRequest,
  type StudioCloudProject,
} from './studio-cloud'
import { loadStudioVideoTemplates } from './studio-video-templates'

export type StudioServerTemplate = {
  id: string
  version: number
  name: string
  description: string
  kind: 'production' | 'parameters'
  source_project_id?: string
  source_revision?: number
  source_license: string
  sample_media_id?: string
  blueprint: StudioProject | null
  inputs: {
    id: string
    label: string
    kind: 'text' | 'number'
    path: string
    required: boolean
    default: string | number
  }[]
  bindings?: { path: string; pattern: string }[]
  slots: {
    id: string
    label: string
    kind: string
    media_id: string
    required: boolean
  }[]
  capabilities: Record<string, string | number>[]
}
type Props = {
  project: StudioProject
  readOnly?: boolean
  onSave?: () => Promise<void>
  onInstantiate?: (project: StudioProject) => void
}

function studioTemplateInputCandidates(
  project: StudioProject,
  t: (key: string) => string
): StudioServerTemplate['inputs'] {
  const result: StudioServerTemplate['inputs'] = []
  const briefLabels = {
    subject: t('Subject'),
    audience: t('Audience'),
    benefit: t('Benefit'),
    callToAction: t('Call to action'),
  }
  const brief = project.production?.creativeBrief
  for (const key of [
    'subject',
    'audience',
    'benefit',
    'callToAction',
  ] as const) {
    const value = brief?.[key]
    if (value) {
      result.push({
        id: key,
        label: briefLabels[key],
        kind: 'text',
        path: `/production/creativeBrief/${key}`,
        required: true,
        default: value,
      })
    }
  }
  const brand = project.production?.brandKit
  const brandLabels = {
    name: t('Brand name'),
    address: t('Address'),
    callToAction: t('Call to action'),
  }
  for (const key of ['name', 'address', 'callToAction'] as const) {
    const value = brand?.[key]
    if (value) {
      result.push({
        id: `brand-${key}`,
        label: brandLabels[key],
        kind: 'text',
        path: `/production/brandKit/${key}`,
        required: true,
        default: value,
      })
    }
  }
  project.nodes.forEach((node, index) => {
    if (node.data.prompt && result.length < 100) {
      result.push({
        id: `node-${index}`,
        label: node.data.title,
        kind: 'text',
        path: `/nodes/${index}/data/prompt`,
        required: true,
        default: node.data.prompt,
      })
    }
  })
  const addText = (
    id: string,
    label: string,
    path: string,
    value: string | undefined
  ) => {
    if (value && result.length < 100) {
      result.push({
        id,
        label,
        kind: 'text',
        path,
        required: true,
        default: value,
      })
    }
  }
  const profileLabels = {
    appearance: t('Appearance'),
    wardrobe: t('Wardrobe'),
    personality: t('Personality'),
    voice: t('Voice'),
    age: t('Age'),
    body: t('Body'),
    face: t('Face'),
    hair: t('Hair'),
    eyes: t('Eyes'),
    makeup: t('Makeup'),
    accessories: t('Accessories'),
    timeOfDay: t('Time of day'),
    atmosphere: t('Atmosphere'),
    lighting: t('Lighting'),
    palette: t('Palette'),
    continuity: t('Continuity'),
    avoid: t('Avoid'),
  }
  project.assets?.forEach((asset, index) => {
    addText(
      `asset-${index}`,
      `${asset.title} · ${t('Description')}`,
      `/assets/${index}/prompt`,
      asset.prompt
    )
    for (const key of Object.keys(
      profileLabels
    ) as (keyof typeof profileLabels)[]) {
      addText(
        `asset-${index}-${key}`,
        `${asset.title} · ${profileLabels[key]}`,
        `/assets/${index}/profile/${key}`,
        asset.profile?.[key]
      )
    }
  })
  project.production?.scenes?.forEach((scene, index) =>
    addText(
      `scene-${index}`,
      `${scene.title} · ${t('Scene description')}`,
      `/production/scenes/${index}/description`,
      scene.description
    )
  )
  const narrativeLabels = {
    information: t('Information'),
    emotion: t('Emotion'),
    visualBeat: t('Visual beat'),
    continuityNeeds: t('Continuity requirements'),
  }
  Object.entries(project.production?.shotNarrative || {}).forEach(
    ([id, narrative]) => {
      const shot = project.shots?.find((item) => item.id === id)
      for (const key of Object.keys(
        narrativeLabels
      ) as (keyof typeof narrativeLabels)[]) {
        addText(
          `narrative-${result.length}`,
          `${shot?.title || id} · ${narrativeLabels[key]}`,
          `/production/shotNarrative/${id}/${key}`,
          narrative[key]
        )
      }
    }
  )
  project.production?.timeline?.forEach((clip, index) =>
    addText(
      `caption-${index}`,
      `${t('Caption')} ${index + 1}`,
      `/production/timeline/${index}/caption`,
      clip.caption
    )
  )
  return result
}

function canonicalProject(value: StudioProject): string {
  const clean = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(clean)
    if (!item || typeof item !== 'object') return item
    return Object.fromEntries(
      Object.entries(item)
        .filter(
          ([key]) =>
            !['selected', 'dragging', 'measured', 'updatedAt'].includes(key)
        )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, clean(child)])
    )
  }
  return JSON.stringify(clean(studioProjectSchema.parse(value)))
}

export function StudioServerTemplates(props: Props) {
  const userId = useAuthStore((state) => state.auth.user?.id)
  if (!userId) return null
  return (
    <StudioServerTemplatesContent
      key={`${userId}:${props.project.id}`}
      {...props}
      userId={userId}
    />
  )
}

function StudioServerTemplatesContent(props: Props & { userId: number }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const key = ['studio', 'production-templates', props.userId]
  const [name, setName] = useState(props.project.title)
  const [description, setDescription] = useState('')
  const [license, setLicense] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [template, setTemplate] = useState<StudioServerTemplate | null>(null)
  const [title, setTitle] = useState('')
  const [values, setValues] = useState<Record<string, string | number>>({})
  const [media, setMedia] = useState<Record<string, string>>({})
  const [reuse, setReuse] = useState(false)
  const [sampleUrl, setSampleUrl] = useState('')
  const [notice, setNotice] = useState('')
  const [bindings, setBindings] = useState<
    NonNullable<StudioServerTemplate['bindings']>
  >([])
  const candidates = useMemo(
    () => studioTemplateInputCandidates(props.project, t),
    [props.project, t]
  )
  const primaryInputs = candidates.filter(
    (field) =>
      ['subject', 'audience', 'benefit', 'callToAction'].includes(field.id) ||
      field.id.startsWith('brand-')
  )
  const suggestedInputs = (
    primaryInputs.length ? primaryInputs : candidates
  ).map((field) => field.id)
  const [exposed, setExposed] = useState<string[] | null>(null)
  const selectedInputs = candidates.filter((field) =>
    (exposed || suggestedInputs).includes(field.id)
  )
  const linkedTargets = candidates.filter(
    (field) =>
      field.kind === 'text' &&
      !selectedInputs.some((input) => input.path === field.path)
  )
  const bindingPreview = (pattern: string) =>
    pattern.replaceAll(/\{\{([^{}]+)\}\}/g, (_token, id: string) =>
      String(selectedInputs.find((field) => field.id === id)?.default ?? '')
    )
  const invalidBindings = bindings.some((binding, index) => {
    const target = linkedTargets.find((field) => field.path === binding.path)
    const tokens = [...binding.pattern.matchAll(/\{\{([^{}]+)\}\}/g)]
    return (
      !target ||
      !tokens.length ||
      binding.pattern.length > 30000 ||
      /[{}]/.test(binding.pattern.replaceAll(/\{\{([^{}]+)\}\}/g, '')) ||
      tokens.some(
        (token) => !selectedInputs.some((field) => field.id === token[1])
      ) ||
      bindings.some(
        (other, otherIndex) =>
          otherIndex !== index && other.path === binding.path
      ) ||
      bindingPreview(binding.pattern) !== target.default
    )
  })
  const kindLabels: Record<string, string> = {
    image: t('Image'),
    video: t('Video'),
    audio: t('Audio'),
  }
  const query = useQuery({
    queryKey: key,
    queryFn: () => studioCloudRequest<StudioServerTemplate[]>('/templates'),
  })
  const sample = useQuery({
    queryKey: [...key, 'sample', template?.sample_media_id],
    enabled: !!template?.sample_media_id,
    queryFn: () => {
      if (!template?.sample_media_id) throw new Error('No template sample')
      return studioCloudMedia('', template.sample_media_id)
    },
  })
  useEffect(() => {
    setSampleUrl('')
    if (!sample.data) return
    const url = URL.createObjectURL(sample.data)
    setSampleUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [sample.data])
  const load = useMutation({
    mutationFn: (id: string) =>
      studioCloudRequest<StudioServerTemplate>(
        `/templates/${encodeURIComponent(id)}`
      ),
    onSuccess: (next) => {
      setTemplate(next)
      setTitle(`${next.name} · ${t('New project')}`)
      setValues(
        Object.fromEntries(
          next.inputs.map((field) => [field.id, field.default])
        )
      )
      setMedia({})
      setReuse(false)
      setNotice('')
      if (next.source_project_id === props.project.id) {
        setLicense(next.source_license)
        setExposed(
          candidates
            .filter((field) =>
              next.inputs.some((input) => input.path === field.path)
            )
            .map((field) => field.id)
        )
        setBindings(next.bindings || [])
      }
    },
    onError: (error) => handleServerError(error),
  })
  const save = useMutation({
    mutationFn: async (versioned: boolean) => {
      await props.onSave?.()
      const source = await studioCloudRequest<StudioCloudProject>(
        `/projects/${encodeURIComponent(props.project.id)}`
      )
      if (
        canonicalProject(source.document) !== canonicalProject(props.project)
      ) {
        throw new Error(
          t(
            'Save and refresh the project before saving its production template.'
          )
        )
      }
      const previous = versioned ? template : null
      return studioCloudRequest<StudioServerTemplate>(
        previous
          ? `/templates/${encodeURIComponent(previous.id)}`
          : '/templates',
        previous ? 'PUT' : 'POST',
        {
          id: previous?.id || `template-${crypto.randomUUID()}`,
          expected_version: previous?.version || 0,
          project_id: props.project.id,
          project_revision: source.revision,
          name: previous?.name || name,
          description: previous?.description || description,
          source_license: license,
          inputs: selectedInputs,
          bindings,
        }
      )
    },
    onSuccess: async (next) => {
      await client.invalidateQueries({ queryKey: key })
      setNotice(
        t(
          'Production template saved. Existing projects keep their original template version.'
        )
      )
      setTemplate(next)
      setSelectedId(next.id)
      setTitle(`${next.name} · ${t('New project')}`)
      setValues(
        Object.fromEntries(
          next.inputs.map((field) => [field.id, field.default])
        )
      )
      setMedia({})
      setReuse(false)
    },
    onError: (error) => handleServerError(error),
  })
  const instantiate = useMutation({
    mutationFn: async () => {
      if (!template || !props.onInstantiate) {
        throw new Error(
          t(
            'Open production templates from the project library to create a new project.'
          )
        )
      }
      return studioCloudRequest<StudioCloudProject>(
        `/templates/${encodeURIComponent(template.id)}/instantiate`,
        'POST',
        {
          project_id: `film-${crypto.randomUUID()}`,
          title,
          version: template.version,
          inputs: values,
          media,
          reuse_original_media: reuse,
        }
      )
    },
    onSuccess: (result) => {
      props.onInstantiate?.(
        studioProjectSchema.parse(result.document) as StudioProject
      )
      setTemplate(null)
    },
    onError: (error) => handleServerError(error),
  })
  const legacy = useMemo(
    () => loadStudioVideoTemplates(localStorage, props.userId),
    [props.userId]
  )
  const migrate = useMutation({
    mutationFn: async () => {
      for (const item of legacy) {
        await studioCloudRequest('/templates', 'POST', {
          id: `template-${crypto.randomUUID()}`,
          name: `${item.model} · ${item.seconds}s`,
          source_license: 'Imported personal generation parameters',
          legacy_parameters: {
            model: item.model,
            group: item.group,
            seconds: item.seconds,
            resolution: item.resolution,
            ratio: item.ratio,
          },
        })
      }
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: key })
      setNotice(
        t(
          'Advanced generation parameters imported. Your original local records are preserved.'
        )
      )
    },
    onError: (error) => handleServerError(error),
  })
  const mediaOptions = props.project.nodes
    .flatMap((node) => {
      const references = [
        node.data.mediaId,
        ...(node.data.takes || []).map((take) => take.mediaId),
      ].filter((id): id is string => !!id)
      return references.map((id) => ({
        id,
        title: node.data.title,
        kind: node.data.kind,
      }))
    })
    .filter(
      (item, index, list) =>
        list.findIndex((other) => other.id === item.id) === index
    )
  const missing =
    !!template &&
    (!title.trim() ||
      template.inputs.some(
        (field) => String(values[field.id] ?? '').trim() === ''
      ) ||
      (!reuse && template.slots.some((slot) => !media[slot.id])))
  return (
    <section
      className='flex flex-col gap-4'
      aria-label={t('My production templates')}
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='font-semibold'>{t('My production templates')}</h3>
        <Button
          variant='outline'
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          {t('Refresh')}
        </Button>
      </div>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Save the storyboard, references, edit, sound and output settings together. Each new project pins one immutable version. No model runs.'
        )}
      </p>
      {notice && (
        <Alert>
          <AlertDescription role='status'>{notice}</AlertDescription>
        </Alert>
      )}
      {query.isPending && (
        <LoadingState inline message={t('Loading templates')} />
      )}
      {query.isError && (
        <ErrorState
          description={t(
            'Templates could not be loaded. Your projects are unchanged.'
          )}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data?.length === 0 && (
        <EmptyState
          title={t('No saved production templates')}
          description={t(
            'Save one of your projects below, then reuse it on another device.'
          )}
          className='min-h-28'
        />
      )}
      {!!query.data?.length && (
        <Field>
          <FieldLabel htmlFor='studio-server-template'>
            {t('Choose a saved template')}
          </FieldLabel>
          <Select
            items={query.data.map((item) => ({
              value: item.id,
              label: `${item.name} · v${item.version}`,
            }))}
            value={selectedId}
            onValueChange={(id) => {
              if (id) {
                setSelectedId(id)
                load.mutate(id)
              }
            }}
          >
            <SelectTrigger id='studio-server-template'>
              <SelectValue placeholder={t('Choose a saved template')} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {query.data.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} · v{item.version} ·{' '}
                    {t(
                      item.kind === 'production'
                        ? 'Whole production template'
                        : 'Advanced generation parameters'
                    )}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}
      {load.isPending && (
        <LoadingState inline message={t('Loading template details')} />
      )}
      {template && (
        <Card>
          <CardHeader>
            <CardTitle>{template.name}</CardTitle>
            <CardDescription>{template.description}</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <div className='flex flex-wrap gap-2'>
              <Badge variant='secondary'>v{template.version}</Badge>
              <Badge variant='outline'>
                {t(
                  template.kind === 'production'
                    ? 'Whole production template'
                    : 'Advanced generation parameters'
                )}
              </Badge>
            </div>
            {sampleUrl && (
              <video
                src={sampleUrl}
                controls
                playsInline
                preload='metadata'
                className='max-h-64 rounded-lg'
                aria-label={t('Original template sample')}
              />
            )}
            {!template.sample_media_id && (
              <p className='text-muted-foreground text-sm'>
                {t(
                  'No finished sample is attached. Preview the editable structure before generating.'
                )}
              </p>
            )}
            {sample.isError && (
              <Button variant='outline' onClick={() => void sample.refetch()}>
                {t('Retry sample preview')}
              </Button>
            )}
            <p className='text-sm'>
              {template.kind === 'parameters' &&
              template.source_license ===
                'Imported personal generation parameters'
                ? t('Imported personal generation parameters')
                : template.source_license}
            </p>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Model requirements are preserved. Availability and generation costs are checked separately when you run the project.'
              )}
            </p>
            {!!template.inputs.length && (
              <Alert>
                <AlertDescription>
                  {t(
                    'Only explicitly linked fields change together. Other shots keep their wording. Changed generation prompts need new media; historical takes and pinned references keep their original content.'
                  )}
                </AlertDescription>
              </Alert>
            )}
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor='studio-template-project-title'>
                  {t('New project title')}
                </FieldLabel>
                <Input
                  id='studio-template-project-title'
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={200}
                />
              </Field>
              {template.inputs.map((field) => (
                <Field key={field.id}>
                  <FieldLabel htmlFor={`template-input-${field.id}`}>
                    {template.kind === 'parameters' &&
                    field.id === 'prompt' &&
                    field.path === '/nodes/0/data/prompt' &&
                    field.label === 'Video description'
                      ? t('Video description')
                      : field.label}
                  </FieldLabel>
                  <Textarea
                    id={`template-input-${field.id}`}
                    value={String(values[field.id] ?? '')}
                    onChange={(event) =>
                      setValues((previous) => ({
                        ...previous,
                        [field.id]:
                          field.kind === 'number'
                            ? Number(event.target.value)
                            : event.target.value,
                      }))
                    }
                  />
                  {!template.bindings?.some((binding) =>
                    binding.pattern.includes(`{{${field.id}}}`)
                  ) &&
                    !field.path.startsWith('/nodes/') && (
                      <FieldDescription>
                        {t(
                          'This input updates only its declared field. Edit the shot prompts in the new project or add an explicit linked-field rule before saving the template.'
                        )}
                      </FieldDescription>
                    )}
                </Field>
              ))}
              {!!template.slots.length && (
                <>
                  <Field orientation='horizontal'>
                    <Checkbox
                      id='studio-template-reuse'
                      checked={reuse}
                      onCheckedChange={(checked) => setReuse(checked === true)}
                    />
                    <FieldLabel htmlFor='studio-template-reuse'>
                      {t('Explicitly reuse my original template media')}
                    </FieldLabel>
                  </Field>
                  {!reuse &&
                    template.slots.map((slot) => (
                      <Field key={slot.id}>
                        <FieldLabel htmlFor={`template-slot-${slot.id}`}>
                          {t('Replace media')}: {slot.label} ·{' '}
                          {kindLabels[slot.kind] || slot.kind}
                        </FieldLabel>
                        <Select
                          items={mediaOptions
                            .filter((item) => item.kind === slot.kind)
                            .map((item) => ({
                              value: item.id,
                              label: `${item.title} · ${item.id}`,
                            }))}
                          value={media[slot.id] || ''}
                          onValueChange={(id) => {
                            if (id) {
                              setMedia((previous) => ({
                                ...previous,
                                [slot.id]: id,
                              }))
                            }
                          }}
                        >
                          <SelectTrigger id={`template-slot-${slot.id}`}>
                            <SelectValue
                              placeholder={t('Choose media from this project')}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {mediaOptions
                                .filter((item) => item.kind === slot.kind)
                                .map((item) => (
                                  <SelectItem key={item.id} value={item.id}>
                                    {item.title} · {item.id}
                                  </SelectItem>
                                ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FieldDescription>
                          {t(
                            'Upload replacement media to the current project first. Media from other accounts cannot be copied.'
                          )}
                        </FieldDescription>
                      </Field>
                    ))}
                </>
              )}
            </FieldGroup>
          </CardContent>
          <CardFooter className='flex flex-wrap gap-2'>
            <Button
              disabled={
                props.readOnly ||
                !props.onInstantiate ||
                missing ||
                instantiate.isPending
              }
              onClick={() => instantiate.mutate()}
            >
              {t(
                instantiate.isPending
                  ? 'Creating project'
                  : 'Create editable project'
              )}
            </Button>
            <Button
              variant='outline'
              disabled={
                props.readOnly ||
                save.isPending ||
                !license.trim() ||
                invalidBindings
              }
              onClick={() => save.mutate(true)}
            >
              {t('Publish current project as next template version')}
            </Button>
            <Button variant='ghost' onClick={() => setTemplate(null)}>
              {t('Close preview')}
            </Button>
          </CardFooter>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            {t('Save this project as a production template')}
          </CardTitle>
          <CardDescription>
            {t(
              'Only the project owner can save a template. Choose the inputs others will replace; the structure, edit and sound stay editable.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor='studio-template-name'>
                {t('Template name')}
              </FieldLabel>
              <Input
                id='studio-template-name'
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='studio-template-description'>
                {t('Template description')}
              </FieldLabel>
              <Textarea
                id='studio-template-description'
                value={description}
                maxLength={2000}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='studio-template-license'>
                {t('Source and reuse rights')}
              </FieldLabel>
              <Textarea
                id='studio-template-license'
                value={license}
                maxLength={2000}
                onChange={(event) => setLicense(event.target.value)}
                placeholder={t(
                  'Describe the source of the media and how you may reuse it.'
                )}
              />
            </Field>
            <FieldGroup>
              {candidates.map((field) => (
                <Field key={field.id} orientation='horizontal'>
                  <Checkbox
                    id={`expose-${field.id}`}
                    checked={(exposed || suggestedInputs).includes(field.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setBindings((previous) =>
                          previous.filter(
                            (binding) => binding.path !== field.path
                          )
                        )
                      }
                      setExposed((previous) =>
                        checked
                          ? [...(previous || suggestedInputs), field.id]
                          : (previous || suggestedInputs).filter(
                              (id) => id !== field.id
                            )
                      )
                    }}
                  />
                  <FieldLabel htmlFor={`expose-${field.id}`}>
                    {t('Replaceable input')}: {field.label}
                  </FieldLabel>
                </Field>
              ))}
            </FieldGroup>
            <details className='rounded-lg border p-3'>
              <summary className='cursor-pointer text-sm font-medium'>
                {t('Link creative fields (advanced)')}
              </summary>
              <div className='mt-3 flex flex-col gap-3'>
                <p className='text-muted-foreground text-sm'>
                  {t(
                    'Choose the exact field to update and place a declared input token in its original wording. The preview must exactly match the current field before saving. No automatic semantic rewrite is performed.'
                  )}
                </p>
                <p className='text-sm'>
                  {t('Available input tokens')}:{' '}
                  {selectedInputs
                    .map((field) => `{{${field.id}}}`)
                    .join(' · ') || t('Select a replaceable input first')}
                </p>
                {bindings.map((binding, index) => (
                  <div
                    key={binding.path}
                    className='flex flex-col gap-2 border-t pt-3'
                  >
                    <Field>
                      <FieldLabel htmlFor={`template-binding-target-${index}`}>
                        {t('Linked field')} {index + 1}
                      </FieldLabel>
                      <Select
                        value={binding.path}
                        items={linkedTargets.map((field) => ({
                          value: field.path,
                          label: field.label,
                        }))}
                        onValueChange={(path) => {
                          const target = linkedTargets.find(
                            (field) => field.path === path
                          )
                          if (target) {
                            setBindings((previous) =>
                              previous.map((item, position) =>
                                position === index
                                  ? {
                                      path: target.path,
                                      pattern: String(target.default),
                                    }
                                  : item
                              )
                            )
                          }
                        }}
                      >
                        <SelectTrigger id={`template-binding-target-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {linkedTargets.map((field) => (
                              <SelectItem key={field.path} value={field.path}>
                                {field.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`template-binding-pattern-${index}`}>
                        {t('Replacement pattern')} {index + 1}
                      </FieldLabel>
                      <Textarea
                        id={`template-binding-pattern-${index}`}
                        maxLength={30000}
                        value={binding.pattern}
                        onChange={(event) =>
                          setBindings((previous) =>
                            previous.map((item, position) =>
                              position === index
                                ? { ...item, pattern: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                      <FieldDescription>
                        {t('Preview with current inputs')}:{' '}
                        {bindingPreview(binding.pattern)}
                      </FieldDescription>
                    </Field>
                    <Button
                      variant='ghost'
                      onClick={() =>
                        setBindings((previous) =>
                          previous.filter(
                            (_item, position) => position !== index
                          )
                        )
                      }
                    >
                      {t('Remove linked field')} {index + 1}
                    </Button>
                  </div>
                ))}
                {invalidBindings && (
                  <Alert variant='destructive'>
                    <AlertDescription>
                      {t(
                        'Fix the linked-field rules: use known input tokens, choose each target once, and reproduce its current wording exactly.'
                      )}
                    </AlertDescription>
                  </Alert>
                )}
                <Button
                  variant='outline'
                  disabled={
                    !selectedInputs.length ||
                    bindings.length >= 100 ||
                    !linkedTargets.some(
                      (field) =>
                        !bindings.some((binding) => binding.path === field.path)
                    )
                  }
                  onClick={() => {
                    const target = linkedTargets.find(
                      (field) =>
                        !bindings.some((binding) => binding.path === field.path)
                    )
                    if (target) {
                      setBindings((previous) => [
                        ...previous,
                        { path: target.path, pattern: String(target.default) },
                      ])
                    }
                  }}
                >
                  {t('Add linked field')}
                </Button>
              </div>
            </details>
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button
            disabled={
              props.readOnly ||
              save.isPending ||
              !name.trim() ||
              !license.trim() ||
              invalidBindings
            }
            onClick={() => save.mutate(false)}
          >
            {t(save.isPending ? 'Saving template' : 'Save production template')}
          </Button>
        </CardFooter>
      </Card>
      {!!legacy.length && (
        <Alert>
          <AlertDescription className='flex flex-col gap-2'>
            <p>
              {t(
                'This device has older generation parameter presets. Import them separately; they are not whole production templates. The original records remain on this device.'
              )}
            </p>
            <Button
              variant='outline'
              disabled={migrate.isPending || props.readOnly}
              onClick={() => migrate.mutate()}
            >
              {t('Import older generation parameters')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </section>
  )
}
