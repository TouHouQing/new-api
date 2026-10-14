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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { createElement, useState } from 'react'
import { expect, test } from 'vitest'

import zh from '@/i18n/locales/zh.json'

import {
  applyStudioAssistantPlan,
  hashStudioAssistantProject,
  importStudioSkill,
  exportStudioSkill,
  saveStudioDraftSkill,
  parseStudioAssistantPlan,
  planStudioLiteralRename,
  restoreStudioBuiltinSkill,
} from '../studio-assistant'
import { StudioAssistantPlanEditor } from '../studio-assistant-plan-editor'
import { createStudioEditedNode } from '../studio-media-editing'
import { studioPrevisSchema } from '../studio-previs'
import {
  sampleStudioPrevisTrack,
  upsertStudioPrevisKey,
} from '../studio-previs-keyframes'
import { studioProductionSchema } from '../studio-production'
import { adoptStudioReferenceShots } from '../studio-reference-analysis'
import {
  addStudioNode,
  createStudioProject,
  recordStudioTake,
} from '../workspace'

test('an applied plan retains its immutable before value after reopening the saved document', () => {
  const original = addStudioNode(
    createStudioProject('Film', 'snapshot'),
    'video',
    'video'
  )
  original.nodes[0].data.title = 'Original shot'
  const plan = JSON.stringify({
    summary: 'Rename',
    operations: [
      { op: 'update_node', nodeId: 'video', patch: { title: 'Renamed shot' } },
    ],
    generateNodeIds: [],
  })
  const applied = structuredClone(original)
  applied.nodes[0].data.title = 'Renamed shot'
  applied.production = {
    ...studioProductionSchema.parse({}),
    assistant: {
      messages: [],
      applied: true,
      proposal: plan,
      undoDocument: JSON.stringify(original),
    },
  }
  const view = render(
    createElement(StudioAssistantPlanEditor, {
      project: applied,
      value: plan,
      disabled: true,
      onChange: () => {},
    })
  )
  expect(view.container.textContent).toContain('Original shot')
  view.rerender(
    createElement(StudioAssistantPlanEditor, {
      project: JSON.parse(JSON.stringify(applied)),
      value: plan,
      disabled: true,
      onChange: () => {},
    })
  )
  expect(view.container.textContent).toContain('Original shot')
})

test('a plan remains editable after clearing a required name and permits numeric and boolean edits', async () => {
  const project = addStudioNode(
    createStudioProject('Film', 'plan-fields'),
    'video',
    'video'
  )
  const initial = JSON.stringify({
    summary: 'Edit the chosen video',
    operations: [
      {
        op: 'update_node',
        nodeId: 'video',
        patch: { title: 'First name', seconds: 5, locked: true },
      },
    ],
    generateNodeIds: [],
  })
  function Host() {
    const [value, setValue] = useState(initial)
    return createElement(
      'div',
      null,
      createElement(StudioAssistantPlanEditor, {
        project,
        value,
        onChange: setValue,
      }),
      createElement('output', { 'data-testid': 'edited-plan' }, value)
    )
  }
  render(createElement(Host))
  const user = userEvent.setup()
  const title = screen.getByRole('textbox')
  await user.clear(title)
  expect(title).toBeVisible()
  expect(() =>
    parseStudioAssistantPlan(
      screen.getByTestId('edited-plan').textContent || ''
    )
  ).toThrow()
  await user.type(title, 'New name')
  const seconds = screen.getByRole('spinbutton')
  await user.clear(seconds)
  await user.type(seconds, '3')
  await user.click(screen.getByRole('checkbox'))
  const plan = parseStudioAssistantPlan(
    screen.getByTestId('edited-plan').textContent || ''
  )
  expect(plan.operations[0]).toMatchObject({
    patch: { title: 'New name', seconds: 3, locked: false },
  })
})

test('an explanation-only skill plan preserves the project without requiring an edit', () => {
  const project = createStudioProject('Film', 'explanation')
  const plan = parseStudioAssistantPlan(
    '{"summary":"Explain the existing project","operations":[],"generateNodeIds":[],"workflowActions":[]}'
  )
  expect(applyStudioAssistantPlan(project, plan)).toEqual(project)
})

