import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createEditorCommandRegistry } from "../src/lib/timeline/editor-commands";
import type { TimelineProject } from "../src/types/timeline";

function fixture(parent: "video" | "a") {
    const project = JSON.parse(readFileSync(new URL("../../backend/internal/production/testdata/audio_links.golden.json", import.meta.url), "utf8")).base as TimelineProject;
    project.clips[4].productionBinding = { transcriptId: "transcript", transcriptRevisionId: "original-revision", transcriptSegmentId: "sentence", sourceClipId: parent };
    return project;
}
const registry = createEditorCommandRegistry();
test("字幕随镜头移动和拆分，保留原文字、转写版本及具体来源", () => {
    const before = fixture("video"),
        saved = structuredClone(before);
    const moved = registry.apply(before, { op: "moveClip", payload: { id: "video", startMs: 3000 } });
    expect(moved.clips.find((clip) => clip.id === "caption")?.startMs).toBe(4000);
    const split = registry.apply(before, { op: "splitClip", payload: { id: "video", splitAtMs: 3000 } });
    const captions = split.clips.filter((clip) => clip.kind === "subtitle");
    expect(captions.map((clip) => [clip.startMs, clip.durationMs, clip.productionBinding?.sourceClipId])).toEqual([
        [2000, 1000, "video"],
        [3000, 500, "video:split:3000"],
    ]);
    expect(captions.every((clip) => clip.text === "独立字幕" && clip.productionBinding?.transcriptRevisionId === "original-revision")).toBe(true);
    expect(before).toEqual(saved);
});
test("字幕可跟随拆分后的旁白，画面与声音的两层关系不依赖原片相等", () => {
    const split = registry.apply(fixture("a"), { op: "splitClip", payload: { id: "video", splitAtMs: 3000 } });
    const voices = split.clips.filter((clip) => clip.audioLink),
        captions = split.clips.filter((clip) => clip.kind === "subtitle");
    expect(captions.map((clip) => [clip.startMs, clip.durationMs])).toEqual([
        [2000, 1000],
        [3000, 500],
    ]);
    expect(captions.map((clip) => clip.productionBinding!.sourceClipId)).toEqual(voices.map((clip) => clip.id));
    const removed = registry.apply(fixture("a"), { op: "removeClip", payload: { id: "video" } });
    expect(removed.clips.some((clip) => clip.kind === "subtitle" || clip.audioLink)).toBe(false);
    expect(removed.clips.some((clip) => clip.id === "repeated-source")).toBe(true);
});
test("锁定字幕阻止实际影响，延长来源而字幕不变时仍可编辑", () => {
    const before = fixture("video");
    before.tracks[3].locked = true;
    expect(() => registry.apply(before, { op: "moveClip", payload: { id: "video", startMs: 2000 } })).toThrow(/字幕轨已锁定/);
    const extended = registry.apply(before, { op: "trimClip", payload: { id: "video", durationMs: 5000 } });
    expect(extended.clips.find((clip) => clip.id === "caption")).toEqual(before.clips[4]);
});
test("静态字幕可调整时间，不把字幕条目的源内标记当成媒体时长上限", () => {
    const before = fixture("video");
    before.clips[4].sourceStartMs = 2000;
    before.clips[4].sourceDurationMs = 1500;
    const trimmed = registry.apply(before, { op: "trimClip", payload: { id: "caption", durationMs: 1000 } });
    expect(trimmed.clips.find((clip) => clip.id === "caption")?.durationMs).toBe(1000);
});
