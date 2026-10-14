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
import { expect, test } from 'vitest'

import { studioProductionSchema } from '../studio-production'
import { studioTimelineSchedule } from '../studio-timeline-playback'
import { createStudioProject, addStudioNode } from '../workspace'

test('preview shares the renderers cumulative frame boundaries for fractional cuts', () => {
  const project = addStudioNode(
    createStudioProject('Fractional film', 'fractional-film'),
    'video',
    'source'
  )
  project.nodes[0].data.mediaId = 'video'
  project.production = studioProductionSchema.parse({
    fps: 24,
    timelineEdited: true,
    timeline: [0, 1, 2].map((index) => ({
      id: `cut-${index}`,
      nodeId: 'source',
      trimStart: 0,
      trimEnd: 0.06,
      speed: 1,
    })),
  })
  const schedule = studioTimelineSchedule(project, { video: 1 })
  expect(schedule.map((item) => Math.round(item.duration * 24))).toEqual([
    1, 2, 1,
  ])
  expect(schedule.at(-1)?.end).toBeCloseTo(4 / 24)
})
