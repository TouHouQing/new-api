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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { useState } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'

import type { StudioProject } from '../local-projects'
import { StudioAttempts } from '../studio-attempts'
import { StudioCaptionEditor } from '../studio-caption-editor'
import { studioCloudRequest } from '../studio-cloud'
import type { StudioCreationStep } from '../studio-creation'
import { StudioCreationWorkspace } from '../studio-creation-workspace'
import { studioProductionSchema } from '../studio-production'
import { parseStudioSubtitleCues } from '../studio-subtitle-cues'
import { createStudioProject } from '../workspace'

vi.mock('../studio-cloud', () => ({
  studioCloudRequest: vi.fn(),
  studioCloudMedia: vi.fn(
    async () => new Blob(['fixture'], { type: 'video/mp4' })
  ),
}))
vi.mock('../api', () => ({
  fetchStudioAttempts: async () => [],
  fetchStudioProviderModels: async () => ['local-text'],
  fetchStudioModels: async () => [
    'qwen3.5:9b',
    'flux.2-klein-4b',
    'wan2.2-ti2v-5b',
  ],
  fetchStudioGroups: async () => [{ id: 'default', description: 'Default' }],
}))
let role = 'owner'
let storageReady = true
const loadDemo = vi.fn(async () => {})
let saved: StudioProject
const update = vi.fn()
const save = vi.fn(async () => {})
let restoreDocument: (project: StudioProject) => void
function Host(props: {
  initial?: StudioProject
  initialStep?: StudioCreationStep
}) {
  const [project, setProject] = useState<StudioProject>({
    ...(props.initial || {
      ...createStudioProject('Film', 'film'),
      production: {
        ...studioProductionSchema.parse({}),
        guide: { step: 'story', goal: 'story' },
      },
    }),
  })
  saved = project
  restoreDocument = setProject
  return (
    <StudioCreationWorkspace
      open
      onOpenChange={() => {}}
      project={project}
      initialStep={props.initialStep}
      userId={1}
      selectedNodeId={null}
      onSave={save}
      onRefresh={async () => {}}
      onUpdate={(value) => {
        update(value)
        setProject(value)
      }}
      getMedia={async () => null}
      onAssets={() => {}}
      onCanvas={() => {}}
      onDemo={loadDemo}
    />
  )
}
beforeEach(() => {
  role = 'owner'
  storageReady = true
  loadDemo.mockReset()
  loadDemo.mockResolvedValue(undefined)
  update.mockClear()
  save.mockReset()
  save.mockResolvedValue(undefined)
  vi.mocked(studioCloudRequest).mockReset()
  vi.mocked(studioCloudRequest).mockImplementation(async (path) => {
    if (path === '/capabilities') {
      return {
        render_available: true,
        storage_available: storageReady,
        quota_per_unit: 500000,
      } as never
    }
    if (path.endsWith('/events')) return { events: [], cursor: '' } as never
    if (/\/(jobs|versions|comments|members|review-shares)$/.test(path)) {
      return [] as never
    }
    return { id: 'film', revision: 1, role, document: saved } as never
  })
})

test('a failed free sample upload explains the storage recovery instead of displaying the raw server error', async () => {
  loadDemo.mockRejectedValue(new Error('object storage rejected the request'))
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <Host />
    </QueryClientProvider>
  )
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Try a free editing example' })
    ).toBeEnabled()
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Try a free editing example' })
  )
  await screen.findByText(
    'Studio storage is unavailable. Restore free space or reconnect storage before generating.'
  )
  expect(
    screen.queryByText('object storage rejected the request')
  ).not.toBeInTheDocument()
})

test('an explicit route step survives a late cloud document with a different saved step', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <Host initialStep='voice' />
    </QueryClientProvider>
  )
  await waitFor(() => expect(saved.production?.guide?.step).toBe('edit'))
  await act(async () =>
    restoreDocument({
      ...saved,
      production: {
        ...studioProductionSchema.parse(saved.production),
        guide: { step: 'deliver', goal: 'story' },
      },
    })
  )
  expect(screen.getByRole('dialog')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(
    screen.getByRole('tab', { name: /studio.workspace.stage.edit/ })
  ).toHaveAttribute('aria-selected', 'true')
})

