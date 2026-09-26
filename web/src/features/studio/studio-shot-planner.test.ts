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

import { describe, expect, test } from 'vitest'

import { parseStudioStoryboardResponse } from './api'
import { planLocalStudioShots } from './studio-shot-planning'

describe('Studio shot planning', () => {
  test('splits pasted paragraphs into editable manual shots', () => {
    expect(
      planLocalStudioShots('Arrives at station.\n\nBoards a train.', 4)
    ).toEqual([
      {
        title: 'Shot 1',
        text: 'Arrives at station.',
        imagePrompt: 'Arrives at station.',
        videoPrompt: 'Arrives at station.',
      },
      {
        title: 'Shot 2',
        text: 'Boards a train.',
        imagePrompt: 'Boards a train.',
        videoPrompt: 'Boards a train.',
      },
    ])
  })

  test('keeps every paragraph when the requested shot count is smaller', () => {
    expect(planLocalStudioShots('Opening.\n\nMiddle.\n\nEnding.', 1)).toEqual([
      {
        title: 'Shot 1',
        text: 'Opening.\n\nMiddle.\n\nEnding.',
        imagePrompt: 'Opening.\n\nMiddle.\n\nEnding.',
        videoPrompt: 'Opening.\n\nMiddle.\n\nEnding.',
      },
    ])
    const two = planLocalStudioShots('Opening.\n\nMiddle.\n\nEnding.', 2)
    expect(two).toHaveLength(2)
    expect(two.map((shot) => shot.text).join('\n\n')).toBe(
      'Opening.\n\nMiddle.\n\nEnding.'
    )
  })

  test('parses validated provider shot fields', () => {
    expect(
      parseStudioStoryboardResponse({
        success: true,
        data: {
          shots: [
            {
              title: 'Arrival',
              text: 'At station',
              image_prompt: 'Wide still',
              video_prompt: 'Slow tracking shot',
            },
          ],
        },
      })
    ).toEqual([
      {
        title: 'Arrival',
        text: 'At station',
        imagePrompt: 'Wide still',
        videoPrompt: 'Slow tracking shot',
      },
    ])
    expect(() =>
      parseStudioStoryboardResponse({ success: true, data: { shots: [{}] } })
    ).toThrow()
    expect(() =>
      parseStudioStoryboardResponse({
        success: true,
        data: {
          shots: [
            {
              title: ' ',
              text: 'scene',
              image_prompt: 'still',
              video_prompt: 'move',
            },
          ],
        },
      })
    ).toThrow()
  })
})
