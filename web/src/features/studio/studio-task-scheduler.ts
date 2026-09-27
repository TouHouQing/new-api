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
export class StudioTaskPollSchedule {
  private readonly nextAt = new Map<string, number>()
  private readonly failures = new Map<string, number>()

  due(taskId: string, now: number): boolean {
    return now >= (this.nextAt.get(taskId) ?? 0)
  }

  recordFailure(taskId: string, now: number): void {
    const failures = (this.failures.get(taskId) ?? 0) + 1
    this.failures.set(taskId, failures)
    this.nextAt.set(taskId, now + Math.min(60_000, 5000 * 2 ** failures))
  }

  recordSuccess(taskId: string, now: number): void {
    this.failures.delete(taskId)
    this.nextAt.set(taskId, now + 5000)
  }

  retain(taskIds: readonly string[]): void {
    const active = new Set(taskIds)
    for (const taskId of this.nextAt.keys()) {
      if (!active.has(taskId)) this.nextAt.delete(taskId)
    }
    for (const taskId of this.failures.keys()) {
      if (!active.has(taskId)) this.failures.delete(taskId)
    }
  }
}

export async function pollStudioTasksBounded<T>(
  items: readonly T[],
  concurrency: number,
  handler: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const item = items[cursor]
      cursor += 1
      await handler(item)
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(items.length, Math.max(1, Math.floor(concurrency))) },
      () => worker()
    )
  )
}
