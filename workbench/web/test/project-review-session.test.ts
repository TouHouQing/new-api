import { describe, expect, test } from "bun:test";
import { createProjectReviewSession } from "../src/services/project-review-session";
import { ApiError } from "../src/services/api/request";
import type { ReviewOperation } from "../src/services/api/project-reviews";

const operation: ReviewOperation = { kind: "comment", reviewId: "review", input: { requestId: "review-stable-request-0001", targetSha256: "a".repeat(64), message: "反馈", blocking: true, location: {} } };
const receipt = { result: { kind: "review-comment-create", replayed: true } };
function memory() {
    const data = new Map<string, string>();
    return {
        data,
        getItem: (key: string) => data.get(key) || null,
        setItem: (key: string, value: string) => {
            data.set(key, value);
        },
        removeItem: (key: string) => {
            data.delete(key);
        },
    };
}
describe("native review durable writes", () => {
    test("lost response recovers the original receipt and retains identity until UI has read the result", async () => {
        const storage = memory(),
            calls: string[] = [];
        const session = createProjectReviewSession("project", storage, {
            write: async (_p, value) => {
                expect(storage.data.size).toBe(1);
                calls.push(value.input.requestId);
                throw new Error("lost reply");
            },
            result: async (_p, id) => {
                calls.push(id);
                return receipt;
            },
        });
        expect(await session.submit(operation)).toEqual(receipt);
        expect(await session.read()).toEqual(operation);
        expect(calls).toEqual([operation.input.requestId, operation.input.requestId]);
        await session.complete();
        expect(await session.read()).toBeNull();
    });
    test("refresh keeps unknown writes and forbids a new identity from replacing pending input", async () => {
        const storage = memory(),
            api = {
                write: async () => {
                    throw new Error("network");
                },
                result: async () => {
                    throw new ApiError("not committed yet", { status: 404 });
                },
            };
        await expect(createProjectReviewSession("project", storage, api).submit(operation)).rejects.toThrow("network");
        const refreshed = createProjectReviewSession("project", storage, {
            write: async (_p, value) => {
                expect(value).toEqual(operation);
                return receipt;
            },
            result: api.result,
        });
        await expect(refreshed.submit({ ...operation, input: { ...operation.input, requestId: "another-stable-request-0001" } } as ReviewOperation)).rejects.toThrow("待确认");
        expect(await refreshed.recover()).toEqual(receipt);
    });
    test("a rejected CAS with no receipt allows a new explicit action; a broken local journal is retained", async () => {
        const storage = memory();
        const session = createProjectReviewSession("project", storage, {
            write: async () => {
                throw new ApiError("conflict", { status: 409 });
            },
            result: async () => {
                throw new ApiError("missing", { status: 404 });
            },
        });
        await expect(session.submit(operation)).rejects.toThrow("conflict");
        expect(await session.read()).toBeNull();
        storage.data.set("project-review-write:project", "invalid JSON");
        await expect(session.read()).rejects.toThrow("无法读取");
        expect(storage.data.size).toBe(1);
    });
    test("failure to persist intent never sends a write", async () => {
        let writes = 0;
        const storage = memory();
        const session = createProjectReviewSession(
            "project",
            {
                ...storage,
                setItem: () => {
                    throw new Error("disk full");
                },
            },
            {
                write: async () => {
                    writes++;
                    return receipt;
                },
                result: async () => receipt,
            },
        );
        await expect(session.submit(operation)).rejects.toThrow("disk full");
        expect(writes).toBe(0);
    });
    test("two panels cannot overwrite each other's pending request", async () => {
        const storage = memory();
        let release!: () => void,
            started!: () => void,
            writes = 0;
        const entered = new Promise<void>((resolve) => {
                started = resolve;
            }),
            gate = new Promise<void>((resolve) => {
                release = resolve;
            });
        const api = {
            write: async () => {
                writes++;
                started();
                await gate;
                return receipt;
            },
            result: async () => receipt,
        };
        const first = createProjectReviewSession("same-project", storage, api),
            second = createProjectReviewSession("same-project", storage, api);
        const one = first.submit(operation);
        await entered;
        const two = second.submit({ ...operation, input: { ...operation.input, requestId: "second-panel-request-0001" } } as ReviewOperation);
        release();
        await one;
        await expect(two).rejects.toThrow("待确认");
        expect(writes).toBe(1);
        expect(await first.read()).toEqual(operation);
    });
    test("a storage adapter that silently drops writes cannot send an untracked operation", async () => {
        let writes = 0;
        const storage = memory();
        const session = createProjectReviewSession(
            "project",
            { ...storage, setItem: () => undefined },
            {
                write: async () => {
                    writes++;
                    return receipt;
                },
                result: async () => receipt,
            },
        );
        await expect(session.submit(operation)).rejects.toThrow("本次没有发送");
        expect(writes).toBe(0);
    });
});
