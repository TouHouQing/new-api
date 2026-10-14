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
import { z } from 'zod'

import { studioProjectSchema, type StudioProject } from './local-projects'
import { applyStudioCanvasOperations } from './studio-canvas-commands'
import { studioProductionSchema } from './studio-production'
import { addStudioShot } from './workspace'

const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/)
const asset = z.strictObject({
  id,
  title: z.string().min(1).max(200),
  description: z.string().max(10000),
})
export const studioScreenplaySchema = z.strictObject({
  title: z.string().min(1).max(200),
  brief: z.string().max(30000),
  characters: z
    .array(asset.extend({ voice: z.string().max(2000).optional() }))
    .max(20)
    .default([]),
  scenes: z.array(asset).max(30).default([]),
  props: z.array(asset).max(100).default([]),
  shots: z
    .array(
      z.strictObject({
        id,
        title: z.string().min(1).max(200),
        sceneId: id.optional(),
        characterIds: z.array(id).max(20).default([]),
        propIds: z.array(id).max(32).default([]),
        text: z.string().max(30000),
        imagePrompt: z.string().max(30000),
        videoPrompt: z.string().max(30000),
        seconds: z.number().int().min(1).max(3600).default(5),
        camera: z.string().max(2000).default(''),
        shotType: z.string().max(200).default(''),
        dialogue: z.string().max(30000).default(''),
      })
    )
    .min(1)
    .max(100),
})

export function planStudioScreenplayChange(
  project: StudioProject,
  input: unknown
) {
  const next = studioScreenplaySchema.parse(input)
  const saved = project.production?.screenplay
  if (!saved) {
    return {
      shotIds: next.shots.map((shot) => shot.id),
      nodeIds: [] as string[],
      removedShotIds: [] as string[],
    }
  }
  const before = studioScreenplaySchema.parse(JSON.parse(saved.source))
  const changedAssets = new Set<string>()
  for (const kind of ['characters', 'scenes', 'props'] as const) {
    for (const asset of [...before[kind], ...next[kind]]) {
      if (
        JSON.stringify(before[kind].find((item) => item.id === asset.id)) !==
        JSON.stringify(next[kind].find((item) => item.id === asset.id))
      ) {
        changedAssets.add(asset.id)
      }
    }
  }
  const removedShotIds = before.shots
    .filter((shot) => !next.shots.some((item) => item.id === shot.id))
    .map((shot) => shot.id)
  const shotIds = next.shots
    .filter((shot) => {
      const original = before.shots.find((item) => item.id === shot.id)
      const references = [
        ...shot.characterIds,
        ...shot.propIds,
        ...(shot.sceneId ? [shot.sceneId] : []),
      ]
      return (
        JSON.stringify(original) !== JSON.stringify(shot) ||
        references.some((id) => changedAssets.has(id))
      )
    })
    .map((shot) => shot.id)
  const nodeIds = [...shotIds, ...removedShotIds].flatMap((id) => {
    const shot = project.shots?.find((shot) => shot.id === saved.shots[id])
    return shot ? [shot.imageNodeId, shot.videoNodeId] : []
  })
  return { shotIds, nodeIds, removedShotIds }
}

