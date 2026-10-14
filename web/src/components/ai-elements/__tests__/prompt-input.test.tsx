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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import {
  PromptInput,
  PromptInputAttachments,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
} from '../prompt-input'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
const revoke = vi.fn()
beforeEach(() => {
  let sequence = 0
  vi.stubGlobal(
    'URL',
    Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => `blob:attachment-${++sequence}`),
      revokeObjectURL: revoke,
    })
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      blob: async () => new Blob(['image'], { type: 'image/png' }),
    }))
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  revoke.mockClear()
})

function input(submit: ComponentProps<typeof PromptInput>['onSubmit']) {
  return (
    <PromptInput onSubmit={submit} multiple>
      <PromptInputTextarea aria-label='Message' />
      <PromptInputAttachments>
        {(file) => <span>{file.filename}</span>}
      </PromptInputAttachments>
      <PromptInputSubmit />
    </PromptInput>
  )
}

test('adding another local attachment preserves the first attachment preview until unmount', () => {
  const view = render(input(vi.fn()))
  fireEvent.change(screen.getByLabelText('Upload files'), {
    target: { files: [new File(['one'], 'one.png', { type: 'image/png' })] },
  })
  fireEvent.change(screen.getByLabelText('Upload files'), {
    target: { files: [new File(['two'], 'two.png', { type: 'image/png' })] },
  })
  expect(screen.getByText('one.png')).toBeVisible()
  expect(screen.getByText('two.png')).toBeVisible()
  expect(revoke).not.toHaveBeenCalled()
  view.unmount()
  expect(revoke).toHaveBeenCalledWith('blob:attachment-1')
  expect(revoke).toHaveBeenCalledWith('blob:attachment-2')
})

test('a rejected submission preserves the message and attachment so the user can retry', async () => {
  const submit = vi.fn().mockRejectedValue(new Error('Submission denied'))
  render(input(submit))
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
    target: { value: 'Keep this draft' },
  })
  fireEvent.change(screen.getByLabelText('Upload files'), {
    target: { files: [new File(['one'], 'one.png', { type: 'image/png' })] },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() => expect(submit).toHaveBeenCalled())
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue(
    'Keep this draft'
  )
  expect(screen.getByText('one.png')).toBeVisible()
  expect(toast.error).toHaveBeenCalledWith('Submission denied')
})

test('a successful pending submission preserves text and attachments added for the next message', async () => {
  let finish: (() => void) | undefined
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  const submit = vi.fn(() => pending)
  render(input(submit))
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
    target: { value: 'First message' },
  })
  fireEvent.change(screen.getByLabelText('Upload files'), {
    target: { files: [new File(['one'], 'one.png', { type: 'image/png' })] },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() => expect(submit).toHaveBeenCalled())
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
    target: { value: 'Next message' },
  })
  fireEvent.change(screen.getByLabelText('Upload files'), {
    target: { files: [new File(['two'], 'two.png', { type: 'image/png' })] },
  })
  await act(async () => {
    if (!finish) throw new Error('Missing test resolver')
    finish()
  })
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue(
    'Next message'
  )
  expect(screen.getByText('two.png')).toBeVisible()
  expect(screen.queryByText('one.png')).not.toBeInTheDocument()
})

test('an attachment conversion failure keeps the draft and reports a retryable error', async () => {
  const submit = vi.fn()
  vi.mocked(fetch).mockRejectedValue(new Error('Attachment unavailable'))
  render(input(submit))
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
    target: { value: 'Retry this draft' },
  })
  fireEvent.change(screen.getByLabelText('Upload files'), {
    target: { files: [new File(['one'], 'one.png', { type: 'image/png' })] },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith('Attachment unavailable')
  )
  expect(submit).not.toHaveBeenCalled()
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue(
    'Retry this draft'
  )
  expect(screen.getByText('one.png')).toBeVisible()
})

test('provider-owned attachment previews are released when the provider unmounts', () => {
  const view = render(
    <PromptInputProvider>{input(vi.fn())}</PromptInputProvider>
  )
  fireEvent.change(screen.getByLabelText('Upload files'), {
    target: { files: [new File(['one'], 'one.png', { type: 'image/png' })] },
  })
  view.unmount()
  expect(revoke).toHaveBeenCalledWith('blob:attachment-1')
})
