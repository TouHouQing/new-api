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

import {
  studioCaptionTrack,
  studioCaptionTrackSrt,
} from '../studio-caption-track'
import {
  studioProductionSchema,
  studioTimelineClipSchema,
} from '../studio-production'
import { parseStudioSubtitleCues } from '../studio-subtitle-cues'
import { addStudioNode, createStudioProject } from '../workspace'

test('clip captions appear in the same exported SRT with decoded duration and a timeline offset', () => {
  let project = addStudioNode(createStudioProject('Film', 'film'), 'video', 'a')
  project = addStudioNode(project, 'video', 'b')
  project.nodes[0].data.mediaId = 'media-a'
  project.nodes[1].data.mediaId = 'media-b'
  project.production = {
    ...studioProductionSchema.parse({}),
    timelineEdited: true,
    timeline: [
      studioTimelineClipSchema.parse({
        id: 'clip-a',
        nodeId: 'a',
        caption: 'First line',
      }),
      studioTimelineClipSchema.parse({
        id: 'clip-b',
        nodeId: 'b',
        caption: 'Second line',
        captionOffset: 0.5,
        captionDuration: 1,
      }),
    ],
  }
  const durations = { 'media-a': 3, 'media-b': 2 }
  expect(
    parseStudioSubtitleCues(studioCaptionTrackSrt(project, durations))
  ).toEqual([
    { start: 0, end: 3, text: 'First line' },
    { start: 3.5, end: 4.5, text: 'Second line' },
  ])
  expect(
    studioCaptionTrack(project, durations).map((row) => row.source)
  ).toEqual(['clip', 'clip'])
})

test('imported SRT retains its global timing and does not duplicate dialogue captions', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'a'
  )
  project.nodes[0].data.mediaId = 'media'
  project.captionsText = '1\n00:00:00,000 --> 00:00:01,000\nImported\n'
  project.captionOffsetSeconds = 1
  expect(studioCaptionTrack(project)).toMatchObject([
    { source: 'srt', start: 1, end: 2, text: 'Imported' },
  ])
})

test('dialogue subtitles stop with decoded speech and retain the shot offset', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'a'
  )
  project.nodes[0].data.mediaId = 'video'
  project.shots = [
    {
      id: 'shot',
      title: 'Shot',
      textNodeId: 'text',
      imageNodeId: 'image',
      videoNodeId: 'a',
    },
  ]
  project.production = studioProductionSchema.parse({
    dialogueCues: [
      {
        id: 'cue',
        shotId: 'shot',
        text: 'Hello',
        offset: 0.2,
        audioMediaId: 'voice',
        duration: 10,
      },
    ],
  })
  expect(studioCaptionTrack(project, { video: 5, voice: 2.4 })).toMatchObject([
    { start: 0.2, end: 2.6, text: 'Hello', source: 'dialogue' },
  ])
})