test('an explicit local rename targets the second video and preserves the first video and original media', () => {
  let project = addStudioNode(
    createStudioProject('Film', 'rename'),
    'video',
    'first'
  )
  project = addStudioNode(project, 'video', 'second')
  project.nodes[0].data.mediaId = 'first-media'
  project.nodes[1].data.mediaId = 'second-media'
  const plan = planStudioLiteralRename(
    project,
    '只把第二个视频节点的名称改为“结伴前行”，保留第一镜头，不生成任何媒体。'
  )
  expect(plan).toBeDefined()
  if (!plan) throw new Error('Expected a local edit proposal')
  const edited = applyStudioAssistantPlan(project, plan)
  expect(edited.nodes[0]).toEqual(project.nodes[0])
  expect(edited.nodes[1].data.title).toBe('结伴前行')
  expect(edited.nodes[1].data.mediaId).toBe('second-media')
  expect(plan.generateNodeIds).toEqual([])
})

test('restoring a built-in skill selects its original without deleting personal versions', () => {
  const custom = importStudioSkill(
    '---\nname: writing\ndescription: Custom draft\nversion: "1.1"\n---\nKeep finished Takes.'
  )
  const restored = restoreStudioBuiltinSkill(custom)
  expect(restored.activeVersion).toBe('1.0')
  expect(restored.versions.map((version) => version.version)).toEqual([
    '1.0',
    '1.1',
  ])
  expect(restored.versions[1].instructions).toBe(
    custom.versions[1].instructions
  )
})

test('a proposed edit with the existing title is rejected instead of reporting an applied change', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'noop'),
    'video',
    'video'
  )
  expect(() =>
    applyStudioAssistantPlan(project, {
      summary: 'Rename the video',
      operations: [
        {
          op: 'update_node',
          nodeId: 'video',
          patch: { title: project.nodes[0].data.title },
        },
      ],
      generateNodeIds: [],
    })
  ).toThrow('No effective changes')
})

test('overriding a built-in skill keeps its original version available for rollback', () => {
  const imported = importStudioSkill(
    '---\nname: writing\ndescription: New direction\nversion: "1.1"\n---\nPreserve characters and edit only the requested shot.'
  )
  expect(imported.versions.map((version) => version.version)).toEqual([
    '1.0',
    '1.1',
  ])
})

test('a proposed reusable skill needs review, preserves versions and exports interoperable metadata', () => {
  const project = createStudioProject('Film', 'skill-draft')
  const draft = {
    id: 'forest-production',
    name: '森林短片制作',
    description: 'Plan a short forest film with preserved narration.',
    version: '1.0',
    instructions:
      'Read projectId with studio_read_project. Review owned reference media and chosen Takes. Confirm a hard budget before generation. Recover saved jobs rather than resubmitting. Validate the final MP4 and timed subtitles.',
  }
  const plan = parseStudioAssistantPlan(
    JSON.stringify({
      summary: 'Create a reusable workflow',
      operations: [],
      generateNodeIds: [],
      workflowActions: [],
      skillDraft: draft,
    })
  )
  expect(
    applyStudioAssistantPlan(project, plan).production?.skills || []
  ).toEqual([])
  const saved = saveStudioDraftSkill(project, draft)
  const skill = saved.production?.skills[0]
  expect(skill?.allowGeneration).toBe(false)
  if (!skill) throw new Error('Draft must be saved after review')
  const markdown = exportStudioSkill(skill)
  expect(markdown).not.toMatch(/^version:/m)
  expect(markdown).not.toMatch(/^display-name:/m)
  const restored = importStudioSkill(markdown)
  expect(restored).toMatchObject({
    id: skill.id,
    name: draft.name,
    activeVersion: '1.0',
    allowGeneration: false,
  })
  expect(restored.versions[0].instructions.trim()).toBe(draft.instructions)
  expect(saveStudioDraftSkill(saved, draft)).toBe(saved)
  const updated = saveStudioDraftSkill(saved, {
    ...draft,
    version: '2.0',
    instructions: `${draft.instructions} Check quality reports.`,
  })
  expect(
    updated.production?.skills[0].versions.map((item) => item.version)
  ).toEqual(['1.0', '2.0'])
  expect(() =>
    saveStudioDraftSkill(saved, {
      ...draft,
      instructions: `${draft.instructions} Different content.`,
    })
  ).toThrow('already installed')
})

test('a persisted assistant snapshot survives JSON key reordering but rejects creative edits', async () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'image',
    'image'
  )
  const hash = await hashStudioAssistantProject(project)
  const reordered = {
    ...project,
    nodes: project.nodes.map((node) => ({
      ...node,
      data: Object.fromEntries(
        Object.entries(node.data).reverse()
      ) as typeof node.data,
    })),
  }
  expect(await hashStudioAssistantProject(reordered)).toBe(hash)
  reordered.nodes[0].data.prompt = 'A different scene'
  expect(await hashStudioAssistantProject(reordered)).not.toBe(hash)
})

