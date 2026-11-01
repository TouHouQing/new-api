import { canonicalize } from "json-canonicalize";
import type { StateStorage } from "zustand/middleware";
import { ApiError } from "@/services/api/request";
import { performReviewOperation, readReviewReceipt, type ReviewOperation } from "@/services/api/project-reviews";

const kinds = new Set(["create", "comment", "comment-patch", "state", "member", "share", "revoke"]);
const queues = new Map<string, Promise<void>>();
async function serialize<T>(key: string, action: () => Promise<T>): Promise<T> {
    if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(`yingce-review:${key}`, action);
    const before = queues.get(key) || Promise.resolve();
    let release!: () => void;
    const turn = new Promise<void>((resolve) => {
        release = resolve;
    });
    queues.set(key, turn);
    await before;
    try {
        return await action();
    } finally {
        release();
        if (queues.get(key) === turn) queues.delete(key);
    }
}
/** One durable request identity per project. Receipts and share tokens are not
 * cached here. An unknown reply stays recoverable across refreshes. */
export function createProjectReviewSession(projectId: string, storage: StateStorage, api = { write: performReviewOperation, result: readReviewReceipt }, coordinationKey = projectId) {
    const key = `project-review-write:${projectId}`;
    const read = async (): Promise<ReviewOperation | null> => {
        const raw = await storage.getItem(key);
        if (!raw) return null;
        try {
            const operation = JSON.parse(raw) as ReviewOperation;
            if (raw.length > 65536 || !operation || !kinds.has(operation.kind) || !operation.input || typeof operation.input.requestId !== "string" || !/^[A-Za-z0-9._:-]{16,128}$/.test(operation.input.requestId)) throw new Error();
            if ("reviewId" in operation && (typeof operation.reviewId !== "string" || !operation.reviewId || operation.reviewId.length > 36)) throw new Error();
            return operation;
        } catch {
            throw new Error("上次审片操作记录无法读取，请保留本机数据并检查备份");
        }
    };
    return {
        read,
        async submit(operation: ReviewOperation) {
            return serialize(coordinationKey, async () => {
                const prior = await read();
                if (prior && canonicalize(prior) !== canonicalize(operation)) throw new Error("还有一项审片操作待确认，请先核对原操作");
                await storage.setItem(key, JSON.stringify(operation));
                if (canonicalize(await read()) !== canonicalize(operation)) throw new Error("本机未能保存审片操作编号，本次没有发送；请检查浏览器存储后重试");
                try {
                    return await api.write(projectId, operation);
                } catch (cause) {
                    try {
                        return await api.result(projectId, operation.input.requestId);
                    } catch (lookup) {
                        if (cause instanceof ApiError && [400, 403, 404, 409, 413, 429].includes(cause.status ?? 0) && lookup instanceof ApiError && lookup.status === 404) await storage.removeItem(key);
                        throw cause;
                    }
                }
            });
        },
        async recover() {
            const prior = await read();
            if (!prior) throw new Error("没有待核对的审片操作");
            // Replaying this exact identity also recovers a request that never
            // reached the server. The server's CAS and role checks still apply.
            return this.submit(prior);
        },
        async complete() {
            await serialize(coordinationKey, async () => {
                await storage.removeItem(key);
            });
        },
    };
}
