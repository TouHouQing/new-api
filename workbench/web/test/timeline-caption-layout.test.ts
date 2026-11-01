import { expect, test } from "bun:test";
import { timelineCaptionPlacements, wrapTimelineCaption } from "../src/lib/timeline/timeline-caption-layout";
import type { TimelineClip } from "../src/types/timeline";

test("人工字幕和自动识别字幕同时出现时分行显示，后续单条字幕可复用空行", () => {
    const clip: TimelineClip = { id: "manual", nodeId: "manual", trackId: "sub", kind: "subtitle", startMs: 500, durationMs: 2000, text: "人工字幕" };
    const placements = timelineCaptionPlacements([clip, { ...clip, id: "asr", startMs: 0, text: "识别字幕" }, { ...clip, id: "later", startMs: 4000 }]);
    expect(placements.get("asr")?.offset).toBe(64);
    expect(placements.get("manual")?.offset).toBe(132);
    expect(placements.get("later")?.offset).toBe(64);
    expect(wrapTimelineCaption("字".repeat(50))).toHaveLength(2);
    expect(() => wrapTimelineCaption("字".repeat(200))).toThrow("三行");
});