test('assistant changes only the requested visual and preserves voiceover and selected Takes', () => {
  let project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'third'
  )
  project = recordStudioTake(project, 'third', {
    id: 'accepted',
    createdAt: '2026-10-05T00:00:00Z',
    prompt: 'Old',
    status: 'completed',
    mediaId: 'original',
  })
  project.voiceoverMediaId = 'narration'
  const plan = parseStudioAssistantPlan(
    '{"summary":"Change shot three to close-up","operations":[{"op":"update_node","nodeId":"third","patch":{"prompt":"Close-up"}}],"generateNodeIds":["third"]}'
  )
  const next = applyStudioAssistantPlan(project, plan)
  expect(project.nodes[0].data.mediaId).toBe('original')
  expect(next.voiceoverMediaId).toBe('narration')
  expect(next.nodes[0].data.takes?.[0].mediaId).toBe('original')
  expect(next.nodes[0].data.status).toBe('idle')
  expect(next.nodes[0].data.prompt).toBe('Close-up')
})
test('assistant cannot unlock or edit locked nodes or silently remove production content', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'locked'
  )
  project.nodes[0].data.locked = true
  expect(() =>
    applyStudioAssistantPlan(project, {
      summary: 'edit',
      operations: [
        { op: 'update_node', nodeId: 'locked', patch: { prompt: 'bad' } },
      ],
      generateNodeIds: [],
    })
  ).toThrow(/locked/)
  expect(() =>
    applyStudioAssistantPlan(project, {
      summary: 'delete',
      operations: [{ op: 'remove_nodes', nodeIds: ['locked'] }],
      generateNodeIds: [],
    })
  ).toThrow(/unsupported/)
})
test('skill import stores only instructions, refuses duplicate versions and preserves rollback versions', () => {
  const first = importStudioSkill(
    '---\nname: film-review\ndescription: Inspect shots\nversion: 1.0\n---\nRetain the accepted voiceover.'
  )
  expect(first.allowGeneration).toBe(false)
  const second = importStudioSkill(
    '---\nname: film-review\ndescription: Inspect shots\nversion: 2.0\n---\nInspect only affected shots.',
    first
  )
  expect(second.versions).toHaveLength(2)
  expect(second.versions[0].instructions).toContain('voiceover')
  expect(() =>
    importStudioSkill(
      '---\nname: film-review\ndescription: Inspect shots\nversion: 2.0\n---\nDifferent content.',
      second
    )
  ).toThrow(/already/)
})
test.each(['的名称', '名称', ''])(
  'a clear local rename accepts the wording 节点%s改为 without requesting inference',
  (wording) => {
    let project = addStudioNode(
      createStudioProject('Film', 'literal-wording'),
      'video',
      'first'
    )
    project = addStudioNode(project, 'video', 'second')
    const plan = planStudioLiteralRename(
      project,
      `只把第二个视频节点${wording}改为“结伴前行”，不生成任何媒体。`
    )
    expect(plan?.operations).toEqual([
      { op: 'update_node', nodeId: 'second', patch: { title: '结伴前行' } },
    ])
    expect(plan?.generateNodeIds).toEqual([])
  }
)

test('a free media edit has a distinct result and original source identity', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'source'
  )
  project.nodes[0].data.mediaId = 'original'
  const next = createStudioEditedNode(project, 'source', 'frame', 'frame')
  expect(next.nodes[0].data.mediaId).toBe('original')
  expect(next.nodes[1].data.kind).toBe('image')
  expect(next.nodes[1].data.derivedFrom?.mediaId).toBe('original')
})

test('repeated edits have distinct bounded names even when the source name is at the schema limit', () => {
  const project = addStudioNode(
    createStudioProject('Film', 'names'),
    'image',
    'source'
  )
  project.nodes[0].data.title = '画'.repeat(200)
  project.nodes[0].data.mediaId = 'original'
  const first = createStudioEditedNode(project, 'source', 'one', 'crop')
  const second = createStudioEditedNode(first, 'source', 'two', 'crop')
  expect(second.nodes[1].data.title.length).toBeLessThanOrEqual(200)
  expect(second.nodes[2].data.title.length).toBeLessThanOrEqual(200)
  expect(second.nodes[1].data.title).not.toBe(second.nodes[2].data.title)
  expect(second.nodes[0].data.mediaId).toBe('original')
})

