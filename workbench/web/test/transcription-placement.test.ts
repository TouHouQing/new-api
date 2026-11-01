import { expect, test } from "bun:test";
import { transcriptionForClip } from "../src/lib/timeline/transcription-placement";
import type { TimelineClip } from "../src/types/timeline";

test("同一文件在不同片段中使用时，识别结果分别按源裁剪与节目时间对齐", () => {
    const source = [
        { startMs: 500, endMs: 2000, text: "第一句" },
        { startMs: 2500, endMs: 4000, text: "第二句" },
    ];
    const clip: TimelineClip = { id: "first", nodeId: "same-source", trackId: "audio", kind: "audio", startMs: 8000, durationMs: 2000, sourceStartMs: 1000 };
    expect(transcriptionForClip(source, clip)).toEqual([
        { index: 1, startMs: 8000, endMs: 9000, text: "第一句" },
        { index: 2, startMs: 9500, endMs: 10000, text: "第二句" },
    ]);
    expect(transcriptionForClip(source, { ...clip, id: "second", startMs: 14000, sourceStartMs: 3000 })).toEqual([{ index: 1, startMs: 14000, endMs: 15000, text: "第二句" }]);
});

test("错误时间不能作为字幕采用", () => {
    const clip: TimelineClip = { id: "clip", nodeId: "source", trackId: "audio", kind: "audio", startMs: 0, durationMs: 1000 };
    expect(() => transcriptionForClip([{ startMs: -1, endMs: 200, text: "bad" }], clip)).toThrow();
});
