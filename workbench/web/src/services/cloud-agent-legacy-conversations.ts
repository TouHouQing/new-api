// Compatibility reader for historical per-canvas journals. New UI uses the account-wide Agent.
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { markdownPlainText } from "@/lib/markdown-plain-text";
import { getActiveUserScope } from "@/lib/user-scope";
import type { AgentPermissionMode, AgentRun } from "@/services/api/agent";
import { getAgentHistory, restoreAgentRun } from "@/services/api/agent";

export type CloudAgentMessagePresentation = {
    displayText?: string;
    canvasReferenceNodeId?: string;
};

export type CloudAgentConversationMessage = {
    id: string;
    role: "user" | "assistant" | "system" | "tool" | "error";
    title?: string;
    text: string;
    streaming?: boolean;
    reasoning?: boolean;
    planItems?: Array<{ id: string; title: string; status: "pending" | "doing" | "done" }>;
    planTerminal?: boolean;
    question?: { question: string; options: Array<{ label: string; detail?: string }>; allowFreeform?: boolean };
    meta?: string;
    detail?: unknown;
    attachments?: Array<{ id: string; name: string; url: string }>;
    interjection?: "sent" | "undelivered";
};

export type CloudAgentConversation = {
    serverRunId?: string;
    id: string;
    title: string;
    messages: CloudAgentConversationMessage[];
    run: AgentRun | null;
    model?: string;
    permissionMode: AgentPermissionMode;
    skillIds?: string[];
    createdAt: string;
    updatedAt: string;
};

type CloudAgentConversationDocument = {
    serverCursor?: string;
    version: 1;
    activeId: string | null;
    conversations: CloudAgentConversation[];
};

export type CloudAgentPendingSubmission = CloudAgentMessagePresentation & {
    fingerprint: string;
    key: string;
    request?: import("@/services/api/agent").CreateAgentRunInput;
    parentRunId?: string;
    messageId?: string;
};

const CLOUD_AGENT_CONVERSATIONS_KEY = "cloud-agent-conversations-v1";

export async function loadCloudAgentConversations(canvasId: string, requestedRunId?: string): Promise<CloudAgentConversationDocument> {
    if (requestedRunId && !/^[A-Za-z0-9_-]{1,80}$/.test(requestedRunId)) throw new Error("运行链接无效");
    const scope = getActiveUserScope();
    const document = await loadSavedCloudAgentConversations(canvasId, Boolean(requestedRunId));
    if (scope !== getActiveUserScope()) throw new DOMException("账号已切换", "AbortError");
    if (!requestedRunId) return document;
    const existing = document.conversations.find((conversation) => conversation.serverRunId === requestedRunId || conversation.run?.id === requestedRunId);
    if (existing) return { ...document, activeId: existing.id };
    const now = new Date().toISOString();
    const restored = await restoreCloudAgentConversation(canvasId, {
        id: `server-run:${requestedRunId}`,
        serverRunId: requestedRunId,
        title: "历史对话",
        messages: [],
        run: null,
        permissionMode: "read_only",
        createdAt: now,
        updatedAt: now,
    });
    if (scope !== getActiveUserScope()) throw new DOMException("账号已切换", "AbortError");
    return { ...document, activeId: restored.id, conversations: [restored, ...document.conversations] };
}

async function loadSavedCloudAgentConversations(canvasId: string, linkedRun: boolean): Promise<CloudAgentConversationDocument> {
    if (!canvasId) throw new Error("缺少画布 ID，无法读取 Agent 对话");
    const value = await localForageStorageForScope(getActiveUserScope()).getItem(storageKey(canvasId));
    if (!value) {
        if (linkedRun) return emptyDocument();
        const page = await recoverCloudAgentConversations(canvasId);
        if (!page.conversations.length) return emptyDocument();
        page.conversations[0] = await restoreCloudAgentConversation(canvasId, page.conversations[0]);
        return { version: 1, activeId: page.conversations[0].id, conversations: page.conversations, serverCursor: page.nextCursor };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        throw new Error("Agent 对话历史已损坏");
    }
    if (!isConversationDocument(parsed)) throw new Error("Agent 对话历史格式无效");
    return parsed;
}

export async function recoverCloudAgentConversations(canvasId: string, cursor?: string) {
    const scope = getActiveUserScope();
    const page = await getAgentHistory(canvasId, cursor);
    if (scope !== getActiveUserScope()) throw new DOMException("账号已切换", "AbortError");
    if (page.items.some((item) => item.canvasId !== canvasId) || (page.hasMore && !page.nextCursor)) throw new Error("服务端历史记录范围或分页无效");
    return {
        conversations: page.items.map((item): CloudAgentConversation => ({
            id: `server-run:${item.id}`,
            serverRunId: item.id,
            title: item.title || "历史对话",
            messages: [],
            run: null,
            permissionMode: "read_only",
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        })),
        nextCursor: page.hasMore ? page.nextCursor : undefined,
    };
}

export async function restoreCloudAgentConversation(canvasId: string, conversation: CloudAgentConversation): Promise<CloudAgentConversation> {
    if (!conversation.serverRunId || conversation.run) return conversation;
    const scope = getActiveUserScope();
    const restored = await restoreAgentRun(conversation.serverRunId);
    if (scope !== getActiveUserScope()) throw new DOMException("账号已切换", "AbortError");
    if (restored.run.id !== conversation.serverRunId || restored.run.canvasId !== canvasId) throw new Error("历史运行与当前画布不一致");
    const messages: CloudAgentConversationMessage[] = [{ id: `server-user:${restored.run.id}`, role: "user", text: restored.prompt }];
    return {
        ...conversation,
        title: cloudAgentConversationTitle(messages),
        messages,
        run: restored.run,
        permissionMode: restored.run.permissionMode,
        skillIds: restored.run.skills?.map((skill) => skill.id),
        createdAt: restored.run.createdAt || conversation.createdAt,
        updatedAt: restored.run.updatedAt || conversation.updatedAt,
    };
}

