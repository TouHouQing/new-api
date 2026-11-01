/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { expect, test } from 'vitest'

import { studioWorkflowProblem } from './studio-workflow-problem'

test('face and source-interval failures explain the next action without hiding the saved task', () => {
  expect(
    studioWorkflowProblem(
      'video task failed: Frontal face confidence is low; use a clearer face or select its region for manual review'
    )
  ).toBe(
    'Choose a clearer face or select the speaking person’s region, then preview before retrying.'
  )
  expect(
    studioWorkflowProblem(
      'video task failed: Speech features do not cover the selected interval'
    )
  ).toBe(
    'The selected audio and video do not cover this interval. Shorten it or choose longer sources before retrying.'
  )
})

test.each([
  'Request failed with status code 502',
  'Request failed with status code 503',
  'Request failed with status code 504',
  'HTTP 503',
  'Network Error',
  'Failed to fetch',
])('an unavailable service gives recovery guidance for %s', (message) => {
  expect(studioWorkflowProblem(message)).toBe(
    'The service is unavailable or timed out. Keep the task and check its progress before resubmitting.'
  )
})

test.each([
  'Request failed with status code 401',
  'Request failed with status code 403',
])('an authorization failure remains distinct for %s', (message) => {
  expect(studioWorkflowProblem(message)).toBe(
    'The service rejected this request. Check credit and model access, then retry with the saved settings.'
  )
})
