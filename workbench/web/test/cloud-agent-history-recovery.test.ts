import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { http } from "@/services/api/request";
import * as storage from "@/lib/localforage-storage";
import { loadCloudAgentConversations, recoverCloudAgentConversations, restoreCloudAgentConversation, type CloudAgentConversation } from "@/services/cloud-agent-legacy-conversations";

afterEach(() => mock.restore());
const stub: CloudAgentConversation = { id: "server-run:owned-run", serverRunId: "owned-run", title: "历史对话", messages: [], run: null, permissionMode: "read_only", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };

test("restores the original request, actual permission and owned run for journal replay", async () => {
    const run = { id: "owned-run", canvasId: "owned-canvas", permissionMode: "request_approval", status: "waiting_approval", skills: [{ id: "owned-skill" }] };
    spyOn(http, "get").mockResolvedValue({ run, prompt: "保留原图，切成六张" } as never);
    const restored = await restoreCloudAgentConversation("owned-canvas", stub);
    expect(restored.run).toEqual(run);
    expect(restored.permissionMode).toBe("request_approval");
    expect(restored.messages).toEqual([{ id: "server-user:owned-run", role: "user", text: "保留原图，切成六张" }]);
    expect(restored.skillIds).toEqual(["owned-skill"]);
    expect(restored.model).toBeUndefined();
});

test("rejects a mismatched native run or canvas before exposing its transcript", async () => {
    const get = spyOn(http, "get");
    get.mockResolvedValueOnce({ run: { id: "owned-run", canvasId: "other-canvas" }, prompt: "foreign" } as never);
    await expect(restoreCloudAgentConversation("owned-canvas", stub)).rejects.toThrow("历史运行与当前画布不一致");
    get.mockResolvedValueOnce({ run: { id: "other-run", canvasId: "owned-canvas" }, prompt: "foreign" } as never);
    await expect(restoreCloudAgentConversation("owned-canvas", stub)).rejects.toThrow("历史运行与当前画布不一致");
});

test("keeps paginated history lazy and passes the native cursor without dropping entries", async () => {
    const get = spyOn(http, "get").mockResolvedValue({ items: [{ id: "owned-run", canvasId: "owned-canvas", title: "切图", createdAt: stub.createdAt, updatedAt: stub.updatedAt }], hasMore: true, nextCursor: "native-next" } as never);
    const page = await recoverCloudAgentConversations("owned-canvas", "native-before");
    expect(page.nextCursor).toBe("native-next");
    expect(page.conversations[0]).toMatchObject({ serverRunId: "owned-run", run: null, messages: [] });
    expect(get).toHaveBeenCalledWith("/agent/history", { params: { canvasId: "owned-canvas", cursor: "native-before", limit: 20 }, signal: undefined });
});

test("rejects a foreign history page and an incomplete pagination receipt", async () => {
    const get = spyOn(http, "get");
    get.mockResolvedValueOnce({ items: [{ canvasId: "other-canvas" }], hasMore: false } as never);
    await expect(recoverCloudAgentConversations("owned-canvas")).rejects.toThrow("服务端历史记录范围或分页无效");
    get.mockResolvedValueOnce({ items: [], hasMore: true } as never);
    await expect(recoverCloudAgentConversations("owned-canvas")).rejects.toThrow("服务端历史记录范围或分页无效");
});

function localHistory(conversation: CloudAgentConversation) {
    const setItem = mock(async () => {});
    spyOn(storage, "localForageStorageForScope").mockReturnValue({ getItem: async () => JSON.stringify({ version: 1, activeId: conversation.id, conversations: [conversation] }), setItem, removeItem: async () => {}, keys: async () => [] });
    return setItem;
}

test("a linked native run opens directly while preserving another local conversation and its messages", async () => {
    const local = { ...stub, id: "local-conversation", serverRunId: undefined, messages: [{ id: "kept", role: "user" as const, text: "保留这份本机对话" }] };
    localHistory(local);
    const get = spyOn(http, "get").mockResolvedValue({
        run: { id: "owned-run", canvasId: "owned-canvas", permissionMode: "request_approval", status: "waiting_approval", createdAt: stub.createdAt, updatedAt: stub.updatedAt },
        prompt: "切成六张",
    } as never);
    const document = await loadCloudAgentConversations("owned-canvas", "owned-run");
    expect(document.activeId).toBe("server-run:owned-run");
    expect(document.conversations).toHaveLength(2);
    expect(document.conversations[0].run?.status).toBe("waiting_approval");
    expect(document.conversations[0].createdAt).toBe(stub.createdAt);
    expect(document.conversations[1]).toEqual(local);
    expect(get).toHaveBeenCalledTimes(1);
});

test("a linked run already present locally retains its transcript and identity", async () => {
    const local = { ...stub, id: "local-original", run: { id: "owned-run", canvasId: "owned-canvas", status: "completed" } as never };
    localHistory(local);
    const get = spyOn(http, "get");
    const document = await loadCloudAgentConversations("owned-canvas", "owned-run");
    expect(document.activeId).toBe(local.id);
    expect(document.conversations).toEqual([local]);
    expect(get).not.toHaveBeenCalled();
});

test("invalid and foreign run links cannot overwrite stored conversation history", async () => {
    const setItem = localHistory({ ...stub, serverRunId: undefined });
    const get = spyOn(http, "get").mockResolvedValue({ run: { id: "owned-run", canvasId: "other-canvas" }, prompt: "foreign" } as never);
    await expect(loadCloudAgentConversations("owned-canvas", "../foreign")).rejects.toThrow("运行链接无效");
    expect(get).not.toHaveBeenCalled();
    await expect(loadCloudAgentConversations("owned-canvas", "owned-run")).rejects.toThrow("历史运行与当前画布不一致");
    expect(setItem).not.toHaveBeenCalled();
});
