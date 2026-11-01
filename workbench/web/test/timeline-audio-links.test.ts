import { expect, test } from "bun:test";
import { createEditorCommandRegistry } from "../src/lib/timeline/editor-commands";
import { linkedAudioFragmentId, validateTimelineAudioLinks } from "../src/lib/timeline/timeline-audio-links";
import type { TimelineClip, TimelineProject } from "../src/types/timeline";

const registry = createEditorCommandRegistry();
function project(mode: "source" | "clip" = "source"): TimelineProject {
    const video: TimelineClip = { id: "video", kind: "video", nodeId: "n", trackId: "picture", startMs: 1000, durationMs: 4000, sourceStartMs: 2000, sourceDurationMs: 10000, playbackRate: 1 };
    return {
        version: 2,
        durationMs: 12000,
        tracks: [
            { id: "picture", kind: "video", label: "画面", order: 0 },
            { id: "voice", kind: "audio", label: "对白", order: 1 },
            { id: "music", kind: "audio", label: "音乐", order: 2 },
            { id: "captions", kind: "subtitle", label: "字幕", order: 3 },
        ],
        clips: [
            video,
            { ...video, id: "repeated-source", startMs: 7000 },
            {
                id: "a",
                kind: "audio",
                nodeId: "voice",
                trackId: "voice",
                startMs: 1500,
                durationMs: 2000,
                sourceStartMs: 300,
                sourceDurationMs: 10000,
                playbackRate: 1,
                volume: 0.25,
                audioLink: { sourceClipId: "video", mode, anchorMs: mode === "source" ? 2500 : 500 },
            },
            { id: "music", kind: "audio", nodeId: "music", trackId: "music", startMs: 0, durationMs: 12000, volume: 0.1 },
            { id: "caption", kind: "subtitle", nodeId: "caption", trackId: "captions", startMs: 2000, durationMs: 1500, text: "独立字幕" },
        ],
    };
}
function apply(input: TimelineProject, op: string, payload: unknown) {
    return registry.apply(input, { op, payload });
}
function audio(input: TimelineProject) {
    return input.clips.filter((clip) => clip.audioLink);
}
function unchanged(input: TimelineProject, result: TimelineProject) {
    for (const id of ["music", "caption", "repeated-source"]) expect(result.clips.find((clip) => clip.id === id)).toEqual(input.clips.find((clip) => clip.id === id));
}

test("移动镜头只移动绑定的使用实例，保留配乐字幕和相同原片的另一次使用", () => {
    const before = project(),
        result = apply(before, "moveClip", { id: "video", startMs: 3000 });
    expect(audio(result)[0]).toMatchObject({ id: "a", startMs: 3500, durationMs: 2000, sourceStartMs: 300 });
    unchanged(before, result);
    expect(before).toEqual(project());
});
test("画面变速的声音保持源裁剪范围，固定语速模式仅裁掉越界部分", () => {
    const source = apply(project(), "setClipPlaybackRate", { id: "video", playbackRate: 2 });
    expect(audio(source)[0]).toMatchObject({ startMs: 1250, durationMs: 1000, sourceStartMs: 300, playbackRate: 2 });
    const clip = apply(project("clip"), "setClipPlaybackRate", { id: "video", playbackRate: 2 });
    expect(audio(clip)[0]).toMatchObject({ startMs: 1500, durationMs: 1500, sourceStartMs: 300, playbackRate: 1 });
    unchanged(project(), source);
});
test("裁去画面开头会准确裁掉对应声音，而非重新从旁白开头播放", () => {
    for (const mode of ["source", "clip"] as const) {
        const result = apply(project(mode), "trimClip", { id: "video", durationMs: 2000, sourceStartMs: 3000 });
        expect(audio(result)[0]).toMatchObject({ startMs: 1000, durationMs: 1500, sourceStartMs: 800 });
    }
});
test("拆分镜头把跟随声音拆到两边，片段编号可重复计算且不会串到另一镜头", () => {
    const before = project(),
        result = apply(before, "splitClip", { id: "video", splitAtMs: 3000 });
    expect(audio(result)).toHaveLength(2);
    expect(audio(result)[0]).toMatchObject({ id: "a", startMs: 1500, durationMs: 1500, sourceStartMs: 300, audioLink: { sourceClipId: "video", anchorMs: 2500 } });
    expect(audio(result)[1]).toMatchObject({ id: linkedAudioFragmentId("a", "video:split:3000"), startMs: 3000, durationMs: 500, sourceStartMs: 1800, audioLink: { sourceClipId: "video:split:3000", anchorMs: 4000 } });
    expect(result).toEqual(apply(before, "splitClip", { id: "video", splitAtMs: 3000 }));
    unchanged(before, result);
});
test("删除镜头会删除其跟随声音，独立音轨与其他镜头保留", () => {
    const before = project(),
        result = apply(before, "removeClip", { id: "video" });
    expect(audio(result)).toHaveLength(0);
    unchanged(before, result);
});
test("绑定解除后声音保持位置并可独立编辑，复制不会继承原实例的跟随关系", () => {
    const detached = apply(project(), "setAudioLink", { id: "a" });
    const moved = apply(detached, "moveClip", { id: "video", startMs: 4000 });
    expect(moved.clips.find((clip) => clip.id === "a")?.startMs).toBe(1500);
    const copy = { ...project().clips.find((clip) => clip.id === "a")!, id: "copy" };
    expect(apply(project(), "addClip", { clip: copy }).clips.find((clip) => clip.id === "copy")?.audioLink).toBeUndefined();
});
test("声音本身的裁剪和拆分保留正确锚点，镜头随后移动仍能一起走", () => {
    const split = apply(project(), "splitClip", { id: "a", splitAtMs: 2500 });
    expect(audio(split)[1]).toMatchObject({ startMs: 2500, sourceStartMs: 1300, audioLink: { sourceClipId: "video", anchorMs: 3500 } });
    const moved = apply(split, "moveClip", { id: "video", startMs: 2000 });
    expect(audio(moved).map((clip) => clip.startMs)).toEqual([2500, 3500]);
});
test("锁定、超速、跨界和断裂绑定均拒绝，失败不改变原剪辑", () => {
    const locked = project();
    locked.tracks[1].locked = true;
    expect(() => apply(locked, "moveClip", { id: "video", startMs: 2000 })).toThrow(/锁定/);
    expect(() => apply(locked, "trimClip", { id: "a", durationMs: 1000 })).toThrow(/锁定/);
    const tooFast = project();
    tooFast.clips[2].playbackRate = 4;
    expect(() => apply(tooFast, "setClipPlaybackRate", { id: "video", playbackRate: 2 })).toThrow(/声音速度/);
    expect(() => apply(project(), "moveClip", { id: "a", startMs: 9000 })).toThrow(/镜头范围/);
    expect(() => apply(project(), "setAudioLink", { id: "a", sourceClipId: "repeated-source", mode: "source" })).toThrow(/镜头范围/);
    const broken = project();
    broken.clips[2].audioLink!.sourceClipId = "missing";
    expect(() => validateTimelineAudioLinks(broken)).toThrow(/关系无效/);
});
