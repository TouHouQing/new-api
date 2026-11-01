import { expect, test } from "bun:test";
import { sampleTimelineReframe, reframeFFmpegFilter } from "../src/lib/timeline/timeline-reframe";
import { clipSourceTime } from "../src/lib/timeline/timeline-speed";
import { createEditorCommandRegistry } from "../src/lib/timeline/editor-commands";
import { registerMediaAnalysisCommand, MEDIA_ANALYSIS_REFRAME_COMMAND } from "../src/lib/timeline/media-analysis-command";
import type { TimelineProject, TimelineReframe } from "../src/types/timeline";

const crop: TimelineReframe = {
    analysisId: "a",
    revisionId: "r",
    resourceId: "original",
    sourceSha256: "a".repeat(64),
    sourceWidth: 320,
    sourceHeight: 180,
    width: 0.5,
    height: 1,
    startMs: 1000,
    endMs: 5000,
    keys: [
        { timeMs: 1000, x: 0, y: 0 },
        { timeMs: 3000, x: 0.25, y: 0 },
        { timeMs: 4875, x: 0.5, y: 0 },
    ],
};
const fixture = (): TimelineProject => ({
    version: 2,
    tracks: [{ id: "v", kind: "video", label: "视频", order: 0 }],
    durationMs: 7000,
    clips: [
        { id: "target", kind: "video", nodeId: "n", trackId: "v", startMs: 5000, sourceStartMs: 1000, durationMs: 2000, playbackRate: 2 },
        { id: "other", kind: "video", nodeId: "n", trackId: "v", startMs: 10000, durationMs: 1000 },
    ],
});

test("crop uses even source pixels and the same source clock after retime and split", () => {
    const registry = createEditorCommandRegistry(),
        before = fixture();
    before.clips[0].reframe = crop;
    expect(sampleTimelineReframe(crop, clipSourceTime(before.clips[0], 6000)).x).toBe(80);
    const split = registry.apply(before, { op: "splitClip", payload: { id: "target", splitAtMs: 6000 } });
    const right = split.clips.find((clip) => clip.id.includes(":split:"))!;
    expect(right.reframe).toEqual(crop);
    expect(sampleTimelineReframe(right.reframe!, clipSourceTime(right, 6000)).x).toBe(80);
    expect(sampleTimelineReframe(crop, 999)).toEqual({ x: 0, y: 0, width: 160, height: 180 });
    expect(sampleTimelineReframe(crop, 6000).x).toBe(160);
    expect(reframeFFmpegFilter(crop, 1000)).toContain("t*1000+1000");
});

test("one native undoable crop command preserves other occurrences and rejects stale/content changes", () => {
    const registry = createEditorCommandRegistry();
    registerMediaAnalysisCommand(registry);
    const before = fixture(),
        after = structuredClone(before);
    after.clips[0].reframe = crop;
    const result = registry.apply(before, { op: MEDIA_ANALYSIS_REFRAME_COMMAND, payload: { before, after } });
    expect(result.clips[0].reframe).toEqual(crop);
    expect(result.clips[1]).toEqual(before.clips[1]);
    expect(before.clips[0].reframe).toBeUndefined();
    expect(() => registry.apply(result, { op: MEDIA_ANALYSIS_REFRAME_COMMAND, payload: { before, after } })).toThrow("已变化");
    after.clips[1].reframe = crop;
    expect(() => registry.apply(before, { op: MEDIA_ANALYSIS_REFRAME_COMMAND, payload: { before, after } })).toThrow("一个");
    delete after.clips[1].reframe;
    after.clips[0].durationMs++;
    expect(() => registry.apply(before, { op: MEDIA_ANALYSIS_REFRAME_COMMAND, payload: { before, after } })).toThrow("不能修改");
});
