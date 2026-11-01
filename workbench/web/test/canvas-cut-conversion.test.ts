import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { ApiError } from "../src/services/api/request";
import { createCanvasCutConversion } from "../src/services/canvas-cut-conversion";
import type { CanvasCutConvertPreview, CanvasCutConvertRequest } from "../src/services/api/canvas-timeline-cut";
import type { ProjectCutView } from "../src/services/api/project-cuts";

const input: Omit<CanvasCutConvertRequest, "requestId" | "previewToken"> = {
    canvasId: "saved-canvas",
    canvasRevision: 3,
    sourceSha256: "a".repeat(64),
    title: "原画布剪辑",
    expectedProjectRevision: 2,
    expectedTimelineRevision: 5,
    mappings: [{ clipId: "repeat-a", resourceId: "original-resource" }],
    texts: [{ clipId: "missing-caption", text: "明确补充的台词" }],
};
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function fixture() {
    const values = new Map<string, string>(),
        requests: CanvasCutConvertRequest[] = [];
    let record: ProjectCutView | undefined,
        previews = 0,
        receiptReads = 0,
        lostAfterCommit = false,
        unavailableBeforeCommit = false,
        nativeConflict = false,
        failStorageOnSubmit = false;
    let mutatePreview: ((plan: CanvasCutConvertPreview) => CanvasCutConvertPreview) | undefined;
    const storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, raw: string) => {
            if (failStorageOnSubmit && JSON.parse(raw).submitted) throw new Error("storage unavailable before submission");
            values.set(key, raw);
        },
        removeItem: (key: string) => {
            values.delete(key);
        },
    };
    const api = {
        preview: async (_project: string, request: CanvasCutConvertRequest): Promise<CanvasCutConvertPreview> => {
            previews++;
            const signature = createHash("sha256")
                .update(JSON.stringify({ ...request, previewToken: undefined }))
                .digest("hex");
            const plan = {
                cutId: `cut:${request.requestId}`,
                title: request.title,
                canvasId: request.canvasId,
                sourceSha256: request.sourceSha256,
                expectedProjectRevision: request.expectedProjectRevision,
                expectedTimelineRevision: request.expectedTimelineRevision,
                summary: { clips: 2, tracks: 2, durationMs: 2000, sha256: "b".repeat(64) },
                pinnedMedia: 0,
                explicitMedia: 1,
                supplementedTexts: 1,
                warnings: [],
                previewToken: signature,
            };
            return mutatePreview ? mutatePreview(plan) : plan;
        },
        apply: async (_project: string, request: CanvasCutConvertRequest): Promise<ProjectCutView> => {
            expect(JSON.parse(values.get("canvas-cut-conversion-v1:project")!).submitted).toBe(true);
            requests.push(copy(request));
            if (unavailableBeforeCommit) throw new Error("connection interrupted; result unknown");
            if (nativeConflict) throw new ApiError("source changed", { status: 409 });
            record ??= {
                cut: {
                    id: `cut:${request.requestId}`,
                    projectId: "project",
                    title: request.title,
                    kind: "snapshot",
                    sourceKey: "canvas-timeline-cut-v1:" + request.sourceSha256,
                    timelineRevision: request.expectedTimelineRevision,
                    timelineSha256: "b".repeat(64),
                    archived: false,
                    createdAt: "2026-10-25T00:00:00Z",
                },
                timeline: { version: 2, tracks: [], clips: [], durationMs: 0 },
                metadata: {
                    kind: "canvas-timeline-cut-v1",
                    requestId: request.requestId,
                    source: { canvasId: request.canvasId, canvasRevision: request.canvasRevision, sourceSha256: request.sourceSha256 },
                    media: request.mappings.map((row) => ({ ...row, resolution: "explicit" })),
                    supplementedTexts: copy(request.texts),
                },
                replayed: false,
            };
            if (lostAfterCommit) throw new Error("response lost after actual commit");
            return copy(record);
        },
        read: async (_project: string, _requestId: string): Promise<ProjectCutView> => {
            receiptReads++;
            if (!record) throw new ApiError("not completed", { status: 404 });
            return { ...copy(record), replayed: true };
        },
    };
    return {
        values,
        storage,
        api,
        requests,
        counts: () => ({ previews, receiptReads }),
        lostReply: () => {
            lostAfterCommit = true;
        },
        network: (unavailable: boolean) => {
            unavailableBeforeCommit = unavailable;
        },
        conflict: (blocked: boolean) => {
            nativeConflict = blocked;
        },
        storageFailure: () => {
            failStorageOnSubmit = true;
        },
        previewMutation: (mutate: typeof mutatePreview) => {
            mutatePreview = mutate;
        },
        corruptRecord: () => {
            if (record) record.metadata!.source = { canvasId: "other-canvas", sourceSha256: input.sourceSha256, canvasRevision: input.canvasRevision };
        },
    };
}

