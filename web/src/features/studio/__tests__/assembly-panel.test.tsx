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
import userEvent from '@testing-library/user-event'
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

test('assembly timeline shows ordered shots and separate fixed-start audio and caption lanes', () => {
  render(
    <StudioAssemblyPanel
      busy={false}
      progress={0}
      timelineShots={[
        { id: 'shot-1', title: 'Opening', plannedDurationSeconds: 6 },
        { id: 'shot-2', title: 'Ending', plannedDurationSeconds: 10 },
      ]}
      soundtrackUrl='blob:music'
      voiceoverUrl='blob:voice'
      captionsText='1\n00:00:00,000 --> 00:00:01,000\nHello'
      onAssemble={vi.fn()}
      onCancel={vi.fn()}
      onDownload={vi.fn()}
    />
  )

  const shotTrack = screen.getByRole('group', {
    name: 'studio.timeline.shotTrack',
  })
  expect(shotTrack.textContent).toMatch(/Opening.*Ending/)
  expect(
    screen.getByRole('button', {
      name: 'studio.timeline.selectShot: Opening',
    })
  ).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getAllByText('studio.timeline.estimatedDuration')).toHaveLength(
    2
  )
  expect(
    screen.getByRole('group', { name: 'studio.timeline.soundtrack' })
  ).toHaveTextContent('studio.timeline.startsAtZero')
  expect(
    screen.getByRole('group', { name: 'studio.timeline.voiceover' })
  ).toHaveTextContent('studio.timeline.startsAtZero')
  expect(
    screen.getByRole('group', { name: 'studio.timeline.captions' })
  ).toHaveTextContent('studio.timeline.startsAtZero')
})

test('selecting a timeline shot edits that shot trim and transition through callbacks', async () => {
  const onUpdateTimelineShotEdit = vi.fn()
  const onSelectTimelineShot = vi.fn()
  render(
    <StudioAssemblyPanel
      busy={false}
      progress={0}
      timelineShots={[
        { id: 'shot-1', title: 'Opening', plannedDurationSeconds: 6 },
        {
          id: 'shot-2',
          title: 'Ending',
          plannedDurationSeconds: 10,
          trimStart: 1,
        },
      ]}
      onSelectTimelineShot={onSelectTimelineShot}
      onUpdateTimelineShotEdit={onUpdateTimelineShotEdit}
      onAssemble={vi.fn()}
      onCancel={vi.fn()}
      onDownload={vi.fn()}
    />
  )

  fireEvent.click(
    screen.getByRole('button', {
      name: 'studio.timeline.selectShot: Ending',
    })
  )
  expect(onSelectTimelineShot).toHaveBeenCalledWith('shot-2')
  expect(
    screen.getByRole('button', {
      name: 'studio.timeline.selectShot: Ending',
    })
  ).toHaveAttribute('aria-pressed', 'true')
  fireEvent.change(
    screen.getByRole('spinbutton', {
      name: 'Ending studio.timeline.trimStart',
    }),
    { target: { value: '2.5' } }
  )
  expect(onUpdateTimelineShotEdit).toHaveBeenCalledWith('shot-2', {
    trimStart: 2.5,
  })
  fireEvent.change(
    screen.getByRole('spinbutton', {
      name: 'Ending studio.timeline.trimEnd',
    }),
    { target: { value: '7' } }
  )
  expect(onUpdateTimelineShotEdit).toHaveBeenCalledWith('shot-2', {
    trimEnd: 7,
  })
  expect(
    screen.queryByRole('combobox', {
      name: 'Ending studio.timeline.transition',
    })
  ).not.toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', {
      name: 'studio.timeline.selectShot: Opening',
    })
  )
  const user = userEvent.setup()
  await user.click(
    screen.getByRole('combobox', {
      name: 'Opening studio.timeline.transition',
    })
  )
  await user.click(screen.getByRole('option', { name: 'studio.timeline.fade' }))
  expect(onUpdateTimelineShotEdit).toHaveBeenCalledWith('shot-1', {
    transition: 'fade',
  })
})

