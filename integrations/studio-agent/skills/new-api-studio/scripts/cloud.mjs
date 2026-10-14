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
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, writeFile, realpath, stat } from 'node:fs/promises'
import { resolve, join, basename, relative, extname, isAbsolute } from 'node:path'
import { request } from './client.mjs'

const id = { type: 'string', pattern: '^[A-Za-z0-9_-]{1,128}$' }
const revision = { type: 'integer', minimum: 0 }
function tool(name, description, properties, required = [], readOnly = true) {
  return { name, description, inputSchema: { type: 'object', properties, required, additionalProperties: false }, annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly } }
}
export const cloudTools = [
  tool('studio_align_dialogue', 'Fit timeline clip speed to the actual recorded character dialogue duration without another model call. Rejects alignment beyond supported speeds and preserves Take selection.', { projectId: id, revision }, ['projectId', 'revision'], false),
  tool('studio_completion_events', 'Read durable completion and failure notifications after a saved cursor. Events survive browser and server restarts; store the returned cursor after processing.', { projectId: id, after: { type: 'string', maxLength: 200 } }, ['projectId']),
  tool('studio_wait_workflow', 'Wait up to 60 seconds for a workflow to finish or need attention. Returns status and results without resubmitting inference.', { jobId: id, timeoutSeconds: { type: 'integer', minimum: 0, maximum: 60 } }, ['jobId']),
  tool('studio_plan_rework', 'Convert timed review feedback into a persistent plan for regeneration, timeline edits or audio repair. Preserves existing Takes and narration; execute selected nodes only after budget confirmation.', { projectId: id, revision, commentId: { type: 'integer', minimum: 1 }, action: { type: 'string', enum: ['regenerate', 'edit', 'audio'] } }, ['projectId', 'revision', 'commentId', 'action'], false),
  tool('studio_create_review_link', 'Create an expiring review link for one stored film or exact Take. Guests can only view and optionally comment; the secret fragment is returned once. Do not publish it without user authorization.', { projectId: id, revision, mediaId: id, nodeId: id, takeId: id, expiresHours: { type: 'integer', minimum: 1, maximum: 720 }, allowComments: { type: 'boolean' } }, ['projectId', 'revision', 'mediaId'], false),
  tool('studio_revoke_review_link', 'Revoke a review link immediately. Project owner permission is required.', { projectId: id, shareId: id }, ['projectId', 'shareId'], false),
  tool('studio_upload_file', 'Stream a local media file up to 512 MiB from NEW_API_INPUT_DIR (default studio-input). filename must be simple, and symlinks escaping the input directory are rejected.', { projectId: id, mediaId: id, filename: { type: 'string', maxLength: 200 }, contentType: { type: 'string', maxLength: 100 } }, ['mediaId', 'filename'], false),
  tool('studio_review_take', 'Approve or request a revision for an exact stored image, audio or video Take. Reviewers may use this without canvas edit permission. Decisions preserve reviewer identity and revision.', { projectId: id, revision, nodeId: id, takeId: { type: 'string', maxLength: 128 }, status: { type: 'string', enum: ['approved', 'retake', 'unreviewed'] }, note: { type: 'string', maxLength: 2000 } }, ['projectId', 'revision', 'nodeId', 'status'], false),
  tool('studio_project_schema', 'Read the exact server and frontend schema before creating or saving persistent project documents.', {}),
  tool('studio_list_projects', 'List paged project summaries without full documents. Returns projects, total and nextOffset. Use studio_read_project for one full document. includeDocuments=true retains the legacy complete array.', { offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 100 }, includeDocuments: { type: 'boolean' } }),
  tool('studio_read_project', 'Read a persistent canvas, production timeline, assets, permissions and revision.', { projectId: id }, ['projectId']),
  tool('studio_save_project', 'Save the full project document using optimistic revision control. Read first, preserve unknown fields and upload referenced media first.', { projectId: id, expectedRevision: revision, document: { type: 'object' } }, ['projectId', 'expectedRevision', 'document'], false),
  tool('studio_upload_media', 'Upload immutable project media (base64, maximum 24 MiB). Never overwrite an existing Take.', { projectId: id, mediaId: id, contentType: { type: 'string' }, base64: { type: 'string', maxLength: 33554432 } }, ['mediaId', 'contentType', 'base64'], false),
  tool('studio_start_workflow', 'Start durable generation, rendering, technical review, transcription or production media. Media actions: music, sound_effects, voice_clone, voice_speech, lip_sync, audio_separate, audio_translate, image_bg_remove, image_upscale, image_outpaint, image_layers, image_grid, image_to_3d, video_remove, video_replace, video_depth. Depth extraction requires an owned video and one to thirty seconds; its resulting video controls VACE with metadata.reference_control=depth. Kind connector uses server-owned connection config and operations import_media, export_media, sync_review, notify_delivery. External writes require human authorization and operation.confirm_external_write=true; source media and exact Take binding belong to this project. Frame.io review import checks the exact original file digest. Never pass credentials or destination URLs in the canvas. Kind graphics exports standalone production.motionGraphics with graphics_frame or graphics_animation to an image or video node, within thirty seconds; output includes an offline editable HTML package and does not call a model. Object edits need operation.edit with source-pixel x/y/width/height and start/end up to30seconds. Typed operation.options control width/height/scale/rows/columns/speed/pitch/pause/expression/translation. Auxiliary outputs are project-owned artifacts. Optional runAfter is a Unix timestamp within seven days; confirmed inputs and budget are frozen, permissions are checked again at execution. Native transform actions crop, resize, rotate, frame, trim, speed, reverse, extract_audio require node_id, media_id and edit {start,end,x,y,width,height,rotation,speed}; preserve the original by creating a distinct target node. Paid operations require explicit confirmation and a quota budget. Previs uses a saved production.previs and action previs_frame, previs_animation, previs_whitebox or previs_depth. GLB, camera, poses and animation tracks use the same Three rendering engine as the editor. Reference analysis uses kind analyze, operation {node_id: a text output, media_id: owned video, model: vision model, samples: 2..8, dimensions: [shots,motion,audio], edit: {start,end}} for an interval up to 60 seconds; it produces editable suggestions and never changes shots automatically. Retain requestId on uncertain responses.', { projectId: id, requestId: id, revision, kind: { type: 'string', enum: ['generate', 'render', 'quality', 'transcribe', 'media', 'previs', 'graphics', 'connector', 'transform', 'analyze'] }, budget: { type: 'integer', minimum: 0, maximum: 2000000000 }, runAfter: { type: 'integer', minimum: 0 }, nodeIds: { type: 'array', items: id, minItems: 0, maxItems: 100 }, render: { type: 'object' }, operation: { type: 'object' }, confirmGeneration: { type: 'boolean' } }, ['projectId', 'revision', 'kind'], false),
  tool('studio_workflow_status', 'Read one durable workflow status and stored results.', { jobId: id }, ['jobId']),
  tool('studio_list_connectors', 'List server-configured optional connections belonging to this project owner. Configuration state is not proof of live access; credentials are never returned.', { projectId: id }, ['projectId']),
  tool('studio_connector_resources', 'Check authorized access and list source media from an optional owner connection. Read only; does not upload or notify anyone. A cursor loads the next page; WebDAV uses a relative folder cursor.', { projectId: id, connectorId: id, cursor: { type: 'string', maxLength: 2000 } }, ['projectId', 'connectorId']),
  tool('studio_list_workflows', 'List up to 100 recent durable workflows in an accessible project, including request_id. Recover a lost submission receipt by matching the original request ID before any retry.', { projectId: id }, ['projectId']),
  tool('studio_control_workflow', 'Pause, cancel, resume, or reconcile an existing connector result by read-only byte verification using externalResourceId. Webhook reconciliation checks the saved event ID with the receiver; it never sends again. Abandon an uncertain result only with explicit acknowledgement and a 10–1000 character note. Never resubmit unresolved paid inference.', { jobId: id, action: { type: 'string', enum: ['pause', 'cancel', 'resume', 'reconcile', 'abandon'] }, externalResourceId: { type: 'string', maxLength: 2000 }, confirmGeneration: { type: 'boolean' }, acknowledgeUncertainty: { type: 'boolean' }, note: { type: 'string', minLength: 10, maxLength: 1000 } }, ['jobId', 'action'], false),
  tool('studio_review_comment', 'Add feedback anchored to an exact project revision, clip Take and time.', { projectId: id, revision, nodeId: id, takeId: id, seconds: { type: 'number', minimum: 0, maximum: 3600 }, message: { type: 'string', maxLength: 10000 } }, ['projectId', 'revision', 'message'], false),
  tool('studio_project_history', 'List immutable project versions.', { projectId: id }, ['projectId']),
  tool('studio_archive_take', 'Archive an unused completed or failed Take from the active canvas while retaining historical versions and source media. Selected, pinned and unfinished Takes are rejected.', { projectId: id, revision, nodeId: id, takeId: id }, ['projectId', 'revision', 'nodeId', 'takeId'], false),
  tool('studio_read_project_version', 'Read an immutable historical document before deciding to restore it.', { projectId: id, revision }, ['projectId', 'revision']),
  tool('studio_project_trash', 'List your deleted projects retained with their media and history.', {}),
  tool('studio_recover_project', 'Restore your deleted project as a new revision with its members and history.', { projectId: id }, ['projectId'], false),
  tool('studio_restore_project', 'Restore a historical document by creating a new revision; never removes history.', { projectId: id, expectedRevision: revision, revision }, ['projectId', 'expectedRevision', 'revision'], false),
  tool('studio_materialize_media', 'Collect successful gateway video tasks into durable project media before rendering.', { projectId: id }, ['projectId'], false),
  tool('studio_download_media', 'Download media or delivery ZIP to NEW_API_OUTPUT_DIR. filename must be a simple new filename; existing files are preserved.', { projectId: id, mediaId: id, filename: { type: 'string', maxLength: 200 } }, ['mediaId', 'filename']),
  tool('studio_cloud_capabilities', 'Read storage, renderer availability, quota units and supported durable workflow operations.', {}),
]

