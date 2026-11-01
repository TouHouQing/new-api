import { expect, test } from "bun:test";
import { getTimelineTrackId, normalizeTimelineProject } from "../src/lib/timeline/timeline-tracks";
import { syncNodeSubtitlesToTimeline, syncTimelineSubtitleClips } from "../src/lib/timeline/timeline-build";
import type { CanvasNodeData } from "../src/types/canvas";

test("重开和恢复旧区域剪辑保留完整画面设置，错误设置不能退回项目默认值", () => {
    const output = { width: 384, height: 640, fps: 24, fit: "blur" as const };
    const loaded = normalizeTimelineProject({ tracks: [], clips: [], output });
    expect(loaded.output).toEqual(output);
    expect(normalizeTimelineProject(JSON.parse(JSON.stringify(loaded))).output).toEqual(output);
    expect(() => normalizeTimelineProject({ output: { ...output, width: 385 } })).toThrow("画幅、帧率");
    expect(() => normalizeTimelineProject({ output: null as never })).toThrow("画幅、帧率");
});

test("重开默认轨道保留名称、锁定、静音、隐藏与排序设置", () => {
    const tracks = [
        { id: "video-1", kind: "video" as const, label: "锁定母版", order: 3, locked: true, visible: false },
        { id: "audio-1", kind: "audio" as const, label: "旁白静音", order: 5, muted: true },
        { id: "subtitle-1", kind: "subtitle" as const, label: "人工校正字幕", order: 8, locked: true },
    ];
    const normalized = normalizeTimelineProject({ version: 2, tracks, clips: [], durationMs: 0 });
    expect(normalized.tracks).toEqual(tracks);
    expect(normalizeTimelineProject(normalized)).toEqual(normalized);
    expect(normalizeTimelineProject({ tracks: [tracks[1]], clips: [] }).tracks.find((track) => track.id === "audio-1")?.muted).toBe(true);
});

test("导入的多条原生轨道重开时不凭空增加三条默认轨", () => {
    const tracks = [
        { id: "import-video", kind: "video" as const, label: "导入画面", order: 0 },
        { id: "import-subs", kind: "subtitle" as const, label: "导入字幕", order: 1 },
        ...[1, 2, 3].map((n) => ({ id: `voice-${n}`, kind: "audio" as const, label: `声音 ${n}`, order: n + 1, muted: n === 2 })),
    ];
    const project = normalizeTimelineProject({ tracks, clips: [] });
    expect(project.tracks).toEqual(tracks);
    expect(normalizeTimelineProject(project)).toEqual(project);
    expect(getTimelineTrackId(project.tracks, "video")).toBe("import-video");
    expect(getTimelineTrackId(project.tracks, "image")).toBe("import-video");
    expect(getTimelineTrackId(project.tracks, "audio")).toBe("voice-1");
    expect(getTimelineTrackId(project.tracks, "subtitle")).toBe("import-subs");
});

test("缺少的媒体轨只补一类且不覆盖已有排序锁定与静音", () => {
    const project = normalizeTimelineProject({ tracks: [{ id: "locked", kind: "video", label: "固定剪辑", order: 7, locked: true }] });
    expect(project.tracks.map((track) => [track.id, track.order])).toEqual([
        ["locked", 7],
        ["audio-1", 8],
        ["subtitle-1", 9],
    ]);
    expect(project.tracks[0].locked).toBe(true);
    expect(getTimelineTrackId([...project.tracks, { id: "free", kind: "video", label: "可编辑", order: 10 }], "video")).toBe("free");
    expect(normalizeTimelineProject(project)).toEqual(project);
});

test("用户自定义轨道占用了默认名称时仍补齐唯一编号", () => {
    const project = normalizeTimelineProject({ tracks: [{ id: "video-1", kind: "audio", label: "保留的声音轨", order: 4 }] });
    expect(new Set(project.tracks.map((track) => track.id)).size).toBe(project.tracks.length);
    expect(project.tracks[0]).toMatchObject({ id: "video-1", kind: "audio" });
    expect(getTimelineTrackId(project.tracks, "video")).toBe("video-1-2");
    expect(normalizeTimelineProject(project)).toEqual(project);
});

test("自定义轨道中的字幕同步保持合法所属轨道并可重复执行", () => {
    const project = normalizeTimelineProject({
        tracks: [
            { id: "picture", kind: "video", label: "画面", order: 0 },
            { id: "captions", kind: "subtitle", label: "对白字幕", order: 1 },
        ],
        clips: [{ id: "v", kind: "video", nodeId: "node", trackId: "picture", startMs: 0, durationMs: 2000, sourceDurationMs: 2000 }],
    });
    const entries = [{ index: 1, startMs: 200, endMs: 1200, text: "字幕" }];
    const synced = syncNodeSubtitlesToTimeline(project, "node", entries);
    expect(synced.clips.find((clip) => clip.kind === "subtitle")?.trackId).toBe("captions");
    const nodes = [{ id: "node", type: "video", metadata: { subtitleEntries: entries } }] as CanvasNodeData[];
    const resynced = syncTimelineSubtitleClips(synced, nodes);
    expect(resynced.clips.filter((clip) => clip.kind === "subtitle")).toHaveLength(1);
    expect(resynced.clips.every((clip) => resynced.tracks.some((track) => track.id === clip.trackId))).toBe(true);
    expect(resynced.clips.find((clip) => clip.kind === "subtitle")?.trackId).toBe("captions");
});
