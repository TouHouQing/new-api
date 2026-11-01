import { expect, test } from "bun:test";
import { createEditorCommandRegistry } from "../src/lib/timeline/editor-commands";
import { createEditorStore } from "../src/stores/editor/editor-store";
import { registerTranscriptCutCommand, TRANSCRIPT_CUT_COMMAND, timelineContentSignature } from "../src/lib/timeline/transcript-cut-command";
import type { TimelineProject } from "../src/types/timeline";

const before: TimelineProject = { version: 2, tracks: [{ id: "a", kind: "audio", label: "旁白", order: 0 }], clips: [{ id: "voice", kind: "audio", trackId: "a", nodeId: "source", startMs: 0, durationMs: 6000 }], durationMs: 6000 };
const after: TimelineProject = {
    ...before,
    clips: [
        { ...before.clips[0], durationMs: 2000 },
        { ...before.clips[0], id: "cut-second", sourceStartMs: 4000, startMs: 2000, durationMs: 2000 },
    ],
    durationMs: 4000,
};
test("文字媒体剪切一次进入撤销与保存，旧计划不能覆盖后续修改", async () => {
    const registry = createEditorCommandRegistry();
    registerTranscriptCutCommand(registry);
    const saved: TimelineProject[] = [];
    const store = createEditorStore({
        registry,
        saveTimeline: async (project) => {
            saved.push(project);
        },
        debounceMs: 60000,
    });
    store.getState().load(before);
    store.getState().dispatch({ op: TRANSCRIPT_CUT_COMMAND, payload: { before, after } });
    expect(store.getState().project).toEqual(after);
    expect(store.getState().history?.undoStack).toHaveLength(1);
    await store.getState().flushSave();
    expect(saved).toEqual([after]);
    store.getState().undo();
    expect(store.getState().project).toEqual(before);
    store.getState().redo();
    expect(store.getState().project).toEqual(after);
    const current = store.getState().project;
    store.getState().dispatch({ op: TRANSCRIPT_CUT_COMMAND, payload: { before, after } });
    expect(store.getState().project).toBe(current);
    expect(store.getState().saveError).toContain("剪辑已变化");
    await store.getState().flushSave();
    expect(timelineContentSignature(before)).toBe(timelineContentSignature({ ...before, updatedAt: "display-only" }));
});
test("错误总时长或重复片段编号不能应用到剪辑", () => {
    const registry = createEditorCommandRegistry();
    registerTranscriptCutCommand(registry);
    expect(() => registry.apply(before, { op: TRANSCRIPT_CUT_COMMAND, payload: { before, after: { ...after, durationMs: 999 } } })).toThrow();
    expect(() => registry.apply(before, { op: TRANSCRIPT_CUT_COMMAND, payload: { before, after: { ...after, clips: [after.clips[0], after.clips[0]] } } })).toThrow();
});
