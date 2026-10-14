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
import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'

import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import type { StudioProject } from './local-projects'
import {
  STUDIO_NODE_CATALOG,
  STUDIO_WORKFLOW_TEMPLATES,
  studioCanvasOperationSchema,
} from './studio-canvas-commands'
import {
  STUDIO_NODE_PORTS,
  STUDIO_TYPED_CONNECTIONS,
} from './studio-node-ports'

export type StudioAgentPermissions = {
  allowEdits: boolean
  allowGeneration: boolean
}
const commandSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['edit', 'run']),
  expectedRevision: z.number().int().positive(),
  operations: z.unknown().optional(),
  nodeId: z.string().optional(),
  confirmGeneration: z.boolean().optional(),
  budget: z.number().int().min(1).max(2_000_000_000).optional(),
})
const sessionSchema = z.object({
  clientSeen: z.string().optional(),
  id: z.string().uuid(),
  projectId: z.string(),
  revision: z.number().int().positive(),
  permissions: z.object({
    allowEdits: z.boolean(),
    allowGeneration: z.boolean(),
  }),
  commands: z.array(commandSchema).optional(),
})
export type StudioAgentSession = z.infer<typeof sessionSchema>
const operationContract = z.toJSONSchema(studioCanvasOperationSchema)

/** Publishes only project content and result handles, never provider settings or browser credentials. */
export function studioAgentSnapshot(
  project: StudioProject,
  models: {
    text: string[]
    image: string[]
    groups: string[]
    gatewayByGroup?: Record<string, string[]>
  }
): Record<string, unknown> {
  return {
    contractVersion: 1,
    project: {
      id: project.id,
      title: project.title,
      defaults: project.defaults,
      canvas: project.canvas,
      nodes: project.nodes.map((node) => ({
        id: node.id,
        position: node.position,
        data: {
          kind: node.data.kind,
          purpose: node.data.purpose,
          title: node.data.title,
          prompt: node.data.prompt,
          model: node.data.model,
          group: node.data.group,
          textMode: node.data.textMode,
          linkedAssetId: node.data.linkedAssetId,
          assetIds: node.data.assetIds,
          assetVersionIds: node.data.assetVersionIds,
          locked: node.data.locked,
          camera: node.data.camera,
          voice: node.data.voice,
          speed: node.data.speed,
          seconds: node.data.seconds,
          ratio: node.data.ratio,
          resolution: node.data.resolution,
          imageSize: node.data.imageSize,
          imageQuality: node.data.imageQuality,
          imageCount: node.data.imageCount,
          status: node.data.status,
          sourceMode: node.data.sourceMode,
          taskId: node.data.taskId,
          selectedTakeId: node.data.selectedTakeId,
          hasLocalMedia: Boolean(node.data.mediaId),
          progress: node.data.progress,
          error: node.data.error,
          outputText: node.data.outputText?.slice(0, 4000),
          outputImagePrompt: node.data.outputImagePrompt?.slice(0, 4000),
          outputVideoPrompt: node.data.outputVideoPrompt?.slice(0, 4000),
          resultUrl: node.data.outputUrl?.startsWith('https://')
            ? node.data.outputUrl
            : undefined,
          takes: node.data.takes?.slice(-10).map((take) => ({
            id: take.id,
            createdAt: take.createdAt,
            status: take.status,
            taskId: take.taskId,
            hasLocalMedia: Boolean(take.mediaId),
            error: take.error,
          })),
        },
      })),
      edges: project.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        sourceTakeId: edge.data?.sourceTakeId,
      })),
      assets: project.assets?.map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        title: asset.title,
        prompt: asset.prompt,
        profile: asset.profile,
        hasLocalMedia: Boolean(asset.mediaId),
        versions: asset.versions?.map((version) => ({
          id: version.id,
          prompt: version.prompt,
          profile: version.profile,
          createdAt: version.createdAt,
          hasLocalMedia: Boolean(version.mediaId),
        })),
      })),
      shots: project.shots?.map(({ shotVoiceoverMediaId, ...shot }) => ({
        ...shot,
        hasLocalVoiceover: Boolean(shotVoiceoverMediaId),
      })),
      finalVideoNodeId: project.finalVideoNodeId,
      production: project.production,
      hasAssembly: Boolean(project.assembledMediaId),
      audioMix: {
        hasSoundtrack: Boolean(project.soundtrackMediaId),
        hasVoiceover: Boolean(project.voiceoverMediaId),
        soundtrackVolume: project.soundtrackVolume,
        voiceoverVolume: project.voiceoverVolume,
        soundtrackOffsetSeconds: project.soundtrackOffsetSeconds,
        voiceoverOffsetSeconds: project.voiceoverOffsetSeconds,
      },
    },
    capabilities: {
      nodeTypes: STUDIO_NODE_CATALOG.map((node) => ({
        ...node,
        ports:
          STUDIO_NODE_PORTS[node.id === 'assembly' ? 'assembly' : node.kind],
      })),
      connections: STUDIO_TYPED_CONNECTIONS,
      templates: STUDIO_WORKFLOW_TEMPLATES,
      operationSchema: operationContract,
      models,
    },
    storage: 'server',
  }
}

type Props = {
  userId: number
  projectId?: string
  getSnapshot: () => Record<string, unknown> | null
  onEdit: (operations: unknown) => Promise<unknown>
  onRun: (
    nodeId: string,
    options: { budget?: number; requestId: string }
  ) => Promise<unknown>
  beforeConnect?: () => Promise<void>
}

