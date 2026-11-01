import { expect, test } from "bun:test";
import { ApiError } from "../src/services/api/request";
import { createTimelineResourceIngest } from "../src/services/timeline-resource-ingest";
import type { TimelineEditPreview, TimelineEditRequest, TimelineEditResult } from "../src/services/api/timeline-edits";
import type { ProjectCutView } from "../src/services/api/project-cuts";
import type { TimelineProject } from "../src/types/timeline";
import type { TimelineEditCommand } from "../src/services/api/timeline-edits";

const requestId = "canvas-native-ingest-0001";
const nodeSource = { canvasId: "canvas", nodeId: "node" };
function fixture() {
    const values = new Map<string, string>();
    const storage = {
        getItem: async (key: string) => values.get(key) ?? null,
        setItem: async (key: string, value: string) => {
            values.set(key, value);
        },
        removeItem: async (key: string) => {
            values.delete(key);
        },
    };
    const timeline: TimelineProject = {
        version: 2,
        tracks: [{ id: "v", kind: "video", label: "画面", order: 0 }],
        clips: [{ id: "added", kind: "image", trackId: "v", nodeId: "resource:r", title: "原画", startMs: 0, durationMs: 4000, directMedia: { id: "r", kind: "image", title: "原画", storageKey: "resource:r" } }],
        durationMs: 4000,
    };
    const summary = { clips: 0, tracks: 1, durationMs: 0, sha256: "a".repeat(64) };
    const plan: TimelineEditPreview = {
        cutId: "cut",
        backupCutId: "before",
        expectedRevision: 3,
        before: summary,
        after: { ...summary, clips: 1, durationMs: 4000 },
        changes: [{ clipId: "added", title: "原画", kind: "image", action: "add", resultClipIds: ["added"] }],
        timeline,
        previewToken: "b".repeat(64),
    };
    const result: TimelineEditResult = { kind: "timeline-edit", plan, appliedRevision: 4, replayed: false };
    const cut: ProjectCutView = {
        cut: { id: "cut", projectId: "p", title: "加入原画", kind: "snapshot", timelineRevision: 3, timelineSha256: "c".repeat(64), archived: false, createdAt: "2026-10-25T00:00:00Z", sourceKey: "timeline-edit-v1" },
        timeline,
        metadata: { kind: "timeline-edit", requestId, commands: [{ op: "addResource", resourceId: "r" }] },
        replayed: false,
    };
    let committed = false,
        writes = 0,
        lostReply = false,
        loads = 0,
        previews = 0;
    const api: NonNullable<Parameters<typeof createTimelineResourceIngest>[4]> = {
        load: async () => {
            loads++;
            return { exists: true, revision: 3, timeline: { ...timeline, clips: [], durationMs: 0 } };
        },
        preview: async (_id, input) => {
            previews++;
            expect(input.commands).toEqual([{ op: "addResource", resourceId: "r" }]);
            return plan;
        },
        apply: async () => {
            writes++;
            committed = true;
            if (lostReply) throw new Error("connection lost after commit");
            return result;
        },
        receipt: async () => {
            if (!committed) throw new ApiError("not completed", { status: 404 });
            return result;
        },
        cut: async () => cut,
    };
    return {
        storage,
        values,
        api,
        cut,
        result,
        plan,
        counts: () => ({ writes, loads, previews }),
        committed: () => {
            committed = true;
        },
        loseReply: () => {
            lostReply = true;
        },
    };
}

function captionFixture() {
    const f = fixture();
    const command: TimelineEditCommand = { op: "addCanvasNode", resourceId: "r", ...nodeSource, canvasRevision: 7, nodeSha256: "e".repeat(64) };
    const timeline = f.cut.timeline;
    // A previous use of this same node must never supply this receipt's text.
    const earlier = { ...timeline.clips[0], id: "previous", canvasOrigin: { ...nodeSource, resourceId: "r", canvasRevision: 1, nodeSha256: "f".repeat(64) } };
    timeline.clips[0].canvasOrigin = { ...nodeSource, resourceId: "r", canvasRevision: 7, nodeSha256: "e".repeat(64) };
    timeline.clips.push({ id: "cue", nodeId: "node", kind: "subtitle", trackId: "s", startMs: 0, durationMs: 2000, text: "确认时的台词", captionLink: { sourceClipId: "added", sourceStartMs: 0, sourceEndMs: 2000 } });
    timeline.clips.unshift(earlier);
    f.plan.changes.push({ clipId: "cue", title: "字幕", kind: "subtitle", action: "add", resultClipIds: ["cue"] });
    f.cut.metadata!.commands = [command];
    let sourceReads = 0;
    const api = {
        ...f.api,
        source: async () => {
            sourceReads++;
            return { ...nodeSource, resourceId: "r", canvasRevision: 7, nodeSha256: "e".repeat(64), title: "原画", captionCount: 1, previewCues: [] };
        },
        preview: async (_: string, input: TimelineEditRequest) => {
            expect(input.commands).toEqual([command]);
            return f.plan;
        },
    };
    return { ...f, api, sourceReads: () => sourceReads };
}

