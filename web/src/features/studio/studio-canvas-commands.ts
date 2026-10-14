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

import {
  isValidStudioConnection,
  planStudioExecution,
  type StudioCanvasNode,
  type StudioCanvasNodeData,
} from './canvas-flow'
import {
  studioAssetProfileSchema,
  studioProjectSchema,
  type StudioProject,
  type StudioAsset,
} from './local-projects'
import {
  frameBounds,
  moveStudioFrame,
  reconcileStudioFrames,
} from './studio-canvas-frames'
import { studioDocumentSchema } from './studio-document'
import { studioNodeInputFingerprint } from './studio-execution'
import { studioImageLayersSchema } from './studio-image-layers'
import { studioPrevisSchema } from './studio-previs'
import {
  studioProductionSchema,
  studioMotionGraphicSchema,
} from './studio-production'
import {
  addStudioNode,
  addStudioShot,
  invalidateStudioBranch,
  pinStudioConnectionTake,
  pinStudioShotAssetVersion,
  pruneStudioShots,
  selectStudioTake,
  setStudioShotAssets,
  moveStudioShot,
  studioBranchNodeIds,
  updateStudioNode,
} from './workspace'

export const STUDIO_NODE_CATALOG = [
  {
    id: 'text',
    kind: 'text',
    titleKey: 'studio.catalog.text',
    descriptionKey: 'studio.catalog.textHint',
  },
  {
    id: 'script',
    kind: 'text',
    purpose: 'script',
    titleKey: 'studio.catalog.script',
    descriptionKey: 'studio.catalog.scriptHint',
  },
  {
    id: 'note',
    kind: 'text',
    purpose: 'note',
    titleKey: 'studio.catalog.note',
    descriptionKey: 'studio.catalog.noteHint',
  },
  {
    id: 'character',
    kind: 'image',
    purpose: 'character',
    titleKey: 'studio.catalog.character',
    descriptionKey: 'studio.catalog.characterHint',
  },
  {
    id: 'scene',
    kind: 'image',
    purpose: 'scene',
    titleKey: 'studio.catalog.scene',
    descriptionKey: 'studio.catalog.sceneHint',
  },
  {
    id: 'style',
    kind: 'image',
    purpose: 'style',
    titleKey: 'studio.catalog.style',
    descriptionKey: 'studio.catalog.styleHint',
  },
  {
    id: 'image',
    kind: 'image',
    titleKey: 'studio.catalog.image',
    descriptionKey: 'studio.catalog.imageHint',
  },
  {
    id: 'video',
    kind: 'video',
    titleKey: 'studio.catalog.video',
    descriptionKey: 'studio.catalog.videoHint',
  },
  {
    id: 'audio',
    kind: 'audio',
    titleKey: 'studio.catalog.audio',
    descriptionKey: 'studio.catalog.audioHint',
  },
  {
    id: 'assembly',
    kind: 'video',
    purpose: 'assembly',
    titleKey: 'studio.catalog.assembly',
    descriptionKey: 'studio.catalog.assemblyHint',
  },
] as const
export type StudioCatalogType = (typeof STUDIO_NODE_CATALOG)[number]['id']
export const STUDIO_WORKFLOW_TEMPLATES = [
  {
    id: 'shot',
    titleKey: 'studio.template.shot',
    descriptionKey: 'studio.template.shotHint',
  },
  {
    id: 'story',
    titleKey: 'studio.template.story',
    descriptionKey: 'studio.template.storyHint',
  },
  {
    id: 'advert',
    titleKey: 'studio.template.advert',
    descriptionKey: 'studio.template.advertHint',
  },
] as const

