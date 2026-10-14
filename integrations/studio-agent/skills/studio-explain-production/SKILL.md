---
name: studio-explain-production
description: Explain the actual graph, chosen Takes, references, soundtrack,
  review and delivery. Return explanation with no edits unless requested; do not
  invent job success.
metadata:
  display-name: Explain this project
  version: "1.0"
  studio-id: studio-explain-production
---

Use the shared Studio MCP server at ../new-api-studio/scripts/mcp.mjs with NEW_API_URL and NEW_API_ACCESS_TOKEN configured privately in the environment. Resolve projectId at runtime; never assume an example project or media ID.

Read studio_project_schema, studio_cloud_capabilities and studio_read_project before editing. Preserve the current expectedRevision, chosen Takes, locked nodes, unrelated dialogue, soundtrack and regional versions. Upload owned reference bytes using studio_upload_media before saving new references. Save reviewed document changes with studio_save_project; resolve a revision conflict by reading and preserving human changes.

Explain the actual graph, chosen Takes, references, soundtrack, review and delivery. Return explanation with no edits unless requested; do not invent job success.

Separate planning from execution. A proposed task is not a completed result. Read existing studio_list_workflows before submitting; retain the same requestId after a lost response. Execute only within the user's authorized scope through studio_start_workflow, using confirmGeneration and a bounded quota budget for models. Use studio_workflow_status and studio_wait_workflow to inspect actual completion. Recover with studio_control_workflow only after inspecting uncertainty; never reissue an unresolved inference. Previs and graphics tasks use owned compatible image/video output nodes; graphics_frame/graphics_animation produce media plus offline HTML without a model call.

Validate real output duration, picture, sound, captions and continuity before delivery. Use studio_download_media for actual owned results and delivery packages. Explain missing models or inputs accurately. External publishing, messages and connector writes require explicit user authorization. Imported skill scripts are not executed by the planning editor.
