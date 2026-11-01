import { expect, test } from "bun:test";
import { sampleTimelineGraphic, validateMotionGraphic, validateTimelineGraphics } from "@/lib/timeline/timeline-graphics";
import { createEditorCommandRegistry } from "@/lib/timeline/editor-commands";
import type { TimelineMotionGraphic, TimelineProject } from "@/types/timeline";
import { createEditorStore } from "@/stores/editor/editor-store";
import { timelineExportPreflight } from "@/lib/timeline/timeline-export-preflight";
import { timelineOverlayRanks } from "@/lib/timeline/timeline-overlay-order";

const graphic: TimelineMotionGraphic = { version: 1, kind: "shape", shape: "square", x: 0.5, y: 0.7, size: 100, color: "#ff0000", animation: "bounce", bpm: 120, phaseOffsetMs: 150, phaseDurationMs: 4000 };
test("motion source clock is continuous through moving and splitting", () => {
    const whole = sampleTimelineGraphic(graphic, { startMs: 1000, durationMs: 4000 }, 2600, 640, 384);
    const split = sampleTimelineGraphic(graphic, { startMs: 2500, durationMs: 2500, sourceStartMs: 1500 }, 2600, 640, 384);
    const moved = sampleTimelineGraphic(graphic, { startMs: 5000, durationMs: 2500, sourceStartMs: 1500 }, 5100, 640, 384);
    expect(split).toEqual(whole);
    expect(moved).toEqual(whole);
    expect(sampleTimelineGraphic(graphic, { startMs: 1000, durationMs: 4000 }, 5000, 640, 384).visible).toBe(false);
    const peak = sampleTimelineGraphic({ ...graphic, animation: "pulse", phaseOffsetMs: 0 }, { startMs: 1000, durationMs: 4000 }, 1125, 640, 384);
    expect(peak.opacity).toBeCloseTo(1, 9);
    expect(peak.scale).toBeCloseTo(1, 9);
});

test("creating and moving a standalone title retains one undo per gesture and can export", () => {
    const store = createEditorStore();
    store.getState().load({ version: 2, durationMs: 0, tracks: [], clips: [] });
    store.getState().dispatch({ op: "addGraphic", payload: { id: "g", text: "标题", startMs: 0, durationMs: 3000, graphic } });
    const added = store.getState().project!;
    expect(added.tracks).toHaveLength(1);
    expect(added.clips).toHaveLength(1);
    expect(timelineExportPreflight(added).blockers).toEqual([]);
    expect(timelineExportPreflight(added).offlineReason).toBeTruthy();
    for (const x of [0.6, 0.7, 0.8]) store.getState().previewGesture({ op: "setGraphic", payload: { id: "g", graphic: { ...graphic, x } } });
    store.getState().commitGesture();
    expect(store.getState().project!.clips[0].graphic!.x).toBe(0.8);
    store.getState().undo();
    expect(store.getState().project!.clips[0].graphic!.x).toBe(0.5);
    store.getState().undo();
    expect(store.getState().project!.clips).toHaveLength(0);
    expect(store.getState().project!.tracks).toHaveLength(0);
    expect(added.clips[0].graphic!.x).toBe(0.5);
    store.getState().redo();
    store.getState().redo();
    store.getState().dispatch({ op: "setGraphic", payload: { id: "g", graphic, restart: true } });
    expect(store.getState().project!.clips[0].graphic!.phaseDurationMs).toBe(3000);
});

test("caption and graphic z order follows top tracks, with stable occurrence ties", () => {
    const project: TimelineProject = {
        version: 2,
        durationMs: 1000,
        tracks: [
            { id: "top", kind: "text", label: "前景", order: -1 },
            { id: "back", kind: "subtitle", label: "字幕", order: 1 },
        ],
        clips: [
            { id: "g", trackId: "top", kind: "text", nodeId: "g", startMs: 0, durationMs: 1000, text: "图形", graphic },
            { id: "s", trackId: "back", kind: "subtitle", nodeId: "s", startMs: 0, durationMs: 1000, text: "台词" },
        ],
    };
    const ranks = timelineOverlayRanks(project);
    expect(ranks.get("g")!).toBeGreaterThan(ranks.get("s")!);
});

test("changing selection cannot discard an unfinished title draft", () => {
    const store = createEditorStore();
    store.getState().selectClip("current");
    store.getState().setPanelDraftDirty("graphic-text:current", true);
    store.getState().selectClip("other");
    expect(store.getState().selectedClipId).toBe("current");
    expect(store.getState().saveError).toContain("应用或放弃");
    store.getState().setPanelDraftDirty("graphic-text:current", false);
    store.getState().selectClip("other");
    expect(store.getState().selectedClipId).toBe("other");
});

test("invalid graphic fields and mixed subtitle settings cannot enter edit history", () => {
    for (const patch of [{ x: NaN }, { x: 1.1 }, { size: 100000 }, { color: "red:enable=1" }, { animation: "invalid" }, { fontFamily: "unknown" }, { url: "https://example.invalid/image" }])
        expect(() => validateMotionGraphic({ ...graphic, ...patch })).toThrow();
    expect(() => validateMotionGraphic({ ...graphic, kind: "image" })).toThrow("素材编号");
    const project: TimelineProject = { version: 2, durationMs: 2000, tracks: [{ id: "text", kind: "text", label: "标题", order: 0 }], clips: [{ id: "g", kind: "text", trackId: "text", nodeId: "g", startMs: 0, durationMs: 2000, text: "图形", graphic }] };
    expect(validateTimelineGraphics(project)).toBe(project);
    const result = createEditorCommandRegistry().apply(project, { op: "setClipProperty", payload: { id: "g", patch: { graphic: { ...graphic, x: 0.8 } } } });
    expect(result.clips[0].graphic?.x).toBe(0.8);
    expect(project.clips[0].graphic?.x).toBe(0.5);
    expect(() => createEditorCommandRegistry().apply(project, { op: "setClipProperty", payload: { id: "g", patch: { graphic: { ...graphic, x: 2 } } } })).toThrow();
});