test('an annotation copy uses a translated action name and preserves its source', async () => {
  const language = i18next.language
  i18next.addResourceBundle('zh', 'translation', zh.translation)
  await i18next.changeLanguage('zh')
  try {
    const project = addStudioNode(
      createStudioProject('Film', 'annotation'),
      'image',
      'source'
    )
    project.nodes[0].data.title = '参考图'
    project.nodes[0].data.mediaId = 'original'
    const next = createStudioEditedNode(project, 'source', 'marked', 'annotate')
    expect(next.nodes[1].data.title).toBe('参考图 · 添加标注 · 编辑副本 1')
    expect(next.nodes[1].data.derivedFrom?.mediaId).toBe('original')
    expect(next.nodes[0].data.mediaId).toBe('original')
  } finally {
    await i18next.changeLanguage(language)
  }
})
test('reference analysis appends only selected shots, preserves existing media and records provenance without injecting its JSON into generation', () => {
  let project = addStudioNode(
    createStudioProject('Film', 'film'),
    'video',
    'accepted'
  )
  project = recordStudioTake(project, 'accepted', {
    id: 'original-take',
    createdAt: '2026-10-05T00:00:00Z',
    status: 'completed',
    prompt: '',
    mediaId: 'original-video',
  })
  project.voiceoverMediaId = 'original-narration'
  project = addStudioNode(project, 'text', 'existing-text')
  project = addStudioNode(project, 'image', 'existing-image')
  project.shots = [
    {
      id: 'existing',
      title: 'Accepted',
      textNodeId: 'existing-text',
      imageNodeId: 'existing-image',
      videoNodeId: 'accepted',
    },
  ]
  project = addStudioNode(project, 'text', 'analysis')
  const output = project.nodes.find((node) => node.id === 'analysis')
  if (!output) throw new Error('Missing analysis')
  output.data.outputText = 'Saved structured analysis'
  output.data.derivedFrom = {
    nodeId: 'accepted',
    mediaId: 'original-video',
    action: 'analyze',
  }
  output.data.selectedTakeId = 'analysis-take'
  const next = adoptStudioReferenceShots(
    project,
    'analysis',
    {
      summary: 'Reference',
      motion: '',
      audio: '',
      limitations: 'Sampled',
      shots: [1, 2].map((index) => ({
        title: `Reference ${index}`,
        start: index - 1,
        end: index,
        text: 'Own new description',
        imagePrompt: 'Own still',
        videoPrompt: 'Own movement',
        camera: 'Close-up',
      })),
    },
    [1]
  )
  expect(next.shots).toHaveLength(2)
  expect(next.shots?.[0].videoNodeId).toBe('accepted')
  expect(next.shots?.[1].title).toBe('Reference 2')
  expect(next.nodes.find((node) => node.id === 'accepted')?.data).toEqual(
    project.nodes[0].data
  )
  expect(next.voiceoverMediaId).toBe('original-narration')
  const adopted = next.nodes.find(
    (node) => node.id === next.shots?.[1].textNodeId
  )
  expect(adopted?.data.derivedFrom).toMatchObject({
    nodeId: 'analysis',
    mediaId: 'original-video',
    takeId: 'analysis-take',
  })
  expect(next.edges.filter((edge) => edge.source === 'analysis')).toHaveLength(
    0
  )
  expect(() =>
    adoptStudioReferenceShots(
      project,
      'analysis',
      { summary: 'Empty', motion: '', audio: '', limitations: '', shots: [] },
      []
    )
  ).toThrow(/Select/)
})

test('3D keys interpolate at the playhead, replacing duplicate times rather than adding discontinuities', () => {
  let scene = studioPrevisSchema.parse({
    duration: 4,
    actors: [{ id: 'actor', title: 'Actor', x: 0, z: 0, endX: 0, endZ: 0 }],
  })
  scene = upsertStudioPrevisKey(scene, 'actor', {
    time: 0,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
  })
  scene = upsertStudioPrevisKey(scene, 'actor', {
    time: 4,
    x: 8,
    y: 2,
    z: 4,
    yaw: 90,
  })
  const keys = scene.advanced?.tracks[0].keys
  if (!keys) throw new Error('The keyframe track is missing')
  expect(sampleStudioPrevisTrack(keys, 2, keys[0])).toEqual({
    time: 2,
    x: 4,
    y: 1,
    z: 2,
    yaw: 45,
  })
  scene = upsertStudioPrevisKey(scene, 'actor', {
    time: 4,
    x: 4,
    y: 0,
    z: 0,
    yaw: 0,
  })
  expect(scene.advanced?.tracks[0].keys).toHaveLength(2)
  expect(() =>
    upsertStudioPrevisKey(scene, 'actor', { ...keys[0], time: 5 })
  ).toThrow(/duration/)
})