test('restoring a built-in skill persists the selection before exporting while keeping personal versions', async () => {
  i18next.addResource(
    'en',
    'translation',
    'studio.creation.step.story',
    'Story'
  )
  mount()
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  save.mockClear()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Creative assistant' }))
  await user.click(
    screen.getByRole('button', { name: 'Assistant settings and skills' })
  )
  const input = document.querySelector<HTMLInputElement>(
    'input[type="file"][accept=".md"]'
  )
  if (!input) throw new Error('The skill upload input is missing')
  const raw =
    '---\nname: writing\ndescription: Story planning\nversion: "1.3"\n---\nPlan the story.\n'
  const file = new File([raw], 'SKILL.md', { type: 'text/markdown' })
  Object.defineProperty(file, 'text', { value: async () => raw })
  Object.defineProperty(file, 'webkitRelativePath', { value: '' })
  await user.upload(input, file)
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  let completeSave = () => {}
  expect(screen.getByText(/^Inputs:/)).toHaveTextContent('Inputs: Story')
  save.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        completeSave = resolve
      })
  )
  await user.click(
    screen.getByRole('button', { name: 'Restore the built-in skill' })
  )
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  expect(
    screen.getByRole('button', { name: 'Export selected skill' })
  ).toBeDisabled()
  expect(saved.production?.skills[0].activeVersion).toBe('1.0')
  expect(
    saved.production?.skills[0].versions.map((version) => version.version)
  ).toEqual(['1.0', '1.3'])
  completeSave()
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Export selected skill' })
    ).toBeEnabled()
  )
})
function mount(initial?: StudioProject) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <Host initial={initial} />
    </QueryClientProvider>
  )
}

test('captions can be added without SRT knowledge and invalid ranges retain the editor draft', async () => {
  let current = ''
  function Captions() {
    const [value, setValue] = useState('')
    current = value
    return (
      <StudioCaptionEditor value={value} disabled={false} onChange={setValue} />
    )
  }
  render(<Captions />)
  await userEvent.click(
    screen.getByRole('button', { name: 'Add caption sentence' })
  )
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Caption 1 text' }),
    'Hello bicycle'
  )
  expect(parseStudioSubtitleCues(current)[0]).toEqual({
    start: 0,
    end: 2,
    text: 'Hello bicycle',
  })
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Caption 1 end' }), {
    target: { value: '0' },
  })
  expect(screen.getByRole('alert')).toHaveTextContent(
    'end time after its start'
  )
  expect(parseStudioSubtitleCues(current)[0].end).toBe(2)
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Caption 1 end' }), {
    target: { value: '3' },
  })
  expect(parseStudioSubtitleCues(current)[0].end).toBe(3)
})

test('unfinished caption rows can be reopened without replacing the last valid subtitle version', () => {
  render(
    <StudioCaptionEditor
      value='1\n00:00:00,000 --> 00:00:02,000\nValid caption\n'
      draft={[
        {
          id: 'pending',
          start: '0',
          end: '',
          text: 'Retain this pending line',
        },
      ]}
      disabled={false}
      onChange={() => {}}
    />
  )
  expect(screen.getByRole('textbox', { name: 'Caption 1 text' })).toHaveValue(
    'Retain this pending line'
  )
  expect(screen.getByRole('spinbutton', { name: 'Caption 1 end' })).toHaveValue(
    null
  )
})

test('the task center includes failed and successful cloud exports when no video submission exists', async () => {
  vi.mocked(studioCloudRequest).mockResolvedValue([
    {
      id: 'failed-export',
      kind: 'render',
      status: 'failed',
      progress: 0,
      error: 'all delivery clips must be approved before rendering',
      revision: 1,
    },
    {
      id: 'successful-export',
      kind: 'render',
      status: 'succeeded',
      progress: 100,
      error: '',
      revision: 2,
    },
  ] as never)
  const open = vi.fn()
  render(
    <StudioAttempts
      open
      onOpenChange={() => {}}
      userId={1}
      projects={[createStudioProject('Export film', 'film')]}
      currentProjectId='film'
      onOpenJob={open}
    />
  )
  await screen.findByRole('button', { name: 'Open task recovery' })
  expect(
    screen.getByRole('button', { name: 'Open task and results' })
  ).toBeVisible()
  await userEvent.click(
    screen.getByRole('button', { name: 'Open task and results' })
  )
  expect(open).toHaveBeenCalledWith('film', 'render', undefined, 'succeeded')
})

