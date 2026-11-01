import { expect, test } from "bun:test";
import { createVideoReworkAdoptionSession, createBeatArrangementSession } from "../src/services/video-rework-adoption-session";
import { ApiError } from "../src/services/api/request";
import type { TimelineEditPreview, TimelineEditRequest, TimelineEditResult } from "../src/services/api/timeline-edits";
const preview = { previewToken: "f".repeat(64), expectedRevision: 7, changes: [{ clipId: "repair", action: "add" }] } as TimelineEditPreview;
const receipt = { kind: "timeline-edit", appliedRevision: 8, plan: preview, replayed: true } as TimelineEditResult;
const command = { op: "applyVideoRepair" as const, id: "occurrence", repairTaskId: "native-task" };
function memory() {
    const values = new Map<string, string>();
    return {
        values,
        getItem: async (key: string) => values.get(key) ?? null,
        setItem: async (key: string, value: string) => {
            values.set(key, value);
        },
        removeItem: async (key: string) => {
            values.delete(key);
        },
    };
}
test("a lost adoption response survives reopening and never creates another write body", async () => {
    const storage = memory(),
        writes: TimelineEditRequest[] = [];
    let canRead = false;
    const api = {
        preview: async () => preview,
        apply: async (_id: string, r: TimelineEditRequest) => {
            expect([...storage.values.values()][0]).toContain('"phase":"submitted"');
            writes.push(structuredClone(r));
            throw new Error("lost committed response");
        },
        read: async () => {
            if (!canRead) throw new Error("network");
            return receipt;
        },
    };
    const session = createVideoReworkAdoptionSession("project", "occurrence", storage, api),
        intent = await session.prepare(command, 7);
    await expect(session.apply(intent.request.requestId)).rejects.toThrow("lost committed");
    await expect(session.clear(intent.request.requestId)).rejects.toThrow("network");
    const reopened = createVideoReworkAdoptionSession("project", "occurrence", storage, api);
    expect((await reopened.read())?.request).toEqual(intent.request);
    await expect(reopened.prepare(command, 8)).rejects.toThrow("上一份");
    canRead = true;
    expect((await reopened.apply(intent.request.requestId)).appliedRevision).toBe(8);
    expect(writes[0]).toEqual(writes[1]);
    await reopened.clear(intent.request.requestId);
    expect(await reopened.read()).toBeNull();
});
test("an explicit native rejection permits a new preview, while an uncertain transport failure retains the write", async () => {
    const storage = memory();
    const api = {
        preview: async () => preview,
        apply: async () => {
            throw new ApiError("stale revision", { code: 409, status: 200 });
        },
        read: async () => {
            throw new ApiError("no receipt", { code: 404 });
        },
    };
    const session = createVideoReworkAdoptionSession("project", "occurrence", storage, api),
        intent = await session.prepare(command, 7);
    await expect(session.apply(intent.request.requestId)).rejects.toThrow("stale");
    expect((await session.read())?.phase).toBe("rejected");
    await session.clear(intent.request.requestId);
    expect(await session.read()).toBeNull();
});
test("preview does not write a cut and can be abandoned before submission; storage failure prevents applying", async () => {
    const storage = memory();
    let calls = 0;
    const api = {
        preview: async () => preview,
        apply: async () => {
            calls++;
            return receipt;
        },
        read: async () => receipt,
    };
    const session = createVideoReworkAdoptionSession("project", "occurrence", storage, api),
        intent = await session.prepare(command, 7);
    await session.clear(intent.request.requestId);
    expect(calls).toBe(0);
    const failed = createVideoReworkAdoptionSession(
        "project",
        "occurrence",
        {
            ...storage,
            setItem: async () => {
                throw new Error("storage full");
            },
        },
        api,
    );
    await expect(failed.prepare(command, 7)).rejects.toThrow("storage full");
    expect(calls).toBe(0);
});

test("节拍复合编辑与视频返工共用断线合同，恢复时保留镜头顺序和原编号", async () => {
    const storage = memory();
    let readable = false;
    const writes: TimelineEditRequest[] = [];
    const api = {
        preview: async () => preview,
        apply: async (_id: string, body: TimelineEditRequest) => {
            writes.push(structuredClone(body));
            throw new Error("reply lost");
        },
        read: async () => {
            if (!readable) throw new Error("offline");
            return receipt;
        },
    };
    const beat = { op: "arrangeToBeats" as const, analysisId: "analysis", analysisRevisionId: "pinned", sourceClipId: "music", clipIds: ["b", "a"] };
    const first = createBeatArrangementSession("project", "music", storage, api),
        intent = await first.prepare(beat, 7);
    await expect(first.apply(intent.request.requestId)).rejects.toThrow("reply lost");
    const reopened = createBeatArrangementSession("project", "music", storage, api);
    expect((await reopened.read())?.request.commands).toEqual([beat]);
    await expect(reopened.prepare({ ...beat, clipIds: ["a", "b"] }, 7)).rejects.toThrow("上一份");
    await expect(reopened.clear(intent.request.requestId)).rejects.toThrow("offline");
    readable = true;
    expect((await reopened.verify())?.appliedRevision).toBe(8);
    await reopened.clear(intent.request.requestId);
    expect(writes).toHaveLength(1);
    expect(await createVideoReworkAdoptionSession("project", "music", storage, api).read()).toBeNull();
});
