import { expect, test } from "bun:test";
import { createWorkingRenderSession } from "../src/services/working-render-session";
import { ApiError } from "../src/services/api/request";
import type { ProjectCutView } from "../src/services/api/project-cuts";
import type { GenerationTask } from "../src/services/api/task-center";

const memory = () => {
    const data = new Map<string, string>();
    return {
        data,
        getItem: async (key: string) => data.get(key) ?? null,
        setItem: async (key: string, value: string) => {
            data.set(key, value);
        },
        removeItem: async (key: string) => {
            data.delete(key);
        },
    };
};
const fixed = { cut: { id: "snapshot", timelineSha256: "a".repeat(64) }, timeline: { version: 2, tracks: [], clips: [], durationMs: 0 } } as unknown as ProjectCutView;
const task = { id: "one-task", status: "succeeded" } as GenerationTask;

test("a lost snapshot and queue response recover one fixed cut and one native task", async () => {
    const storage = memory(),
        cutRequests: string[] = [],
        renderRequests: string[] = [];
    let saved: ProjectCutView | undefined, queued: GenerationTask | undefined;
    const api = {
        createCut: async (_project: string, input: { requestId: string; expectedRevision: number; purpose?: string }) => {
            expect(storage.data.size).toBe(1);
            expect(input.expectedRevision).toBe(7);
            expect(input.purpose).toBe("export");
            cutRequests.push(input.requestId);
            saved = fixed;
            throw new Error("lost snapshot reply");
        },
        readCut: async () => {
            if (!saved) throw new ApiError("missing", { status: 404 });
            return saved;
        },
        render: async (_project: string, cutId: string, input: { requestId: string }) => {
            expect(cutId).toBe(fixed.cut.id);
            renderRequests.push(input.requestId);
            queued = task;
            throw new Error("lost queued reply");
        },
        readRender: async () => {
            if (!queued) throw new ApiError("missing", { status: 404 });
            return queued;
        },
    };
    const first = await createWorkingRenderSession("project", storage, api).submit(7);
    const recovered = await createWorkingRenderSession("project", storage, api).submit(999);
    expect(recovered.task.id).toBe(first.task.id);
    expect(new Set([...cutRequests, ...renderRequests]).size).toBe(1);
});

test("failure to save intent prevents both writes", async () => {
    let calls = 0;
    const storage = {
        ...memory(),
        setItem: async () => {
            throw new Error("quota");
        },
    };
    const api = {
        createCut: async () => {
            calls++;
            return fixed;
        },
        readCut: async () => fixed,
        render: async () => {
            calls++;
            return task;
        },
        readRender: async () => task,
    };
    await expect(createWorkingRenderSession("project", storage, api).submit(1)).rejects.toThrow("quota");
    expect(calls).toBe(0);
});

test("unknown queue state keeps the intent, while an observed terminal job permits a new export", async () => {
    const storage = memory();
    let state: GenerationTask["status"] = "running";
    const api = { createCut: async () => fixed, readCut: async () => fixed, render: async () => ({ ...task, status: state }), readRender: async () => ({ ...task, status: state }) };
    const session = createWorkingRenderSession("project", storage, api);
    await session.submit(1);
    const original = await session.read();
    await expect(session.prepareAnother()).rejects.toThrow("仍在执行");
    expect((await session.read())?.requestId).toBe(original?.requestId);
    state = "cancelled";
    await session.prepareAnother();
    expect(await session.read()).toBeNull();
    await session.submit(2);
    expect((await session.read())?.requestId).not.toBe(original?.requestId);
});

test("an uncertain read cannot discard the original export intent", async () => {
    const storage = memory();
    const api = {
        createCut: async () => fixed,
        readCut: async () => {
            throw new Error("offline");
        },
        render: async () => task,
        readRender: async () => task,
    };
    const session = createWorkingRenderSession("project", storage, api);
    await session.submit(1);
    await expect(session.prepareAnother()).rejects.toThrow("offline");
    expect(await session.read()).not.toBeNull();
});

test("explicitly abandoning a confirmed unsubmitted snapshot can start from the new revision", async () => {
    const storage = memory();
    const api = {
        createCut: async () => {
            throw new ApiError("revision changed", { status: 409 });
        },
        readCut: async () => {
            throw new ApiError("missing", { status: 404 });
        },
        render: async () => task,
        readRender: async () => task,
    };
    const session = createWorkingRenderSession("project", storage, api);
    await expect(session.submit(1)).rejects.toThrow("revision changed");
    expect(await session.read()).not.toBeNull();
    await session.prepareAnother();
    expect(await session.read()).toBeNull();
});

test("corrupt or cross-project persisted intents cannot submit or queue", async () => {
    const storage = memory();
    let calls = 0;
    const api = {
        createCut: async () => {
            calls++;
            return fixed;
        },
        readCut: async () => fixed,
        render: async () => task,
        readRender: async () => task,
    };
    const session = createWorkingRenderSession("project", storage, api);
    await session.submit(1);
    calls = 0;
    const [key, raw] = [...storage.data.entries()][0];
    storage.data.set(key, JSON.stringify({ ...JSON.parse(raw), projectId: "foreign" }));
    await expect(session.submit()).rejects.toThrow("不匹配");
    expect(calls).toBe(0);
});
