import { expect, test } from "bun:test";
import { createCanvasAdmissionJournal, type CanvasAdmissionBatch } from "@/services/canvas-admission-journal";
import type { CreateTaskInput, GenerationTask } from "@/services/api/task-center";

function fixture() {
    const values = new Map<string, string>();
    let scope = "owner";
    const storage = {
        keys: async () => [...values.keys()],
        getItem: async (key: string) => values.get(key) || null,
        setItem: async (key: string, value: string) => {
            values.set(key, value);
        },
        removeItem: async (key: string) => {
            values.delete(key);
        },
    };
    const create = () => createCanvasAdmissionJournal(storage, "owner", () => scope);
    const task = (id = "first"): CreateTaskInput => ({
        projectId: "canvas",
        type: "canvas_image",
        model: "custom::image",
        prompt: "保留清晨的光线",
        input: {
            mode: "image",
            config: { apiKey: "private-model-key", secretKey: "private-signature", headers: [{ name: "Authorization", value: "private-header" }], baseUrl: "https://provider.invalid/model?token=private-query", count: "1" },
            metadata: {
                nodeId: id,
                clientOperationId: "canvas-image:" + id,
                canvasTaskDraft: {
                    node: { id, type: "image", title: "候选图", position: { x: 400, y: 100 }, width: 300, height: 200, metadata: { status: "loading" } },
                    connections: [{ id: "to-" + id, fromNodeId: "root", toNodeId: id, fromHandleId: "result", toHandleId: "input", fromAnchorRatio: 0.25 }],
                },
            },
        },
    });
    return {
        values,
        storage,
        create,
        task,
        setScope: (value: string) => {
            scope = value;
        },
    };
}
test("a fresh client restores the exact batch and all original identities without storing credentials", async () => {
    const f = fixture(),
        body: CanvasAdmissionBatch = {
            tasks: [f.task("first"), f.task("second")],
            root: { node: { id: "root", type: "image", title: "候选", position: { x: 20, y: 30 }, width: 300, height: 200, metadata: { isBatchRoot: true, batchChildIds: ["first", "second"] } }, connections: [] },
            retiredNodeIds: ["old-child"],
        };
    const record = await f.create().prepare("batch", body);
    const serialized = [...f.values.values()][0];
    for (const secret of ["private-model-key", "private-signature", "private-header", "private-query"]) expect(serialized).not.toContain(secret);
    const restored = await f.create().read(record.key);
    expect(restored?.operationIds).toEqual(["canvas-image:first", "canvas-image:second"]);
    const original = await f.create().replay(restored!, (task, index) => body.tasks[index].input!.config as Record<string, unknown>);
    expect(original).toEqual(body);
});
test("concurrent clients cannot overwrite an unresolved operation with a different prompt", async () => {
    const f = fixture(),
        original = f.task();
    const results = await Promise.allSettled([f.create().prepare("single", original), f.create().prepare("single", { ...original, prompt: "不同的提示词" })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(f.values.size).toBe(1);
});
test("an unavailable browser store rejects admission before a request can be sent", async () => {
    const f = fixture();
    f.storage.setItem = async () => {};
    await expect(f.create().prepare("single", f.task())).rejects.toThrow("尚未调用模型");
    expect(f.values.size).toBe(0);
});
test("switching accounts rejects reads, clears and replay of the original submission", async () => {
    const f = fixture(),
        record = await f.create().prepare("single", f.task());
    f.setScope("other");
    await expect(f.create().read(record.key)).rejects.toThrow("账号已切换");
    await expect(f.create().clear(record)).rejects.toThrow("账号已切换");
    await expect(f.create().replay(record, () => ({}))).rejects.toThrow("账号已切换");
    expect(f.values.size).toBe(1);
});
test("a credential change prevents replay while the owned lookup identity stays available", async () => {
    const f = fixture(),
        body = f.task(),
        record = await f.create().prepare("single", body);
    await expect(f.create().replay(record, () => ({ ...(body.input!.config as object), apiKey: "different" }))).rejects.toThrow("原渠道凭据已变化");
    expect((await f.create().read(record.key))?.operationIds).toEqual(["canvas-image:first"]);
});
test("tampered targets and parameters cannot be replayed", async () => {
    const f = fixture(),
        record = await f.create().prepare("single", f.task());
    const changed = JSON.parse(f.values.get(record.key)!);
    changed.request.prompt = "被修改的参数";
    f.values.set(record.key, JSON.stringify(changed));
    await expect(f.create().read(record.key)).rejects.toThrow("原生成参数已变化");
});
test("native receipts must match the whole batch and the original canvas before clearing", async () => {
    const f = fixture(),
        record = await f.create().prepare("batch", { tasks: [f.task("first"), f.task("second")] });
    const task = { id: "native-first", projectId: "canvas", clientOperationId: "canvas-image:first" } as GenerationTask;
    expect(() => f.create().verifyAccepted(record, [task])).toThrow("回执与原生成提交不一致");
    expect(() => f.create().verifyAccepted(record, [task, { ...task, id: "native-second", clientOperationId: "canvas-image:second", projectId: "other" }])).toThrow("回执与原生成提交不一致");
    expect(f.values.size).toBe(1);
});
test("accepted cleanup preserves every other pending request and unrelated scoped data", async () => {
    const f = fixture(),
        first = await f.create().prepare("single", f.task("first")),
        second = await f.create().prepare("single", f.task("second"));
    f.values.set("unrelated", "keep");
    await f.create().clear(first);
    expect((await f.create().list()).map((record) => record.key)).toEqual([second.key]);
    expect(f.values.get("unrelated")).toBe("keep");
});
test("editing the caller's object after prepare never changes the frozen request", async () => {
    const f = fixture(),
        body = f.task(),
        record = await f.create().prepare("single", body);
    body.prompt = "后续编辑";
    expect(((await f.create().read(record.key))!.request as CreateTaskInput).prompt).toBe("保留清晨的光线");
});
