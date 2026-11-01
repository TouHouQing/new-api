import { test, expect } from "bun:test";
import { createWorkflowSubmissionSession } from "@/services/workflow-submission-session";
import { ApiError } from "@/services/api/request";
import type { CreateTaskInput, GenerationTask } from "@/services/api/task-center";

const identity = { scope: "owner", projectId: "project", unitId: "chapter", shotId: "shot", stage: "storyboard" };
function fixture() {
    const values = new Map<string, string>(),
        created: CreateTaskInput[] = [];
    let accepted: GenerationTask | undefined,
        scope = "owner",
        lost = false,
        lookupLost = false;
    const request: CreateTaskInput = {
        projectId: "project",
        type: "canvas_image",
        operation: "image",
        prompt: "原来的镜头",
        model: "local-image",
        input: {
            mode: "image",
            config: { apiKey: "private-model-key", secretKey: "private-signature", quality: "high" },
            metadata: { domainProjectId: "project", unitId: "chapter", shotId: "shot", shotRevisionId: "fixed-revision" },
            referenceImages: [{ resourceId: "original-image" }],
        },
    };
    const storage = {
        getItem: async (key: string) => values.get(key) || null,
        setItem: async (key: string, value: string) => {
            values.set(key, value);
        },
        removeItem: async (key: string) => {
            values.delete(key);
        },
    };
    const api = {
        scope: () => scope,
        createId: () => "00000000-0000-0000-0000-000000000001",
        createTask: async (body: CreateTaskInput) => {
            created.push(structuredClone(body));
            accepted ??= { id: "task", projectId: "project", clientOperationId: (body.input!.metadata as Record<string, string>).clientOperationId, status: "queued" } as GenerationTask;
            if (lost) throw new Error("reply lost");
            return accepted;
        },
        findTask: async () => {
            if (lookupLost) throw new Error("lookup lost");
            if (!accepted) throw new ApiError("not found", { status: 404 });
            return accepted;
        },
    };
    return {
        values,
        storage,
        api,
        request,
        created,
        session: () => createWorkflowSubmissionSession(identity, storage, api),
        setLost: (value: boolean) => {
            lost = value;
        },
        setLookupLost: (value: boolean) => {
            lookupLost = value;
        },
        setScope: (value: string) => {
            scope = value;
        },
        removeTask: () => {
            accepted = undefined;
        },
    };
}
test("lost submit and lookup replies survive a new client without storing provider secrets", async () => {
    const f = fixture();
    f.setLost(true);
    f.setLookupLost(true);
    await expect(f.session().submit(f.request)).rejects.toThrow("结果尚未确认");
    expect(f.created).toHaveLength(1);
    const stored = [...f.values.values()].join("");
    expect(stored).not.toContain("private-model-key");
    expect(stored).not.toContain("private-signature");
    expect(stored).toContain("original-image");
    f.setLookupLost(false);
    const task = await f.session().recover();
    expect(task?.id).toBe("task");
    expect(f.created).toHaveLength(1);
    expect(f.values.size).toBe(0);
});
test("an explicit retry sends the exact original request and operation after a 404 lookup", async () => {
    const f = fixture();
    f.setLost(true);
    f.setLookupLost(true);
    await expect(f.session().submit(f.request)).rejects.toThrow();
    f.removeTask();
    f.setLookupLost(false);
    f.setLost(false);
    expect(await f.session().recover()).toBeNull();
    const before = structuredClone(f.created[0]);
    f.request.prompt = "后来修改的提示词";
    await f.session().recover(true, { apiKey: "private-model-key", secretKey: "private-signature" });
    expect(f.created).toHaveLength(2);
    expect(f.created[1]).toEqual(before);
    expect(f.values.size).toBe(0);
});
test("changed credentials cannot silently rewrite an unresolved original generation", async () => {
    const f = fixture();
    f.setLost(true);
    f.setLookupLost(true);
    await expect(f.session().submit(f.request)).rejects.toThrow();
    f.removeTask();
    f.setLookupLost(false);
    await expect(f.session().recover(true, { apiKey: "new-key", secretKey: "private-signature" })).rejects.toThrow("凭据已变化");
    expect(f.created).toHaveLength(1);
    expect(f.values.size).toBe(1);
});
test("two clients cannot overwrite an unresolved operation with another prompt", async () => {
    const f = fixture();
    f.setLost(true);
    f.setLookupLost(true);
    const attempts = await Promise.allSettled([f.session().submit(f.request), f.session().submit({ ...f.request, prompt: "另一个窗口" })]);
    expect(attempts.every((value) => value.status === "rejected")).toBe(true);
    expect(f.created).toHaveLength(1);
    expect(f.values.size).toBe(1);
});
test("a definite validation rejection clears only its own unaccepted journal", async () => {
    const f = fixture();
    f.api.createTask = async () => {
        throw new ApiError("invalid fixed reference", { status: 400 });
    };
    await expect(f.session().submit(f.request)).rejects.toThrow("invalid fixed reference");
    expect(f.values.size).toBe(0);
});
test("storage failure prevents any model submission", async () => {
    const f = fixture();
    f.storage.setItem = async () => {};
    await expect(f.session().submit(f.request)).rejects.toThrow("记录未能保存");
    expect(f.created).toHaveLength(0);
});
test("account switches prevent both querying and replaying another account's submission", async () => {
    const f = fixture();
    f.setLost(true);
    f.setLookupLost(true);
    await expect(f.session().submit(f.request)).rejects.toThrow();
    f.setScope("other");
    await expect(f.session().recover(true)).rejects.toThrow("账号已切换");
    expect(f.created).toHaveLength(1);
});
test("tampered original parameters cannot be replayed", async () => {
    const f = fixture();
    f.setLost(true);
    f.setLookupLost(true);
    await expect(f.session().submit(f.request)).rejects.toThrow();
    const [key, value] = [...f.values][0],
        record = JSON.parse(value);
    record.request.prompt = "被改动的原参数";
    f.values.set(key, JSON.stringify(record));
    await expect(f.session().recover(true)).rejects.toThrow("参数已变化");
    expect(f.created).toHaveLength(1);
});