test('an outdated draft can be replanned after editing the story without removing existing footage', async () => {
  const project = createStudioProject('Existing', 'film')
  project.production = {
    ...studioProductionSchema.parse({}),
    brief: 'New blue bicycle story.',
    screenplayDraft: JSON.stringify({
      title: 'Old',
      brief: 'Old courier story.',
      shots: [{ title: 'Old shot', text: 'Old', seconds: 5 }],
    }),
    guide: { goal: 'story', step: 'story' },
  }
  project.nodes = [
    {
      id: 'retained',
      type: 'studio',
      position: { x: 0, y: 0 },
      data: {
        kind: 'video',
        title: 'Retained footage',
        prompt: '',
        mediaId: 'original-video',
      },
    },
  ]
  mount(project)
  const button = screen.getByRole('button', {
    name: 'Make a manual shot draft',
  })
  await waitFor(() => expect(button).toBeEnabled())
  await userEvent.click(button)
  await userEvent.click(
    screen.getByRole('button', { name: 'Replace pending draft' })
  )
  await waitFor(() =>
    expect(JSON.parse(saved.production?.screenplayDraft || '{}').brief).toBe(
      'New blue bicycle story.'
    )
  )
  expect(saved.nodes[0].data.mediaId).toBe('original-video')
})
test('a beginner saves a story, edits shots and returns without entering JSON or submitting inference', async () => {
  mount()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Describe a video' }))
  const story = screen.getByRole('textbox', { name: 'Tell your story' })
  await waitFor(() => expect(story).toBeEnabled())
  await user.type(story, 'A courier finds a letter.')
  expect(saved.production?.brief).toBe('A courier finds a letter.')
  await user.click(
    screen.getByRole('button', { name: 'Make a manual shot draft' })
  )
  const title = await screen.findByRole('textbox', { name: 'Shot title' })
  fireEvent.change(title, { target: { value: '' } })
  expect(
    JSON.parse(saved.production?.screenplayDraft || '{}').shots[0].title
  ).toBe('')
  expect(
    screen.getByRole('button', { name: 'Confirm shots and prepare pictures' })
  ).toBeDisabled()
  fireEvent.change(title, { target: { value: 'Opening' } })
  const duration = screen.getByRole('spinbutton', {
    name: 'Duration in seconds',
  })
  fireEvent.change(duration, { target: { value: '4000' } })
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Use a whole number'
  )
  fireEvent.change(duration, { target: { value: '8' } })
  await user.click(
    screen.getByRole('button', { name: 'Confirm shots and prepare pictures' })
  )
  expect(saved.shots).toHaveLength(1)
  await user.click(screen.getByRole('button', { name: 'Previous step' }))
  await user.click(screen.getByRole('button', { name: 'Previous step' }))
  expect(screen.getByRole('textbox', { name: 'Tell your story' })).toHaveValue(
    'A courier finds a letter.'
  )
  expect(
    vi.mocked(studioCloudRequest).mock.calls.every((call) => call[1] !== 'POST')
  ).toBe(true)
})
test('a reviewer may browse the guide while story inputs and project writes remain unavailable', async () => {
  role = 'reviewer'
  mount()
  await userEvent.click(
    screen.getByRole('button', { name: 'Describe a video' })
  )
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: 'Tell your story' })
    ).toBeDisabled()
  )
  await userEvent.click(
    screen.getByRole('tab', { name: /studio.workspace.stage.shots/ })
  )
  expect(
    await screen.findByRole('textbox', { name: 'Shot title' })
  ).toBeDisabled()
  expect(update).not.toHaveBeenCalled()
})

