import { expect, test } from "bun:test";
import { activeTimelineLayers, timelineClipFade } from "../src/lib/timeline/timeline-preview-layers";
import { timelineExportPreflight } from "../src/lib/timeline/timeline-export-preflight";
import type { TimelineProject } from "../src/types/timeline";

function project(): TimelineProject {
    return {
        version: 2,
        durationMs: 3000,
        tracks: [
            { id: "video", kind: "video", label: "画面", order: 0 },
            { id: "audio", kind: "audio", label: "声音", order: 1 },
            { id: "subtitle", kind: "subtitle", label: "字幕", order: 2 },
        ],
        clips: [
            { id: "v", nodeId: "v", kind: "image", trackId: "video", startMs: 0, durationMs: 3000, directMedia: { id: "v", kind: "image", title: "图", storageKey: "resource:image" } },
            { id: "a", nodeId: "a", kind: "audio", trackId: "audio", startMs: 500, durationMs: 1000, fadeInMs: 200, fadeOutMs: 200, directMedia: { id: "a", kind: "audio", title: "配音", storageKey: "resource:voice" } },
            { id: "s", nodeId: "s", kind: "subtitle", trackId: "subtitle", startMs: 500, durationMs: 1000, text: "早上好" },
        ],
    };
}

test("声音和字幕按节目时间进入、离开，并遵守隐藏和静音", () => {
    const timeline = project();
    expect(activeTimelineLayers(timeline, 400).audio).toHaveLength(0);
    expect(activeTimelineLayers(timeline, 800).audio).toHaveLength(1);
    expect(activeTimelineLayers(timeline, 800).text[0].text).toBe("早上好");
    expect(activeTimelineLayers(timeline, 1500).text).toHaveLength(0);
    timeline.tracks[1].muted = true;
    timeline.tracks[2].visible = false;
    expect(activeTimelineLayers(timeline, 800)).toEqual({ audio: [], text: [] });
});

test("音量和画面淡入淡出使用片段时间，重复素材实例互不影响", () => {
    const clip = project().clips[1];
    expect(timelineClipFade(clip, 600)).toBe(0.5);
    expect(timelineClipFade(clip, 1000)).toBe(1);
    expect(timelineClipFade(clip, 1400)).toBe(0.5);
    expect(timelineClipFade({ ...clip, startMs: 2000 }, 1400)).toBe(0);
    expect(timelineClipFade({ ...clip, fadeInMs: 800, fadeOutMs: 800 }, 1000)).toBe(0.390625);
});

test("导出检查不能静默跳过缺失声音，复杂剪辑不走能力不足的离线路径", () => {
    const timeline = project();
    const ready = timelineExportPreflight(timeline);
    expect(ready.blockers).toHaveLength(0);
    expect(ready).toMatchObject({ videoCount: 1, audioCount: 1, textCount: 1, durationMs: 3000 });
    expect(ready.offlineReason).toContain("成片导出");
    delete timeline.clips[1].directMedia;
    expect(timelineExportPreflight(timeline).blockers[0]).toContain("1 个片段");
});