test('timeline reports invalid trim range and prevents invalid export', () => {
  render(
    <StudioAssemblyPanel
      busy={false}
      progress={0}
      timelineShots={[
        { id: 'shot-1', title: 'Opening', trimStart: 8, trimEnd: 4 },
      ]}
      onAssemble={vi.fn()}
      onCancel={vi.fn()}
      onDownload={vi.fn()}
    />
  )
  expect(screen.getByRole('alert')).toHaveTextContent(
    'studio.timeline.invalidTrim'
  )
  expect(
    screen.getByRole('button', { name: 'studio.assembly.create' })
  ).toBeDisabled()
})

test('timeline clip overview identifies configured crop and fade between shots', () => {
  render(
    <StudioAssemblyPanel
      busy={false}
      progress={0}
      timelineShots={[
        {
          id: 'shot-1',
          title: 'Opening',
          trimStart: 1,
          trimEnd: 5,
          transition: 'fade',
          transitionSeconds: 0.7,
        },
        { id: 'shot-2', title: 'Ending' },
      ]}
      onAssemble={vi.fn()}
      onCancel={vi.fn()}
      onDownload={vi.fn()}
    />
  )

  const shotTrack = screen.getByRole('group', {
    name: 'studio.timeline.shotTrack',
  })
  expect(shotTrack).toHaveTextContent('studio.timeline.cropRange')
  expect(shotTrack).toHaveTextContent('studio.timeline.fadeDuration')
})

test('timeline places soundtrack, voiceover and captions at editable start times', () => {
  const onSoundtrackOffsetChange = vi.fn()
  const onVoiceoverOffsetChange = vi.fn()
  const onCaptionOffsetChange = vi.fn()
  render(
    <StudioAssemblyPanel
      busy={false}
      progress={0}
      timelineShots={[{ id: 'shot-1', title: 'Opening' }]}
      soundtrackUrl='blob:music'
      soundtrackOffsetSeconds={2}
      onSoundtrackOffsetChange={onSoundtrackOffsetChange}
      voiceoverUrl='blob:voice'
      voiceoverOffsetSeconds={3}
      onVoiceoverOffsetChange={onVoiceoverOffsetChange}
      captionsText='00:00:00,000 --> 00:00:01,000\nHello'
      captionOffsetSeconds={4}
      onCaptionOffsetChange={onCaptionOffsetChange}
      onAssemble={vi.fn()}
      onCancel={vi.fn()}
      onDownload={vi.fn()}
    />
  )

  const soundtrackStart = screen.getByRole('spinbutton', {
    name: 'studio.timeline.soundtrack studio.timeline.startOffset',
  })
  const voiceoverStart = screen.getByRole('spinbutton', {
    name: 'studio.timeline.voiceover studio.timeline.startOffset',
  })
  const captionStart = screen.getByRole('spinbutton', {
    name: 'studio.timeline.captions studio.timeline.startOffset',
  })
  expect(soundtrackStart).toHaveValue(2)
  expect(voiceoverStart).toHaveValue(3)
  expect(captionStart).toHaveValue(4)

  fireEvent.change(soundtrackStart, { target: { value: '1.5' } })
  fireEvent.change(voiceoverStart, { target: { value: '2.5' } })
  fireEvent.change(captionStart, { target: { value: '3.5' } })
  expect(onSoundtrackOffsetChange).toHaveBeenCalledWith(1.5)
  expect(onVoiceoverOffsetChange).toHaveBeenCalledWith(2.5)
  expect(onCaptionOffsetChange).toHaveBeenCalledWith(3.5)
})

test('timeline reorders shots with boundary-aware move controls', () => {
  const onMoveTimelineShot = vi.fn()
  render(
    <StudioAssemblyPanel
      busy={false}
      progress={0}
      timelineShots={[
        { id: 'shot-1', title: 'Opening' },
        { id: 'shot-2', title: 'Ending' },
      ]}
      onMoveTimelineShot={onMoveTimelineShot}
      onAssemble={vi.fn()}
      onCancel={vi.fn()}
      onDownload={vi.fn()}
    />
  )

  expect(
    screen.getByRole('button', {
      name: 'Opening studio.timeline.moveEarlier',
    })
  ).toBeDisabled()
  expect(
    screen.getByRole('button', {
      name: 'Ending studio.timeline.moveLater',
    })
  ).toBeDisabled()
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Ending studio.timeline.moveEarlier',
    })
  )
  expect(onMoveTimelineShot).toHaveBeenCalledWith('shot-2', 'up')
})