test('an empty or invalid shot duration blocks applying and continuing until corrected', async () => {
  mount()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Describe a video' }))
  const story = screen.getByRole('textbox', { name: 'Tell your story' })
  await waitFor(() => expect(story).toBeEnabled())
  await user.type(story, 'A courier arrives at sunrise.')
  await user.click(
    screen.getByRole('button', { name: 'Make a manual shot draft' })
  )
  const duration = await screen.findByRole('spinbutton', {
    name: 'Duration in seconds',
  })
  await user.clear(duration)
  expect(
    screen.getByRole('button', { name: 'Confirm shots and prepare pictures' })
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Confirm shots and prepare pictures' })
  ).toBeDisabled()
  await user.type(duration, '0')
  expect(
    screen.getByRole('button', { name: 'Confirm shots and prepare pictures' })
  ).toBeDisabled()
  await user.clear(duration)
  await user.type(duration, '5')
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Confirm shots and prepare pictures' })
    ).toBeEnabled()
  )
  await user.click(
    screen.getByRole('button', { name: 'Confirm shots and prepare pictures' })
  )
  expect(saved.shots).toHaveLength(1)
  expect(saved.production?.guide?.step).toBe('visual')
  expect(
    vi.mocked(studioCloudRequest).mock.calls.every((call) => call[1] !== 'POST')
  ).toBe(true)
})

test.each(['', '0', '1.5', '3601'])(
  'an invalid story duration %j blocks manual planning and continuing until corrected',
  async (invalid) => {
    mount()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Describe a video' }))
    const story = screen.getByRole('textbox', { name: 'Tell your story' })
    await waitFor(() => expect(story).toBeEnabled())
    await user.type(story, 'A fox finds a lamp.')
    const duration = screen.getByRole('spinbutton', { name: 'Target duration' })
    fireEvent.change(duration, { target: { value: invalid } })
    expect(duration).toHaveAttribute('aria-invalid', 'true')
    expect(
      screen.getByRole('button', { name: 'Make a manual shot draft' })
    ).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: 'Review shot draft' })
    ).not.toBeInTheDocument()
    expect(saved.production?.screenplayDraft).toBeFalsy()
    fireEvent.change(duration, { target: { value: '6' } })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Make a manual shot draft' })
      ).toBeEnabled()
    )
    await user.click(
      screen.getByRole('button', { name: 'Make a manual shot draft' })
    )
    expect(
      JSON.parse(saved.production?.screenplayDraft || '{}').shots[0].seconds
    ).toBe(6)
  }
)

test.each([
  {
    title: 'a duplicate installed version',
    raw: '---\nname: writing\ndescription: Story planning\nversion: "1.0"\n---\nPlan the story.\n',
    key: 'This skill version is already installed',
    message: '该技能版本已安装，请选择已有版本。',
  },
  {
    title: 'invalid skill metadata',
    raw: '---\ndescription: Missing the required name\n---\nPlan the story.\n',
    key: 'Skill import failed. Check the file format or try again.',
    message: '技能导入失败，请检查文件格式或重试。',
  },
])(
  'skill import reports $title in the current language without changing the project',
  async (sample) => {
    i18next.addResource('zh', 'translation', sample.key, sample.message)
    await i18next.changeLanguage('zh')
    try {
      mount()
      const user = userEvent.setup()
      await user.click(
        screen.getByRole('button', { name: 'Creative assistant' })
      )
      await user.click(
        screen.getByRole('button', { name: 'Assistant settings and skills' })
      )
      const input = document.querySelector<HTMLInputElement>(
        'input[type="file"][accept=".md"]'
      )
      expect(input).not.toBeNull()
      if (!input) throw new Error('The skill upload input is missing')
      const file = new File([sample.raw], 'SKILL.md', { type: 'text/markdown' })
      Object.defineProperty(file, 'text', { value: async () => sample.raw })
      Object.defineProperty(file, 'webkitRelativePath', { value: '' })
      await user.upload(input, file)
      expect(await screen.findByRole('alert')).toHaveTextContent(sample.message)
      expect(update).not.toHaveBeenCalled()
      expect(saved.production?.skills).toHaveLength(0)
    } finally {
      await i18next.changeLanguage('en')
    }
  }
)

