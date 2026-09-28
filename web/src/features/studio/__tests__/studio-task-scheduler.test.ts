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
import { expect, test } from 'vitest'

import {
  StudioTaskPollSchedule,
  pollStudioTasksBounded,
} from '../studio-task-scheduler'

test('task polling backs off failed checks without starving other tasks', () => {
  const schedule = new StudioTaskPollSchedule()
  expect(schedule.due('task-a', 1000)).toBe(true)
  schedule.recordFailure('task-a', 1000)
  expect(schedule.due('task-a', 10_999)).toBe(false)
  expect(schedule.due('task-b', 1001)).toBe(true)
  expect(schedule.due('task-a', 11_000)).toBe(true)
  schedule.recordFailure('task-a', 11_000)
  expect(schedule.due('task-a', 30_999)).toBe(false)
  schedule.recordSuccess('task-a', 31_000)
  expect(schedule.due('task-a', 35_999)).toBe(false)
  expect(schedule.due('task-a', 36_000)).toBe(true)
  schedule.retain(['task-b'])
  expect(schedule.due('task-a', 36_000)).toBe(true)
})

test('task polling limits concurrent network checks', async () => {
  const releases: Array<() => void> = []
  const started: number[] = []
  const run = pollStudioTasksBounded([1, 2, 3, 4], 2, async (id) => {
    started.push(id)
    await new Promise<void>((resolve) => releases.push(resolve))
  })
  await Promise.resolve()
  expect(started).toEqual([1, 2])
  releases.shift()?.()
  await Promise.resolve()
  await Promise.resolve()
  expect(started).toEqual([1, 2, 3])
  releases.shift()?.()
  releases.shift()?.()
  await Promise.resolve()
  await Promise.resolve()
  expect(started).toEqual([1, 2, 3, 4])
  releases.shift()?.()
  await run
})
