/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'

import type { StudioTrackingPoint } from '../studio-tracking'
import { StudioTrackingEditor } from '../studio-tracking-editor'

const request = vi.hoisted(() => vi.fn())
vi.mock('../studio-cloud', () => ({
  studioCloudRequest: (...args: unknown[]) => request(...args),
}))

const manualKeys = [0, 1, 2, 3, 4, 5].map((time) => ({
  time,
  x: time / 10,
  y: 0,
}))
const points: StudioTrackingPoint[] = manualKeys.map((key) => ({
  time: key.time,
  crop: { x: key.x, y: key.y, width: 0.3, height: 1 },
  confidence: 0.2,
  review_required: false,
  manual: true,
}))
const defaultProps = {
  path: '/projects/own-test',
  analysisId: 'saved-six',
  points,
  url: 'blob:own-source',
  readOnly: false,
  onCorrect: vi.fn(),
  manualKeys,
}
function renderEditor(
  props: ComponentProps<typeof StudioTrackingEditor> = defaultProps
) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  const view = (next: typeof props) => (
    <QueryClientProvider client={client}>
      <StudioTrackingEditor {...next} />
    </QueryClientProvider>
  )
  const result = render(view(props))
  return {
    ...result,
    update: (next: typeof props) => result.rerender(view(next)),
  }
}
const save = () =>
  screen.getByRole('button', { name: 'Save a corrected trajectory version' })
const confirm = () =>
  screen.getByRole('checkbox', {
    name: 'I checked these manual keys against the source footage.',
  })

beforeEach(() => {
  request.mockReset().mockResolvedValue({ id: 'corrected-seven' })
  defaultProps.onCorrect.mockClear()
})

test('restores all saved keys and retains inner keys when an endpoint is adjusted and saved', async () => {
  const user = userEvent.setup()
  renderEditor()
  expect(screen.getAllByRole('spinbutton')).toHaveLength(18)
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Crop key 1 x' }), {
    target: { value: '5' },
  })
  await user.click(confirm())
  await user.click(save())
  await waitFor(() => expect(request).toHaveBeenCalledOnce())
  expect(request.mock.calls[0][2].keys).toEqual([
    { time: 0, x: 0.05, y: 0 },
    ...manualKeys.slice(1),
  ])
  expect(request.mock.calls[0][2].confirmed).toBe(true)
  expect(defaultProps.onCorrect).toHaveBeenCalledWith('corrected-seven')
})

test('same-analysis query objects preserve unsaved edits and explicit confirmation', async () => {
  const user = userEvent.setup()
  const view = renderEditor()
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Crop key 3 x' }), {
    target: { value: '35' },
  })
  await user.click(confirm())
  view.update({
    ...defaultProps,
    points: points.map((point) => ({ ...point, crop: { ...point.crop } })),
    manualKeys: manualKeys.map((key) => ({ ...key })),
  })
  expect(screen.getByRole('spinbutton', { name: 'Crop key 3 x' })).toHaveValue(
    35
  )
  expect(confirm()).toBeChecked()
  expect(save()).toBeEnabled()
})

test('changing immutable analysis identity restores that version and requires fresh review', async () => {
  const user = userEvent.setup()
  const view = renderEditor()
  await user.click(confirm())
  view.update({
    ...defaultProps,
    analysisId: 'other-version',
    manualKeys: [manualKeys[0], manualKeys[5]],
  })
  await waitFor(() => expect(screen.getAllByRole('spinbutton')).toHaveLength(6))
  expect(confirm()).not.toBeChecked()
  expect(save()).toBeDisabled()
})

test.each(
  [
    null,
    {},
    [],
    [manualKeys[0]],
    [manualKeys[1], manualKeys[0]],
    [manualKeys[0], manualKeys[0]],
    [{ time: -1, x: 0, y: 0 }, manualKeys[5]],
    [manualKeys[0], { time: 6, x: 0, y: 0 }],
    [manualKeys[0], { time: 5, x: 0.71, y: 0 }],
    [manualKeys[0], { time: 5, x: 0, y: 0.01 }],
    [manualKeys[0], { time: '5', x: 0, y: 0 }],
    [manualKeys[0], { time: 5, x: Number.NaN, y: 0 }],
    Array.from({ length: 101 }, (_, i) => ({ time: i / 20, x: 0, y: 0 })),
  ].map((value) => ({ value }))
)(
  'an invalid persisted key set blocks overwriting it instead of silently seeding endpoints: $value',
  ({ value }) => {
    renderEditor({ ...defaultProps, manualKeys: value })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The saved crop keys are invalid'
    )
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
    expect(confirm()).toHaveAttribute('aria-disabled', 'true')
    expect(save()).toBeDisabled()
    expect(request).not.toHaveBeenCalled()
  }
)

test('only a result without previous correction seeds endpoints', () => {
  renderEditor({ ...defaultProps, manualKeys: undefined })
  expect(screen.getAllByRole('spinbutton')).toHaveLength(6)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('invalid edited source-time order needs correction before confirmation or save', () => {
  renderEditor()
  fireEvent.change(
    screen.getByRole('spinbutton', { name: 'Crop key 3 time' }),
    { target: { value: '4.5' } }
  )
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Use increasing source times'
  )
  expect(confirm()).toHaveAttribute('aria-disabled', 'true')
  expect(save()).toBeDisabled()
})

test('read-only access displays all saved keys without mutation controls', () => {
  renderEditor({ ...defaultProps, readOnly: true })
  const fields = screen.getAllByRole('spinbutton')
  expect(fields).toHaveLength(18)
  fields.forEach((field) => expect(field).toBeDisabled())
  expect(confirm()).toHaveAttribute('aria-disabled', 'true')
  expect(save()).toBeDisabled()
  expect(request).not.toHaveBeenCalled()
})