const idSchema = z.string().min(1).max(128)
const positionSchema = z.strictObject({
  x: z.number().finite().min(-1_000_000).max(1_000_000),
  y: z.number().finite().min(-1_000_000).max(1_000_000),
})
const nodePatchSchema = z.strictObject({
  textDocument: studioDocumentSchema.optional(),
  labelColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  rating: z.number().int().min(0).max(5).optional(),
  visualPresetIds: z.array(z.string().max(160)).max(32).optional(),
  referenceControl: z.enum(['depth', 'edges']).optional(),
  videoKeyframes: z
    .array(
      z.strictObject({ mediaId: idSchema, time: z.number().min(0).max(30) })
    )
    .max(8)
    .optional(),
  imageLayers: studioImageLayersSchema.optional(),
  title: z.string().min(1).max(200).optional(),
  prompt: z.string().max(30000).optional(),
  model: z.string().max(200).nullable().optional(),
  group: z.string().max(100).nullable().optional(),
  textMode: z.enum(['shot', 'plain']).optional(),
  seconds: z.number().int().min(1).max(3600).optional(),
  ratio: z.string().max(40).optional(),
  resolution: z.string().max(100).optional(),
  imageSize: z.string().max(40).optional(),
  imageQuality: z.string().max(40).optional(),
  imageCount: z.number().int().min(1).max(10).optional(),
  voice: z.string().max(100).optional(),
  speed: z.number().min(0.25).max(4).optional(),
  locked: z.boolean().optional(),
  camera: z
    .strictObject({
      shotSize: z.string().max(200).optional(),
      angle: z.string().max(200).optional(),
      movement: z.string().max(200).optional(),
      lens: z.string().max(200).optional(),
      lighting: z.string().max(200).optional(),
    })
    .optional(),
})
export const studioCanvasOperationSchema = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('group_nodes'),
    id: idSchema.optional(),
    title: z.string().trim().min(1).max(200).optional(),
    nodeIds: z.array(idSchema).min(2).max(500),
  }),
  z.strictObject({
    op: z.literal('ungroup_nodes'),
    frameIds: z.array(idSchema).min(1).max(100),
  }),
  z.strictObject({
    op: z.literal('move_frame'),
    frameId: idSchema,
    position: positionSchema,
  }),
  z.strictObject({
    op: z.literal('update_frame'),
    frameId: idSchema,
    patch: z.strictObject({
      title: z.string().trim().min(1).max(200).optional(),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
      x: z.number().finite().min(-1_000_000).max(1_000_000).optional(),
      y: z.number().finite().min(-1_000_000).max(1_000_000).optional(),
      width: z.number().finite().min(160).max(2_000_000).optional(),
      height: z.number().finite().min(100).max(2_000_000).optional(),
    }),
  }),
  z.strictObject({ op: z.literal('set_previs'), scene: studioPrevisSchema }),
  z.strictObject({
    op: z.literal('set_motion_graphics'),
    items: z.array(studioMotionGraphicSchema).max(50),
  }),
  z.strictObject({
    op: z.literal('add_node'),
    nodeType: z.enum([
      'text',
      'script',
      'note',
      'character',
      'scene',
      'style',
      'image',
      'video',
      'audio',
      'assembly',
    ]),
    id: idSchema.optional(),
    title: z.string().min(1).max(200).optional(),
    prompt: z.string().max(10000).optional(),
    model: z.string().max(200).optional(),
    group: z.string().max(100).optional(),
    position: positionSchema.optional(),
    assetId: idSchema.optional(),
  }),
  z.strictObject({
    op: z.literal('update_node'),
    nodeId: idSchema,
    patch: nodePatchSchema,
  }),
  z.strictObject({
    op: z.literal('remove_nodes'),
    nodeIds: z.array(idSchema).min(1).max(500),
  }),
  z.strictObject({
    op: z.literal('connect'),
    source: idSchema,
    target: idSchema,
    sourceHandle: z.string().max(100).optional(),
    targetHandle: z.string().max(100).optional(),
    sourceTakeId: idSchema.optional(),
  }),
  z.strictObject({
    op: z.literal('disconnect'),
    edgeIds: z.array(idSchema).min(1).max(1000),
  }),
  z.strictObject({
    op: z.literal('move_nodes'),
    nodes: z
      .array(z.strictObject({ id: idSchema, position: positionSchema }))
      .min(1)
      .max(500),
  }),
  z.strictObject({
    op: z.literal('duplicate'),
    nodeIds: z.array(idSchema).min(1).max(500),
    offset: positionSchema.optional(),
  }),
  z.strictObject({
    op: z.literal('layout'),
    direction: z.enum(['horizontal', 'vertical']).default('horizontal'),
  }),
  z.strictObject({
    op: z.literal('arrange'),
    nodeIds: z.array(idSchema).min(2).max(500),
    mode: z.enum([
      'align_left',
      'align_top',
      'distribute_horizontal',
      'distribute_vertical',
    ]),
  }),
  z.strictObject({
    op: z.literal('upsert_asset'),
    id: idSchema.optional(),
    kind: z.enum(['character', 'location', 'style']),
    title: z.string().min(1).max(200),
    prompt: z.string().max(10000),
    profile: studioAssetProfileSchema.optional(),
  }),
  z.strictObject({
    op: z.literal('bind_assets'),
    nodeId: idSchema,
    assetIds: z.array(idSchema).max(32),
  }),
  z.strictObject({
    op: z.literal('add_shot'),
    title: z.string().min(1).max(200).optional(),
    assetIds: z.array(idSchema).max(32).optional(),
  }),
  z.strictObject({
    op: z.literal('apply_template'),
    templateId: z.enum(['shot', 'story', 'advert']),
    position: positionSchema.optional(),
  }),
  z.strictObject({
    op: z.literal('set_audio_track'),
    nodeId: idSchema,
    track: z.enum(['soundtrack', 'voiceover']),
  }),
  z.strictObject({
    op: z.literal('select_take'),
    nodeId: idSchema,
    takeId: idSchema,
  }),
  z.strictObject({
    op: z.literal('pin_connection'),
    edgeId: idSchema,
    takeId: idSchema.optional(),
  }),
  z.strictObject({
    op: z.literal('pin_asset_version'),
    shotId: idSchema,
    assetId: idSchema,
    versionId: idSchema.optional(),
  }),
  z.strictObject({
    op: z.literal('move_shot'),
    shotId: idSchema,
    direction: z.enum(['up', 'down']),
  }),
  z.strictObject({
    op: z.literal('reorder_clips'),
    nodeId: idSchema,
    edgeIds: z.array(idSchema).max(500),
  }),
  z.strictObject({
    op: z.literal('update_shot'),
    shotId: idSchema,
    patch: z.strictObject({
      title: z.string().min(1).max(200).optional(),
      shotType: z.string().max(200).optional(),
      camera: z.string().max(2000).optional(),
      dialogue: z.string().max(30000).optional(),
      reviewStatus: z.enum(['unreviewed', 'approved', 'retake']).optional(),
      reviewNote: z.string().max(2000).optional(),
      trimStart: z.number().min(0).max(3600).optional(),
      trimEnd: z.number().min(0).max(3600).optional(),
      muted: z.boolean().optional(),
      volume: z.number().min(0).max(1).optional(),
      transition: z.enum(['cut', 'fade']).optional(),
      transitionSeconds: z.number().min(0.1).max(3).optional(),
      shotCaptionText: z.string().max(30000).optional(),
    }),
  }),
])
export type StudioCanvasOperation = z.infer<typeof studioCanvasOperationSchema>

function requireStudioItem<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Studio canvas item is unavailable')
  return value
}

