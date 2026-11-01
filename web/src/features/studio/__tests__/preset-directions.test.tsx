/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import {
  StudioVisualPresetLibrary,
  type StudioVisualPresetDemoManifest,
} from '../studio-visual-preset-library'
import { STUDIO_VISUAL_PRESETS } from '../studio-visual-presets'
import { addStudioNode, createStudioProject } from '../workspace'

function mount(
  options: {
    model?: string
    locked?: boolean
    prompt?: string
    movement?: string
    manifest?: StudioVisualPresetDemoManifest
  } = {}
) {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'video'
  )
  const node = project.nodes[0]
  node.data = {
    ...node.data,
    model: options.model || 'wan-local',
    prompt: options.prompt || 'A fox',
    camera: { movement: options.movement },
    locked: options.locked,
    selectedTakeId: 'approved',
    mediaId: 'approved-media',
  }
  const onApply = vi.fn()
  const view = render(
    <StudioVisualPresetLibrary
      node={node}
      presets={[]}
      favorites={[]}
      onApply={onApply}
      onSave={vi.fn()}
      demoManifest={options.manifest || {}}
    />
  )
  return { node, onApply, view }
}

test('applying an opposite camera direction requires an explicit choice and cancelling preserves the draft', () => {
  const { onApply } = mount({
    movement: 'static camera',
    prompt: 'A fox, static camera',
  })
  fireEvent.click(screen.getAllByRole('button', { name: 'Apply preset' })[0])
  expect(screen.getByRole('alertdialog')).toBeVisible()
  expect(screen.getByLabelText('Prompt after replacement')).not.toHaveValue(
    expect.stringContaining('static camera')
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Keep current direction' })
  )
  expect(onApply).not.toHaveBeenCalled()
})

test('confirming a direction replacement changes only draft fields and removes the conflicting direction', () => {
  const { onApply, node } = mount({
    movement: 'static camera',
    prompt: 'A fox, static camera',
  })
  fireEvent.click(screen.getAllByRole('button', { name: 'Apply preset' })[0])
  fireEvent.click(
    screen.getByRole('button', { name: 'Replace conflicting settings' })
  )
  expect(onApply).toHaveBeenCalledOnce()
  const updated = { ...node.data, ...onApply.mock.calls[0][0] }
  expect(updated.camera.movement).toBe('slow dolly in')
  expect(updated.prompt).toContain('A fox')
  expect(updated.prompt).not.toContain('static camera')
  expect(updated.selectedTakeId).toBe('approved')
  expect(updated.mediaId).toBe('approved-media')
})

test('a still frame alone is not labelled as a verified motion demonstration', () => {
  mount({
    manifest: {
      'camera-push': { model: 'FLUX.2 Klein 4B', width: 512, height: 320 },
    },
  })
  expect(screen.getAllByText('Motion demonstration not verified')).toHaveLength(
    11
  )
  expect(screen.queryByText('Demonstrated with the selected model')).toBeNull()
})

test('a real video sample exposes playback and provenance while another model remains unverified', () => {
  mount({
    model: 'different-video',
    manifest: {
      'camera-push': {
        video: {
          url: '/studio-presets/push-demo.mp4',
          model: 'Wan 2.2',
          modelId: 'wan-local',
          sha256: 'a'.repeat(64),
          kind: 'model-output',
          verification: 'verified',
        },
      },
    },
  })
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Compare preset example: Gentle push in',
    })
  )
  const video = screen.getByLabelText('Preset motion demo: Gentle push in')
  expect(video).toHaveAttribute('src', '/studio-presets/push-demo.mp4')
  expect(screen.getByText(/Model-generated demonstration/)).toBeVisible()
  expect(screen.queryByText('Demonstrated with the selected model')).toBeNull()
  fireEvent.error(video)
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The motion demo could not be played'
  )
  expect(screen.queryByText('Playable demo available')).toBeNull()
})

