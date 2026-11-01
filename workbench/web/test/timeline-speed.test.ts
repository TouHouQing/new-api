import { expect, test } from "bun:test";
import { createEditorCommandRegistry } from "../src/lib/timeline/editor-commands";
import { transcriptionForClip } from "../src/lib/timeline/transcription-placement";
import { clipSourceTime } from "../src/lib/timeline/timeline-speed";
import type { TimelineProject } from "../src/types/timeline";

function fixture(): TimelineProject {
    return {
        version: 2,
        durationMs: 12000,
        tracks: [
            { id: "a", kind: "audio", label: "对白", order: 0 },
            { id: "s", kind: "subtitle", label: "字幕", order: 1 },
        ],
        clips: [
            { id: "voice", kind: "audio", nodeId: "source", trackId: "a", startMs: 2000, durationMs: 4000, sourceStartMs: 1000, sourceDurationMs: 12000, fadeInMs: 1000 },
            { id: "caption", kind: "subtitle", nodeId: "transcript", trackId: "s", startMs: 3000, durationMs: 2000, text: "第二句", productionBinding: { sourceClipId: "voice" } },
            { id: "repeat", kind: "audio", nodeId: "source", trackId: "a", startMs: 9000, durationMs: 3000, sourceStartMs: 2000, sourceDurationMs: 12000 },
        ],
    };
}

test("speed changes one occurrence, follows its captions and survives native split/trim/replay", () => {
    const initial = fixture(),
        registry = createEditorCommandRegistry();
    const fast = registry.apply(initial, { op: "setClipPlaybackRate", payload: { id: "voice", playbackRate: 2 } });
    expect(fast.clips[0]).toMatchObject({ startMs: 2000, durationMs: 2000, sourceStartMs: 1000, playbackRate: 2, fadeInMs: 500 });
    expect(fast.clips[1]).toMatchObject({ startMs: 2500, durationMs: 1000 });
    expect(fast.clips[2]).toEqual(initial.clips[2]);
    expect(initial.clips[0].durationMs).toBe(4000);
    const split = registry.apply(fast, { op: "splitClip", payload: { id: "voice", splitAtMs: 2750 } });
    expect(split.clips[1]).toMatchObject({ sourceStartMs: 2500, durationMs: 1250, playbackRate: 2 });
    expect(clipSourceTime(split.clips[1], 3000)).toBe(3000);
    expect(() => registry.apply(fast, { op: "trimClip", payload: { id: "voice", durationMs: 6000 } })).toThrow(/sourceDurationMs/);
    expect(registry.apply(fast, { op: "setClipPlaybackRate", payload: { id: "voice", playbackRate: 1 } }).clips).toEqual(initial.clips.map((clip, index) => (index ? clip : { ...clip, playbackRate: 1 })));
});

test("caption placement uses consumed source time and supports slow, fast and repeated sources", () => {
    const clip = { ...fixture().clips[0], playbackRate: 2, durationMs: 2000 };
    const segments = [
        { startMs: 2000, endMs: 4000, text: "第二句" },
        { startMs: 4900, endMs: 6000, text: "边界" },
    ];
    expect(transcriptionForClip(segments, clip)).toEqual([
        { index: 1, startMs: 2500, endMs: 3500, text: "第二句" },
        { index: 2, startMs: 3950, endMs: 4000, text: "边界" },
    ]);
    expect(transcriptionForClip(segments, { ...clip, playbackRate: 0.5, durationMs: 8000 })[0]).toMatchObject({ startMs: 4000, endMs: 8000 });
});

test("invalid speed, locked source/captions and detached captions leave the project untouched", () => {
    const registry = createEditorCommandRegistry(),
        project = fixture();
    for (const playbackRate of [0, -1, 0.1, 4.1, Number.NaN, Infinity, "2"]) expect(() => registry.apply(project, { op: "setClipPlaybackRate", payload: { id: "voice", playbackRate } })).toThrow();
    for (const id of ["a", "s"]) expect(() => registry.apply({ ...project, tracks: project.tracks.map((track) => ({ ...track, locked: track.id === id })) }, { op: "setClipPlaybackRate", payload: { id: "voice", playbackRate: 2 } })).toThrow(/锁定/);
    expect(() => registry.apply({ ...project, clips: project.clips.map((clip) => (clip.id === "caption" ? { ...clip, startMs: 20000 } : clip)) }, { op: "setClipPlaybackRate", payload: { id: "voice", playbackRate: 2 } })).toThrow(/重新对齐/);
    expect(project).toEqual(fixture());
});