export function studioNodeBusy(node: StudioCanvasNode): boolean {
  return Boolean(
    node.data.pendingRequestId ||
    ['submitting', 'queued', 'processing'].includes(node.data.status || '') ||
    node.data.takes?.some(
      (take) => take.status === 'queued' || take.status === 'processing'
    )
  )
}

function assertEditableBranch(project: StudioProject, nodeId: string): void {
  const affected = studioBranchNodeIds(project, nodeId)
  if (
    project.nodes.some((node) => affected.has(node.id) && studioNodeBusy(node))
  ) {
    throw new Error(
      'Wait for the active Studio task before changing its inputs'
    )
  }
}

/** Distinguishes authoring edits from selection, viewport changes and task polling. */
export function studioCanvasDocumentFingerprint(
  project: StudioProject
): string {
  const fields = [
    'kind',
    'purpose',
    'linkedAssetId',
    'title',
    'prompt',
    'model',
    'textMode',
    'group',
    'videoFamily',
    'locked',
    'seconds',
    'ratio',
    'resolution',
    'imageSize',
    'imageQuality',
    'imageCount',
    'imageLayers',
    'videoKeyframes',
    'voice',
    'speed',
    'reworkRegion',
    'reworkRange',
    'camera',
    'assetIds',
    'assetVersionIds',
    'metadataJson',
    'referenceControl',
    'payloadPatchJson',
  ] as const
  return JSON.stringify([
    project.title,
    project.defaults,
    project.finalVideoNodeId,
    project.soundtrackMediaId,
    project.voiceoverMediaId,
    project.soundtrackVolume,
    project.voiceoverVolume,
    project.soundtrackOffsetSeconds,
    project.voiceoverOffsetSeconds,
    project.shots,
    project.production,
    project.canvas?.frames,
    project.nodes.map((node) => [
      node.id,
      node.position,
      ...fields.map((field) => node.data[field]),
    ]),
    project.edges.map((edge) => [
      edge.id,
      edge.source,
      edge.target,
      edge.sourceHandle,
      edge.targetHandle,
      edge.data,
    ]),
    project.assets?.map((asset) => [
      asset.id,
      asset.kind,
      asset.title,
      asset.prompt,
      asset.profile,
    ]),
  ])
}

/** UI and Agent mutations share this transaction boundary; no operation submits a model request. */
const DEFAULT_TEMPLATE_LABELS: Record<string, string> = {
  'studio.template.prompt.story':
    'Write a short story with a clear beginning, conflict and ending. Describe recurring characters and locations.',
  'studio.template.prompt.advert':
    'Write a product film brief: audience, benefit, proof, three visual beats and a final call to action.',
  'studio.template.prompt.character':
    'Describe a consistent character identity, appearance and wardrobe for this project.',
  'studio.template.prompt.scene':
    'Describe a consistent location, time of day, atmosphere and lighting for this project.',
  'studio.template.prompt.style':
    'Describe a consistent visual language, palette and texture for this project.',
  'studio.shot.defaultName': 'Shot',
  'studio.kind.text': 'Text',
  'studio.kind.image': 'Image',
  'studio.kind.video': 'Video',
  'studio.catalog.text': 'Text',
  'studio.catalog.textHint':
    'Generate shot descriptions and image/video prompts.',
  'studio.catalog.script': 'Script',
  'studio.catalog.scriptHint':
    'Develop a brief, story or screenplay with a text model.',
  'studio.catalog.note': 'Note',
  'studio.catalog.noteHint': 'A manual creative brief or instruction source.',
  'studio.catalog.character': 'Character',
  'studio.catalog.characterHint':
    'Reusable identity, costume and reference images.',
  'studio.catalog.scene': 'Scene',
  'studio.catalog.sceneHint': 'Reusable location, atmosphere and lighting.',
  'studio.catalog.style': 'Style',
  'studio.catalog.styleHint':
    'Keep the visual language and palette consistent.',
  'studio.catalog.image': 'Image',
  'studio.catalog.imageHint':
    'Generate, edit or upload images with typed references.',
  'studio.catalog.video': 'Video',
  'studio.catalog.videoHint':
    'Generate clips from prompts, frames and video references.',
  'studio.catalog.audio': 'Audio',
  'studio.catalog.audioHint':
    'Upload audio or synthesize speech for the final mix.',
  'studio.catalog.assembly': 'Assembly',
  'studio.catalog.assemblyHint':
    'Order video clips, mix audio and export an MP4 locally.',
}

