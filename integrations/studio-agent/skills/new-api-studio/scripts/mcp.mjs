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
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { cloudTools, callCloudTool } from './cloud.mjs'

import {
  editCanvas,
  request,
  runNode,
  STUDIO_GUIDE,
  workspacePath,
} from './client.mjs'

const idProperty = {
  type: 'string',
  description: 'ID of the workspace the user connected in the browser',
}
const revisionProperty = {
  type: 'integer',
  minimum: 1,
  description: 'Latest revision returned by studio_read_canvas',
}
const tools = [
  {
    name: 'studio_list_workspaces',
    description:
      'List the current user’s connected browser canvases and their permissions.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'studio_read_canvas',
    description:
      'Read nodes, typed connections, shots, character/scene/style assets, results, models and the exact edit-operation schema.',
    inputSchema: {
      type: 'object',
      properties: { sessionId: idProperty },
      required: ['sessionId'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'studio_edit_canvas',
    description:
      'Queue one atomic canvas edit. Read capabilities.operationSchema first. Supports node creation/configuration, connections, duplication, layout, assets, shots and audio tracks. Does not start generation. Poll the returned job ID.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: idProperty,
        expectedRevision: revisionProperty,
        requestId: { type: 'string', format: 'uuid' },
        operations: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            properties: { op: { type: 'string' } },
            required: ['op'],
          },
        },
      },
      required: ['sessionId', 'expectedRevision', 'operations'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    },
  },
  {
    name: 'studio_run_node',
    description:
      'Queue execution of one node and its dependencies. Platform models require an explicit quota budget and use a durable server workflow; personal providers use the configured direct flow. Requires browser generation permission and explicit confirmation. Keep its receipt; never resubmit an uncertain request.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: idProperty,
        expectedRevision: revisionProperty,
        nodeId: { type: 'string' },
        requestId: { type: 'string', format: 'uuid' },
        confirmGeneration: { type: 'boolean', const: true },
        budget: { type: 'integer', minimum: 1, maximum: 2000000000, description: 'Hard quota budget for default platform models; paid requests above this limit are rejected before submission' },
      },
      required: [
        'sessionId',
        'expectedRevision',
        'nodeId',
        'confirmGeneration',
      ],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'studio_job_status',
    description:
      'Read a command receipt. succeeded means the browser processed the command; inspect the node task status for asynchronous video completion.',
    inputSchema: {
      type: 'object',
      properties: { sessionId: idProperty, jobId: { type: 'string' } },
      required: ['sessionId', 'jobId'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
]
tools.push(...cloudTools)
const prompts = [
  {
    name: 'studio-director',
    description: 'Develop a connected canvas from a creative brief.',
    arguments: [
      {
        name: 'brief',
        description: 'Film, short drama or advertising brief',
        required: true,
      },
    ],
  },
  {
    name: 'studio-continuity-review',
    description:
      'Review character, scene, camera and shot continuity before generation.',
    arguments: [],
  },
]

function validateArgument(value, rule, path, depth = 0) {
  if (depth > 32) throw new Error(`Argument nesting exceeds the limit: ${path}`)
  const invalid = () => { throw new Error(`Invalid argument: ${path}`) }
  if (Object.hasOwn(rule, 'const') && value !== rule.const) invalid()
  if (rule.enum && !rule.enum.includes(value)) invalid()
  if (rule.type === 'string') {
    if (typeof value !== 'string') invalid()
    let length = 0
    if (rule.minLength !== undefined || rule.maxLength !== undefined) {
      for (const _character of value) {
        length++
        if (length > (rule.maxLength ?? Infinity)) invalid()
      }
    }
    if (length < (rule.minLength ?? 0) || length > (rule.maxLength ?? Infinity)) invalid()
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) invalid()
    if (rule.format === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) invalid()
  } else if (rule.type === 'number' || rule.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) invalid()
    if (rule.type === 'integer' && !Number.isSafeInteger(value)) invalid()
    if (value < (rule.minimum ?? -Infinity) || value > (rule.maximum ?? Infinity)) invalid()
  } else if (rule.type === 'boolean') {
    if (typeof value !== 'boolean') invalid()
  } else if (rule.type === 'array') {
    if (!Array.isArray(value)) invalid()
    if (value.length < (rule.minItems ?? 0) || value.length > (rule.maxItems ?? Infinity)) invalid()
    if (rule.items) value.forEach((item, index) => validateArgument(item, rule.items, `${path}[${index}]`, depth + 1))
  } else if (rule.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
    if (rule.required?.some((key) => !Object.hasOwn(value, key) || value[key] === undefined)) invalid()
    const properties = rule.properties || {}
    for (const [key, item] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) validateArgument(item, properties[key], `${path}.${key}`, depth + 1)
      else if (rule.additionalProperties === false) invalid()
    }
  }
}

function validArguments(params, tool) {
  const args = params?.arguments === undefined ? {} : params.arguments
  validateArgument(args, tool.inputSchema, 'arguments')
  return args
}

