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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { Studio } from '../index'
import type { StudioProject } from '../local-projects'
import { studioProductionSchema } from '../studio-production'
import { createStudioProject } from '../workspace'

const storage = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(async () => {}),
}))
vi.mock('../media-store', () => ({
  studioMediaStore: () => ({
    loadProjects: storage.load,
    saveProjects: storage.save,
    saveProjectsIfAbsent: async () => false,
    get: async () => null,
  }),
}))
vi.mock('../api', () => ({
  fetchStudioGroups: async () => [],
  fetchStudioModels: async () => [],
  fetchStudioProviderConfigs: async () => ({}),
  fetchStudioProviderModels: async () => [],
  fetchStudioAttempts: async () => [],
}))
vi.mock('@/components/ai-elements/canvas', () => ({
  Canvas: () => <div aria-label='Restored canvas' role='region' />,
}))
vi.mock('../studio-creation-workspace', () => ({
  StudioCreationWorkspace: (props: {
    initialStep?: string
    project: StudioProject
    onUpdate: (project: StudioProject) => void
  }) => (
    <div role='region' aria-label={`Requested step ${props.initialStep}`}>
      <button
        type='button'
        onClick={() =>
          props.onUpdate({
            ...props.project,
            production: {
              ...studioProductionSchema.parse(props.project.production),
              guide: { step: 'edit', goal: 'story' },
            },
          })
        }
      >
        Apply local tool result
      </button>
    </div>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useAuthStore.setState((state) => ({
    auth: {
      ...state.auth,
      user: { id: 12, username: 'one', role: 1, group: 'default' },
    },
  }))
})

function renderWorkspace(workspace: 'canvas' | 'guided') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['studio-cloud-capabilities', 12], {
    generation_credit_available: false,
  })
  return render(
    <QueryClientProvider client={client}>
      <Studio workspace={workspace} />
    </QueryClientProvider>
  )
}

test('a canvas entry stays on the canvas after a guided project is restored', async () => {
  const project = createStudioProject('Guided film', 'film')
  project.production = {
    ...studioProductionSchema.parse({}),
    guide: { step: 'story', goal: 'story' },
  }
  storage.load.mockResolvedValue([project])
  renderWorkspace('canvas')
  expect(
    await screen.findByRole('region', { name: 'Restored canvas' })
  ).toBeInTheDocument()
})

test('restored guide state cannot rewrite the URL, while a local tool result can move it', async () => {
  const project = createStudioProject('Guided film', 'film')
  project.production = {
    ...studioProductionSchema.parse({}),
    guide: { step: 'deliver', goal: 'story' },
  }
  storage.load.mockResolvedValue([project])
  const navigate = vi.fn()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['studio-cloud-capabilities', 12], {
    generation_credit_available: false,
  })
  render(
    <QueryClientProvider client={client}>
      <Studio
        workspace='guided'
        project='film'
        step='voice'
        onNavigate={navigate}
      />
    </QueryClientProvider>
  )
  await screen.findByRole('region', { name: 'Requested step voice' })
  expect(navigate).not.toHaveBeenCalled()
  fireEvent.click(
    screen.getByRole('button', { name: 'Apply local tool result' })
  )
  expect(navigate).toHaveBeenCalledWith('guided', 'film', true, 'edit')
})

test('a canvas entry selected during project loading survives that asynchronous restore', async () => {
  let complete!: (projects: StudioProject[]) => void
  storage.load.mockReturnValue(
    new Promise<StudioProject[]>((resolve) => {
      complete = resolve
    })
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['studio-cloud-capabilities', 12], {
    generation_credit_available: false,
  })
  const host = render(
    <QueryClientProvider client={client}>
      <Studio workspace='guided' />
    </QueryClientProvider>
  )
  host.rerender(
    <QueryClientProvider client={client}>
      <Studio workspace='canvas' />
    </QueryClientProvider>
  )
  const project = createStudioProject('Guided film', 'film')
  project.production = {
    ...studioProductionSchema.parse({}),
    guide: { step: 'story', goal: 'story' },
  }
  await act(async () => {
    complete([project])
  })
  expect(
    await screen.findByRole('region', { name: 'Restored canvas' })
  ).toBeInTheDocument()
})
