import { expect, test } from "bun:test";
import { timelineDisplayLanes } from "@/lib/timeline/timeline-display-lanes";
import { createEditorCommandRegistry } from "@/lib/timeline/editor-commands";
import type { TimelineProject } from "@/types/timeline";

test("simultaneous occurrences remain individually selectable without changing document order", () => {
    const clips = Object.freeze([Object.freeze({ id: "title", startMs: 0, durationMs: 4000 }), Object.freeze({ id: "logo", startMs: 0, durationMs: 4000 }), Object.freeze({ id: "shape", startMs: 0, durationMs: 4000 })]);
    const layout = timelineDisplayLanes(clips);
    expect(layout.count).toBe(3);
    expect([...layout.lanes]).toEqual([
        ["title", 0],
        ["logo", 1],
        ["shape", 2],
    ]);
    expect(clips.map((clip) => clip.id)).toEqual(["title", "logo", "shape"]);
});

test("shared endpoints reuse the lowest available row even with unsorted input", () => {
    const layout = timelineDisplayLanes([
        { id: "later", startMs: 3000, durationMs: 1000 },
        { id: "first", startMs: 0, durationMs: 1000 },
        { id: "long", startMs: 0, durationMs: 3000 },
        { id: "middle", startMs: 1000, durationMs: 1000 },
    ]);
    expect(layout.count).toBe(2);
    expect([...layout.lanes]).toEqual([
        ["first", 0],
        ["long", 1],
        ["middle", 0],
        ["later", 0],
    ]);
    expect(timelineDisplayLanes([]).count).toBe(1);
});

test("dense timelines allocate the minimum rows without any same-row intersection", () => {
    const clips = Array.from({ length: 5000 }, (_, i) => ({ id: `clip-${i}`, startMs: i * 100, durationMs: 2000 }));
    const layout = timelineDisplayLanes(clips);
    expect(layout.count).toBe(20);
    const ends = Array<number>(layout.count).fill(0);
    for (const clip of clips) {
        const lane = layout.lanes.get(clip.id)!;
        expect(clip.startMs).toBeGreaterThanOrEqual(ends[lane]!);
        ends[lane] = clip.startMs + clip.durationMs;
    }
});

test("edit commands reject sub-millisecond times before they can enter the save queue", () => {
    const project: TimelineProject = { id: "precision", tracks: [{ id: "text", kind: "text", label: "标题", order: 0 }], clips: [{ id: "title", trackId: "text", kind: "text", text: "标题", startMs: 0, durationMs: 3000 }], durationMs: 3000 };
    const registry = createEditorCommandRegistry();
    for (const command of [
        { op: "moveClip", payload: { id: "title", startMs: 312.5 } },
        { op: "trimClip", payload: { id: "title", startMs: 312.5 } },
        { op: "trimClip", payload: { id: "title", durationMs: 2312.5 } },
        { op: "trimClip", payload: { id: "title", sourceStartMs: 0.5 } },
    ])
        expect(() => registry.apply(project, command)).toThrow(/integer milliseconds/);
    expect(project.clips[0]!.startMs).toBe(0);
});
