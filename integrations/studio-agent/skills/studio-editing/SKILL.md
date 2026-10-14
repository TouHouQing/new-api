---
name: studio-editing
description: Edit, review, repair and export a new-api Studio film using its persistent timeline.
---

Use the shared Studio MCP server at `../new-api-studio/scripts/mcp.mjs` with `NEW_API_URL` and `NEW_API_ACCESS_TOKEN` configured in the environment. The bundled skills operate on the same server project; they do not keep independent project copies.

Read the exact project revision, production.timeline, audioTracks, dialogueCues and reviews. Preserve trim, speed, chosen Takes and narration during changes. A timed review can become studio_plan_rework with regenerate, edit or audio; use its exact node and Take association. Modify only the affected portion and retain accepted media. For dialogue use voiceBindings and generated cue audio, then studio_align_dialogue; automatic subtitles follow actual cue durations. Render a draft to review the result, run technical quality, resolve pending changes and approve the exact delivery Takes before final export. Use the desired delivery preset and download the film, subtitles and source package. Poll studio_completion_events with a saved cursor or studio_wait_workflow to receive durable completion. Create review links only within the user authorization; never publish their secret URLs on your own.

Save with studio_save_project and expectedRevision after uploading referenced media. Re-read and preserve human edits on conflicts. Use existing user authorization for local model execution, retain explicit budgets, and do not publish or message third parties without authorization.