export function useStudioAgentBridge(props: Props) {
  const latest = useRef(props)
  latest.current = props
  const [session, setSession] = useState<StudioAgentSession | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const active = useRef<StudioAgentSession | null>(null)
  const currentDocument = useRef({ json: '', revision: 1 })
  const processing = useRef(false)
  const opening = useRef(0)
  const ownerId = useRef(props.userId)

  const document = useCallback(() => {
    const snapshot = latest.current.getSnapshot()
    if (!snapshot) throw new Error('Studio workspace is unavailable')
    const json = JSON.stringify(snapshot)
    if (new Blob([json]).size > 2 * 1024 * 1024) {
      throw new Error('Studio canvas is too large to connect to an Agent')
    }
    if (currentDocument.current.json && currentDocument.current.json !== json) {
      currentDocument.current.revision++
    }
    currentDocument.current.json = json
    return { json, revision: currentDocument.current.revision }
  }, [])

  const disconnect = useCallback(() => {
    opening.current++
    const connected = active.current
    active.current = null
    setSession(null)
    setConnecting(false)
    if (connected) {
      void api
        .delete(`/api/studio/bridge/sessions/${connected.id}`)
        .catch(() => {
          /* The lease also expires without a heartbeat. */
        })
    }
  }, [])

  const connect = useCallback(
    async (permissions: StudioAgentPermissions) => {
      if (
        active.current ||
        !latest.current.userId ||
        !latest.current.projectId
      ) {
        return
      }
      const attempt = ++opening.current
      setConnecting(true)
      setError(null)
      currentDocument.current = { json: '', revision: 1 }
      try {
        await latest.current.beforeConnect?.()
        const snapshot = document()
        const data = JSON.parse(snapshot.json) as {
          project: { id: string; title: string }
        }
        const response = await api.post('/api/studio/bridge/sessions', {
          projectId: data.project.id,
          title: data.project.title,
          revision: snapshot.revision,
          snapshot: data,
          permissions,
        })
        const connected = sessionSchema.parse(
          requireServerSuccess(response.data).data
        )
        if (opening.current !== attempt) {
          void api
            .delete(`/api/studio/bridge/sessions/${connected.id}`)
            .catch(() => {})
          return
        }
        active.current = connected
        ownerId.current = latest.current.userId
        setSession(connected)
      } catch (cause) {
        if (opening.current === attempt) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      } finally {
        if (opening.current === attempt) setConnecting(false)
      }
    },
    [document]
  )

  useEffect(() => {
    const id = session?.id
    if (!id) return
    let stopped = false
    let polling = false
    let sentJSON = currentDocument.current.json
    let failures = 0
    const execute = async (command: z.infer<typeof commandSchema>) => {
      processing.current = true
      setPending(true)
      let executed = false
      try {
        const before = document()
        const claim = await api.post(
          `/api/studio/bridge/sessions/${id}/commands/${command.id}/claim`,
          { revision: before.revision }
        )
        if (
          requireServerSuccess(claim.data).data?.claimed !== true ||
          active.current?.id !== id ||
          ownerId.current !== latest.current.userId ||
          active.current.projectId !== latest.current.projectId
        ) {
          return
        }
        // Recheck after the asynchronous claim; human edits can occur while it is in flight.
        if (document().revision !== command.expectedRevision) {
          throw new Error(
            'Studio canvas changed before the Agent command could execute'
          )
        }
        let result: unknown
        if (command.kind === 'edit') {
          if (!active.current.permissions.allowEdits) {
            throw new Error('Studio canvas editing is disabled')
          }
          result = await latest.current.onEdit(command.operations)
        } else {
          if (
            !active.current.permissions.allowGeneration ||
            !command.confirmGeneration ||
            !command.nodeId
          ) {
            throw new Error('Studio generation is disabled')
          }
          result = await latest.current.onRun(command.nodeId, {
            budget: command.budget,
            requestId: command.id,
          })
        }
        executed = true
        const snapshot = document()
        const state = JSON.parse(snapshot.json) as {
          project: { title: string }
        }
        await api.put(`/api/studio/bridge/sessions/${id}`, {
          title: state.project.title,
          revision: snapshot.revision,
          snapshot: state,
        })
        await api.post(
          `/api/studio/bridge/sessions/${id}/commands/${command.id}/result`,
          { result: { revision: snapshot.revision, value: result } }
        )
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause)
        if (!stopped) setError(message)
        if (!executed) {
          try {
            await api.post(
              `/api/studio/bridge/sessions/${id}/commands/${command.id}/result`,
              { error: message.slice(0, 2000) }
            )
          } catch {
            /* An uncertain receipt is retained by the server; never retry generation here. */
          }
        }
      } finally {
        processing.current = false
        if (!stopped) setPending(false)
      }
    }
    const tick = async () => {
      if (polling || stopped || active.current?.id !== id) return
      polling = true
      try {
        const snapshot = document()
        const project = JSON.parse(snapshot.json) as {
          project: { title: string }
        }
        const response = await api.put(`/api/studio/bridge/sessions/${id}`, {
          title: project.project.title,
          revision: snapshot.revision,
          ...(sentJSON !== snapshot.json ? { snapshot: project } : {}),
        })
        const published = sessionSchema.parse(
          requireServerSuccess(response.data).data
        )
        if (stopped || active.current?.id !== id) return
        sentJSON = snapshot.json
        failures = 0
        setSession(published)
        active.current = published
        const command = published.commands?.[0]
        if (command && !processing.current) void execute(command)
      } catch (cause) {
        if (!stopped) {
          setError(cause instanceof Error ? cause.message : String(cause))
          failures++
          if (failures >= 3) disconnect()
        }
      } finally {
        polling = false
      }
    }
    void tick()
    const timer = window.setInterval(() => {
      void tick()
    }, 5000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [session?.id, document, disconnect])

  useEffect(() => {
    return () => disconnect()
  }, [props.userId, props.projectId, disconnect])
  return { session, connecting, error, pending, connect, disconnect }
}