export async function callCloudTool(name, args) {
  const route = args.projectId ? `/projects/${encodeURIComponent(args.projectId)}` : ''
  const send = (path, options = {}) => request(path, { ...options, area: 'cloud' })
  switch (name) {
    case 'studio_align_dialogue': return send(`${route}/dialogue/align`, { method: 'POST', body: { revision: args.revision } })
    case 'studio_completion_events': return send(`${route}/events${args.after ? `?after=${encodeURIComponent(args.after)}` : ''}`)
    case 'studio_plan_rework': return send(`${route}/rework`, { method: 'POST', body: { revision: args.revision, comment_id: args.commentId, action: args.action } })
    case 'studio_create_review_link': return send(`${route}/review-shares`, { method: 'POST', body: { revision: args.revision, media_id: args.mediaId, node_id: args.nodeId || '', take_id: args.takeId || '', expires_hours: args.expiresHours || 168, allow_comments: args.allowComments === true } })
    case 'studio_revoke_review_link': return send(`${route}/review-shares/${encodeURIComponent(args.shareId)}`, { method: 'DELETE' })
    case 'studio_wait_workflow': {
      const deadline = Date.now() + Math.min(60, Math.max(0, args.timeoutSeconds ?? 30)) * 1000
      while (true) {
        const job = await send(`/jobs/${encodeURIComponent(args.jobId)}`)
        if (['succeeded', 'failed', 'uncertain', 'cancelled', 'paused'].includes(job.status) || Date.now() >= deadline) return job
        await new Promise((resolve) => setTimeout(resolve, Math.min(1000, deadline - Date.now())))
      }
    }
    case 'studio_upload_file': {
      if (!args.filename || basename(args.filename) !== args.filename || /[/\\:\x00-\x1f]/.test(args.filename) || args.filename.includes('..')) throw new Error('Use a simple input filename')
      const directory = await realpath(resolve(process.env.NEW_API_INPUT_DIR || 'studio-input'))
      const file = await realpath(join(directory, args.filename))
      const local = relative(directory, file)
      if (local.startsWith('..') || isAbsolute(local)) throw new Error('Input file escapes the configured directory')
      const metadata = await stat(file)
      if (!metadata.isFile() || metadata.size < 1 || metadata.size > 512 * 1024 * 1024) throw new Error('Input must be a regular media file between 1 byte and 512 MiB')
      const types = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
      const contentType = args.contentType || types[extname(file).toLowerCase()]
      if (!contentType) throw new Error('Specify the media contentType')
      return send(`/media/${encodeURIComponent(args.mediaId)}${route ? `?project_id=${encodeURIComponent(args.projectId)}` : ''}`, { method: 'PUT', binary: createReadStream(file), stream: true, contentLength: metadata.size, contentType })
    }
    case 'studio_review_take': return send(`${route}/review`, { method: 'POST', body: { revision: args.revision, node_id: args.nodeId, take_id: args.takeId || '', status: args.status, note: args.note || '' } })
    case 'studio_project_schema': return send('/project-schema')
    case 'studio_list_projects': return send(args.includeDocuments ? '/projects' : `/projects?summary=true&offset=${args.offset || 0}&limit=${args.limit || 25}`)
    case 'studio_read_project': return send(route)
    case 'studio_save_project': return send(route, { method: 'PUT', body: { revision: args.expectedRevision, document: args.document } })
    case 'studio_upload_media': {
      if (typeof args.base64 !== 'string' || args.base64.length > 33554432 || !/^[A-Za-z0-9+/]*={0,2}$/.test(args.base64)) throw new Error('Invalid or oversized base64 media')
      const binary = Buffer.from(args.base64, 'base64')
      if (binary.length === 0 || binary.length > 24 * 1024 * 1024) throw new Error('Upload must be between 1 byte and 24 MiB')
      return send(`/media/${encodeURIComponent(args.mediaId)}${route ? `?project_id=${encodeURIComponent(args.projectId)}` : ''}`, { method: 'PUT', binary, contentType: args.contentType })
    }
    case 'studio_start_workflow': {
      const requestId = args.requestId || randomUUID()
      try { return await send(`${route}/jobs`, { method: 'POST', body: { request_id: requestId, revision: args.revision, kind: args.kind, budget: args.budget || 0, run_after: args.runAfter || 0, node_ids: args.nodeIds || [], render: args.render, operation: args.operation, confirm_generation: args.confirmGeneration === true } }) }
      catch (error) { throw new Error(`${error.message}; retain requestId=${requestId} and inspect workflows before resubmitting`) }
    }
    case 'studio_workflow_status': return send(`/jobs/${encodeURIComponent(args.jobId)}`)
    case 'studio_list_connectors': return send(`${route}/connectors`)
    case 'studio_connector_resources': return send(`${route}/connectors/${encodeURIComponent(args.connectorId)}/resources${args.cursor ? '?cursor=' + encodeURIComponent(args.cursor) : ''}`)
    case 'studio_list_workflows': return send(`${route}/jobs`)
    case 'studio_control_workflow': return send(`/jobs/${encodeURIComponent(args.jobId)}/control`, { method: 'POST', body: { action: args.action, external_resource_id: args.externalResourceId || '', confirm_generation: args.confirmGeneration === true, acknowledge_uncertainty: args.acknowledgeUncertainty === true, note: args.note || '' } })
    case 'studio_review_comment': return send(`${route}/comments`, { method: 'POST', body: { revision: args.revision, node_id: args.nodeId || '', take_id: args.takeId || '', seconds: args.seconds || 0, message: args.message } })
    case 'studio_project_history': return send(`${route}/versions`)
    case 'studio_archive_take': return send(`${route}/takes/archive`, { method: 'POST', body: { revision: args.revision, node_id: args.nodeId, take_id: args.takeId } })
    case 'studio_read_project_version': return send(`${route}/versions/${args.revision}`)
    case 'studio_project_trash': return send('/trash')
    case 'studio_recover_project': return send(`${route}/undelete`, { method: 'POST' })
    case 'studio_restore_project': return send(`${route}/restore`, { method: 'POST', body: { expected_revision: args.expectedRevision, revision: args.revision } })
    case 'studio_materialize_media': return send(`${route}/materialize`, { method: 'POST' })
    case 'studio_cloud_capabilities': return send('/capabilities')
    case 'studio_download_media': {
      if (!args.filename || basename(args.filename) !== args.filename || /[/\\:\x00-\x1f]/.test(args.filename) || args.filename.includes('..')) throw new Error('Use a simple safe filename')
      const directory = resolve(process.env.NEW_API_OUTPUT_DIR || 'studio-output')
      await mkdir(directory, { recursive: true })
      const data = await send(`/media/${encodeURIComponent(args.mediaId)}${route ? `?project_id=${encodeURIComponent(args.projectId)}` : ''}`, { download: true })
      const path = join(directory, args.filename)
      await writeFile(path, data, { flag: 'wx' })
      return { path, bytes: data.length }
    }
    default: throw new Error('Unknown persistent Studio tool')
  }
}
