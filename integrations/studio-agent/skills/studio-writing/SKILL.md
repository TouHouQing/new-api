---
name: studio-writing
description: Create and revise film scripts in new-api Studio while preserving production assets and existing edits.
---

Use the shared Studio MCP server at `../new-api-studio/scripts/mcp.mjs` with `NEW_API_URL` and `NEW_API_ACCESS_TOKEN` configured in the environment. The bundled skills operate on the same server project; they do not keep independent project copies.

Use studio_project_schema and studio_read_project to inspect the current brief and production.screenplay. Produce the executable screenplay schema: title, brief, characters, scenes, props, shots; each shot includes stable source ID, sceneId, characterIds, propIds, text, imagePrompt, videoPrompt, seconds, camera, shotType and dialogue. Preserve recurring source IDs during revisions. Apply revisions through the Studio planning editor so its impact analysis retains Takes, voiceover and timeline. For direct document edits, retain production.screenplay mappings and create a pending production.changes entry listing the affected image/video node IDs. Do not mark old media as regenerated. Respect targetDuration, audience and established character continuity.

Save with studio_save_project and expectedRevision after uploading referenced media. Re-read and preserve human edits on conflicts. Use existing user authorization for local model execution, retain explicit budgets, and do not publish or message third parties without authorization.
