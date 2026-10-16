/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { fetchStudioAttempts } from '../api'
import { StudioAttempts } from '../studio-attempts'
import { StudioClipTrimHandles } from '../studio-clip-trim-handles'
import { StudioMediaImport } from '../studio-media-import'
import { studioTimelineClipSchema } from '../studio-production'
import { StudioTemplateLibrary } from '../studio-template-library'
import { createStudioProject } from '../workspace'

vi.mock('../api', () => ({ fetchStudioAttempts: vi.fn() }))
const mediaContext = vi.hoisted(() => ({ value: null as unknown }))
vi.mock('../studio-production-context', () => ({
  useStudioProductionContext: () => mediaContext.value,
}))

test('an immediate upload saves the new project before linking media', async () => {
  const order: string[] = []
  const onUpdate = vi.fn()
  mediaContext.value = {
    writable: true,
    props: {
      project: createStudioProject('Fresh', 'fresh'),
      userId: 1,
      onSave: async () => {
        order.push('save')
      },
      onUpdate,
    },
  }
  vi.spyOn(api, 'put').mockImplementation(async () => {
    order.push('upload')
    return { data: { success: true } }
  })
  const view = render(<StudioMediaImport />)
  const input = view.container.querySelector('input[type=file]')
  if (!input) throw new Error('Media input is missing')
  fireEvent.change(input, {
    target: { files: [new File(['image'], 'test.png', { type: 'image/png' })] },
  })
  await waitFor(() => expect(onUpdate).toHaveBeenCalled())
  expect(order.slice(0, 2)).toEqual(['save', 'upload'])
  expect(onUpdate.mock.calls[0][0].nodes[0].data.sourceMode).toBe('upload')
  vi.restoreAllMocks()
})

test('current project filters local and unlinked submissions, with all-project access explicit', async () => {
  vi.mocked(fetchStudioAttempts).mockResolvedValue([
    {
      id: 'foreign',
      model: 'foreign-model',
      taskId: 'task-b',
      group: 'default',
      stage: 'accepted',
      createdAt: '',
      httpStatus: 200,
      channelId: 1,
      errorCode: '',
    },
  ])
  vi.spyOn(api, 'request').mockResolvedValue({
    data: { success: true, data: [] },
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <StudioAttempts
        open
        userId={1}
        currentProjectId='a'
        onOpenChange={vi.fn()}
        localTasks={['a', 'b'].map((id) => ({
          projectId: id,
          projectTitle: `Project ${id}`,
          nodeId: id,
          nodeTitle: `Shot ${id}`,
          model: 'wan',
          taskId: `task-${id}`,
          status: 'processing',
        }))}
      />
    </QueryClientProvider>
  )
  await waitFor(() => expect(fetchStudioAttempts).toHaveBeenCalled())
  expect(screen.getByText('Project a · Shot a')).toBeTruthy()
  expect(screen.queryByText('Project b · Shot b')).toBeNull()
  expect(screen.queryByText('foreign-model')).toBeNull()
  await userEvent.click(
    screen.getByRole('combobox', { name: 'Task project scope' })
  )
  await userEvent.click(screen.getByRole('option', { name: 'All projects' }))
  expect(await screen.findByText('Project b · Shot b')).toBeTruthy()
  expect(await screen.findByText('foreign-model')).toBeTruthy()
  vi.restoreAllMocks()
})

test('recipe preview and cancel leave the project untouched; confirmation returns a pending draft', async () => {
  const project = createStudioProject('Original', 'original')
  const onApply = vi.fn()
  render(<StudioTemplateLibrary project={project} onApply={onApply} />)
  await userEvent.click(
    screen.getAllByRole('button', { name: 'Preview and use recipe' })[0]
  )
  await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
  expect(onApply).not.toHaveBeenCalled()
  expect(project.production?.screenplayDraft).toBeUndefined()
  await userEvent.click(
    screen.getAllByRole('button', { name: 'Preview and use recipe' })[0]
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Use as editable draft' })
  )
  expect(onApply).toHaveBeenCalledOnce()
  const next = onApply.mock.calls[0][0]
  expect(
    JSON.parse(next.production.screenplayDraft).shots.length
  ).toBeGreaterThan(0)
  expect(next.nodes).toEqual(project.nodes)
})

test('trim handles support keyboard precision and prevent inverted or empty ranges', () => {
  const onTrim = vi.fn()
  render(
    <StudioClipTrimHandles
      clip={studioTimelineClipSchema.parse({
        id: 'clip',
        nodeId: 'video',
        trimStart: 1,
        trimEnd: 4,
      })}
      available={5}
      filmSeconds={5}
      onTrim={onTrim}
    />
  )
  const sliders = screen.getAllByRole('slider')
  fireEvent.keyDown(sliders[0], { key: 'ArrowRight' })
  expect(onTrim).toHaveBeenLastCalledWith({ trimStart: 1.1, trimEnd: 4 })
  fireEvent.keyDown(sliders[1], { key: 'Home' })
  expect(onTrim.mock.calls.at(-1)?.[0].trimEnd).toBeGreaterThan(1)
})