test('invalid delivery numbers stay in the field and cannot corrupt the saved document', async () => {
  mount()
  const user = userEvent.setup()
  await waitFor(() => expect(save).toHaveBeenCalled())
  await user.click(
    screen.getByRole('tab', { name: /studio.workspace.stage.deliver/ })
  )
  await user.click(
    screen.getByRole('button', { name: 'Advanced export settings' })
  )
  const width = await screen.findByLabelText('studio.production.width')
  const valid = saved.production?.width
  for (const raw of ['', '0', '-1', '5000', 'hello']) {
    fireEvent.change(width, { target: { value: raw } })
    fireEvent.blur(width)
    expect(width).toHaveAttribute('aria-invalid', 'true')
    expect(saved.production?.width).toBe(valid)
    expect(
      screen.getAllByRole('button', { name: 'Export video' })[0]
    ).toBeDisabled()
  }
  fireEvent.change(width, { target: { value: '640' } })
  fireEvent.blur(width)
  expect(width).toHaveAttribute('aria-invalid', 'false')
  expect(saved.production?.width).toBe(640)
})

test('the novice workbench exposes five main goals and an optional media path', async () => {
  mount()
  await waitFor(() => expect(save).toHaveBeenCalled())
  expect(screen.getAllByRole('tab')).toHaveLength(5)
  await userEvent
    .setup()
    .click(screen.getByRole('tab', { name: /studio.workspace.stage.visual/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Project tools' }))
  expect(
    screen.getByRole('menuitem', { name: 'studio.workspace.tool.media' })
  ).toBeEnabled()
})

test('an empty timeline explains why both export and export preview are unavailable', async () => {
  mount()
  await waitFor(() => expect(save).toHaveBeenCalled())
  await userEvent
    .setup()
    .click(screen.getByRole('tab', { name: /studio.workspace.stage.deliver/ }))
  expect(
    screen.getAllByRole('button', { name: 'Export video' })[0]
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Preview the exact export layout' })
  ).toBeDisabled()
  expect(
    screen.getByText('Add completed footage to the timeline before exporting.')
  ).toBeVisible()
})

test('storage outage blocks a valid export and gives an actionable reason while completed footage stays available', async () => {
  storageReady = false
  const project = createStudioProject('Film', 'film')
  project.nodes = [
    {
      id: 'video',
      type: 'studio',
      position: { x: 0, y: 0 },
      data: {
        kind: 'video',
        title: 'Video',
        prompt: '',
        status: 'completed',
        mediaId: 'completed-video',
        seconds: 2,
      },
    },
  ]
  mount(project)
  await waitFor(() => expect(save).toHaveBeenCalled())
  await userEvent
    .setup()
    .click(screen.getByRole('tab', { name: /studio.workspace.stage.deliver/ }))
  expect(
    screen.getAllByRole('button', { name: 'Export video' })[0]
  ).toBeDisabled()
  expect(
    screen.getByText(
      'Studio storage is unavailable. Restore free space or reconnect storage before generating.'
    )
  ).toBeVisible()
  expect(saved.nodes[0].data.mediaId).toBe('completed-video')
})

test('the fixed generation action opens the same scope confirmation without starting a model', async () => {
  const project = createStudioProject('Film', 'film')
  project.nodes = [
    {
      id: 'video',
      type: 'studio',
      position: { x: 0, y: 0 },
      data: {
        kind: 'video',
        title: 'Shot',
        prompt: 'A cat walking',
        model: 'wan2.2-ti2v-5b',
        seconds: 2,
        status: 'idle',
      },
    },
  ]
  saved = project
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['studio-cloud-capabilities', 1], {
    render_available: true,
    storage_available: true,
    quota_per_unit: 500000,
    available_quota: 5000000,
    generation_credit_available: true,
  })
  render(
    <QueryClientProvider client={client}>
      <StudioCreationWorkspace
        open
        onOpenChange={() => {}}
        project={project}
        initialStep='visual'
        userId={1}
        selectedNodeId='video'
        onSave={save}
        onRefresh={async () => {}}
        onUpdate={update}
        getMedia={async () => null}
        onAssets={() => {}}
        onCanvas={() => {}}
        onDemo={loadDemo}
      />
    </QueryClientProvider>
  )
  const action = screen.getByRole('button', {
    name: 'Review and generate selected footage',
  })
  await waitFor(() => expect(action).toBeEnabled())
  await userEvent.click(action)
  expect(await screen.findByRole('alertdialog')).toBeVisible()
  expect(
    vi
      .mocked(studioCloudRequest)
      .mock.calls.some(
        ([path, method]) => path.endsWith('/jobs') && method === 'POST'
      )
  ).toBe(false)
})
