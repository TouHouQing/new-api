import { expect, test } from "bun:test";
import { locateReviewRework } from "../src/lib/timeline/review-rework";
import type { TimelineProject } from "../src/types/timeline";
import type { ReviewClip } from "../src/services/api/project-reviews";

test("review rework locates the exact repeated occurrence and maps a moved program position", () => {
    const source: ReviewClip = { id: "repeat-2", title: "第二次使用", kind: "video", resourceId: "same", startMs: 4000, durationMs: 2000, sourceStartMs: 1000, playbackRate: 2, artifactId: "original-candidate" };
    const project = {
        version: 2,
        durationMs: 10000,
        tracks: [],
        clips: [
            { id: "repeat-1", kind: "video", startMs: 0, durationMs: 2000, directMedia: { id: "same" }, sourceStartMs: 1000, playbackRate: 2 },
            { id: "repeat-2", kind: "video", startMs: 7000, durationMs: 2000, directMedia: { id: "same" }, sourceStartMs: 1000, playbackRate: 2, productionBinding: { artifactId: "original-candidate" } },
        ],
    } as unknown as TimelineProject;
    expect(locateReviewRework(project, { clip: source, programStartMs: 4500 })).toEqual({ clipId: "repeat-2", timeMs: 7500 });
    const before = JSON.stringify(project);
    for (const changes of [{ directMedia: { id: "replacement" } }, { playbackRate: 1 }, { sourceStartMs: 0 }, { durationMs: 1000 }, { productionBinding: { artifactId: "later-candidate" } }]) {
        const changed = structuredClone(project);
        Object.assign(changed.clips[1], changes);
        expect(locateReviewRework(changed, { clip: source, programStartMs: 4500 })).toBeNull();
    }
    expect(locateReviewRework(project, { programStartMs: 4500 })).toBeNull();
    expect(locateReviewRework(project, { clip: { ...source, resourceId: undefined }, programStartMs: 4500 })).toBeNull();
    expect(locateReviewRework(project, { clip: source, programStartMs: 6000 })).toBeNull();
    expect(JSON.stringify(project)).toBe(before);
});
