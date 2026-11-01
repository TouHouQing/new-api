/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { studioProductionSchema } from '../studio-production'
import {
  StudioServerTemplates,
  type StudioServerTemplate,
} from '../studio-server-templates'
import { saveStudioVideoTemplate } from '../studio-video-templates'
import { createStudioProject } from '../workspace'

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().auth.setUser({ id: 1, username: 'creator', role: 1 })
})
afterEach(() => {
  localStorage.clear()
  useAuthStore.getState().auth.setUser(null)
  vi.restoreAllMocks()
})

const project = () => ({
  ...createStudioProject('Original', 'source'),
  createdAt: '2026-10-18T00:00:00Z',
  production: {
    ...studioProductionSchema.parse({}),
    creativeBrief: {
      recipeId: '',
      subject: 'Coffee',
      audience: 'Neighbors',
      benefit: '',
      callToAction: '',
    },
  },
})
const template = (): StudioServerTemplate => ({
  id: 'saved',
  version: 2,
  name: 'Coffee film',
  description: 'Reusable shots',
  kind: 'production',
  source_project_id: 'source',
  source_revision: 1,
  source_license: 'Own footage',
  blueprint: null,
  inputs: [
    {
      id: 'subject',
      label: 'Subject',
      kind: 'text',
      path: '/production/creativeBrief/subject',
      required: true,
      default: 'Coffee',
    },
  ],
  slots: [
    {
      id: 'old',
      label: 'Product image',
      kind: 'image',
      media_id: 'old',
      required: true,
    },
  ],
  capabilities: [],
})
function setupRequest(source = project(), definition = template()) {
  return vi.spyOn(api, 'request').mockImplementation(async (config) => {
    if (
      config.url === '/api/studio/cloud/templates' &&
      config.method === 'GET'
    ) {
      return { data: { success: true, data: [definition] } }
    }
    if (config.url === '/api/studio/cloud/templates/saved') {
      return { data: { success: true, data: definition } }
    }
    if (config.url === '/api/studio/cloud/projects/source') {
      return {
        data: {
          success: true,
          data: {
            id: 'source',
            revision: 3,
            role: 'owner',
            document: source,
          },
        },
      }
    }
    if (config.method === 'POST' && config.url?.endsWith('/instantiate')) {
      return {
        data: {
          success: true,
          data: {
            id: 'instance',
            revision: 1,
            role: 'owner',
            document: { ...project(), id: 'instance', title: 'Tea' },
          },
        },
      }
    }
    if (
      config.method === 'POST' &&
      config.url === '/api/studio/cloud/templates'
    ) {
      return {
        data: {
          success: true,
          data: { ...template(), id: 'created', version: 1 },
        },
      }
    }
    throw new Error(`Unexpected request ${config.url}`)
  })
}
function renderPanel(
  props: Partial<React.ComponentProps<typeof StudioServerTemplates>> = {}
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const result = render(
    <QueryClientProvider client={client}>
      <StudioServerTemplates project={project()} {...props} />
    </QueryClientProvider>
  )
  return { ...result, client }
}

test('saving a production template pins the server revision and exposes selected creative inputs', async () => {
  const request = setupRequest()
  const onSave = vi.fn(async () => {})
  renderPanel({ onSave })
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Source and reuse rights' }),
    'Owned original footage'
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Save production template' })
  )
  await screen.findByRole('status')
  expect(onSave).toHaveBeenCalledOnce()
  const call = request.mock.calls.find(
    ([config]) => config.method === 'POST'
  )?.[0]
  expect(call?.data).toMatchObject({
    project_id: 'source',
    project_revision: 3,
    expected_version: 0,
    source_license: 'Owned original footage',
    inputs: [
      { id: 'subject', path: '/production/creativeBrief/subject' },
      { id: 'audience', path: '/production/creativeBrief/audience' },
    ],
  })
  expect(call?.headers).toMatchObject({ 'X-Studio-Document-Version': '2' })
})