export async function saveCloudAgentConversations(canvasId: string, activeId: string | null, conversations: CloudAgentConversation[]) {
    if (!canvasId) throw new Error("缺少画布 ID，无法保存 Agent 对话");
    // 流式标记只属于内存中的观察状态。若网络在最后一个 delta 后断开，
    // 也不能让下次恢复把思考卡片误判为仍在实时展开。
    const persistedConversations = conversations.map((conversation) => ({
        ...conversation,
        messages: conversation.messages.map((message) => ({ ...message, streaming: false })),
    }));
    const document: CloudAgentConversationDocument = { version: 1, activeId, conversations: persistedConversations };
    await localForageStorageForScope(getActiveUserScope()).setItem(storageKey(canvasId), JSON.stringify(document));
}

// Keep the retry key outside the chat snapshot. If the response is lost, a
// page refresh can safely repeat the same request without creating another
// billed Agent turn.
export async function loadCloudAgentPendingSubmission(canvasId: string, conversationId: string) {
    if (!canvasId || !conversationId) return null;
    const value = await localForageStorageForScope(getActiveUserScope()).getItem(pendingStorageKey(canvasId, conversationId));
    if (value === null || value === undefined) return null;
    // A corrupt recovery record is not proof that the previous POST never ran.
    // Fail closed rather than discarding its identity and risking another charge.
    try {
        const parsed = JSON.parse(value) as Partial<CloudAgentPendingSubmission> | null;
        if (!parsed || typeof parsed.fingerprint !== "string" || typeof parsed.key !== "string" || parsed.key.length < 8) throw new Error("invalid identity");
        if (parsed.request !== undefined && (!parsed.request || parsed.request.idempotencyKey !== parsed.key || parsed.request.canvasId !== canvasId || typeof parsed.request.prompt !== "string")) throw new Error("invalid request");
        if (parsed.parentRunId !== undefined && typeof parsed.parentRunId !== "string") throw new Error("invalid parent");
        if (parsed.messageId !== undefined && typeof parsed.messageId !== "string") throw new Error("invalid message");
        return {
            fingerprint: parsed.fingerprint,
            key: parsed.key,
            request: parsed.request,
            parentRunId: parsed.parentRunId,
            messageId: parsed.messageId,
            displayText: parsed.displayText,
            canvasReferenceNodeId: parsed.canvasReferenceNodeId,
        } satisfies CloudAgentPendingSubmission;
    } catch {
        throw new Error("待确认请求记录损坏，已暂停本对话发送；请先在任务中心核对原运行，不要直接重复生成");
    }
}

export async function saveCloudAgentPendingSubmission(canvasId: string, conversationId: string, pending: CloudAgentPendingSubmission) {
    if (!canvasId || !conversationId) throw new Error("缺少 Agent 对话范围，无法保存幂等提交");
    await localForageStorageForScope(getActiveUserScope()).setItem(pendingStorageKey(canvasId, conversationId), JSON.stringify(pending));
}

export async function clearCloudAgentPendingSubmission(canvasId: string, conversationId: string) {
    if (!canvasId || !conversationId) return;
    await localForageStorageForScope(getActiveUserScope()).removeItem(pendingStorageKey(canvasId, conversationId));
}

export function cloudAgentConversationTitle(messages: CloudAgentConversationMessage[]) {
    const firstPrompt = displayConversationTitle(messages.find((message) => message.role === "user")?.text || "");
    return firstPrompt.length > 28 ? `${firstPrompt.slice(0, 28)}...` : firstPrompt;
}

function displayConversationTitle(value: string) {
    return markdownPlainText(value.replace(/@\[skill:[^\]]+\]/gu, "技能包")) || "新对话";
}

function storageKey(canvasId: string) {
    return `${CLOUD_AGENT_CONVERSATIONS_KEY}:${encodeURIComponent(canvasId)}`;
}

function pendingStorageKey(canvasId: string, conversationId: string) {
    return `${CLOUD_AGENT_CONVERSATIONS_KEY}:pending:${encodeURIComponent(canvasId)}:${encodeURIComponent(conversationId)}`;
}

function emptyDocument(): CloudAgentConversationDocument {
    return { version: 1, activeId: null, conversations: [] };
}

function isConversationDocument(value: unknown): value is CloudAgentConversationDocument {
    if (!value || typeof value !== "object") return false;
    const document = value as Partial<CloudAgentConversationDocument>;
    if (document.version !== 1 || !Array.isArray(document.conversations)) return false;
    return document.conversations.every((conversation) => {
        if (!conversation || typeof conversation !== "object") return false;
        const candidate = conversation as Partial<CloudAgentConversation>;
        return (
            typeof candidate.id === "string" &&
            typeof candidate.title === "string" &&
            Array.isArray(candidate.messages) &&
            typeof candidate.createdAt === "string" &&
            typeof candidate.updatedAt === "string" &&
            ["read_only", "auto", "request_approval"].includes(candidate.permissionMode || "")
        );
    });
}
