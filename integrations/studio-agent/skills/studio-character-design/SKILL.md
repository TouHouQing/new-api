---
name: studio-character-design
description: Build reusable character and scene references with per-shot continuity in new-api Studio.
---

Use the shared Studio MCP server at `../new-api-studio/scripts/mcp.mjs` with `NEW_API_URL` and `NEW_API_ACCESS_TOKEN` configured in the environment. The bundled skills operate on the same server project; they do not keep independent project copies.

Read assets, their versions, selected Takes and each shot continuityStates before editing. Use character profiles for appearance, wardrobe, voice and continuity. Portrait, turnaround, expressions and location-angle variants are reference assets; retain their media and version IDs. Pin the chosen version for each affected shot. Keep wardrobe, emotion and prop state in the shot state rather than overwriting the character identity. Verify the actual provider accepts the reference type and count; the local Wan adapter accepts one first frame. Review identity across actual generated shots. Human acceptance is required for visual identity and story continuity; technical decoding checks do not prove identity consistency.

Save with studio_save_project and expectedRevision after uploading referenced media. Re-read and preserve human edits on conflicts. Use existing user authorization for local model execution, retain explicit budgets, and do not publish or message third parties without authorization.
