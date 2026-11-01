import { describe, expect, test } from "bun:test";
import { createCutRenderSession } from "../src/services/cut-render-session";
import type { GenerationTask } from "../src/services/api/task-center";

const cut = { id: "fixed-cut", timelineSha256: "a".repeat(64) };
function memory() {
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
}
const task = (status: GenerationTask["status"]): GenerationTask => ({ id: "same-task", projectId: "project", type: "timeline_render", status }) as GenerationTask;

describe("fixed cut export intent", () => {
    test("stores intent before submission and recovers a lost response across a reopened session", async () => {
        const storage = memory(),
            requests: string[] = [];
        const api = {
            create: async (_project: string, _cut: string, input: { requestId: string }) => {
                expect(storage.data.size).toBe(1);
                requests.push(input.requestId);
                if (requests.length === 1) throw new Error("lost successful response");
                return task("succeeded");
            },
            read: async () => task("succeeded"),
        };
        await expect(createCutRenderSession("project", cut, storage, api).submit()).rejects.toThrow("lost successful response");
        const reopened = createCutRenderSession("project", cut, storage, api);
        expect((await reopened.submit()).id).toBe("same-task");
        expect(requests[0]).toBe(requests[1]);
        expect((await reopened.read())?.timelineSha256).toBe(cut.timelineSha256);
    });
    test("requires an observed terminal task before allocating another export intent", async () => {
        const storage = memory();
        let status: GenerationTask["status"] = "running";
        const api = { create: async () => task(status), read: async () => task(status) };
        const session = createCutRenderSession("project", cut, storage, api);
        await session.submit();
        const first = await session.read();
        await expect(session.prepareAnother()).rejects.toThrow("仍在执行");
        expect((await session.read())?.requestId).toBe(first?.requestId);
        status = "cancelled";
        await session.prepareAnother();
        expect(await session.read()).toBeNull();
        await session.submit();
        expect((await session.read())?.requestId).not.toBe(first?.requestId);
    });
    test("rejects stale or cross-project persisted intent without submitting a task", async () => {
        const storage = memory();
        let calls = 0;
        const api = {
            create: async () => {
                calls++;
                return task("queued");
            },
            read: async () => task("queued"),
        };
        const session = createCutRenderSession("project", cut, storage, api);
        await session.submit();
        calls = 0;
        const [key, raw] = [...storage.data.entries()][0];
        storage.data.set(key, JSON.stringify({ ...JSON.parse(raw), projectId: "other" }));
        await expect(session.submit()).rejects.toThrow("不匹配");
        expect(calls).toBe(0);
    });
});