test("canvas conversion persists the exact intent and recovers a lost commit after reopening", async () => {
    const f = fixture(),
        first = createCanvasCutConversion("project", f.storage, f.api);
    const plan = await first.prepare(copy(input));
    expect(plan.state).toBe("ready");
    if (plan.state !== "ready") throw new Error("expected preview");
    expect(f.requests).toHaveLength(0);
    f.lostReply();
    const result = await first.apply(plan.pending.plan!);
    expect(result.state).toBe("complete");
    expect(f.requests).toHaveLength(1);
    const reopened = await createCanvasCutConversion("project", f.storage, f.api).restore();
    expect(reopened?.state).toBe("complete");
    expect(f.requests).toHaveLength(1);
    expect(f.counts().previews).toBe(1);
    if (reopened?.state === "complete") {
        expect(reopened.cut.cut.id).toBe(plan.pending.plan!.cutId);
        expect(reopened.cut.replayed).toBe(true);
    }
});

test("unknown conversion remains bound to its original body and cannot silently become another intent", async () => {
    const f = fixture(),
        service = createCanvasCutConversion("project", f.storage, f.api);
    const plan = await service.prepare(copy(input));
    if (plan.state !== "ready") throw new Error("expected preview");
    f.network(true);
    await expect(service.apply(plan.pending.plan!)).rejects.toThrow("result unknown");
    const reopened = createCanvasCutConversion("project", f.storage, f.api),
        restored = await reopened.restore();
    expect(restored?.state).toBe("ready");
    expect(restored?.pending.submitted).toBe(true);
    await expect(reopened.prepare({ ...input, title: "另一份剪辑" })).rejects.toThrow("上一次转换已提交");
    expect(f.counts().previews).toBe(1);
    f.network(false);
    expect((await reopened.apply(plan.pending.plan!)).state).toBe("complete");
    expect(f.requests).toHaveLength(2);
    expect(f.requests[0]).toEqual(f.requests[1]);
});

test("native validation conflict releases the rejected form only after checking the original receipt", async () => {
    const f = fixture(),
        service = createCanvasCutConversion("project", f.storage, f.api);
    const plan = await service.prepare(copy(input));
    if (plan.state !== "ready") throw new Error("expected preview");
    f.conflict(true);
    await expect(service.apply(plan.pending.plan!)).rejects.toThrow("source changed");
    const restored = await service.restore();
    expect(restored?.state).toBe("draft");
    expect(restored?.pending.submitted).toBe(false);
    f.conflict(false);
    const next = await service.prepare({ ...input, sourceSha256: "c".repeat(64) });
    expect(next.state).toBe("ready");
    expect(next.pending.input.requestId).not.toBe(plan.pending.input.requestId);
    expect(f.requests).toHaveLength(1);
});

test("another window cannot replace the body that a user has just confirmed", async () => {
    const f = fixture(),
        a = createCanvasCutConversion("project", f.storage, f.api),
        b = createCanvasCutConversion("project", f.storage, f.api);
    const first = await a.prepare(copy(input));
    if (first.state !== "ready") throw new Error("expected preview");
    const second = await b.prepare({ ...input, title: "另一窗口的选择" });
    expect(second.state).toBe("ready");
    await expect(a.apply(first.pending.plan!)).rejects.toThrow("另一个窗口");
    expect(f.requests).toHaveLength(0);
});

test("an unrelated receipt or preview cannot be presented as the selected canvas conversion", async () => {
    const f = fixture(),
        service = createCanvasCutConversion("project", f.storage, f.api);
    f.previewMutation((plan) => ({ ...plan, canvasId: "wrong-source" }));
    await expect(service.prepare(copy(input))).rejects.toThrow("转换预览与当前选择不一致");
    expect(f.requests).toHaveLength(0);
    f.previewMutation(undefined);
    const plan = await service.prepare(copy(input));
    if (plan.state !== "ready") throw new Error("expected preview");
    await service.apply(plan.pending.plan!);
    f.corruptRecord();
    await expect(service.restore()).rejects.toThrow("转换回执与已确认选择不一致");
    await expect(service.clearCompleted()).rejects.toThrow();
    expect(f.values.size).toBe(1);
    expect(f.requests).toHaveLength(1);
});

test("failed durable storage prevents submission and preserves a retryable original plan", async () => {
    const f = fixture(),
        service = createCanvasCutConversion("project", f.storage, f.api);
    const plan = await service.prepare(copy(input));
    if (plan.state !== "ready") throw new Error("expected preview");
    f.storageFailure();
    await expect(service.apply(plan.pending.plan!)).rejects.toThrow("storage unavailable before submission");
    expect(f.requests).toHaveLength(0);
    const restored = await service.restore();
    expect(restored?.state).toBe("ready");
    expect(restored?.pending.submitted).toBe(false);
});

test("invalid text and corrupted or foreign stored intents never cause a conversion request", async () => {
    const f = fixture(),
        service = createCanvasCutConversion("project", f.storage, f.api);
    await expect(service.prepare({ ...input, texts: [{ clipId: "caption", text: "\ud800" }] })).rejects.toThrow("转换选择或文字无效");
    expect(f.values.size).toBe(0);
    f.values.set("canvas-cut-conversion-v1:project", "{broken");
    await expect(service.restore()).rejects.toThrow("保存的转换输入无法读取");
    f.values.clear();
    const ready = await service.prepare(copy(input));
    expect(ready.state).toBe("ready");
    const raw = JSON.parse(f.values.get("canvas-cut-conversion-v1:project")!);
    raw.projectId = "other-project";
    f.values.set("canvas-cut-conversion-v1:project", JSON.stringify(raw));
    await expect(service.restore()).rejects.toThrow("保存的转换输入无法读取");
    expect(f.requests).toHaveLength(0);
});
