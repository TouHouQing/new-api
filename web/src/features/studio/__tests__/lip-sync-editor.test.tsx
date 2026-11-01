/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'

import {
  studioLipSelectionValid,
  type StudioLipSelection,
} from '../studio-lip-sync'
import { StudioLipSyncEditor } from '../studio-lip-sync-editor'

const initial = { start: 2, end: 3, x: 0, y: 0, width: 0, height: 0 }

test('lip sync validates independent source ranges and rejects missing coverage before generation', () => {
  expect(studioLipSelectionValid(initial, 0.2, 5, 1.3)).toBe(true)
  expect(studioLipSelectionValid(initial, 0.4, 5, 1.3)).toBe(false)
  expect(studioLipSelectionValid(initial, 0, 2.5, 2)).toBe(false)
  expect(
    studioLipSelectionValid({ ...initial, width: 0, height: 100 }, 0, 5, 2)
  ).toBe(false)
  expect(
    studioLipSelectionValid(
      { ...initial, x: 1100, width: 300, height: 200 },
      0,
      5,
      2,
      { width: 1280, height: 384 }
    )
  ).toBe(false)
})

test('speaker region and both source intervals remain directly editable and automatic detection is an explicit action', async () => {
  const onValidation = vi.fn()
  const changes = vi.fn()
  function Example() {
    const [edit, setEdit] = useState<StudioLipSelection>({
      ...initial,
      x: 640,
      width: 640,
      height: 384,
    })
    const [audioStart, setAudioStart] = useState(0.2)
    return (
      <StudioLipSyncEditor
        mediaId='source'
        getMedia={async () => new Blob(['video'])}
        edit={edit}
        onChange={(value) => {
          setEdit(value)
          changes(value)
        }}
        audioStart={audioStart}
        onAudioStart={setAudioStart}
        videoDuration={5}
        audioDuration={2}
        disabled={false}
        onValidation={onValidation}
      />
    )
  }
  render(<Example />)
  const video = await screen.findByLabelText('Speaker source preview')
  Object.defineProperties(video, {
    videoWidth: { value: 1280 },
    videoHeight: { value: 384 },
  })
  fireEvent.loadedMetadata(video)
  await waitFor(() => expect(onValidation).toHaveBeenLastCalledWith(true))
  fireEvent.change(screen.getByLabelText('Source video start in seconds'), {
    target: { value: '2.2' },
  })
  expect(changes).toHaveBeenLastCalledWith(
    expect.objectContaining({ start: 2.2, end: 3, x: 640 })
  )
  fireEvent.change(screen.getByLabelText('Dialogue audio start in seconds'), {
    target: { value: '1.5' },
  })
  await waitFor(() => expect(onValidation).toHaveBeenLastCalledWith(false))
  expect(
    screen.getByRole('button', { name: 'Preview selected source interval' })
  ).toBeDisabled()
  fireEvent.click(
    screen.getByRole('button', { name: 'Automatic detection for one person' })
  )
  expect(changes).toHaveBeenLastCalledWith(
    expect.objectContaining({ x: 0, y: 0, width: 0, height: 0, start: 2.2 })
  )
  expect(screen.getByText(/Output is a new candidate/)).toBeInTheDocument()
})

test('read-only speaker settings cannot be changed or cleared', async () => {
  const onChange = vi.fn()
  render(
    <StudioLipSyncEditor
      mediaId='source'
      getMedia={async () => new Blob(['video'])}
      edit={initial}
      onChange={onChange}
      audioStart={0}
      onAudioStart={vi.fn()}
      videoDuration={5}
      audioDuration={2}
      disabled
      onValidation={vi.fn()}
    />
  )
  expect(screen.getByLabelText('Source video start in seconds')).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Automatic detection for one person' })
  ).toBeDisabled()
  fireEvent.click(
    screen.getByRole('button', { name: 'Automatic detection for one person' })
  )
  expect(onChange).not.toHaveBeenCalled()
})
