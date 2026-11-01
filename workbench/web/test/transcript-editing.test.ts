import { expect, test } from "bun:test";
import { transcriptChanges, transcriptSourceSrt } from "../src/lib/timeline/transcript-editing";
import type { TranscriptDocument } from "../src/services/api/project-transcripts";
import { createEditorStore } from "../src/stores/editor/editor-store";
import { createEditorCommandRegistry } from "../src/lib/timeline/editor-commands";
import type { TimelineProject } from "../src/types/timeline";

const original: TranscriptDocument = { version: 1, precision: "segment", segments: [{ id: "s-1", startMs: 1210, endMs: 2450, text: "窗边直物" }] };
test("校正差异保留源时间、原稿和说话人清空操作", () => {
    const draft = structuredClone(original);
    draft.segments[0].text = "窗边植物";
    draft.segments[0].speaker = "旁白";
    expect(transcriptChanges(original, draft)).toEqual([{ id: "s-1", text: "窗边植物", speaker: "旁白" }]);
    expect(original.segments[0].text).toBe("窗边直物");
    expect(transcriptChanges(draft, { ...original, segments: [{ ...draft.segments[0], speaker: "" }] })).toEqual([{ id: "s-1", speaker: "" }]);
    expect(transcriptSourceSrt(draft)).toContain("00:00:01,210 --> 00:00:02,450\n窗边植物");
    draft.segments[0].startMs++;
    expect(() => transcriptChanges(original, draft)).toThrow("源时间");
});

test("文字稿面板草稿独立于时间线保存，旧面板清理不能解除新面板保护", async () => {
    let saves = 0;
    const store = createEditorStore({
        saveTimeline: async () => {
            saves++;
        },
    });
    store.getState().setPanelDraftDirty("old", true);
    store.getState().setPanelDraftDirty("new", true);
    store.getState().setPanelDraftDirty("old", false);
    expect(store.getState().hasPendingPanelEdits).toBe(true);
    expect(store.getState().isDirty).toBe(false);
    await store.getState().flushSave();
    expect(saves).toBe(0);
    store.getState().setPanelDraftDirty("new", false);
    expect(store.getState().hasPendingPanelEdits).toBe(false);
});

test("再次采用文字稿只替换当前素材实例的字幕，并固定具体版本", () => {
    const registry = createEditorCommandRegistry();
    const state: TimelineProject = {
        version: 2,
        tracks: [{ id: "sub", kind: "subtitle", label: "字幕", order: 0 }],
        durationMs: 12000,
        clips: [
            { id: "old", kind: "subtitle", nodeId: "transcription:occurrence-a", trackId: "sub", startMs: 0, durationMs: 1000, text: "旧识别" },
            {
                id: "other",
                kind: "subtitle",
                nodeId: "other",
                trackId: "sub",
                startMs: 10000,
                durationMs: 2000,
                text: "同一素材的另一个使用实例",
                productionBinding: { transcriptId: "document", transcriptRevisionId: "v1", transcriptSegmentId: "s-1", sourceClipId: "occurrence-b" },
            },
        ],
    };
    const command = {
        op: "rebuildSubtitleClips",
        payload: { nodeId: "bounded-hash", trackId: "sub", entries: [{ index: 1, startMs: 500, endMs: 1000, text: "校正" }], transcript: { id: "document", revisionId: "v2", sourceClipId: "occurrence-a", segmentIds: ["s-1"] } },
    };
    const first = registry.apply(state, command),
        second = registry.apply(first, command);
    expect(first.clips).toHaveLength(2);
    expect(second).toEqual(first);
    expect(second.clips.find((row) => row.id === "other")).toEqual(state.clips[1]);
    expect(second.clips.find((row) => row.text === "校正")?.productionBinding?.transcriptRevisionId).toBe("v2");
    expect(state.clips[0].text).toBe("旧识别");
    expect(() => registry.apply(state, { ...command, payload: { ...command.payload, transcript: { ...command.payload.transcript, segmentIds: [] } } })).toThrow();
});
