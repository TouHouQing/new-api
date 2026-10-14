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
import i18next from 'i18next'
import { expect, test } from 'vitest'

import {
  studioEditableScreenplay,
  applyStudioEditableScreenplay,
  studioPlanStoryDraft,
  studioCreationProgress,
} from '../studio-creation'
import { classifyStudioCreationModels } from '../studio-creation-models'
import { studioCreationTemplate } from '../studio-creation-templates'
import { studioProductionSchema } from '../studio-production'
import { applyStudioScreenplay } from '../studio-screenplay'
import { addStudioShot, createStudioProject } from '../workspace'

test('all creative templates retain the authors story, duration and frame', () => {
  const project = createStudioProject('My story', 'template')
  project.production = {
    ...studioProductionSchema.parse({}),
    brief: 'A blue bicycle arrives.\n\nA child waves.',
    targetDuration: 12,
    width: 1080,
    height: 1920,
  }
  for (const goal of ['story', 'product', 'explain', 'presenter'] as const) {
    const draft = studioCreationTemplate(project, goal, i18next.t)
    expect(draft.brief).toBe(project.production.brief)
    expect(
      draft.shots.reduce((sum, shot) => sum + (shot.seconds || 0), 0)
    ).toBe(12)
    expect(draft.shots.map((shot) => shot.text).join(' ')).toContain(
      'blue bicycle'
    )
  }
  expect(project.production.height).toBe(1920)
})

test('a one second manual plan never silently extends the requested duration', () => {
  const draft = studioPlanStoryDraft(
    createStudioProject('Short', 'short'),
    'One.\n\nTwo.\n\nThree.',
    1
  )
  expect(draft.shots.reduce((sum, shot) => sum + (shot.seconds || 0), 0)).toBe(
    1
  )
})

test('account model recommendations separate actual local text, image and video services from audio tools', () => {
  expect(
    classifyStudioCreationModels([
      'qwen3.5:9b',
      'flux.2-klein-4b',
      'wan2.2-ti2v-5b',
      'whisper-local',
      'chatterbox-local',
      'studio-lip-sync',
    ])
  ).toEqual({
    text: ['qwen3.5:9b'],
    image: ['flux.2-klein-4b'],
    video: ['wan2.2-ti2v-5b'],
  })
})

test('manual drafts use localized default shot names without changing their story', () => {
  const draft = studioPlanStoryDraft(
    createStudioProject('影片', 'localized'),
    '小狐狸发现灯笼。',
    5,
    '镜头'
  )
  expect(draft.shots[0].title).toBe('镜头 1')
  expect(draft.shots[0].text).toBe('小狐狸发现灯笼。')
})

test('a story can become an editable saved draft without image or video prompts', () => {
  const project = createStudioProject('First film', 'film')
  const draft = studioPlanStoryDraft(project, 'A courier finds a letter.', 12)
  draft.shots[0].imagePrompt = ''
  draft.shots[0].videoPrompt = ''
  let sequence = 0
  const saved = applyStudioScreenplay(project, draft, () => `id-${++sequence}`)
  expect(saved.shots).toHaveLength(1)
  expect(
    saved.nodes.find((node) => node.id === saved.shots?.[0].textNodeId)?.data
      .outputText
  ).toBe('A courier finds a letter.')
  expect(studioCreationProgress(saved).visual).toBe(false)
})

test('a reordered screenplay preserves shot identity and existing selected media', () => {
  let sequence = 0
  const makeId = () => `id-${++sequence}`
  const project = createStudioProject('Film', 'film')
  const draft = studioPlanStoryDraft(
    project,
    'The courier arrives.\n\nThe letter is delivered.',
    10
  )
  const saved = applyStudioScreenplay(project, draft, makeId)
  const shots = saved.shots || []
  const shotIds = shots.map((shot) => shot.id)
  const selected = saved.nodes.find((node) => node.id === shots[0]?.videoNodeId)
  if (!selected) throw new Error('The first video node is missing')
  selected.data.mediaId = 'approved-video'
  const editable = studioEditableScreenplay(saved)
  editable.shots.reverse()
  const revised = applyStudioScreenplay(saved, editable, makeId)
  expect(revised.shots?.map((shot) => shot.id)).toEqual([...shotIds].reverse())
  expect(
    revised.nodes.find((node) => node.id === shots[0]?.videoNodeId)?.data
      .mediaId
  ).toBe('approved-video')
})

test('a persisted unfinished draft is restored rather than replaced by a new plan', () => {
  const project = createStudioProject('Draft', 'draft')
  const draft = studioPlanStoryDraft(project, 'An unfinished story.', 8)
  draft.shots[0].dialogue = 'Keep this line.'
  project.production = {
    ...studioCreationProgress(project).production,
    screenplayDraft: JSON.stringify(draft),
  }
  expect(studioEditableScreenplay(project).shots[0].dialogue).toBe(
    'Keep this line.'
  )
})

test('temporarily empty shot titles remain editable until the plan is applied', () => {
  const project = createStudioProject('Draft', 'draft')
  const draft = studioPlanStoryDraft(project, 'A story.', 8)
  draft.shots[0].title = ''
  project.production = {
    ...studioCreationProgress(project).production,
    screenplayDraft: JSON.stringify(draft),
  }
  expect(studioEditableScreenplay(project).shots[0].title).toBe('')
  expect(() => applyStudioScreenplay(project, draft)).toThrow()
})

test('editing a legacy canvas screenplay adopts its existing shot IDs and selected media', () => {
  const project = addStudioShot(
    createStudioProject('Legacy', 'legacy'),
    'shot',
    { text: 'text', image: 'image', video: 'video' },
    'Opening'
  )
  const node = project.nodes.find((node) => node.id === 'video')
  if (!node) throw new Error('Video node missing')
  node.data.mediaId = 'approved-film'
  const draft = studioEditableScreenplay(project)
  draft.shots[0].title = 'Revised opening'
  const next = applyStudioEditableScreenplay(project, draft)
  expect(next.shots?.map((shot) => shot.id)).toEqual(['shot'])
  expect(next.shots?.[0].videoNodeId).toBe('video')
  expect(next.nodes.find((node) => node.id === 'video')?.data.mediaId).toBe(
    'approved-film'
  )
})
