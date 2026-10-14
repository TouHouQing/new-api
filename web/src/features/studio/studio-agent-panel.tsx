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
import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { toIntlLocale } from '@/i18n/languages'
import { api } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'

import type { useStudioAgentBridge } from './studio-agent-bridge'
import { studioCloudRequest } from './studio-cloud'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  bridge: ReturnType<typeof useStudioAgentBridge>
}
export function StudioAgentPanel(props: Props) {
  const { t, i18n } = useTranslation()
  const [allowEdits, setAllowEdits] = useState(true)
  const [allowGeneration, setAllowGeneration] = useState(false)
  const [client, setClient] = useState('claude')
  const [connection, setConnection] = useState('')
  const [platformReady, setPlatformReady] = useState(false)
  const [installPath, setInstallPath] = useState('<new-api-studio>')
  const [certificateFile, setCertificateFile] = useState('')
  const clientEnvironment = {
    NEW_API_URL: window.location.origin,
    NEW_API_ACCESS_TOKEN: '<personal-access-token>',
    ...(certificateFile.trim()
      ? { NODE_EXTRA_CA_CERTS: certificateFile.trim() }
      : {}),
  }
  const jsonConfig = JSON.stringify(
    {
      mcpServers: {
        'new-api-studio': {
          command: 'node',
          args: [`${installPath.replace(/[\\/]+$/, '')}/scripts/mcp.mjs`],
          env: clientEnvironment,
        },
      },
    },
    null,
    2
  )
  const config =
    client === 'codex'
      ? `[mcp_servers.new-api-studio]\ncommand = "node"\nargs = [${JSON.stringify(`${installPath.replace(/[\\/]+$/, '')}/scripts/mcp.mjs`)}]\n\n[mcp_servers.new-api-studio.env]\n${Object.entries(
          clientEnvironment
        )
          .map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
          .join('\n')}`
      : jsonConfig
  const [downloading, setDownloading] = useState(false)
  const download = async () => {
    setDownloading(true)
    try {
      const response = await api.get<Blob>('/api/studio/bridge/skill', {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(response.data)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'new-api-studio.zip'
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (error) {
      handleServerError(error)
    } finally {
      setDownloading(false)
    }
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('studio.agent.title')}
      description={t('studio.agent.description')}
    >
      <div className='flex flex-col gap-4'>
        <dl className='grid grid-cols-[auto_1fr] gap-2 text-sm'>
          <dt>{t('Platform API')}</dt>
          <dd>{t(platformReady ? 'Reachable' : 'Not verified')}</dd>
          <dt>{t('Current browser bridge')}</dt>
          <dd>{t(props.bridge.session ? 'Connected' : 'Disconnected')}</dd>
          <dt>{t('External client read verification')}</dt>
          <dd>
            {props.bridge.session?.clientSeen
              ? `${t('Verified by an authenticated client read')} · ${new Date(props.bridge.session.clientSeen).toLocaleString(toIntlLocale(i18n.resolvedLanguage || i18n.language))}`
              : t(
                  'Not verified. Load the client configuration and read this canvas session.'
                )}
          </dd>
        </dl>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Server workflow jobs continue after closing the page. Browser canvas commands need this bridge to stay open. A verified read records the last client access; it does not prove the client is still running or enable generation.'
          )}
        </p>
        <Field>
          <FieldLabel>{t('Choose your agent client')}</FieldLabel>
          <Select
            value={client}
            onValueChange={(value) => {
              if (value) setClient(value)
            }}
            items={[
              { value: 'codex', label: 'Codex' },
              { value: 'claude', label: 'Claude Desktop' },
              { value: 'cursor', label: 'Cursor' },
              { value: 'other', label: t('Other stdio MCP client') },
            ]}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {[
                  ['codex', 'Codex'],
                  ['claude', 'Claude Desktop'],
                  ['cursor', 'Cursor'],
                  ['other', t('Other stdio MCP client')],
                ].map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Button
          variant='outline'
          onClick={() => {
            setConnection('')
            setPlatformReady(false)
            void studioCloudRequest('/capabilities')
              .then(() => {
                setPlatformReady(true)
                setConnection(
                  t(
                    'Platform connection verified. Load the configuration in your MCP client and read the project list to verify the client connection.'
                  )
                )
              })
              .catch((error) => setConnection(String(error)))
          }}
        >
          {t('Test platform connection')}
        </Button>
        {connection && (
          <p role='status' className='text-sm'>
            {connection}
          </p>
        )}
        <Alert>
          <AlertDescription>{t('studio.agent.localHint')}</AlertDescription>
        </Alert>
        <div className='flex flex-col gap-3'>
          <Field orientation='horizontal'>
            <Checkbox
              id='studio-agent-edit'
              checked={allowEdits}
              disabled={Boolean(props.bridge.session)}
              onCheckedChange={(checked) => setAllowEdits(checked === true)}
            />
            <FieldLabel htmlFor='studio-agent-edit'>
              {t('studio.agent.allowEdits')}
            </FieldLabel>
          </Field>
          <Field orientation='horizontal'>
            <Checkbox
              id='studio-agent-generation'
              checked={allowGeneration}
              disabled={Boolean(props.bridge.session)}
              onCheckedChange={(checked) =>
                setAllowGeneration(checked === true)
              }
            />
            <FieldLabel htmlFor='studio-agent-generation'>
              {t('studio.agent.allowGeneration')}
            </FieldLabel>
          </Field>
          <p className='text-muted-foreground text-xs'>
            {t('studio.agent.generationHint')}
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          {props.bridge.session ? (
            <>
              <Button variant='outline' onClick={props.bridge.disconnect}>
                {t('studio.agent.disconnect')}
              </Button>
              <CopyButton
                size='sm'
                aria-label={t('studio.agent.copySession')}
                value={props.bridge.session.id}
              >
                {t('studio.agent.copySession')}
              </CopyButton>
              <span className='text-muted-foreground text-xs' role='status'>
                {t(
                  props.bridge.pending
                    ? 'studio.agent.executing'
                    : 'studio.agent.connected',
                  { revision: props.bridge.session.revision }
                )}
              </span>
            </>
          ) : (
            <Button
              disabled={props.bridge.connecting}
              onClick={() =>
                void props.bridge.connect({ allowEdits, allowGeneration })
              }
            >
              {t(
                props.bridge.connecting
                  ? 'studio.agent.connecting'
                  : 'studio.agent.connect'
              )}
            </Button>
          )}
        </div>
        {props.bridge.error && (
          <Alert variant='destructive'>
            <AlertDescription>{props.bridge.error}</AlertDescription>
          </Alert>
        )}
        <div className='flex items-center justify-between gap-2'>
          <h3 className='text-sm font-semibold'>{t('studio.agent.mcp')}</h3>
          <CopyButton
            size='sm'
            aria-label={t('studio.agent.copyConfig')}
            value={config}
          >
            {t('studio.agent.copyConfig')}
          </CopyButton>
        </div>
        <pre className='bg-muted max-h-52 overflow-auto rounded-lg p-3 text-xs'>
          {config}
        </pre>
        <Field>
          <FieldLabel>{t('Installed skill folder')}</FieldLabel>
          <Input
            value={installPath}
            maxLength={500}
            onChange={(event) => setInstallPath(event.target.value)}
            aria-label={t('Installed skill folder')}
          />
        </Field>
        <Field>
          <FieldLabel>{t('Optional HTTPS CA certificate file')}</FieldLabel>
          <Input
            aria-label={t('Optional HTTPS CA certificate file')}
            value={certificateFile}
            maxLength={500}
            onChange={(event) => setCertificateFile(event.target.value)}
          />
          <p className='text-muted-foreground text-xs'>
            {t(
              'For local HTTPS with a private CA, enter the trusted root certificate PEM file path. This sets NODE_EXTRA_CA_CERTS for the client. Restart the client after changing this setting.'
            )}
          </p>
        </Field>
        <ol className='list-inside list-decimal space-y-2 text-sm'>
          <li>
            {t(
              'Download and extract the skill package. Enter the new-api-studio folder path above.'
            )}
          </li>
          <li>
            {t(
              'Install Node.js, then run node --version in your client environment.'
            )}
          </li>
          <li>
            {t(
              'Create a personal access token in account settings and replace the token placeholder locally. Keep it private.'
            )}
          </li>
          <li>
            {t(
              'Load the copied configuration in the selected MCP client, connect this browser canvas, then call studio_read_canvas with its session ID. The verified read status updates after the next browser heartbeat.'
            )}
          </li>
        </ol>
        <p className='text-muted-foreground text-xs'>
          {t('studio.agent.setupHint')}
        </p>
        <div className='flex flex-col gap-2 rounded-lg border p-3 text-sm'>
          <h3 className='font-semibold'>{t('studio.agent.skill')}</h3>
          <p className='text-muted-foreground text-xs'>
            {t('studio.agent.skillHint')}
          </p>
          <Button
            size='sm'
            variant='outline'
            disabled={downloading}
            onClick={() => void download()}
          >
            {t('studio.agent.downloadSkill')}
          </Button>
          <code className='block text-xs break-all'>
            new-api-studio/SKILL.md
          </code>
        </div>
      </div>
    </Dialog>
  )
}
