import { localForageStorageForScope } from "@/lib/localforage-storage";
import type { CloudAgentConversation } from "@/services/cloud-agent-conversations";

// Retain old per-canvas journals and retry keys while moving the UI to the
// upstream account-wide Agent. The old records remain available for recovery.
export async function migrateCanvasAgentJournals(scope: string) {
    const storage = localForageStorageForScope(scope);
    const keys = await storage.keys();
    const conversations: CloudAgentConversation[] = [];
    for (const key of keys.filter((key) => key.startsWith("cloud-agent-conversations-v1:") && !key.includes(":pending:"))) {
        const value = await storage.getItem(key);
        if (!value) continue;
        const document: unknown = JSON.parse(value);
        if (!document || typeof document !== "object" || !("conversations" in document) || !Array.isArray(document.conversations)) throw new Error("历史画布对话格式无效，原记录已保留");
        const canvas = decodeURIComponent(key.slice("cloud-agent-conversations-v1:".length));
        for (const item of document.conversations as CloudAgentConversation[]) {
            if (!item || typeof item.id !== "string" || !Array.isArray(item.messages) || typeof item.title !== "string") throw new Error("历史画布对话格式无效，原记录已保留");
            const id = `legacy:${encodeURIComponent(canvas)}:${item.id}`;
            const pending = await storage.getItem(`cloud-agent-conversations-v1:pending:${encodeURIComponent(canvas)}:${encodeURIComponent(item.id)}`);
            if (pending) {
                const parsed = JSON.parse(pending) as { key?: string; fingerprint?: string };
                if (!parsed.key || !parsed.fingerprint) throw new Error("历史待确认请求损坏，请核对创作历史；原记录已保留");
                await storage.setItem(`cloud-agent-conversations-v2:pending:${encodeURIComponent(id)}`, pending);
            }
            conversations.push({ ...item, id, localSelectedCanvasId: canvas, messages: item.messages.map((message) => ({ ...message, streaming: false })) });
        }
    }
    conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { version: 1 as const, activeId: conversations[0]?.id ?? null, conversations };
}
