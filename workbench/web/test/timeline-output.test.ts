import { expect, test } from "bun:test";
import { timelineCaptionLineUnits, timelineOutputFormat } from "@/lib/timeline/timeline-output";
import { wrapTimelineCaption } from "@/lib/timeline/timeline-caption-layout";
import { createEditorCommandRegistry } from "@/lib/timeline/editor-commands";
import { createEditorHistory, pushEditorHistory, undoEditorHistory } from "@/lib/timeline/editor-history";
import type { TimelineProject } from "@/types/timeline";

test("stored regional output survives edits and output changes can be undone", () => {
    const project: TimelineProject = { version: 2, tracks: [], clips: [], durationMs: 0, output: { width: 384, height: 640, fps: 24, fit: "blur" } };
    expect(timelineOutputFormat("16:9", project.output)).toEqual(project.output);
    const changed = createEditorCommandRegistry().apply(project, { op: "setOutput", payload: { output: { width: 640, height: 384, fps: 25, fit: "crop" } } });
    expect(changed.clips).toBe(project.clips);
    const history = pushEditorHistory(createEditorHistory(project), changed);
    expect(undoEditorHistory(history)?.current.output).toEqual(project.output);
});

test("output commands reject malformed profiles without changing the source", () => {
    const project: TimelineProject = { version: 2, tracks: [], clips: [], durationMs: 0 };
    for (const output of [null, {}, { width: 385, height: 640, fps: 24 }, { width: 384, height: 640, fps: 61 }, { width: 384, height: 640, fps: 24, fit: "unknown" }, { width: 384, height: 640, fps: 24, extra: true }]) {
        expect(() => createEditorCommandRegistry().apply(project, { op: "setOutput", payload: { output } })).toThrow();
        expect(project.output).toBeUndefined();
    }
});

test.each([
    ["16:9", 1920, 1080],
    ["9:16", 1080, 1920],
    ["1:1", 1080, 1080],
    ["4:3", 1440, 1080],
    ["3:4", 1080, 1440],
    ["21:9", 2520, 1080],
])("timeline %s keeps the project output orientation", (ratio, width, height) => {
    expect(timelineOutputFormat(String(ratio))).toEqual({ width, height, fps: 30 });
});

test("legacy cuts keep the landscape default and unsupported ratios fail explicitly", () => {
    expect(timelineOutputFormat()).toEqual({ width: 1920, height: 1080, fps: 30 });
    expect(() => timelineOutputFormat("12:7")).toThrow("暂不支持导出画幅");
});

test("portrait captions wrap to the narrower output instead of spilling outside the frame", () => {
    const text = "一".repeat(30);
    expect(wrapTimelineCaption(text, timelineCaptionLineUnits(1920))).toEqual([text]);
    const portrait = wrapTimelineCaption(text, timelineCaptionLineUnits(1080));
    expect(portrait).toHaveLength(2);
    expect(portrait.join("")).toBe(text);
    expect(portrait.every((line) => line.length <= 22)).toBe(true);
    expect(() => wrapTimelineCaption("一".repeat(70), timelineCaptionLineUnits(1080))).toThrow("超过三行");
});
