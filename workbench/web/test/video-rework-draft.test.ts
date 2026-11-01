import { expect, test } from "bun:test";
import { readVideoReworkDraft, videoReworkDraftKey, type VideoReworkDraft } from "../src/services/video-rework-draft";
import type { VideoReworkSource } from "../src/types/video-rework";
const source = { clipSha256: "a".repeat(64), media: { sha256: "b".repeat(64), width: 512, height: 512 } } as VideoReworkSource;
test("reopened repair draft retains source occurrence, clocks, odd-pixel region and original audio choice", async () => {
    const draft: VideoReworkDraft = {
        version: 1,
        projectId: "project",
        clipId: "one-use",
        clipSha256: source.clipSha256,
        sourceSha256: source.media.sha256,
        start: 0.5,
        end: 1.5,
        candidateId: "candidate",
        candidateStart: 0.25,
        audio: "original",
        region: { x: 17, y: 15, width: 31, height: 33 },
    };
    const key = videoReworkDraftKey("project", "one-use");
    let raw = JSON.stringify(draft);
    const storage = { getItem: async (name: string) => (name === key ? raw : null), setItem: async () => {}, removeItem: async () => {} };
    expect(await readVideoReworkDraft(storage, "project", "one-use", source)).toEqual(draft);
    await expect(readVideoReworkDraft(storage, "project", "one-use", { ...source, clipSha256: "c".repeat(64) })).rejects.toThrow("原片段已变化");
    raw = JSON.stringify({ ...draft, region: { ...draft.region, x: 510 } });
    await expect(readVideoReworkDraft(storage, "project", "one-use", source)).rejects.toThrow("范围无效");
    expect(await readVideoReworkDraft(storage, "other-project", "one-use", source)).toBeNull();
});