export function allocateStudioShotDurations(input: unknown, target: number) {
  const screenplay = studioScreenplaySchema.parse(input)
  if (
    !Number.isInteger(target) ||
    target < screenplay.shots.length ||
    target > 3600
  ) {
    throw new Error(
      'Target duration must allow at least one second per shot and at most one hour'
    )
  }
  const total = screenplay.shots.reduce((sum, shot) => sum + shot.seconds, 0)
  const remainder = target - screenplay.shots.length
  const weights = screenplay.shots.map(
    (shot) => (remainder * shot.seconds) / total
  )
  const durations = weights.map((weight) => 1 + Math.floor(weight))
  let missing = target - durations.reduce((sum, duration) => sum + duration, 0)
  const order = weights
    .map((weight, index) => ({ index, fraction: weight - Math.floor(weight) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (const item of order) {
    if (missing-- <= 0) break
    durations[item.index]++
  }
  return {
    ...screenplay,
    shots: screenplay.shots.map((shot, index) => ({
      ...shot,
      seconds: durations[index],
    })),
  }
}

function reviseStudioScreenplay(
  project: StudioProject,
  input: unknown,
  newId: () => string
): StudioProject {
  const production = project.production
  const saved = production?.screenplay
  if (!production || !saved) {
    throw new Error('The screenplay source is unavailable')
  }
  const previousSource = studioScreenplaySchema.parse(JSON.parse(saved.source))
  const nextSource = studioScreenplaySchema.parse(input)
  const shotSources = new Map(
    nextSource.shots.map((shot) => [
      saved.shots[shot.id],
      {
        before: previousSource.shots.find((old) => old.id === shot.id),
        after: shot,
      },
    ])
  )
  const assetEdits = new Map<
    string,
    { title: boolean; prompt: boolean; voice: boolean }
  >()
  for (const [kind, oldAssets, newAssets] of [
    ['character', previousSource.characters, nextSource.characters],
    ['scene', previousSource.scenes, nextSource.scenes],
    ['prop', previousSource.props, nextSource.props],
  ] as const) {
    for (const asset of newAssets) {
      const old = oldAssets.find((item) => item.id === asset.id)
      const existingId = saved.assets[`${kind}:${asset.id}`]
      if (!old || !existingId) continue
      assetEdits.set(existingId, {
        title: old.title !== asset.title,
        prompt: old.description !== asset.description,
        voice:
          ('voice' in old ? old.voice : undefined) !==
          ('voice' in asset ? asset.voice : undefined),
      })
    }
  }
  const impact = planStudioScreenplayChange(project, input)
  const fresh = applyStudioScreenplay(
    {
      ...project,
      nodes: [],
      edges: [],
      assets: [],
      shots: [],
      production: undefined,
    },
    input,
    newId
  )
  const replacements = new Map<string, string>()
  const freshProduction = fresh.production
  const freshScreenplay = freshProduction?.screenplay
  if (!freshProduction || !freshScreenplay) {
    throw new Error('The imported screenplay is unavailable')
  }
  for (const [key, freshId] of Object.entries(freshScreenplay.assets)) {
    const priorId = saved.assets[key]
    if (!priorId) continue
    replacements.set(freshId, priorId)
    const freshNode = fresh.nodes.find(
      (node) => node.data.linkedAssetId === freshId
    )
    const priorNode = project.nodes.find(
      (node) => node.data.linkedAssetId === priorId
    )
    if (freshNode && priorNode) replacements.set(freshNode.id, priorNode.id)
  }
  for (const [key, freshId] of Object.entries(freshScreenplay.shots)) {
    const prior = project.shots?.find((shot) => shot.id === saved.shots[key])
    const shot = fresh.shots?.find((shot) => shot.id === freshId)
    if (!prior || !shot) continue
    for (const field of [
      'id',
      'textNodeId',
      'imageNodeId',
      'videoNodeId',
    ] as const) {
      replacements.set(shot[field], prior[field])
    }
  }
  const referenceFields = new Set([
    'id',
    'nodeId',
    'shotId',
    'assetId',
    'linkedAssetId',
    'textNodeId',
    'imageNodeId',
    'videoNodeId',
    'source',
    'target',
    'assetIds',
    'shotIds',
  ])
  const referenceMaps = new Set([
    'assets',
    'shots',
    'assetBindings',
    'assetVersionIds',
  ])
  const remap = (value: unknown, field = '', reference = false): unknown => {
    if (typeof value === 'string') {
      return reference || referenceFields.has(field)
        ? replacements.get(value) || value
        : value
    }
    if (Array.isArray(value)) {
      return value.map((item) =>
        remap(item, '', reference || referenceFields.has(field))
      )
    }
    if (value && typeof value === 'object') {
      const dictionary = referenceMaps.has(field)
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          dictionary ? replacements.get(key) || key : key,
          remap(item, key, dictionary),
        ])
      )
    }
    return value
  }
  const mapped = remap(fresh) as StudioProject
  const affected = new Set(impact.nodeIds)
  const nodes = new Map(project.nodes.map((node) => [node.id, node]))
  for (const node of mapped.nodes) {
    const previous = nodes.get(node.id)
    if (!previous) {
      nodes.set(node.id, node)
      continue
    }
    const assetEdit = assetEdits.get(node.data.linkedAssetId || '')
    const shot = project.shots?.find((shot) =>
      [shot.textNodeId, shot.imageNodeId, shot.videoNodeId].includes(node.id)
    )
    const source = shot ? shotSources.get(shot.id) : undefined
    const data = {
      ...previous.data,
      title:
        assetEdit && !assetEdit.title ? previous.data.title : node.data.title,
      prompt:
        assetEdit && !assetEdit.prompt
          ? previous.data.prompt
          : node.data.prompt,
      assetIds: node.data.assetIds,
      linkedAssetId: node.data.linkedAssetId,
      seconds: node.data.seconds,
    }
    if (
      source?.before &&
      JSON.stringify([
        source.before.sceneId,
        source.before.characterIds,
        source.before.propIds,
      ]) ===
        JSON.stringify([
          source.after.sceneId,
          source.after.characterIds,
          source.after.propIds,
        ])
    ) {
      data.assetIds = previous.data.assetIds
    }
    if (!node.data.linkedAssetId && node.data.kind !== 'text') {
      data.prompt = previous.data.prompt
    }
    if (node.data.kind === 'text') {
      Object.assign(data, {
        outputText:
          source?.before?.text === source?.after.text
            ? previous.data.outputText
            : node.data.outputText,
        outputImagePrompt:
          source?.before?.imagePrompt === source?.after.imagePrompt
            ? previous.data.outputImagePrompt
            : node.data.outputImagePrompt,
        outputVideoPrompt:
          source?.before?.videoPrompt === source?.after.videoPrompt
            ? previous.data.outputVideoPrompt
            : node.data.outputVideoPrompt,
      })
    }
    if (source?.before && source.before.seconds === source.after.seconds) {
      data.seconds = previous.data.seconds
    }
    if (source?.before && source.before.title === source.after.title) {
      data.title = previous.data.title
    }
    if (affected.has(node.id)) data.status = 'idle'
    nodes.set(node.id, { ...previous, data })
  }
  const oldImportedShots = new Set(Object.values(saved.shots))
  const oldImportedAssets = new Set(Object.values(saved.assets))
  const next = mapped.production
  if (!next) {
    throw new Error('The revised production plan is unavailable')
  }
  const activeShotIds = new Set((mapped.shots || []).map((shot) => shot.id))
  const removedVideoNodes = new Set(
    (project.shots || [])
      .filter(
        (shot) => oldImportedShots.has(shot.id) && !activeShotIds.has(shot.id)
      )
      .map((shot) => shot.videoNodeId)
  )
  const updatedAssets = (mapped.assets || []).map((asset) => {
    const previous = project.assets?.find((old) => old.id === asset.id)
    if (!previous) return asset
    const edit = assetEdits.get(asset.id)
    return {
      ...previous,
      ...asset,
      title: edit?.title ? asset.title : previous.title,
      prompt: edit?.prompt ? asset.prompt : previous.prompt,
      profile: edit?.voice
        ? { ...previous.profile, voice: asset.profile?.voice }
        : previous.profile,
      mediaId: previous.mediaId,
      versions: previous.versions,
    }
  })
  const document = {
    ...project,
    title:
      previousSource.title === nextSource.title ? project.title : mapped.title,
    nodes: [...nodes.values()],
    edges: [
      ...project.edges,
      ...mapped.edges.filter(
        (edge) =>
          !project.edges.some(
            (old) => old.source === edge.source && old.target === edge.target
          )
      ),
    ],
    assets: [
      ...(project.assets || []).filter(
        (asset) => !mapped.assets?.some((next) => next.id === asset.id)
      ),
      ...updatedAssets,
    ],
    shots: [
      ...(project.shots || []).filter((shot) => !oldImportedShots.has(shot.id)),
      ...(mapped.shots || []).map((shot) => {
        const old = project.shots?.find((old) => old.id === shot.id)
        const source = shotSources.get(shot.id)
        const merged = { ...old, ...shot }
        for (const field of [
          'title',
          'camera',
          'shotType',
          'dialogue',
        ] as const) {
          if (
            old &&
            source?.before &&
            source.before[field] === source.after[field]
          ) {
            merged[field] = old[field] || ''
          }
        }
        return merged
      }),
    ],
    production: {
      ...production,
      brief:
        previousSource.brief === nextSource.brief
          ? production.brief
          : next.brief,
      screenplay: next.screenplay,
      timeline: production.timeline.filter(
        (clip) => !removedVideoNodes.has(clip.nodeId)
      ),
      continuityStates: production.continuityStates.filter(
        (state) =>
          !oldImportedShots.has(state.shotId) || activeShotIds.has(state.shotId)
      ),
      dialogueCues: production.dialogueCues.filter(
        (cue) =>
          !oldImportedShots.has(cue.shotId) || activeShotIds.has(cue.shotId)
      ),
      scenes: [
        ...production.scenes.filter(
          (scene) => !oldImportedAssets.has(scene.id)
        ),
        ...next.scenes.map((scene) => {
          const previous = production.scenes.find((old) => old.id === scene.id)
          const edit = assetEdits.get(scene.id)
          return {
            ...scene,
            title: previous && !edit?.title ? previous.title : scene.title,
            description:
              previous && !edit?.prompt
                ? previous.description
                : scene.description,
          }
        }),
      ],
      props: [
        ...production.props.filter((prop) => !oldImportedAssets.has(prop.id)),
        ...next.props.map((prop) => ({
          ...prop,
          title: !assetEdits.get(prop.id)?.title
            ? production.props.find((old) => old.id === prop.id)?.title ||
              prop.title
            : prop.title,
          description: !assetEdits.get(prop.id)?.prompt
            ? (production.props.find((old) => old.id === prop.id)
                ?.description ?? prop.description)
            : prop.description,
          mediaIds:
            production.props.find((old) => old.id === prop.id)?.mediaIds || [],
        })),
      ],
      assetBindings: {
        ...production.assetBindings,
        ...Object.fromEntries(
          Object.entries(next.assetBindings).filter(([shotId]) => {
            const source = shotSources.get(shotId)
            return (
              !source?.before ||
              JSON.stringify(source.before.propIds) !==
                JSON.stringify(source.after.propIds)
            )
          })
        ),
      },
      changes: [
        ...production.changes,
        ...(impact.shotIds.length || impact.removedShotIds.length
          ? [
              {
                id: newId(),
                kind: 'script' as const,
                message: `Script revision: ${[...impact.shotIds, ...impact.removedShotIds].join(', ')}`,
                nodeIds: impact.nodeIds,
                status: 'pending' as const,
                createdAt: new Date().toISOString(),
              },
            ]
          : []),
      ].slice(-200),
    },
    updatedAt: new Date().toISOString(),
  }
  return studioProjectSchema.parse(document) as StudioProject
}

