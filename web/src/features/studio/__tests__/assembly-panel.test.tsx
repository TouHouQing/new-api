/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { StudioAssemblyPanel } from '../studio-assembly-panel'

test('assembly panel starts and cancels a browser MP4 export with visible progress', () => {
  const onAssemble = vi.fn()
  const onCancel = vi.fn()
  const props = { onAssemble, onCancel, onDownload: vi.fn() }
  const { rerender } = render(
    <StudioAssemblyPanel {...props} busy={false} progress={0} />
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.assembly.create' })
  )
  expect(onAssemble).toHaveBeenCalledOnce()
  rerender(<StudioAssemblyPanel {...props} busy progress={42} />)
  expect(
    screen
      .getByRole('progressbar', { name: 'studio.assembly.progress' })
      .getAttribute('value')
  ).toBe('42')
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.assembly.cancel' })
  )
  expect(onCancel).toHaveBeenCalledOnce()
})

test('assembly panel offers a saved MP4 for preview and download', () => {
  const onDownload = vi.fn()
  render(
    <StudioAssemblyPanel
      busy={false}
      progress={100}
      previewUrl='blob:assembled'
      onAssemble={vi.fn()}
      onCancel={vi.fn()}
      onDownload={onDownload}
    />
  )
  expect(screen.getByLabelText('studio.assembly.preview')).toHaveAttribute(
    'src',
    'blob:assembled'
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.assembly.download' })
  )
  expect(onDownload).toHaveBeenCalledOnce()
})

test('assembly panel lets a creator edit timed captions before export', () => {
  const onCaptionsChange = vi.fn()
  render(
    <StudioAssemblyPanel
      busy={false}
      progress={0}
      captionsText=''
      onCaptionsChange={onCaptionsChange}
      onAssemble={vi.fn()}
      onCancel={vi.fn()}
      onDownload={vi.fn()}
    />
  )
  fireEvent.change(
    screen.getByRole('textbox', { name: 'studio.timeline.captions' }),
    {
      target: { value: '1\n00:00:00,000 --> 00:00:01,000\nHello' },
    }
  )
  expect(onCaptionsChange).toHaveBeenCalledWith(
    '1\n00:00:00,000 --> 00:00:01,000\nHello'
  )
})

test('assembly panel lets a creator add narration beside the soundtrack', () => {
  const onUploadVoiceover = vi.fn()
  const onVoiceoverVolumeChange = vi.fn()
  const onRemoveVoiceover = vi.fn()
  render(
    <StudioAssemblyPanel
      busy={false}
      progress={0}
      voiceoverUrl='blob:voice'
      voiceoverVolume={0.6}
      onUploadVoiceover={onUploadVoiceover}
      onVoiceoverVolumeChange={onVoiceoverVolumeChange}
      onRemoveVoiceover={onRemoveVoiceover}
      onAssemble={vi.fn()}
      onCancel={vi.fn()}
      onDownload={vi.fn()}
    />
  )
  const file = new File(['voice'], 'narration.mp3', { type: 'audio/mpeg' })
  fireEvent.change(screen.getByLabelText('studio.timeline.voiceover'), {
    target: { files: [file] },
  })
  expect(onUploadVoiceover).toHaveBeenCalledWith(file)
  fireEvent.change(screen.getByLabelText('studio.timeline.voiceoverVolume'), {
    target: { value: '0.4' },
  })
  expect(onVoiceoverVolumeChange).toHaveBeenCalledWith(0.4)
  fireEvent.click(
    screen.getByRole('button', { name: 'studio.timeline.removeVoiceover' })
  )
  expect(onRemoveVoiceover).toHaveBeenCalledOnce()
})
