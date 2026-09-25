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
import { beforeEach, describe, expect, test } from 'vitest'

import {
  loadStudioProjects,
  parseStudioProjectImport,
  saveStudioProjects,
  serializeStudioProjectExport,
  studioProjectsKey,
} from './local-projects'
import {
  addStudioNode,
  addStudioShot,
  createStudioProject,
  ensureStudioFinalVideo,
} from './workspace'

beforeEach(() => localStorage.clear())

describe('browser-local Studio projects', () => {
  test('persists project defaults across reload and portable export', () => {
    const project = {
      ...createStudioProject('Defaults', 'project-defaults'),
      defaults: {
        videoGroup: '特价sd',
        videoModel: 'site-alias',
        seconds: 30,
        ratio: '9:16',
      },
    }
    saveStudioProjects(localStorage, 12, [project])
    expect(loadStudioProjects(localStorage, 12)[0].defaults).toEqual(
      project.defaults
    )
    expect(
      parseStudioProjectImport(serializeStudioProjectExport(project)).defaults
    ).toEqual(project.defaults)
  })
  test('preserves canvas lines saved before named ports existed', () => {
    let project = addStudioNode(
      createStudioProject('Old canvas', 'old-canvas'),
      'text',
      'text'
    )
    project = addStudioNode(project, 'video', 'video')
    project.edges = [{ id: 'old-line', source: 'text', target: 'video' }]
    saveStudioProjects(localStorage, 12, [project])

    expect(loadStudioProjects(localStorage, 12)[0].edges).toEqual([
      { id: 'old-line', source: 'text', target: 'video' },
    ])
  })
  test('migrates an older pending video task into recoverable version history', () => {
    const project = createStudioProject('Legacy', 'legacy')
    project.nodes = [
      {
        id: 'video',
        type: 'studio',
        position: { x: 0, y: 0 },
        data: {
          kind: 'video',
          title: 'Video',
          prompt: 'old scene',
          model: 'site-alias',
          taskId: 'task-before-update',
          status: 'queued',
        },
      },
    ]
    localStorage.setItem(
      studioProjectsKey(12),
      JSON.stringify({ version: 1, projects: [project] })
    )
    const loaded = loadStudioProjects(localStorage, 12)[0]
    expect(loaded.nodes[0].data.takes?.[0].taskId).toBe('task-before-update')
    expect(loaded.nodes[0].data.selectedTakeId).toBe(
      loaded.nodes[0].data.takes?.[0].id
    )
  })
  test('plain JSON export excludes version, asset, and soundtrack media IDs', () => {
    const project = createStudioProject('Versions', 'p-versions')
    project.nodes = [
      {
        id: 'image',
        type: 'studio',
        position: { x: 0, y: 0 },
        data: {
          kind: 'image',
          title: 'Frame',
          prompt: 'actor',
          mediaId: 'current-media',
          outputUrl: 'https://private.example/current',
          takes: [
            {
              id: 'take-1',
              createdAt: 'now',
              prompt: 'actor',
              status: 'completed',
              mediaId: 'take-media',
              outputUrl: 'https://private.example/take',
            },
          ],
        },
      },
    ]
    project.assets = [
      {
        id: 'actor',
        kind: 'character',
        title: 'Actor',
        prompt: 'red scarf',
        mediaId: 'asset-media',
      },
    ]
    project.soundtrackMediaId = 'audio-media'
    const raw = serializeStudioProjectExport(project)
    for (const id of [
      'current-media',
      'take-media',
      'asset-media',
      'audio-media',
    ]) {
      expect(raw).not.toContain(id)
    }
    const imported = parseStudioProjectImport(raw)
    expect(imported.nodes[0].data.takes?.[0].mediaId).toBeUndefined()
    expect(imported.assets?.[0].mediaId).toBeUndefined()
  })
  test('keeps storyboard and final video links across reload and project export', () => {
    let project = addStudioShot(
      createStudioProject('Drama', 'p1'),
      'shot-1',
      {
        text: 't1',
        image: 'i1',
        video: 'v1',
      },
      'Opening'
    )
    project = ensureStudioFinalVideo(project, 'final')
    saveStudioProjects(localStorage, 12, [project])
    expect(loadStudioProjects(localStorage, 12)[0].finalVideoNodeId).toBe(
      'final'
    )
    expect(
      loadStudioProjects(localStorage, 12)[0].edges.some(
        (edge) => edge.source === 'v1' && edge.target === 'final'
      )
    ).toBe(true)
    expect(
      parseStudioProjectImport(serializeStudioProjectExport(project))
        .finalVideoNodeId
    ).toBe('final')
  })
  test('keeps a generic video format and editable metadata across reload and export', () => {
    const project = {
      id: 'p-custom',
      title: 'Custom video',
      createdAt: 'now',
      updatedAt: 'now',
      edges: [],
      nodes: [
        {
          id: 'video',
          type: 'studio' as const,
          position: { x: 0, y: 0 },
          data: {
            kind: 'video' as const,
            title: 'Shot',
            prompt: 'Sunrise',
            model: '轮换渠道-会员视频',
            videoFamily: 'generic' as const,
            seconds: 30,
            resolution: 'custom-provider-resolution-1536',
            ratio: '2:3',
            metadataJson: '{"aigc_watermark":false}',
          },
        },
      ],
    }
    saveStudioProjects(localStorage, 12, [project])
    expect(
      loadStudioProjects(localStorage, 12)[0].nodes[0].data.resolution
    ).toBe('custom-provider-resolution-1536')
    expect(
      loadStudioProjects(localStorage, 12)[0].nodes[0].data.metadataJson
    ).toBe('{"aigc_watermark":false}')
    expect(
      parseStudioProjectImport(serializeStudioProjectExport(project)).nodes[0]
        .data.videoFamily
    ).toBe('generic')
  })

  test('rejects an imported project that embeds an API key in video metadata', () => {
    expect(() =>
      parseStudioProjectImport(
        JSON.stringify({
          id: 'p',
          title: 'Unsafe',
          createdAt: 'now',
          updatedAt: 'now',
          edges: [],
          nodes: [
            {
              id: 'v',
              type: 'studio',
              position: { x: 0, y: 0 },
              data: {
                kind: 'video',
                title: 'Shot',
                prompt: 'forest',
                metadataJson: '{"api_key":"sk-private"}',
              },
            },
          ],
        })
      )
    ).toThrow('project')
  })
  test('isolates saved projects by New API user ID', () => {
    const project = {
      id: 'project-one',
      title: 'Film ideas',
      nodes: [],
      edges: [],
      createdAt: '2026-09-23T00:00:00.000Z',
      updatedAt: '2026-09-23T00:00:00.000Z',
    }
    saveStudioProjects(localStorage, 12, [project])

    expect(loadStudioProjects(localStorage, 12)).toEqual([project])
    expect(loadStudioProjects(localStorage, 13)).toEqual([])
    expect(studioProjectsKey(12)).not.toBe(studioProjectsKey(13))
  })

  test('treats malformed or outdated documents as empty', () => {
    localStorage.setItem(studioProjectsKey(12), 'broken json')
    expect(() => loadStudioProjects(localStorage, 12)).toThrow('backup')

    localStorage.setItem(
      studioProjectsKey(12),
      JSON.stringify({ version: 0, projects: [{ id: 'old' }] })
    )
    expect(() => loadStudioProjects(localStorage, 12)).toThrow('backup')
  })

  test('rejects an invalid edit before it replaces a valid saved project', () => {
    const project = createStudioProject('Safe', 'safe')
    saveStudioProjects(localStorage, 12, [project])
    const original = localStorage.getItem(studioProjectsKey(12))
    const invalid = {
      ...project,
      assets: [
        {
          id: 'character',
          kind: 'character' as const,
          title: '',
          prompt: 'portrait',
        },
      ],
    }
    expect(() => saveStudioProjects(localStorage, 12, [invalid])).toThrow()
    expect(localStorage.getItem(studioProjectsKey(12))).toBe(original)
  })

  test('preserves arbitrary thirty-second alias projects and repairs invalid legacy durations', () => {
    const node = (id: string, seconds: number | null) => ({
      id,
      type: 'studio',
      position: { x: 0, y: 0 },
      data: {
        kind: 'video',
        title: id,
        prompt: 'a forest',
        model: '会员套餐甲',
        videoFamily: 'seedance-2',
        seconds,
      },
    })
    localStorage.setItem(
      studioProjectsKey(12),
      JSON.stringify({
        version: 1,
        projects: [
          {
            id: 'p',
            title: 'Thirty seconds',
            createdAt: 'now',
            updatedAt: 'now',
            edges: [],
            nodes: [node('valid', 30), node('empty', 0), node('null', null)],
          },
        ],
      })
    )
    const loaded = loadStudioProjects(localStorage, 12)
    expect(loaded).toHaveLength(1)
    expect(loaded[0].nodes.map((item) => item.data.seconds)).toEqual([30, 5, 5])
    expect(loaded[0].nodes.map((item) => item.data.videoFamily)).toEqual([
      'seedance-2',
      'seedance-2',
      'seedance-2',
    ])
  })

  test('rejects missing users so account data cannot enter a shared key', () => {
    expect(() => studioProjectsKey(0)).toThrow('user ID')
    expect(() => loadStudioProjects(localStorage, -1)).toThrow('user ID')
  })

  test('surfaces storage quota failures to the workspace', () => {
    const storage: Pick<Storage, 'getItem' | 'setItem'> = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError')
      },
    }
    expect(() => saveStudioProjects(storage, 12, [])).toThrow('full')
  })

  test('rejects project imports with embedded credentials or malformed nodes', () => {
    expect(() =>
      parseStudioProjectImport(
        JSON.stringify({
          id: 'x',
          title: 'Bad',
          nodes: [],
          edges: [],
          createdAt: 'now',
          updatedAt: 'now',
          apiKey: 'secret',
        })
      )
    ).toThrow('project')
    expect(() =>
      parseStudioProjectImport(
        JSON.stringify({
          id: 'x',
          title: 'Bad',
          nodes: [
            {
              id: 'n',
              type: 'studio',
              position: { x: 0, y: 0 },
              data: { kind: 'html', title: 'X', prompt: '' },
            },
          ],
          edges: [],
          createdAt: 'now',
          updatedAt: 'now',
        })
      )
    ).toThrow('project')
  })

  test('keeps artifact access URLs out of local video state and exported files', () => {
    const project = {
      id: 'p',
      title: 'Film',
      createdAt: 'now',
      updatedAt: 'now',
      edges: [],
      nodes: [
        {
          id: 'v',
          type: 'studio' as const,
          position: { x: 0, y: 0 },
          data: {
            kind: 'video' as const,
            title: 'Shot',
            prompt: 'Rain',
            taskId: 'task',
            outputUrl: 'https://cdn.example/video?access=secret',
          },
        },
      ],
    }
    saveStudioProjects(localStorage, 12, [project])
    expect(localStorage.getItem(studioProjectsKey(12))).not.toContain(
      'access=secret'
    )
    const exported = serializeStudioProjectExport(project)
    expect(exported).not.toContain('access=secret')
    expect(
      parseStudioProjectImport(exported).nodes[0].data.outputUrl
    ).toBeUndefined()
  })

  test('does not treat imported media IDs as files in this browser', () => {
    const raw = JSON.stringify({
      id: 'p',
      title: 'Film',
      createdAt: 'now',
      updatedAt: 'now',
      edges: [],
      nodes: [
        {
          id: 'i',
          type: 'studio',
          position: { x: 0, y: 0 },
          data: {
            kind: 'image',
            title: 'Frame',
            prompt: 'Rain',
            mediaId: 'from-other-browser',
          },
        },
      ],
    })
    expect(parseStudioProjectImport(raw).nodes[0].data.mediaId).toBeUndefined()
  })
})
