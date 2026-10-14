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
import { mkdir, writeFile } from 'node:fs/promises'

import {
  exportStudioSkill,
  STUDIO_BUILTIN_SKILLS,
} from '../src/features/studio/studio-assistant'
import { STUDIO_SPECIALIZED_SKILLS } from '../src/features/studio/studio-specialized-skills'

const skills = [
  ...STUDIO_SPECIALIZED_SKILLS,
  ...STUDIO_BUILTIN_SKILLS.filter((skill) => skill.id === 'review'),
]
for (const skill of skills) {
  const id = `studio-${skill.id}`
  const directory = new URL(
    `../../integrations/studio-agent/skills/${id}/`,
    import.meta.url
  )
  await mkdir(directory, { recursive: true })
  const installed = {
    ...skill,
    id,
    versions: skill.versions.map((version) => ({
      ...version,
      instructions: `Use the shared Studio MCP server at ../new-api-studio/scripts/mcp.mjs with NEW_API_URL and NEW_API_ACCESS_TOKEN configured privately in the environment. Resolve projectId at runtime; never assume an example project or media ID.

Read studio_project_schema, studio_cloud_capabilities and studio_read_project before editing. Preserve the current expectedRevision, chosen Takes, locked nodes, unrelated dialogue, soundtrack and regional versions. Upload owned reference bytes using studio_upload_media before saving new references. Save reviewed document changes with studio_save_project; resolve a revision conflict by reading and preserving human changes.

${version.instructions}

Separate planning from execution. A proposed task is not a completed result. Read existing studio_list_workflows before submitting; retain the same requestId after a lost response. Execute only within the user's authorized scope through studio_start_workflow, using confirmGeneration and a bounded quota budget for models. Use studio_workflow_status and studio_wait_workflow to inspect actual completion. Recover with studio_control_workflow only after inspecting uncertainty; never reissue an unresolved inference. Previs and graphics tasks use owned compatible image/video output nodes; graphics_frame/graphics_animation produce media plus offline HTML without a model call.

Validate real output duration, picture, sound, captions and continuity before delivery. Use studio_download_media for actual owned results and delivery packages. Explain missing models or inputs accurately. External publishing, messages and connector writes require explicit user authorization. Imported skill scripts are not executed by the planning editor.
`,
    })),
  }
  await writeFile(new URL('SKILL.md', directory), exportStudioSkill(installed))
}
console.log(`Generated ${skills.length} specialized and review skill packages`)
