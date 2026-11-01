import { expect, test } from "bun:test";
import { createEditorCommandRegistry } from "../src/lib/timeline/editor-commands";
import { reconcileTimelineMarkers } from "../src/lib/timeline/timeline-markers";
import { normalizeTimelineProject } from "../src/lib/timeline/timeline-tracks";
import { registerMediaAnalysisCommand, MEDIA_ANALYSIS_MARKERS_COMMAND } from "../src/lib/timeline/media-analysis-command";
import { computeSnap } from "../src/lib/timeline/timeline-snap";
import type { TimelineProject } from "../src/types/timeline";

function fixture(): TimelineProject {
    return {
        version: 2,
        tracks: [{ id: "v", kind: "video", label: "视频", order: 0 }],
        clips: [
            {
                id: "target",
                analysisOccurrenceId: "target",
                kind: "video",
                nodeId: "n",
                trackId: "v",
                startMs: 5000,
                durationMs: 2000,
                sourceStartMs: 1000,
                playbackRate: 2,
                directMedia: { id: "r", kind: "video", title: "原片", storageKey: "resource:original" },
            },
        ],
        durationMs: 7000,
        productionMarkers: [{ id: "marker", kind: "beat", label: "节拍", timeMs: 6250, source: { analysisId: "analysis", revisionId: "revision", itemId: "beat", clipId: "target", occurrenceId: "target", resourceId: "original", sourceTimeMs: 3500 } }],
    };
}
test("analysis markers follow native split, move, rate and trim without binding another occurrence", () => {
    const registry = createEditorCommandRegistry();
    const before = fixture();
    const split = registry.apply(before, { op: "splitClip", payload: { id: "target", splitAtMs: 6000 } });
    expect(split.productionMarkers![0].source!.clipId).toBe("target:split:6000");
    expect(before.productionMarkers![0].source!.clipId).toBe("target");
    const moved = registry.apply(split, { op: "moveClip", payload: { id: "target:split:6000", startMs: 12000 } });
    expect(moved.productionMarkers![0].timeMs).toBe(12250);
    const retimed = registry.apply(moved, { op: "setClipPlaybackRate", payload: { id: "target:split:6000", playbackRate: 1 } });
    expect(retimed.productionMarkers![0].timeMs).toBe(12500);
    const copy = registry.apply(retimed, { op: "addClip", payload: { clip: { ...retimed.clips[1], id: "copy", startMs: 20000 } } });
    expect(copy.clips[2].analysisOccurrenceId).toBeUndefined();
    expect(copy.productionMarkers).toHaveLength(1);
    const removed = registry.apply(copy, { op: "trimClip", payload: { id: "target:split:6000", sourceStartMs: 3600, durationMs: 500 } });
    expect(removed.productionMarkers).toHaveLength(0);
    expect(normalizeTimelineProject(moved).productionMarkers![0].timeMs).toBe(12250);
});
test("ambiguous cloned analysis anchors fail instead of selecting another use of the source", () => {
    const before = fixture();
    before.clips.push({ ...before.clips[0], id: "wrong" });
    expect(() => reconcileTimelineMarkers(before)).toThrow("多个片段");
});
test("whole-source repair retains original analysis provenance through split and move", () => {
    const project = fixture(),
        clip = project.clips[0];
    clip.directMedia!.storageKey = "resource:repaired";
    clip.videoReworkOrigin = { version: 2, taskId: "native-task", plan: {} as import("../src/types/video-rework").VideoReworkPlan, sourceResourceIds: ["original"] };
    const registry = createEditorCommandRegistry();
    const split = registry.apply(project, { op: "splitClip", payload: { id: "target", splitAtMs: 6000 } });
    const moved = registry.apply(split, { op: "moveClip", payload: { id: "target:split:6000", startMs: 12000 } });
    expect(moved.productionMarkers![0].timeMs).toBe(12250);
    expect(moved.productionMarkers![0].source!.resourceId).toBe("original");
    moved.clips[1].videoReworkOrigin!.version = 1;
    expect(reconcileTimelineMarkers(moved).productionMarkers).toHaveLength(0);
});
test("marker adoption is one native command, rejects stale plans and cannot rewrite media", () => {
    const registry = createEditorCommandRegistry();
    registerMediaAnalysisCommand(registry);
    const before = fixture(),
        after = structuredClone(before);
    after.productionMarkers![0].label = "核对后的节拍";
    const adopted = registry.apply(before, { op: MEDIA_ANALYSIS_MARKERS_COMMAND, payload: { before, after } });
    expect(adopted.productionMarkers![0].label).toBe("核对后的节拍");
    after.clips[0].durationMs++;
    expect(() => registry.apply(before, { op: MEDIA_ANALYSIS_MARKERS_COMMAND, payload: { before, after } })).toThrow("不能修改");
    expect(() => registry.apply(adopted, { op: MEDIA_ANALYSIS_MARKERS_COMMAND, payload: { before, after } })).toThrow("已变化");
});
test("other clips snap to beats while a dragged source does not snap to its own moving anchors", () => {
    const project = fixture();
    const args = { candidateMs: 6252, playheadMs: 0, clips: [], markers: project.productionMarkers, pxPerMs: 0.1, thresholdPx: 8, enabled: true };
    expect(computeSnap(args).snappedMs).toBe(6250);
    expect(computeSnap({ ...args, excludeClipId: "target" }).snappedMs).toBe(6252);
});
