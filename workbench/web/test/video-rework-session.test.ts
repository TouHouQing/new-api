import { expect, test } from "bun:test";
import { createVideoReworkSession } from "../src/services/video-rework-session";
import type { VideoReworkCreateRequest, VideoReworkEdit } from "../src/types/video-rework";
import type { GenerationTask } from "../src/services/api/task-center";

const edit: VideoReworkEdit = {
    clipId: "occurrence-1",
    clipSha256: "a".repeat(64),
    sourceResourceId: "original",
    sourceSha256: "b".repeat(64),
    sourceStartMs: 500,
    sourceEndMs: 1500,
    candidateResourceId: "candidate",
    candidateSha256: "c".repeat(64),
    candidateStartMs: 250,
    audio: "original",
    region: { x: 17, y: 15, width: 31, height: 33 },
};
const task = (status: GenerationTask["status"]) => ({ id: "one-native-task", status }) as GenerationTask;
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
test("lost accepted reply, reopening and retries retain the complete original native body", async () => {
    const storage = memory(),
        calls: VideoReworkCreateRequest[] = [];
    const api = {
        create: async (_id: string, body: VideoReworkCreateRequest) => {
            expect(storage.data.size).toBe(1);
            calls.push(structuredClone(body));
            if (calls.length === 1) throw new Error("lost accepted response");
            return task("succeeded");
        },
        read: async () => task("succeeded"),
    };
    const first = createVideoReworkSession("project", edit.clipId, storage, api);
    const intent = await first.prepare(edit, 7);
    await expect(first.submit(intent.request.requestId)).rejects.toThrow("lost accepted");
    const reopened = createVideoReworkSession("project", edit.clipId, storage, api);
    expect((await reopened.verify())?.id).toBe("one-native-task");
    await reopened.submit(intent.request.requestId);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
    await expect(reopened.prepare({ ...edit, audio: "mute" }, 7)).rejects.toThrow("上一份");
    await expect(reopened.prepare(edit, 8)).rejects.toThrow("上一份");
});
test("an uncertain or running task cannot be discarded to silently create another intent", async () => {
    const storage = memory();
    let status: GenerationTask["status"] = "running",
        unknown = false;
    const api = {
        create: async () => task(status),
        read: async () => {
            if (unknown) throw new Error("404 unknown");
            return task(status);
        },
    };
    const session = createVideoReworkSession("project", edit.clipId, storage, api),
        intent = await session.prepare(edit, 1);
    await session.submit(intent.request.requestId);
    await expect(session.prepareAnother(intent.request.requestId)).rejects.toThrow("仍在处理");
    unknown = true;
    await expect(session.prepareAnother(intent.request.requestId)).rejects.toThrow("404");
    expect((await session.read())?.request).toEqual(intent.request);
    unknown = false;
    status = "cancelled";
    await session.prepareAnother(intent.request.requestId);
    expect(await session.read()).toBeNull();
    expect((await session.prepare(edit, 2)).request.requestId).not.toBe(intent.request.requestId);
});
test("two windows serialize conflicting preparations and cannot submit another window's intent", async () => {
    const storage = memory();
    let calls = 0;
    const api = {
        create: async () => {
            calls++;
            return task("queued");
        },
        read: async () => task("queued"),
    };
    const a = createVideoReworkSession("project", edit.clipId, storage, api),
        b = createVideoReworkSession("project", edit.clipId, storage, api);
    const results = await Promise.allSettled([a.prepare(edit, 1), b.prepare({ ...edit, audio: "candidate" }, 1)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(b.submit(crypto.randomUUID())).rejects.toThrow("另一个窗口");
    expect(calls).toBe(0);
});
test("storage failure, malformed region and cross-project records stop before any POST", async () => {
    const storage = memory();
    let calls = 0;
    const api = {
        create: async () => {
            calls++;
            return task("queued");
        },
        read: async () => task("queued"),
    };
    const session = createVideoReworkSession("project", edit.clipId, storage, api);
    await expect(session.prepare({ ...edit, region: { x: 0, y: 0, width: 0, height: 2 } }, 1)).rejects.toThrow("无效");
    await expect(
        createVideoReworkSession(
            "project",
            edit.clipId,
            {
                ...storage,
                setItem: async () => {
                    throw new Error("disk full");
                },
            },
            api,
        ).prepare(edit, 1),
    ).rejects.toThrow("disk full");
    await session.prepare(edit, 1);
    const [key, raw] = [...storage.data][0];
    storage.data.set(key, JSON.stringify({ ...JSON.parse(raw), projectId: "foreign" }));
    await expect(session.submit("unchanged-id")).rejects.toThrow("不匹配");
    expect(calls).toBe(0);
});
test("a fresh browser recovers the complete server-recorded intent without creating another task", async () => {
    const storage = memory();
    let posts = 0;
    const request = { requestId: "native-original-repair-0001", expectedRevision: 7, edit };
    const api = {
        create: async () => {
            posts++;
            return task("succeeded");
        },
        read: async () => task("succeeded"),
    };
    const session = createVideoReworkSession("project", edit.clipId, storage, api);
    const server = { ...task("succeeded"), type: "video_rework", projectId: "project", inputJson: JSON.stringify({ version: 1, projectId: "project", request, plan: { request: edit } }) };
    expect((await session.recover(server)).request).toEqual(request);
    expect((await createVideoReworkSession("project", edit.clipId, storage, api).read())?.request).toEqual(request);
    expect((await session.verify())?.id).toBe(server.id);
    expect(posts).toBe(0);
    await expect(session.recover({ ...server, projectId: "other-project" })).rejects.toThrow("不属于");
    await expect(session.recover({ ...server, inputJson: JSON.stringify({ version: 1, projectId: "project", request: { ...request, requestId: "another-repair-record-0001" }, plan: { request: edit } }) })).rejects.toThrow("先核对当前");
    expect((await session.read())?.request).toEqual(request);
});