function screenplayReference(
  references: Map<string, string>,
  id: string
): string {
  const value = references.get(id)
  if (!value) throw new Error('Screenplay asset reference is unavailable')
  return value
}

// One structured screenplay owns recurring assets, scene membership, props and
// three connected generation nodes per shot. Import is atomic and never paid.
export function applyStudioScreenplay(
  project: StudioProject,
  input: unknown,
  newId: () => string = () => crypto.randomUUID()
): StudioProject {
  const screenplay = studioScreenplaySchema.parse(input)
  if (project.production?.screenplay) {
    return reviseStudioScreenplay(project, input, newId)
  }
  const characterIds = new Set(screenplay.characters.map((asset) => asset.id))
  const sceneIds = new Set(screenplay.scenes.map((asset) => asset.id))
  const propIds = new Set(screenplay.props.map((asset) => asset.id))
  if (
    characterIds.size !== screenplay.characters.length ||
    sceneIds.size !== screenplay.scenes.length ||
    propIds.size !== screenplay.props.length ||
    new Set(screenplay.shots.map((shot) => shot.id)).size !==
      screenplay.shots.length
  ) {
    throw new Error('Screenplay IDs must be unique')
  }
  for (const shot of screenplay.shots) {
    if (
      shot.characterIds.some((id) => !characterIds.has(id)) ||
      (shot.sceneId && !sceneIds.has(shot.sceneId)) ||
      shot.propIds.some((id) => !propIds.has(id))
    ) {
      throw new Error('A shot references an unknown character, scene or prop')
    }
  }
  if (
    project.nodes.length +
      screenplay.shots.length * 3 +
      screenplay.characters.length +
      screenplay.scenes.length >
      500 ||
    (project.shots?.length || 0) + screenplay.shots.length > 166
  ) {
    throw new Error('Screenplay exceeds the canvas capacity')
  }
  let next = project
  const references = new Map<string, string>()
  const sceneMap = new Map<string, string>()
  for (const [kind, assets] of [
    ['character', screenplay.characters],
    ['scene', screenplay.scenes],
  ] as const) {
    for (const asset of assets) {
      const nodeId = newId()
      next = applyStudioCanvasOperations(
        next,
        [
          {
            op: 'add_node',
            nodeType: kind,
            id: nodeId,
            title: asset.title,
            prompt: asset.description,
          },
        ],
        newId
      )
      const node = next.nodes.find((node) => node.id === nodeId)
      if (!node?.data.linkedAssetId) {
        throw new Error('Reference asset could not be created')
      }
      references.set(`${kind}:${asset.id}`, node.data.linkedAssetId)
      if ('voice' in asset && asset.voice) {
        next = applyStudioCanvasOperations(
          next,
          [
            {
              op: 'upsert_asset',
              id: node.data.linkedAssetId,
              kind: 'character',
              title: asset.title,
              prompt: asset.description,
              profile: { voice: asset.voice },
            },
          ],
          newId
        )
      }
      if (kind === 'scene') sceneMap.set(asset.id, node.data.linkedAssetId)
    }
  }
  const production = next.production || studioProductionSchema.parse({})
  const scenes = screenplay.scenes.map((scene) => ({
    id: screenplayReference(sceneMap, scene.id),
    title: scene.title,
    description: scene.description,
    shotIds: [] as string[],
    assetIds: [screenplayReference(sceneMap, scene.id)],
  }))
  const props = screenplay.props.map((prop) => ({
    id: newId(),
    title: prop.title,
    description: prop.description,
    mediaIds: [] as string[],
  }))
  const propMap = new Map(
    screenplay.props.map((prop, index) => [prop.id, props[index].id])
  )
  const assetBindings = { ...production.assetBindings }
  const shotMap: Record<string, string> = {}
  for (const shot of screenplay.shots) {
    const shotId = newId(),
      ids = { text: newId(), image: newId(), video: newId() }
    next = addStudioShot(next, shotId, ids, shot.title)
    shotMap[shot.id] = shotId
    const assetIds = shot.characterIds.map((id) =>
      screenplayReference(references, `character:${id}`)
    )
    if (shot.sceneId) {
      assetIds.push(screenplayReference(references, `scene:${shot.sceneId}`))
      const sceneId = screenplayReference(sceneMap, shot.sceneId)
      scenes.find((scene) => scene.id === sceneId)?.shotIds.push(shotId)
    }
    assetBindings[shotId] = shot.propIds.map((id) =>
      screenplayReference(propMap, id)
    )
    next = {
      ...next,
      nodes: next.nodes.map((node) => {
        if (node.id === ids.text) {
          return {
            ...node,
            data: {
              ...node.data,
              prompt: shot.text,
              outputText: shot.text,
              outputImagePrompt: shot.imagePrompt,
              outputVideoPrompt: shot.videoPrompt,
              status: 'completed',
            },
          }
        }
        if (node.id === ids.image || node.id === ids.video) {
          return {
            ...node,
            data: { ...node.data, assetIds, seconds: shot.seconds, prompt: '' },
          }
        }
        return node
      }),
      shots: next.shots?.map((item) =>
        item.id === shotId
          ? {
              ...item,
              camera: shot.camera,
              shotType: shot.shotType,
              dialogue: shot.dialogue,
            }
          : item
      ),
    }
  }
  const document = {
    ...next,
    title: screenplay.title,
    production: {
      ...production,
      brief: screenplay.brief,
      scenes: [...production.scenes, ...scenes],
      props: [...production.props, ...props],
      assetBindings,
      screenplay: {
        source: JSON.stringify(screenplay),
        assets: Object.fromEntries([
          ...references,
          ...[...propMap].map(([key, value]) => [`prop:${key}`, value]),
        ]),
        shots: shotMap,
      },
    },
    updatedAt: new Date().toISOString(),
  }
  return studioProjectSchema.parse(document) as StudioProject
}