export function applyStudioCanvasOperations(
  project: StudioProject,
  input: unknown,
  newId: () => string = () => crypto.randomUUID(),
  translate: (key: string) => string = (key) =>
    DEFAULT_TEMPLATE_LABELS[key] || key
): StudioProject {
  const operations = z
    .array(studioCanvasOperationSchema)
    .min(1)
    .max(100)
    .parse(input)
  let next = project
  for (const operation of operations) {
    if (operation.op === 'group_nodes') {
      const members = next.nodes.filter((n) => operation.nodeIds.includes(n.id))
      if (members.length !== operation.nodeIds.length) {
        throw new Error('Canvas group members must exist and be unique')
      }
      const id = operation.id || newId()
      if (
        next.nodes.some((n) => n.id === id) ||
        next.canvas?.frames?.some((f) => f.id === id)
      ) {
        throw new Error('Canvas group IDs must be unique')
      }
      const frames = (next.canvas?.frames || []).flatMap((f) => {
        const nodeIds = f.nodeIds.filter(
          (id) => !operation.nodeIds.includes(id)
        )
        return nodeIds.length ? [{ ...f, nodeIds }] : []
      })
      next = {
        ...next,
        canvas: {
          ...next.canvas,
          frames: [
            ...frames,
            {
              id,
              title: operation.title || translate('Canvas group'),
              nodeIds: operation.nodeIds,
              ...frameBounds(members),
            },
          ],
        },
      }
      continue
    }
    if (operation.op === 'ungroup_nodes') {
      if (
        operation.frameIds.some(
          (id) => !next.canvas?.frames?.some((f) => f.id === id)
        )
      ) {
        throw new Error('Canvas group is unavailable')
      }
      next = {
        ...next,
        canvas: {
          ...next.canvas,
          frames: (next.canvas?.frames || []).filter(
            (f) => !operation.frameIds.includes(f.id)
          ),
        },
      }
      continue
    }
    if (operation.op === 'move_frame') {
      next = moveStudioFrame(next, operation.frameId, operation.position)
      continue
    }
    if (operation.op === 'update_frame') {
      if (!next.canvas?.frames?.some((f) => f.id === operation.frameId)) {
        throw new Error('Canvas group is unavailable')
      }
      next = {
        ...next,
        canvas: {
          ...next.canvas,
          frames: next.canvas.frames.map((f) =>
            f.id === operation.frameId ? { ...f, ...operation.patch } : f
          ),
        },
      }
      continue
    }
    if (
      operation.op === 'set_previs' ||
      operation.op === 'set_motion_graphics'
    ) {
      const production = next.production || studioProductionSchema.parse({})
      next = {
        ...next,
        production: {
          ...production,
          ...(operation.op === 'set_previs'
            ? { previs: operation.scene }
            : { motionGraphics: operation.items }),
        },
        updatedAt: new Date().toISOString(),
      }
      continue
    }
    if (operation.op === 'add_node') {
      if (
        operation.nodeType === 'assembly' &&
        next.nodes.some((node) => node.data.purpose === 'assembly')
      ) {
        throw new Error('This project already has a final assembly node')
      }
      const entry = requireStudioItem(
        STUDIO_NODE_CATALOG.find((item) => item.id === operation.nodeType)
      )
      const id = operation.id || newId()
      next = addStudioNode(next, entry.kind, id)
      const purpose = 'purpose' in entry ? entry.purpose : undefined
      const title = operation.title || translate(entry.titleKey)
      let linkedAssetId: string | undefined
      let linkedAsset: StudioAsset | undefined
      if (
        purpose === 'character' ||
        purpose === 'scene' ||
        purpose === 'style'
      ) {
        const kind = purpose === 'scene' ? 'location' : purpose
        linkedAssetId = operation.assetId || newId()
        const existing = next.assets?.find(
          (asset) => asset.id === linkedAssetId
        )
        linkedAsset = existing
        if (existing && existing.kind !== kind) {
          throw new Error('Studio asset kind does not match the node')
        }
        if (!existing) {
          next = {
            ...next,
            assets: [
              ...(next.assets || []),
              {
                id: linkedAssetId,
                kind,
                title,
                prompt: operation.prompt || '',
              },
            ],
          }
        }
      } else if (operation.assetId) {
        throw new Error(
          'Only character, scene and style nodes can link an asset'
        )
      }
      let model = operation.model
      if (!model && purpose !== 'note' && purpose !== 'assembly') {
        if (entry.kind === 'text') model = next.defaults?.textModel
        if (entry.kind === 'image') model = next.defaults?.imageModel
        if (entry.kind === 'video') model = next.defaults?.videoModel
      }
      next = {
        ...next,
        nodes: next.nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                position: operation.position || node.position,
                data: {
                  ...node.data,
                  title,
                  prompt: operation.prompt ?? linkedAsset?.prompt ?? '',
                  purpose,
                  linkedAssetId,
                  mediaId: linkedAsset?.mediaId,
                  outputUrl: linkedAsset?.outputUrl,
                  status:
                    linkedAsset?.mediaId || linkedAsset?.outputUrl
                      ? 'completed'
                      : 'idle',
                  model: purpose === 'note' ? undefined : model,
                  textMode: purpose === 'script' ? 'plain' : undefined,
                  group:
                    entry.kind === 'video'
                      ? operation.group || next.defaults?.videoGroup
                      : operation.group,
                  voice: entry.kind === 'audio' ? 'alloy' : undefined,
                  speed: entry.kind === 'audio' ? 1 : undefined,
                },
              }
            : node
        ),
      }
      if (purpose === 'assembly') {
        const clips = next.shots?.length
          ? next.shots.map((shot) => shot.videoNodeId)
          : next.nodes
              .filter((node) => node.id !== id && node.data.kind === 'video')
              .map((node) => node.id)
        next = {
          ...next,
          edges: [
            ...next.edges,
            ...clips.map((source) => ({
              id: newId(),
              source,
              target: id,
              sourceHandle: 'video',
              targetHandle: 'clip',
            })),
          ],
        }
      }
      continue
    }
    if (operation.op === 'update_node') {
      const node = next.nodes.find((item) => item.id === operation.nodeId)
      if (!node) throw new Error('Studio node is unavailable')
      const keys = Object.keys(operation.patch)
      const cosmetic = keys.every((key) => key === 'title' || key === 'locked')
      if (!cosmetic) assertEditableBranch(next, node.id)
      if (node.data.purpose === 'note' && operation.patch.model) {
        throw new Error('Notes are manual sources')
      }
      const patch = {
        ...operation.patch,
        ...(Object.hasOwn(operation.patch, 'model')
          ? { model: operation.patch.model || undefined }
          : {}),
        ...(Object.hasOwn(operation.patch, 'group')
          ? { group: operation.patch.group || undefined }
          : {}),
      }
      if (!cosmetic) next = invalidateStudioBranch(next, node.id)
      next = updateStudioNode(
        next,
        node.id,
        patch as Partial<StudioCanvasNodeData>
      )
      continue
    }
    if (operation.op === 'remove_nodes') {
      const ids = new Set(operation.nodeIds)
      if (next.nodes.some((node) => ids.has(node.id) && studioNodeBusy(node))) {
        throw new Error('An active Studio task cannot be removed')
      }
      const targets = next.edges
        .filter((edge) => ids.has(edge.source) && !ids.has(edge.target))
        .map((edge) => edge.target)
      for (const target of targets) assertEditableBranch(next, target)
      next = pruneStudioShots({
        ...next,
        nodes: next.nodes.filter((node) => !ids.has(node.id)),
        edges: next.edges.filter(
          (edge) => !ids.has(edge.source) && !ids.has(edge.target)
        ),
      })
      for (const target of targets) next = invalidateStudioBranch(next, target)
      continue
    }
    if (operation.op === 'connect') {
      assertEditableBranch(next, operation.target)
      if (
        !isValidStudioConnection(
          next.nodes,
          next.edges,
          operation.source,
          operation.target,
          operation.sourceHandle,
          operation.targetHandle
        )
      ) {
        throw new Error(
          'Studio connection is incompatible, duplicated or cyclic'
        )
      }
      const id = newId()
      next = invalidateStudioBranch(
        {
          ...next,
          edges: [
            ...next.edges,
            {
              id,
              source: operation.source,
              target: operation.target,
              sourceHandle: operation.sourceHandle,
              targetHandle: operation.targetHandle,
            },
          ],
        },
        operation.target
      )
      if (operation.sourceTakeId) {
        next = pinStudioConnectionTake(next, id, operation.sourceTakeId)
      }
      continue
    }
    if (operation.op === 'disconnect') {
      const removed = next.edges.filter((edge) =>
        operation.edgeIds.includes(edge.id)
      )
      for (const edge of removed) assertEditableBranch(next, edge.target)
      next = {
        ...next,
        edges: next.edges.filter(
          (edge) => !operation.edgeIds.includes(edge.id)
        ),
      }
      for (const edge of removed) {
        next = invalidateStudioBranch(next, edge.target)
      }
      continue
    }
    if (operation.op === 'move_nodes') {
      for (const item of operation.nodes) {
        const node = next.nodes.find((node) => node.id === item.id)
        if (!node) throw new Error('Studio node is unavailable')
        if (node.data.locked) {
          throw new Error('Unlock the Studio node before moving it')
        }
      }
      const positions = new Map(
        operation.nodes.map((node) => [node.id, node.position])
      )
      next = {
        ...next,
        nodes: next.nodes.map((node) =>
          positions.has(node.id)
            ? { ...node, position: positions.get(node.id) || node.position }
            : node
        ),
      }
      continue
    }
    if (operation.op === 'duplicate') {
      const selected = next.nodes.filter((node) =>
        operation.nodeIds.includes(node.id)
      )
      if (selected.length !== new Set(operation.nodeIds).size) {
        throw new Error('Studio node is unavailable')
      }
      if (selected.some((node) => node.data.purpose === 'assembly')) {
        throw new Error('A project can have only one final assembly node')
      }
      const ids = new Map(selected.map((node) => [node.id, newId()]))
      const offset = operation.offset || { x: 48, y: 48 }
      const nodes = selected.map((node) => {
        const manualMedia =
          !node.data.model &&
          (node.data.kind === 'image' || node.data.kind === 'audio')
        const data: StudioCanvasNodeData = {
          kind: node.data.kind,
          title: node.data.title,
          prompt: node.data.prompt,
          model: node.data.model,
          purpose: node.data.purpose,
          linkedAssetId: node.data.linkedAssetId,
          assetIds: node.data.assetIds,
          assetVersionIds: node.data.assetVersionIds,
          textMode: node.data.textMode,
          group: node.data.group,
          seconds: node.data.seconds,
          ratio: node.data.ratio,
          resolution: node.data.resolution,
          imageSize: node.data.imageSize,
          imageQuality: node.data.imageQuality,
          imageCount: node.data.imageCount,
          camera: node.data.camera,
          voice: node.data.voice,
          speed: node.data.speed,
          metadataJson: node.data.metadataJson,
          referenceControl: node.data.referenceControl,
          payloadPatchJson: node.data.payloadPatchJson,
          textDocument: node.data.textDocument,
          labelColor: node.data.labelColor,
          rating: node.data.rating,
          visualPresetIds: node.data.visualPresetIds,
          videoFamily: node.data.videoFamily,
          videoKeyframes: node.data.videoKeyframes,
          imageLayers: node.data.imageLayers,
          reworkRegion: node.data.reworkRegion,
          reworkRange: node.data.reworkRange,
          derivedFrom: node.data.derivedFrom,
          assistantPlan: node.data.assistantPlan,
          assistantSkillId: node.data.assistantSkillId,
          assistantScopeNodeIds: node.data.assistantScopeNodeIds?.map(
            (id) => ids.get(id) || id
          ),
          status: 'idle',
        }
        if (node.data.purpose === 'note') {
          data.outputText = node.data.outputText
          data.status = node.data.status === 'completed' ? 'completed' : 'idle'
        }
        if (manualMedia || node.data.sourceMode === 'upload') {
          data.mediaId = node.data.mediaId
          data.outputUrl = node.data.outputUrl
          data.sourceMode = node.data.sourceMode
          data.status = node.data.status === 'completed' ? 'completed' : 'idle'
        }
        return {
          id: requireStudioItem(ids.get(node.id)),
          type: 'studio' as const,
          selected: true,
          position: {
            x: node.position.x + offset.x,
            y: node.position.y + offset.y,
          },
          data: structuredClone(data),
        }
      })
      const edges = next.edges
        .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
        .map((edge) => ({
          ...edge,
          id: newId(),
          source: requireStudioItem(ids.get(edge.source)),
          target: requireStudioItem(ids.get(edge.target)),
          data: undefined,
          selected: false,
        }))
      next = {
        ...next,
        nodes: [
          ...next.nodes.map((node) => ({ ...node, selected: false })),
          ...nodes,
        ],
        edges: [...next.edges, ...edges],
        canvas: {
          ...next.canvas,
          frames: [
            ...(next.canvas?.frames || []),
            ...(next.canvas?.frames || [])
              .filter((f) => f.nodeIds.every((id) => ids.has(id)))
              .map((f) => ({
                ...f,
                id: newId(),
                x: f.x + offset.x,
                y: f.y + offset.y,
                nodeIds: f.nodeIds.map((id) => requireStudioItem(ids.get(id))),
              })),
          ],
        },
      }
      continue
    }
    if (operation.op === 'layout') {
      const levels = new Map<string, number>()
      for (const node of next.nodes) {
        for (const item of planStudioExecution(
          next.nodes,
          next.edges,
          node.id
        )) {
          const parents = next.edges
            .filter((edge) => edge.target === item.id)
            .map((edge) => levels.get(edge.source) || 0)
          levels.set(item.id, parents.length ? Math.max(...parents) + 1 : 0)
        }
      }
      const rows = new Map<number, number>()
      next = {
        ...next,
        nodes: next.nodes.map((node) => {
          if (node.data.locked) return node
          const level = levels.get(node.id) || 0
          const row = rows.get(level) || 0
          rows.set(level, row + 1)
          const position =
            operation.direction === 'horizontal'
              ? { x: level * 400, y: row * 340 }
              : { x: row * 400, y: level * 340 }
          return { ...node, position }
        }),
      }
      continue
    }
    if (operation.op === 'arrange') {
      const selected = next.nodes.filter(
        (node) => operation.nodeIds.includes(node.id) && !node.data.locked
      )
      if (selected.length < 2) continue
      const axis =
        operation.mode === 'align_left' ||
        operation.mode === 'distribute_horizontal'
          ? 'x'
          : 'y'
      const ordered = [...selected].sort(
        (a, b) => a.position[axis] - b.position[axis]
      )
      const start = ordered[0].position[axis]
      const step =
        (requireStudioItem(ordered.at(-1)).position[axis] - start) /
        (ordered.length - 1)
      const positions = new Map(
        ordered.map((node, index) => [
          node.id,
          {
            ...node.position,
            [axis]: operation.mode.startsWith('align')
              ? start
              : start + step * index,
          },
        ])
      )
      next = {
        ...next,
        nodes: next.nodes.map((node) =>
          positions.has(node.id)
            ? { ...node, position: positions.get(node.id) || node.position }
            : node
        ),
      }
      continue
    }
    if (operation.op === 'upsert_asset') {
      const id = operation.id || newId()
      const previous = next.assets?.find((asset) => asset.id === id)
      if (previous && previous.kind !== operation.kind) {
        throw new Error('Studio asset kind cannot be changed')
      }
      const asset: StudioAsset = {
        ...previous,
        id,
        kind: operation.kind,
        title: operation.title,
        prompt: operation.prompt,
        ...(operation.profile !== undefined
          ? { profile: operation.profile }
          : {}),
      }
      for (const node of next.nodes) {
        if (
          node.data.linkedAssetId === id ||
          (node.data.assetIds?.includes(id) && !node.data.assetVersionIds?.[id])
        ) {
          assertEditableBranch(next, node.id)
        }
      }
      next = {
        ...next,
        assets: previous
          ? next.assets?.map((item) => (item.id === id ? asset : item))
          : [...(next.assets || []), asset],
      }
      for (const node of next.nodes) {
        if (
          node.data.linkedAssetId === id ||
          (node.data.assetIds?.includes(id) && !node.data.assetVersionIds?.[id])
        ) {
          next = invalidateStudioBranch(next, node.id)
        }
      }
      next = {
        ...next,
        nodes: next.nodes.map((node) =>
          node.data.linkedAssetId === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  title: asset.title,
                  prompt: asset.prompt,
                },
              }
            : node
        ),
      }
      continue
    }
    if (operation.op === 'bind_assets') {
      assertEditableBranch(next, operation.nodeId)
      if (!next.nodes.some((node) => node.id === operation.nodeId)) {
        throw new Error('Studio node is unavailable')
      }
      const assetIds = [...new Set(operation.assetIds)]
      if (
        assetIds.some((id) => !next.assets?.some((asset) => asset.id === id))
      ) {
        throw new Error('Studio asset is unavailable')
      }
      const shot = next.shots?.find((shot) =>
        [shot.textNodeId, shot.imageNodeId, shot.videoNodeId].includes(
          operation.nodeId
        )
      )
      if (shot) next = setStudioShotAssets(next, shot.id, assetIds)
      else {
        next = updateStudioNode(
          invalidateStudioBranch(next, operation.nodeId),
          operation.nodeId,
          { assetIds, assetVersionIds: undefined }
        )
      }
      continue
    }
    if (operation.op === 'add_shot') {
      const id = newId()
      next = addStudioShot(
        next,
        id,
        { text: newId(), image: newId(), video: newId() },
        operation.title || `Shot ${(next.shots?.length || 0) + 1}`
      )
      if (operation.assetIds) {
        next = setStudioShotAssets(next, id, operation.assetIds)
      }
      continue
    }
    if (operation.op === 'apply_template') {
      const origin = operation.position || { x: 0, y: 0 }
      const scriptId = newId()
      const previousIds = new Set(next.nodes.map((node) => node.id))
      next = applyStudioCanvasOperations(
        next,
        [
          {
            op: 'add_node',
            nodeType: 'script',
            id: scriptId,
            title: translate('studio.catalog.script'),
            prompt:
              operation.templateId === 'advert'
                ? translate('studio.template.prompt.advert')
                : translate('studio.template.prompt.story'),
          },
        ],
        newId,
        translate
      )
      const assetIds: string[] = []
      const referenceIds: string[] = []
      if (operation.templateId !== 'shot') {
        for (const nodeType of ['character', 'scene', 'style'] as const) {
          const id = newId()
          referenceIds.push(id)
          next = applyStudioCanvasOperations(
            next,
            [
              {
                op: 'add_node',
                nodeType,
                id,
                title: translate(`studio.catalog.${nodeType}`),
                prompt: translate(`studio.template.prompt.${nodeType}`),
              },
            ],
            newId,
            translate
          )
          const assetId = next.nodes.find((node) => node.id === id)?.data
            .linkedAssetId
          if (assetId) assetIds.push(assetId)
        }
      }
      const shotId = newId()
      const ids = { text: newId(), image: newId(), video: newId() }
      const shotTitle = `${translate('studio.shot.defaultName')} 1`
      next = addStudioShot(next, shotId, ids, shotTitle)
      next = {
        ...next,
        nodes: next.nodes.map((node) =>
          Object.values(ids).includes(node.id)
            ? {
                ...node,
                data: {
                  ...node.data,
                  title: `${shotTitle} · ${translate(`studio.kind.${node.data.kind}`)}`,
                },
              }
            : node
        ),
      }
      next = {
        ...next,
        edges: [
          ...next.edges,
          {
            id: newId(),
            source: scriptId,
            target: ids.text,
            sourceHandle: 'scene',
            targetHandle: 'brief',
          },
        ],
      }
      for (const id of referenceIds) {
        next = {
          ...next,
          edges: [
            ...next.edges,
            {
              id: newId(),
              source: id,
              target: ids.image,
              sourceHandle: 'image',
              targetHandle: 'reference_image',
            },
            {
              id: newId(),
              source: id,
              target: ids.video,
              sourceHandle: 'image',
              targetHandle: 'reference_image',
            },
          ],
        }
      }
      if (assetIds.length) next = setStudioShotAssets(next, shotId, assetIds)
      next = {
        ...next,
        nodes: next.nodes.map((node) =>
          previousIds.has(node.id)
            ? node
            : {
                ...node,
                position: {
                  x: node.position.x + origin.x,
                  y: node.position.y + origin.y,
                },
              }
        ),
      }
      continue
    }
    if (operation.op === 'set_audio_track') {
      const node = next.nodes.find((node) => node.id === operation.nodeId)
      if (
        node?.data.kind !== 'audio' ||
        node.data.status !== 'completed' ||
        !node.data.mediaId
      ) {
        throw new Error(
          'Store a completed audio result before assigning a track'
        )
      }
      next = {
        ...next,
        [operation.track === 'soundtrack'
          ? 'soundtrackMediaId'
          : 'voiceoverMediaId']: node.data.mediaId,
        assembledMediaId: undefined,
      }
      continue
    }
    if (operation.op === 'select_take') {
      assertEditableBranch(next, operation.nodeId)
      next = selectStudioTake(next, operation.nodeId, operation.takeId)
      continue
    }
    if (operation.op === 'pin_connection') {
      const edge = next.edges.find((edge) => edge.id === operation.edgeId)
      if (!edge) throw new Error('Studio connection is unavailable')
      assertEditableBranch(next, edge.target)
      next = pinStudioConnectionTake(next, operation.edgeId, operation.takeId)
      continue
    }
    if (operation.op === 'pin_asset_version') {
      const shot = next.shots?.find((shot) => shot.id === operation.shotId)
      if (!shot) throw new Error('Studio shot is unavailable')
      assertEditableBranch(next, shot.textNodeId)
      next = pinStudioShotAssetVersion(
        next,
        operation.shotId,
        operation.assetId,
        operation.versionId
      )
      continue
    }
    if (operation.op === 'move_shot') {
      next = moveStudioShot(next, operation.shotId, operation.direction)
      continue
    }
    if (operation.op === 'reorder_clips') {
      if (
        !next.nodes.some(
          (node) =>
            node.id === operation.nodeId && node.data.purpose === 'assembly'
        )
      ) {
        throw new Error('Studio assembly node is unavailable')
      }
      assertEditableBranch(next, operation.nodeId)
      const incoming = next.edges.filter(
        (edge) =>
          edge.target === operation.nodeId &&
          next.nodes.some(
            (node) => node.id === edge.source && node.data.kind === 'video'
          )
      )
      if (
        operation.edgeIds.length !== incoming.length ||
        new Set(operation.edgeIds).size !== incoming.length ||
        operation.edgeIds.some((id) => !incoming.some((edge) => edge.id === id))
      ) {
        throw new Error('Studio assembly clip order is invalid')
      }
      const ordered = operation.edgeIds.map((id) =>
        requireStudioItem(incoming.find((edge) => edge.id === id))
      )
      let index = 0
      next = invalidateStudioBranch(
        {
          ...next,
          edges: next.edges.map((edge) =>
            incoming.some((item) => item.id === edge.id)
              ? ordered[index++]
              : edge
          ),
          assembledMediaId: undefined,
        },
        operation.nodeId
      )
      continue
    }
    if (operation.op === 'update_shot') {
      const shot = next.shots?.find((shot) => shot.id === operation.shotId)
      if (!shot) throw new Error('Studio shot is unavailable')
      if (
        operation.patch.camera !== undefined ||
        operation.patch.dialogue !== undefined ||
        operation.patch.shotType !== undefined
      ) {
        assertEditableBranch(next, shot.textNodeId)
        next = invalidateStudioBranch(next, shot.textNodeId)
      }
      if (operation.patch.title && operation.patch.title !== shot.title) {
        next = {
          ...next,
          nodes: next.nodes.map((node) => {
            if (
              ![shot.textNodeId, shot.imageNodeId, shot.videoNodeId].includes(
                node.id
              )
            ) {
              return node
            }
            if (
              node.data.title !== shot.title &&
              !node.data.title.startsWith(`${shot.title} ·`) &&
              !/^(Text|Image|Video|文本|图片|视频) \d+$/.test(node.data.title)
            ) {
              return node
            }
            return {
              ...node,
              data: {
                ...node.data,
                title:
                  node.data.kind === 'video'
                    ? operation.patch.title || ''
                    : `${operation.patch.title} · ${translate(`studio.kind.${node.data.kind}`)}`,
              },
            }
          }),
        }
      }
      const editedShot = { ...shot, ...operation.patch }
      if (
        editedShot.trimStart !== undefined &&
        editedShot.trimEnd !== undefined &&
        editedShot.trimEnd <= editedShot.trimStart
      ) {
        throw new Error('Studio shot trim end must follow its start')
      }
      next = {
        ...next,
        shots: next.shots?.map((shot) =>
          shot.id === operation.shotId ? { ...shot, ...operation.patch } : shot
        ),
      }
    }
  }
  next = reconcileStudioFrames({ ...next, updatedAt: new Date().toISOString() })
  studioProjectSchema.parse(next)
  if (new Set(next.nodes.map((node) => node.id)).size !== next.nodes.length) {
    throw new Error('Studio node IDs must be unique')
  }
  if (new Set(next.edges.map((edge) => edge.id)).size !== next.edges.length) {
    throw new Error('Studio connection IDs must be unique')
  }
  return next
}

