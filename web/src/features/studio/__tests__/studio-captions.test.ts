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

import { parseStudioCaptions } from '../studio-captions'

test('SRT captions parse BOM, numeric identifiers, CRLF, and multiline text', () => {
  expect(
    parseStudioCaptions(
      '\uFEFF1\r\n00:00:01,250 --> 00:00:02,500\r\nFirst line\r\nSecond line\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nNext\r\n'
    )
  ).toEqual([
    { start: 1.25, end: 2.5, text: 'First line\nSecond line' },
    { start: 3, end: 4, text: 'Next' },
  ])
})

test('WebVTT captions parse cue identifiers, settings, and minute timestamps', () => {
  expect(
    parseStudioCaptions(
      'WEBVTT\n\nNOTE source transcript\nignore this\n\nopening\n00:01.000 --> 00:02.250 align:center\nHello\n\n00:03.000 --> 00:04.000\nWorld'
    )
  ).toEqual([
    { start: 1, end: 2.25, text: 'Hello' },
    { start: 3, end: 4, text: 'World' },
  ])
})

test('invalid or empty timed cues are rejected with a useful error', () => {
  expect(() =>
    parseStudioCaptions('00:02.000 --> 00:01.000\nBackwards')
  ).toThrow('caption cue 1')
  expect(() => parseStudioCaptions('00:01.000 --> 00:02.000')).toThrow(
    'caption cue 1'
  )
  expect(() => parseStudioCaptions('not a subtitle')).toThrow('caption cue 1')
})

test('blank caption input produces no cues', () => {
  expect(parseStudioCaptions(' \n\r\n')).toEqual([])
})
