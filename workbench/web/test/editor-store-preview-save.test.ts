import { expect, test } from "bun:test";
import { createEditorStore } from "@/stores/editor/editor-store";
import type { TimelineProject } from "@/types/timeline";

const base = (): TimelineProject => ({
    version: 2,
    tracks: [{ id: "video", kind: "video", label: "视频", order: 0 }],
    clips: [{ id: "clip", kind: "video", trackId: "video", startMs: 0, durationMs: 5000, sourceStartMs: 0, sourceDurationMs: 10000 }],
    durationMs: 5000,
});
const move = (startMs: number) => ({ op: "moveClip", payload: { id: "clip", startMs } });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a pending debounce saves the committed edit while a later drag is only a preview", async () => {
    const saved: TimelineProject[] = [];
    const store = createEditorStore({
        debounceMs: 10,
        saveTimeline: async (document) => {
            saved.push(document);
        },
    });
    store.getState().load(base());
    store.getState().dispatch(move(1000));
    store.getState().previewGesture(move(3000));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(saved.map((document) => document.clips[0]!.startMs)).toEqual([1000]);
    expect(store.getState().inPreview).toBe(true);
    expect(store.getState().isDirty).toBe(false);
    store.getState().cancelGesture();
    await store.getState().flushSave();
    expect(store.getState().project?.clips[0]!.startMs).toBe(1000);
    expect(saved.map((document) => document.clips[0]!.startMs)).toEqual([1000]);
});

test("leaving during a drag flushes only committed work and committing later saves the new pose", async () => {
    const saved: TimelineProject[] = [];
    const store = createEditorStore({
        debounceMs: 1000,
        saveTimeline: async (document) => {
            saved.push(document);
        },
    });
    store.getState().load(base());
    store.getState().dispatch(move(1000));
    store.getState().previewGesture(move(2000));
    await store.getState().flushSave();
    expect(saved.map((document) => document.clips[0]!.startMs)).toEqual([1000]);
    store.getState().commitGesture();
    await store.getState().flushSave();
    expect(saved.map((document) => document.clips[0]!.startMs)).toEqual([1000, 2000]);
    expect(store.getState().isDirty).toBe(false);
});

test("a save acknowledged during a preview does not leave a cancelled drag dirty", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
        release = resolve;
    });
    const saved: TimelineProject[] = [];
    const store = createEditorStore({
        debounceMs: 1000,
        saveTimeline: async (document) => {
            saved.push(document);
            await pending;
        },
    });
    store.getState().load(base());
    store.getState().dispatch(move(1000));
    const saving = store.getState().flushSave();
    await tick();
    store.getState().previewGesture(move(3000));
    release();
    await saving;
    expect(store.getState().isDirty).toBe(false);
    store.getState().cancelGesture();
    await store.getState().flushSave();
    expect(saved.map((document) => document.clips[0]!.startMs)).toEqual([1000]);
});

test("a gesture committed before an older save completes remains queued for persistence", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
        release = resolve;
    });
    const saved: TimelineProject[] = [];
    const store = createEditorStore({
        debounceMs: 1000,
        saveTimeline: async (document) => {
            saved.push(document);
            if (saved.length === 1) await pending;
        },
    });
    store.getState().load(base());
    store.getState().dispatch(move(1000));
    const saving = store.getState().flushSave();
    await tick();
    store.getState().previewGesture(move(2000));
    store.getState().commitGesture();
    release();
    await saving;
    expect(store.getState().isDirty).toBe(true);
    await store.getState().flushSave();
    expect(saved.map((document) => document.clips[0]!.startMs)).toEqual([1000, 2000]);
    expect(store.getState().isDirty).toBe(false);
});