test('instantiating requires an explicit media choice and keeps the selected immutable version', async () => {
  const request = setupRequest()
  const onInstantiate = vi.fn()
  renderPanel({ onInstantiate })
  await screen.findByRole('combobox', { name: 'Choose a saved template' })
  await userEvent.click(
    screen.getByRole('combobox', { name: 'Choose a saved template' })
  )
  await userEvent.click(
    await screen.findByRole('option', { name: /Coffee film/ })
  )
  const create = await screen.findByRole('button', {
    name: 'Create editable project',
  })
  expect(create).toBeDisabled()
  await userEvent.clear(screen.getByRole('textbox', { name: 'Subject' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Subject' }), 'Tea')
  await userEvent.click(
    screen.getByRole('checkbox', {
      name: 'Explicitly reuse my original template media',
    })
  )
  expect(create).toBeEnabled()
  await userEvent.click(create)
  await waitFor(() => expect(onInstantiate).toHaveBeenCalledOnce())
  expect(onInstantiate.mock.calls[0][0].id).toBe('instance')
  const call = request.mock.calls.find(([config]) =>
    config.url?.endsWith('/instantiate')
  )?.[0]
  expect(call?.data).toMatchObject({
    version: 2,
    inputs: { subject: 'Tea' },
    reuse_original_media: true,
  })
})

test('an older parameter import preserves the original local records and labels them separately', async () => {
  saveStudioVideoTemplate(localStorage, 1, {
    model: 'wan',
    group: 'default',
    seconds: 5,
    resolution: '640x384',
    ratio: '16:9',
    savedAt: '2026-10-18',
  })
  const raw = localStorage.getItem('newapi:studio:video-templates:v1:user:1')
  const request = setupRequest()
  renderPanel()
  await userEvent.click(
    screen.getByRole('button', { name: 'Import older generation parameters' })
  )
  await screen.findByRole('status')
  expect(localStorage.getItem('newapi:studio:video-templates:v1:user:1')).toBe(
    raw
  )
  expect(
    request.mock.calls.find(([config]) => config.method === 'POST')?.[0].data
  ).toMatchObject({
    legacy_parameters: { model: 'wan', seconds: 5, group: 'default' },
  })
})

test('replaceable inputs are visible without changing the original project', () => {
  setupRequest()
  const source = project()
  const before = JSON.stringify(source)
  renderPanel({ project: source })
  expect(
    screen.getByRole('checkbox', { name: 'Replaceable input: Subject' })
  ).toBeChecked()
  expect(
    screen.getByRole('checkbox', { name: 'Replaceable input: Audience' })
  ).toBeChecked()
  expect(JSON.stringify(source)).toBe(before)
})

test('linked fields require an explicit valid pattern and submit only the declared creative target', async () => {
  const source = project()
  source.nodes = [
    {
      id: 'shot',
      type: 'studio',
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        title: 'Product frame',
        prompt: 'Coffee on a table',
      },
    },
  ]
  const request = setupRequest(source)
  renderPanel({ project: source })
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Source and reuse rights' }),
    'Own original'
  )
  await userEvent.click(screen.getByText('Link creative fields (advanced)'))
  await userEvent.click(
    screen.getByRole('button', { name: 'Add linked field' })
  )
  const save = screen.getByRole('button', { name: 'Save production template' })
  expect(save).toBeDisabled()
  const pattern = screen.getByRole('textbox', { name: 'Replacement pattern 1' })
  fireEvent.change(pattern, { target: { value: '{{unknown}} on a table' } })
  expect(save).toBeDisabled()
  fireEvent.change(pattern, { target: { value: '{{subject}} on a table' } })
  expect(save).toBeEnabled()
  await userEvent.click(save)
  await screen.findByRole('status')
  const call = request.mock.calls.find(
    ([config]) => config.method === 'POST'
  )?.[0]
  expect(call?.data).toMatchObject({
    bindings: [
      { path: '/nodes/0/data/prompt', pattern: '{{subject}} on a table' },
    ],
  })
  expect(source.nodes[0].data.prompt).toBe('Coffee on a table')
})

test('an unlinked input explicitly explains that existing shot prompts will not be rewritten', async () => {
  setupRequest()
  renderPanel({ onInstantiate: vi.fn() })
  await userEvent.click(
    await screen.findByRole('combobox', { name: 'Choose a saved template' })
  )
  await userEvent.click(
    await screen.findByRole('option', { name: /Coffee film/ })
  )
  expect(
    await screen.findByText(
      'This input updates only its declared field. Edit the shot prompts in the new project or add an explicit linked-field rule before saving the template.'
    )
  ).toBeInTheDocument()
})

test('switching projects clears unsaved template rules and naming from the previous project', async () => {
  setupRequest()
  const view = renderPanel()
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Source and reuse rights' }),
    'Previous project rights'
  )
  const second = { ...project(), id: 'second', title: 'Second project' }
  view.rerender(
    <QueryClientProvider client={view.client}>
      <StudioServerTemplates project={second} />
    </QueryClientProvider>
  )
  expect(screen.getByRole('textbox', { name: 'Template name' })).toHaveValue(
    'Second project'
  )
  expect(
    screen.getByRole('textbox', { name: 'Source and reuse rights' })
  ).toHaveValue('')
})

test('saved author labels remain literal while new candidate labels use the interface language', async () => {
  i18next.addResource('en', 'translation', 'Subject', 'Localized system term')
  try {
    setupRequest()
    renderPanel()
    expect(
      screen.getByRole('checkbox', {
        name: 'Replaceable input: Localized system term',
      })
    ).toBeInTheDocument()
    await userEvent.click(
      await screen.findByRole('combobox', { name: 'Choose a saved template' })
    )
    await userEvent.click(
      await screen.findByRole('option', { name: /Coffee film/ })
    )
    expect(
      await screen.findByRole('textbox', { name: 'Subject' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: 'Localized system term' })
    ).not.toBeInTheDocument()
  } finally {
    i18next.removeResourceBundle('en', 'translation')
  }
})

test.each(['parameters', 'production'] as const)(
  'only controlled legacy parameter fields translate and %s author fields stay literal',
  async (kind) => {
    i18next.addResource(
      'en',
      'translation',
      'Video description',
      'Localized video description'
    )
    i18next.addResource(
      'en',
      'translation',
      'Imported personal generation parameters',
      'Localized imported parameters'
    )
    try {
      setupRequest(project(), {
        ...template(),
        kind,
        source_license: 'Imported personal generation parameters',
        inputs: [
          {
            id: 'prompt',
            label: 'Video description',
            kind: 'text',
            path: '/nodes/0/data/prompt',
            default: '',
            required: true,
          },
        ],
        slots: [],
      })
      renderPanel()
      await userEvent.click(
        await screen.findByRole('combobox', { name: 'Choose a saved template' })
      )
      await userEvent.click(
        await screen.findByRole('option', { name: /Coffee film/ })
      )
      const label =
        kind === 'parameters'
          ? 'Localized video description'
          : 'Video description'
      expect(
        await screen.findByRole('textbox', { name: label })
      ).toBeInTheDocument()
      const license =
        kind === 'parameters'
          ? 'Localized imported parameters'
          : 'Imported personal generation parameters'
      expect(screen.getByText(license, { selector: 'p' })).toBeInTheDocument()
    } finally {
      i18next.removeResourceBundle('en', 'translation')
    }
  }
)