export async function handleMessage(message) {
  const id = message?.id
  if (
    !message ||
    message.jsonrpc !== '2.0' ||
    typeof message.method !== 'string' ||
    (id !== undefined &&
      id !== null &&
      typeof id !== 'string' &&
      !Number.isFinite(id))
  )
    return {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Invalid JSON-RPC request' },
    }
  if (id === undefined) return null
  const result = (value) => ({ jsonrpc: '2.0', id, result: value })
  const error = (code, text) => ({
    jsonrpc: '2.0',
    id,
    error: { code, message: text },
  })
  if (message.method === 'initialize') {
    const requested = message.params?.protocolVersion
    const protocolVersion = ['2025-11-25', '2025-06-18', '2025-03-26'].includes(
      requested
    )
      ? requested
      : '2025-11-25'
    return result({
      protocolVersion,
      capabilities: { tools: {}, resources: {}, prompts: {} },
      serverInfo: { name: 'new-api-studio', version: '1.0.0' },
      instructions: STUDIO_GUIDE,
    })
  }
  if (message.method === 'ping') return result({})
  if (message.method === 'tools/list') return result({ tools })
  if (message.method === 'prompts/list') return result({ prompts })
  if (message.method === 'prompts/get') {
    const prompt = prompts.find((item) => item.name === message.params?.name)
    if (!prompt) return error(-32602, 'Unknown Studio prompt')
    if (prompt.name === 'studio-director' && !message.params?.arguments?.brief)
      return error(-32602, 'A creative brief is required')
    const brief = message.params?.arguments?.brief
    return result({
      description: prompt.description,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `${STUDIO_GUIDE}\n\n${brief ? `Develop this creative brief: ${brief}. Create reusable character, scene and style assets, a script, planned shots and camera settings. Review the graph and show the plan before paid generation.` : 'Review the connected project for inconsistent character appearance, wardrobe, lighting, scene time, camera direction, missing references, unreviewed shots and incompatible connections. Explain specific issues and propose canvas edits.'}`,
          },
        },
      ],
    })
  }
  if (message.method === 'resources/templates/list')
    return result({
      resourceTemplates: [
        {
          uriTemplate: 'studio://workspace/{sessionId}',
          name: 'Studio canvas',
          mimeType: 'application/json',
        },
      ],
    })
  if (message.method === 'resources/list') {
    try {
      const sessions = await request('/sessions')
      return result({
        resources: [
          {
            uri: 'studio://guide',
            name: 'Studio operating guide',
            mimeType: 'text/plain',
          },
          ...sessions.map((session) => ({
            uri: `studio://workspace/${session.id}`,
            name: session.title,
            description: session.online
              ? 'Connected browser canvas'
              : 'Disconnected canvas snapshot',
            mimeType: 'application/json',
          })),
        ],
      })
    } catch (cause) {
      return error(-32000, cause.message)
    }
  }
  if (message.method === 'resources/read') {
    const uri = message.params?.uri
    if (uri === 'studio://guide')
      return result({
        contents: [{ uri, mimeType: 'text/plain', text: STUDIO_GUIDE }],
      })
    if (typeof uri !== 'string' || !uri.startsWith('studio://workspace/'))
      return error(-32602, 'Unknown Studio resource')
    try {
      const data = await request(
        workspacePath(uri.slice('studio://workspace/'.length))
      )
      return result({
        contents: [
          { uri, mimeType: 'application/json', text: JSON.stringify(data) },
        ],
      })
    } catch (cause) {
      return error(-32000, cause.message)
    }
  }
  if (message.method === 'tools/call') {
    const tool = tools.find((item) => item.name === message.params?.name)
    if (!tool) return error(-32602, 'Unknown Studio tool')
    let args
    try {
      args = validArguments(message.params, tool)
    } catch (cause) {
      return error(-32602, cause.message)
    }
    try {
      let data
      if (cloudTools.some((item) => item.name === tool.name)) data = await callCloudTool(tool.name, args)
      if (tool.name === 'studio_list_workspaces')
        data = await request('/sessions')
      if (tool.name === 'studio_read_canvas')
        data = await request(workspacePath(args.sessionId))
      if (tool.name === 'studio_edit_canvas') data = await editCanvas(args)
      if (tool.name === 'studio_run_node') data = await runNode(args)
      if (tool.name === 'studio_job_status')
        data = await request(
          `${workspacePath(args.sessionId)}/commands/${encodeURIComponent(args.jobId)}`
        )
      data ??= null
      return result({
        content: [{ type: 'text', text: JSON.stringify(data) }],
        structuredContent: { data },
        isError: false,
      })
    } catch (cause) {
      return result({
        content: [{ type: 'text', text: cause.message }],
        isError: true,
      })
    }
  }
  return error(-32601, 'Method not found')
}

export function startMcpServer() {
  const reader = createInterface({ input: process.stdin, crlfDelay: Infinity })
  reader.on('line', async (line) => {
    if (line.length > 34 * 1024 * 1024) {
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'MCP request is too large' } })}\n`
      )
      return
    }
    let message
    try {
      message = JSON.parse(line)
    } catch {
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`
      )
      return
    }
    const response = await handleMessage(message)
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`)
  })
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  startMcpServer()
