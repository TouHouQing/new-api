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

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import { studioCloudRequest } from './studio-cloud'
import { StudioConnectorPanel } from './studio-connector-panel'
import { useStudioProductionContext } from './studio-production-context'

export function StudioApps() {
  const { t } = useTranslation()
  const { props, mutate } = useStudioProductionContext()
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState('')
  const apps = [
    {
      id: 'files',
      name: 'Project files and media',
      input: 'Read files you select; save new immutable assets',
      output: 'Project media and a portable project package',
      available: true,
    },
    {
      id: 'review',
      name: 'Review and delivery links',
      input:
        'Read one pinned film version; optionally accept timed review comments',
      output: 'Expiring review link, comments and a rework plan',
      available: true,
    },
    {
      id: 'agent',
      name: 'Agent and MCP workspace',
      input:
        'Access only projects allowed by the configured account and its edit/generation permissions',
      output: 'Project changes, durable jobs, review and exports',
      available: true,
    },
  ]
  return (
    <Collapsible className='mt-4 rounded-lg border p-3'>
      <CollapsibleTrigger render={<Button variant='outline' />}>
        {t('Optional delivery connections')}
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-4 pt-3'>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Connections are optional. Check the read and write scope before configuring an external agent. No external message is sent by opening this directory.'
          )}
        </p>
        {apps.map((app) => (
          <div key={app.id} className='space-y-1 border-t pt-3 text-sm'>
            <p className='font-medium'>
              {t(app.name)} ·{' '}
              {t(
                app.available
                  ? 'Available in this workspace'
                  : 'Requires an external integration'
              )}
            </p>
            <p>
              {t('Access scope')}: {t(app.input)}
            </p>
            <p>
              {t('Output')}: {t(app.output)}
            </p>
            {app.id === 'agent' && (
              <Button
                variant='outline'
                onClick={() =>
                  mutate.mutate(async () => {
                    const projects =
                      await studioCloudRequest<unknown[]>('/projects')
                    setStatus(
                      t(
                        'Connection verified; {{count}} projects are available to this account.',
                        { count: projects.length }
                      )
                    )
                  })
                }
              >
                {t('Test workspace access')}
              </Button>
            )}
          </div>
        ))}
        <StudioConnectorPanel />
        <Field>
          <FieldLabel>{t('External review URL')}</FieldLabel>
          <Input
            aria-label={t('External review URL')}
            type='url'
            value={url}
            maxLength={4096}
            onChange={(event) => setUrl(event.target.value)}
          />
        </Field>
        <Button
          variant='outline'
          disabled={!url}
          onClick={() => {
            try {
              const link = new URL(url)
              if (
                link.protocol !== 'https:' ||
                link.username ||
                link.password
              ) {
                throw new Error(t('Enter an HTTPS review URL'))
              }
              window.open(link.href, '_blank', 'noopener,noreferrer')
              setStatus(
                t('Opened for manual review. No project assets were uploaded.')
              )
            } catch (error) {
              setStatus(String(error))
            }
          }}
        >
          {t('Open external review workspace')}
        </Button>
        {status && (
          <p role='status' className='text-sm'>
            {status}
          </p>
        )}
        <p className='text-muted-foreground text-xs'>
          {t('Current project')}: {props.project.title}
        </p>
      </CollapsibleContent>
    </Collapsible>
  )
}