/** History restores document edits while retaining settled or still-running requests. */
export class StudioCanvasHistory {
  private past: StudioProject[] = []
  private future: StudioProject[] = []
  get canUndo(): boolean {
    return this.past.length > 0
  }
  get canRedo(): boolean {
    return this.future.length > 0
  }
  get retainedProjects(): readonly StudioProject[] {
    return [...this.past, ...this.future]
  }
  private trim(): void {
    this.past = this.past.slice(-50)
    this.future = this.future.slice(-50)
    while (
      new Blob([JSON.stringify([this.past, this.future])]).size >
      8 * 1024 * 1024
    ) {
      if (this.past.length > this.future.length) this.past.shift()
      else if (this.future.length) this.future.shift()
      else break
    }
  }
  capture(project: StudioProject): void {
    if (new Blob([JSON.stringify(project)]).size > 8 * 1024 * 1024) {
      this.past = []
      this.future = []
      return
    }
    this.past.push(structuredClone(project))
    this.future = []
    this.trim()
  }
  undo(current: StudioProject): StudioProject {
    const previous = this.past.at(-1)
    if (!previous) return current
    const restored = this.restore(previous, current)
    this.past.pop()
    this.future.push(structuredClone(current))
    this.trim()
    return restored
  }
  redo(current: StudioProject): StudioProject {
    const next = this.future.at(-1)
    if (!next) return current
    const restored = this.restore(next, current)
    this.future.pop()
    this.past.push(structuredClone(current))
    this.trim()
    return restored
  }
  private restore(
    snapshot: StudioProject,
    current: StudioProject
  ): StudioProject {
    const runtimeKeys = [
      'status',
      'staleSourceTitle',
      'sourceMode',
      'takes',
      'selectedTakeId',
      'outputText',
      'outputImagePrompt',
      'outputVideoPrompt',
      'outputUrl',
      'mediaId',
      'taskId',
      'error',
      'progress',
      'pendingRequestId',
      'pendingRequestFingerprint',
      'pendingRequestPrompt',
      'pendingRequestGroup',
      'pendingRequestModel',
      'pendingRequestSnapshot',
    ] as const
    let next: StudioProject = {
      ...snapshot,
      assembledMediaId: current.assembledMediaId,
      assets: snapshot.assets?.map((asset) => {
        const live = current.assets?.find((item) => item.id === asset.id)
        return live
          ? {
              ...asset,
              mediaId: live.mediaId,
              outputUrl: live.outputUrl,
              versions: live.versions,
            }
          : asset
      }),
      nodes: snapshot.nodes.map((node) => {
        const live = current.nodes.find((item) => item.id === node.id)
        if (!live) return node
        const data = { ...node.data }
        for (const key of runtimeKeys) data[key] = live.data[key] as never
        return { ...node, data }
      }),
      updatedAt: new Date().toISOString(),
    }
    if (
      current.nodes.some(
        (node) =>
          studioNodeBusy(node) &&
          (!next.nodes.some((previous) => previous.id === node.id) ||
            studioNodeInputFingerprint(next, node.id) !==
              studioNodeInputFingerprint(current, node.id))
      )
    ) {
      throw new Error(
        'Wait for the active Studio task before undoing its inputs'
      )
    }
    const changed = next.nodes
      .filter(
        (node) =>
          current.nodes.some((item) => item.id === node.id) &&
          studioNodeInputFingerprint(next, node.id) !==
            studioNodeInputFingerprint(current, node.id)
      )
      .map((node) => node.id)
    for (const id of changed) {
      if (!next.nodes.some((node) => node.id === id && studioNodeBusy(node))) {
        next = invalidateStudioBranch(next, id)
      }
    }
    return next
  }
}