test('a diagram does not count as verification of the selected generation model', () => {
  mount({
    manifest: {
      'camera-push': {
        video: {
          url: '/studio-presets/push-diagram.mp4',
          model: 'FFmpeg',
          modelId: 'wan-local',
          sha256: 'b'.repeat(64),
          kind: 'motion-diagram',
          verification: 'verified',
        },
      },
    },
  })
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Compare preset example: Gentle push in',
    })
  )
  expect(screen.getByText(/Motion diagram; not a model output/)).toBeVisible()
  expect(screen.queryByText('Demonstrated with the selected model')).toBeNull()
})

test('a locked shot cannot receive a visual preset', () => {
  const { onApply } = mount({ locked: true })
  for (const button of screen.getAllByRole('button', {
    name: 'Apply preset',
  })) {
    expect(button).toBeDisabled()
  }
  expect(onApply).not.toHaveBeenCalled()
  expect(
    within(screen.getByRole('status')).getByText(/This shot is locked/)
  ).toBeVisible()
})

test('a replacement preview cannot overwrite a shot edited while the confirmation is open', () => {
  const { node, onApply, view } = mount({
    movement: 'static camera',
    prompt: 'A fox, static camera',
  })
  fireEvent.click(screen.getAllByRole('button', { name: 'Apply preset' })[0])
  view.rerender(
    <StudioVisualPresetLibrary
      node={{
        ...node,
        data: {
          ...node.data,
          prompt: 'The latest collaborative edit, static camera',
        },
      }}
      presets={[]}
      favorites={[]}
      onApply={onApply}
      onSave={vi.fn()}
      demoManifest={{}}
    />
  )
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The shot changed while you were reviewing'
  )
  expect(
    screen.getByRole('button', { name: 'Replace conflicting settings' })
  ).toBeDisabled()
  expect(onApply).not.toHaveBeenCalled()
})

test('a controlled illustration keeps its failed real model test visible without certifying the model', () => {
  mount({
    manifest: {
      'camera-push': {
        video: {
          url: '/studio-presets/illustration.mp4',
          model: 'Original geometry',
          sha256: 'a'.repeat(64),
          kind: 'motion-diagram',
          verification: 'verified',
        },
        modelTest: {
          url: '/studio-presets/failed-test.mp4',
          model: 'Wan',
          modelId: 'wan-local',
          sha256: 'b'.repeat(64),
          kind: 'model-output',
          verification: 'unverified',
          notes: 'Framing was not retained',
        },
      },
    },
  })
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Compare preset example: Gentle push in',
    })
  )
  fireEvent.click(screen.getByText('Inspect actual model test'))
  expect(
    screen.getByLabelText('Recorded model test: Gentle push in')
  ).toHaveAttribute('src', '/studio-presets/failed-test.mp4')
  expect(screen.getByText(/recorded model test did not pass/)).toBeVisible()
  expect(screen.queryByText('Demonstrated with the selected model')).toBeNull()
})

test('removal previews exact changes, cancellation preserves the draft, and stale review cannot overwrite it', () => {
  const { node, onApply, view } = mount()
  const data = {
    ...node.data,
    visualPresetIds: ['camera-push@1'],
    camera: { ...STUDIO_VISUAL_PRESETS[0].camera },
  }
  const props = {
    node: { ...node, data },
    presets: [],
    favorites: [],
    onApply,
    onSave: vi.fn(),
    demoManifest: {},
  }
  view.rerender(<StudioVisualPresetLibrary {...props} />)
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Remove applied preset: Gentle push in',
    })
  )
  expect(screen.getByRole('alertdialog')).toHaveTextContent('slow dolly in')
  fireEvent.click(screen.getByRole('button', { name: 'Keep preset' }))
  expect(onApply).not.toHaveBeenCalled()
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Remove applied preset: Gentle push in',
    })
  )
  view.rerender(
    <StudioVisualPresetLibrary
      {...props}
      node={{ ...node, data: { ...data, prompt: 'Latest edit' } }}
    />
  )
  expect(
    screen.getByRole('button', { name: 'Remove preset settings' })
  ).toBeDisabled()
  expect(onApply).not.toHaveBeenCalled()
})
