---
name: studio-storyboard
description: Plan and revise scene and shot structure for an existing new-api Studio film.
---

Use the shared Studio MCP server at `../new-api-studio/scripts/mcp.mjs` with `NEW_API_URL` and `NEW_API_ACCESS_TOKEN` configured in the environment. The bundled skills operate on the same server project; they do not keep independent project copies.

Read the project before changing shot order, timing, camera or asset assignment. Preserve shot IDs, selected Takes and pinned references. Use production.scenes and assetBindings for scene and prop membership; continuityStates owns per-shot wardrobe, emotion, prop state and versionId. Record affected nodes in production.changes. Reuse completed dependencies and run only selected affected nodes. Quantify planned seconds before generation and use an explicit quota budget. A receipt or uncertain task requires inspection and reconciliation, never a blind resubmission.

Save with studio_save_project and expectedRevision after uploading referenced media. Re-read and preserve human edits on conflicts. Use existing user authorization for local model execution, retain explicit budgets, and do not publish or message third parties without authorization.