test("node snapshot confirmation carries its exact captions and receipt, including a repeated node", async () => {
    const f = captionFixture();
    const flow = createTimelineResourceIngest("p", "r", requestId, f.storage, f.api, nodeSource);
    const ready = await flow.prepare();
    if (ready.state !== "ready") throw new Error();
    expect(ready.captions?.previewCues).toEqual(["确认时的台词"]);
    expect(ready.captions?.captionCount).toBe(1);
    f.loseReply();
    expect((await flow.apply(ready.input)).captions?.previewCues).toEqual(["确认时的台词"]);
    // A completed operation reads its immutable cut, even if the node is gone.
    f.api.source = async () => {
        throw new Error("node deleted");
    };
    const recovered = await createTimelineResourceIngest("p", "r", requestId, f.storage, f.api, nodeSource).prepare();
    expect(recovered.state).toBe("complete");
    expect(f.counts().writes).toBe(1);
    expect(f.sourceReads()).toBe(1);
});

test("a node receipt cannot be recovered using another node or the old resource-only URL", async () => {
    const f = captionFixture();
    f.committed();
    await expect(createTimelineResourceIngest("p", "r", requestId, f.storage, f.api, { canvasId: "canvas", nodeId: "other" }).prepare()).rejects.toThrow("另一项编辑");
    await expect(createTimelineResourceIngest("p", "r", requestId, f.storage, f.api).prepare()).rejects.toThrow("另一项编辑");
    expect(f.counts().writes).toBe(0);
});

test("reload retains one durable append intent and concurrent confirmation makes one write", async () => {
    const f = fixture();
    const first = await createTimelineResourceIngest("p", "r", requestId, f.storage, f.api).prepare();
    expect(first.state).toBe("ready");
    const reloaded = createTimelineResourceIngest("p", "r", requestId, f.storage, f.api);
    const recovered = await reloaded.prepare();
    if (recovered.state !== "ready") throw new Error("expected pending intent");
    const [left, right] = await Promise.all([reloaded.apply(recovered.input), reloaded.apply(recovered.input)]);
    expect(left.clipId).toBe("added");
    expect(right.clipId).toBe("added");
    expect(f.counts().writes).toBe(1);
    expect(f.counts().loads).toBe(1);
    expect(f.values.size).toBe(0);
    const completed = await createTimelineResourceIngest("p", "r", requestId, f.storage, f.api).prepare();
    expect(completed.state).toBe("complete");
    expect(f.counts().writes).toBe(1);
});
test("lost HTTP reply recovers the immutable receipt without resubmission", async () => {
    const f = fixture();
    f.loseReply();
    const flow = createTimelineResourceIngest("p", "r", requestId, f.storage, f.api);
    const prepared = await flow.prepare();
    if (prepared.state !== "ready") throw new Error();
    expect((await flow.apply(prepared.input)).clipId).toBe("added");
    expect(f.counts().writes).toBe(1);
});
test("a receipt for another edit cannot be mistaken for this asset append", async () => {
    const f = fixture();
    f.committed();
    f.cut.metadata!.commands = [{ op: "removeClip", id: "added" }];
    await expect(createTimelineResourceIngest("p", "r", requestId, f.storage, f.api).prepare()).rejects.toThrow("另一项编辑");
    expect(f.counts()).toEqual({ writes: 0, loads: 0, previews: 0 });
});
test("a missing immutable after-cut does not look like a missing operation receipt", async () => {
    const f = fixture();
    f.committed();
    f.api.cut = async () => {
        throw new ApiError("missing cut", { status: 404 });
    };
    await expect(createTimelineResourceIngest("p", "r", requestId, f.storage, f.api).prepare()).rejects.toThrow("missing cut");
    expect(f.counts().previews).toBe(0);
});
test("suppressed browser persistence blocks writes", async () => {
    const f = fixture();
    f.storage.setItem = async () => {};
    const flow = createTimelineResourceIngest("p", "r", requestId, f.storage, f.api);
    await expect(flow.prepare()).rejects.toThrow("存储空间");
    expect(f.counts().writes).toBe(0);
});
test("tampered cached commands and changed confirmation parameters are rejected", async () => {
    const f = fixture();
    const flow = createTimelineResourceIngest("p", "r", requestId, f.storage, f.api);
    const prepared = await flow.prepare();
    if (prepared.state !== "ready") throw new Error();
    const changed = { ...prepared.input, commands: [{ op: "removeClip", id: "added" }] } as TimelineEditRequest;
    await expect(flow.apply(changed)).rejects.toThrow("参数已变化");
    const key = [...f.values.keys()][0]!;
    const cache = JSON.parse(f.values.get(key)!);
    cache.input = changed;
    f.values.set(key, JSON.stringify(cache));
    await expect(createTimelineResourceIngest("p", "r", requestId, f.storage, f.api).prepare()).rejects.toThrow("恢复记录无效");
    expect(f.counts().writes).toBe(0);
    const refreshed = await flow.prepare(true);
    expect(refreshed.state).toBe("ready");
});
test("permission failures never become a fresh append", async () => {
    const f = fixture();
    f.api.receipt = async () => {
        throw new ApiError("forbidden", { status: 403 });
    };
    await expect(createTimelineResourceIngest("p", "r", requestId, f.storage, f.api).prepare()).rejects.toThrow("forbidden");
    expect(f.counts()).toEqual({ writes: 0, loads: 0, previews: 0 });
});
