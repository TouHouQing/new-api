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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { studioCloudRequest, type StudioCloudProject } from './studio-cloud'
import { useStudioProductionContext } from './studio-production-context'
import { addStudioNode } from './workspace'

type Connector = {
  id: string
  provider: string
  label: string
  state: string
  operations: string[]
}
type Resource = { id: string; name: string; kind: string; size: number }
type Resources = { items: Resource[]; cursor: string }
const providers = [
  'Frame.io',
  'Feishu Drive',
  'Notion',
  'WebDAV storage',
  'Delivery webhook',
  'Lark',
  'Unsplash',
  'Vimeo',
  'Slack',
  'Linear',
  'Asana',
  'Descript',
  'Atlassian',
  'Baidu Drive',
  'Airtable',
  'HubSpot',
]

export function StudioConnectorPanel() {
  const { t } = useTranslation()
  const { props, path, record, mutate, jobs } = useStudioProductionContext()
  const [connection, setConnection] = useState('')
  const [action, setAction] = useState('import_media')
  const [resources, setResources] = useState<Resources>({
    items: [],
    cursor: '',
  })
  const [resource, setResource] = useState('')
  const [target, setTarget] = useState('')
  const [source, setSource] = useState('')
  const [kind, setKind] = useState<'image' | 'video' | 'audio' | 'text'>(
    'video'
  )
  const [confirmed, setConfirmed] = useState(false)
  const [status, setStatus] = useState('')
  const owner = record.data?.role === 'owner'
  const catalog = useQuery({
    queryKey: ['studio-connectors', props.userId, props.project.id],
    queryFn: () => studioCloudRequest<Connector[]>(`${path}/connectors`),
    enabled: owner && props.open,
  })
  const selected = catalog.data?.find((item) => item.id === connection)
  const sources = props.project.nodes.flatMap((node) =>
    (node.data.takes || [])
      .filter((take) => take.status === 'completed' && take.mediaId)
      .map((take, index) => ({
        value: `${node.id}:${take.id}`,
        label: `${node.data.title} · ${t('Take')} ${index + 1}`,
        nodeId: node.id,
        takeId: take.id,
        mediaId: take.mediaId || '',
        kind: node.data.kind,
      }))
  )
  const attachments = props.project.nodes.flatMap((node) =>
    (node.data.takes || []).flatMap((take, index) =>
      (take.auxiliary || []).map((item) => ({
        value: item.mediaId,
        label: `${node.data.title} · ${t('Take')} ${index + 1} · ${t(`Tool artifact ${item.role}`)}`,
        nodeId: '',
        takeId: '',
        mediaId: item.mediaId,
        kind: 'file',
      }))
    )
  )
  const deliveries = (jobs.data || [])
    .filter((job) => job.kind === 'render' && job.status === 'succeeded')
    .flatMap((job, index) => {
      const result = job.result as {
        media_id?: string
        package_media_id?: string
        delivery_label?: string
      }
      return [
        result.media_id
          ? {
              value: result.media_id,
              label: `${result.delivery_label || t('Rendered film')} ${index + 1}`,
              nodeId: '',
              takeId: '',
              mediaId: result.media_id,
              kind: 'delivery',
            }
          : null,
        result.package_media_id
          ? {
              value: result.package_media_id,
              label: `${result.delivery_label || t('Delivery package')} ${index + 1}`,
              nodeId: '',
              takeId: '',
              mediaId: result.package_media_id,
              kind: 'file',
            }
          : null,
      ].filter((item) => item !== null)
    })
  const sourceOptions = [...sources, ...attachments, ...deliveries].filter(
    (item, index, all) =>
      all.findIndex((current) => current.value === item.value) === index
  )
  const chosen = sourceOptions.find((item) => item.value === source)
  const outputs = props.project.nodes.filter(
    (node) =>
      node.data.kind === (action === 'import_context' ? 'text' : kind) &&
      !node.data.locked &&
      node.data.purpose !== 'assembly' &&
      (node.data.takes?.length || 0) < 100
  )
  const importing = action === 'import_media' || action === 'import_context'
  const writing = action === 'export_media' || action === 'notify_delivery'
  let valid = owner && selected?.state === 'configured' && !mutate.isPending
  if (writing) valid = valid && confirmed && !!chosen
  if (importing) {
    valid = valid && !!resource && outputs.some((node) => node.id === target)
  }
  if (action === 'sync_review') {
    valid = valid && !!resource && chosen?.kind === 'video'
  }
  return (
    <div className='space-y-3 border-t pt-3'>
      <p className='font-medium'>{t('Optional external connections')}</p>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Read authorized source files, bind review to exact Takes, or export to a fixed folder or page. Credentials stay on the server. These connections are optional for making and delivering a local film.'
        )}
      </p>
      {!owner && (
        <p className='text-muted-foreground text-sm'>
          {t('External connections are managed by the project owner.')}
        </p>
      )}
      {owner && catalog.isPending && (
        <p role='status'>{t('Loading connection configuration')}</p>
      )}
      {catalog.isError && (
        <p role='alert' className='text-destructive text-sm'>
          {t('Connection configuration could not be loaded')}{' '}
          <Button
            variant='outline'
            size='sm'
            onClick={() => void catalog.refetch()}
          >
            {t('Retry')}
          </Button>
        </p>
      )}
      {owner && catalog.data?.length === 0 && (
        <div className='space-y-2 text-sm'>
          <p>
            {t(
              'No external account is configured. These connections are optional for local creation and delivery.'
            )}
          </p>
          <p className='text-muted-foreground'>
            {t('For video review and delivery')}:{' '}
            {providers
              .slice(0, 5)
              .map((label) => t(label))
              .join(' · ')}
          </p>
          <Collapsible>
            <CollapsibleTrigger render={<Button size='sm' variant='outline' />}>
              {t('Browse all optional connections')}
            </CollapsibleTrigger>
            <CollapsibleContent className='text-muted-foreground pt-2'>
              {providers
                .slice(5)
                .map((label) => t(label))
                .join(' · ')}
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
      {!!catalog.data?.length && (
        <>
          <Select
            value={connection}
            onValueChange={(value) => {
              setConnection(value || '')
              const next = catalog.data?.find((item) => item.id === value)
              const operation = next?.operations.includes(action)
                ? action
                : next?.operations[0] || 'import_media'
              setAction(operation)
              setKind(operation === 'import_context' ? 'text' : 'video')
              setTarget('')
              setSource('')
              setConfirmed(false)
              setResource('')
              setResources({ items: [], cursor: '' })
              setStatus('')
            }}
          >
            <SelectTrigger aria-label={t('External connection')}>
              <SelectValue>
                {selected?.label || t('Choose a connection')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {catalog.data.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label} ·{' '}
                  {item.state === 'configured'
                    ? t('Configured; access has not been checked')
                    : t('Authorization missing or expired')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected && (
            <>
              <Select
                value={selected.operations.includes(action) ? action : null}
                onValueChange={(value) => {
                  setAction(value || 'import_media')
                  setKind(value === 'import_context' ? 'text' : 'video')
                  setTarget('')
                  setConfirmed(false)
                  setStatus('')
                }}
              >
                <SelectTrigger aria-label={t('Connection operation')}>
                  <SelectValue>
                    {selected.operations.includes(action)
                      ? t(`Connection operation ${action}`)
                      : t('Choose a connection operation')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {selected.operations.map((operation) => (
                    <SelectItem key={operation} value={operation}>
                      {t(`Connection operation ${operation}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected.provider !== 'webhook' && (
                <Button
                  variant='outline'
                  disabled={selected.state !== 'configured' || mutate.isPending}
                  onClick={() =>
                    mutate.mutate(async () => {
                      const value = await studioCloudRequest<Resources>(
                        `${path}/connectors/${encodeURIComponent(connection)}/resources`
                      )
                      setResources(value)
                      setStatus(
                        t(
                          'Authorized access verified; {{count}} resources returned.',
                          { count: value.items.length }
                        )
                      )
                    })
                  }
                >
                  {t('Check access and list files')}
                </Button>
              )}
              {['import_media', 'import_context', 'sync_review'].includes(
                action
              ) && (
                <>
                  <Select
                    value={resource}
                    onValueChange={(value) => setResource(value || '')}
                  >
                    <SelectTrigger aria-label={t('External source file')}>
                      <SelectValue>
                        {resources.items.find((item) => item.id === resource)
                          ?.name || t('Choose an external file')}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {resources.items
                        .filter(
                          (item) =>
                            !['folder', 'collection'].includes(item.kind)
                        )
                        .map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {resources.cursor && (
                    <Button
                      variant='outline'
                      disabled={mutate.isPending}
                      onClick={() =>
                        mutate.mutate(async () => {
                          const value = await studioCloudRequest<Resources>(
                            `${path}/connectors/${encodeURIComponent(connection)}/resources?cursor=${encodeURIComponent(resources.cursor)}`
                          )
                          setResources((old) => ({
                            ...value,
                            items: [
                              ...old.items,
                              ...value.items.filter(
                                (item) =>
                                  !old.items.some(
                                    (current) => current.id === item.id
                                  )
                              ),
                            ],
                          }))
                        })
                      }
                    >
                      {t('Load more external files')}
                    </Button>
                  )}
                  {selected.provider === 'webdav' &&
                    resources.items
                      .filter((item) => item.kind === 'folder')
                      .map((item) => (
                        <Button
                          key={item.id}
                          variant='outline'
                          size='sm'
                          disabled={mutate.isPending}
                          onClick={() =>
                            mutate.mutate(async () => {
                              setResources(
                                await studioCloudRequest<Resources>(
                                  `${path}/connectors/${encodeURIComponent(connection)}/resources?cursor=${encodeURIComponent(item.id)}`
                                )
                              )
                              setResource('')
                            })
                          }
                        >
                          {t('Open folder')} · {item.name}
                        </Button>
                      ))}
                </>
              )}
              {importing && (
                <>
                  <Select
                    value={kind}
                    onValueChange={(value) => {
                      if (
                        value === 'image' ||
                        value === 'video' ||
                        value === 'audio' ||
                        value === 'text'
                      ) {
                        setKind(value)
                        setTarget('')
                      }
                    }}
                  >
                    <SelectTrigger aria-label={t('Imported media type')}>
                      <SelectValue>{t(`studio.kind.${kind}`)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(action === 'import_context'
                        ? (['text'] as const)
                        : (['image', 'video', 'audio'] as const)
                      ).map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`studio.kind.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={target}
                    onValueChange={(value) => setTarget(value || '')}
                  >
                    <SelectTrigger aria-label={t('Import output node')}>
                      <SelectValue>
                        {outputs.find((node) => node.id === target)?.data
                          .title || t('Choose an output node')}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {outputs.map((node) => (
                        <SelectItem key={node.id} value={node.id}>
                          {node.data.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant='outline'
                    disabled={
                      !owner ||
                      mutate.isPending ||
                      props.project.nodes.length >= 500
                    }
                    onClick={() => {
                      const id = crypto.randomUUID()
                      const next = addStudioNode(props.project, kind, id)
                      const node = next.nodes.find((node) => node.id === id)
                      if (node) {
                        node.data.title = [
                          ...(resources.items.find(
                            (item) => item.id === resource
                          )?.name || t('Imported media')),
                        ]
                          .slice(0, 200)
                          .join('')
                        node.data.sourceMode = 'upload'
                      }
                      props.onUpdate(next)
                      setTarget(id)
                    }}
                  >
                    {t('Create an import output node')}
                  </Button>
                </>
              )}
              {!importing && (
                <Select
                  value={source}
                  onValueChange={(value) => {
                    setSource(value || '')
                    setConfirmed(false)
                  }}
                >
                  <SelectTrigger aria-label={t('Pinned source file')}>
                    <SelectValue>
                      {chosen?.label || t('Choose a source file')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {sourceOptions
                      .filter(
                        (item) =>
                          action !== 'sync_review' || item.kind === 'video'
                      )
                      .map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
              {writing && (
                <Field>
                  <FieldLabel>{t('External write confirmation')}</FieldLabel>
                  <label className='flex items-start gap-2 text-sm'>
                    <Checkbox
                      checked={confirmed}
                      disabled={!owner}
                      onCheckedChange={(value) => setConfirmed(value === true)}
                    />
                    {t(
                      'I authorize exporting this selected file or completion receipt to {{destination}}. This service may have its own storage or collaboration charges.',
                      { destination: selected.label }
                    )}
                  </label>
                </Field>
              )}
              <Button
                disabled={!valid || !selected.operations.includes(action)}
                onClick={() =>
                  mutate.mutate(async () => {
                    await props.onSave()
                    const current =
                      await studioCloudRequest<StudioCloudProject>(path)
                    await studioCloudRequest(`${path}/jobs`, 'POST', {
                      request_id: crypto.randomUUID(),
                      revision: current.revision,
                      kind: 'connector',
                      operation: {
                        connector_id: connection,
                        action,
                        external_resource_id: resource,
                        node_id: importing ? target : chosen?.nodeId,
                        media_id: chosen?.mediaId,
                        take_id: chosen?.takeId,
                        confirm_external_write: writing && confirmed,
                      },
                    })
                    setStatus(
                      t(
                        'Connection task saved. Follow its progress in the workflow list.'
                      )
                    )
                    setConfirmed(false)
                  })
                }
              >
                {t('Run the connection task')}
              </Button>
            </>
          )}
        </>
      )}
      {status && (
        <p role='status' className='text-sm'>
          {status}
        </p>
      )}
    </div>
  )
}
