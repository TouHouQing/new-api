import { expect, test } from "bun:test";
import { ApiError } from "../src/services/api/request";
import { createLegacySettingsReviewSession } from "../src/services/legacy-settings-review-session";
import type { CutReviewPreview, CutReviewRequest, CutReviewResult } from "../src/services/api/project-timeline";

const request: CutReviewRequest = { requestId: "explicit-review-session-0001", expectedRevision: 7, discardFields: ["regionalVersions.reframes"], previewToken: "a".repeat(64) };
const plan: CutReviewPreview = {
    cutId: "reviewed",
    backupCutId: "before",
    sourceCutId: "source",
    expectedRevision: 7,
    before: { clips: 1, tracks: 1, durationMs: 2000, sha256: "b".repeat(64) },
    discardFields: request.discardFields,
    previewToken: request.previewToken!,
};
const receipt: CutReviewResult = { kind: "legacy-settings-review", plan, appliedRevision: 8, replayed: true };
function cache() {
    const values = new Map<string, string>();
    return {
        values,
        getItem: async (key: string) => values.get(key) ?? null,
        setItem: async (key: string, value: string) => {
            values.set(key, value);
        },
        removeItem: async (key: string) => {
            values.delete(key);
        },
    };
}
test("confirmation is durable before an unknown reply and a refreshed session reuses its exact identity", async () => {
    const storage = cache(),
        calls: string[] = [];
    const api = {
        apply: async (_id: string, body: CutReviewRequest) => {
            expect(storage.values.size).toBe(1);
            calls.push(body.requestId);
            throw new Error("lost reply");
        },
        result: async () => {
            throw new Error("offline");
        },
    };
    const first = createLegacySettingsReviewSession("p", storage, api);
    await expect(first.submit({ request, plan })).rejects.toThrow("lost reply");
    const fresh = createLegacySettingsReviewSession("p", storage, {
        apply: async (_id, body) => {
            calls.push(body.requestId);
            return receipt;
        },
        result: async () => receipt,
    });
    const pending = await fresh.read();
    expect(pending).toEqual({ request, plan });
    expect(await fresh.submit(pending!)).toEqual(receipt);
    expect(calls).toEqual([request.requestId, request.requestId]);
    expect(await fresh.read()).not.toBeNull();
    await fresh.complete();
    expect(await fresh.read()).toBeNull();
});
test("failed durable storage prevents a review write and corrupt recovery is retained", async () => {
    const storage = cache();
    let writes = 0;
    const api = {
        apply: async () => {
            writes++;
            return receipt;
        },
        result: async () => receipt,
    };
    const failed = createLegacySettingsReviewSession(
        "p",
        {
            ...storage,
            setItem: async () => {
                throw new Error("disk full");
            },
        },
        api,
    );
    await expect(failed.submit({ request, plan })).rejects.toThrow("disk full");
    expect(writes).toBe(0);
    storage.values.set("legacy-settings-review:p", "broken-json");
    const corrupt = createLegacySettingsReviewSession("p", storage, api);
    await expect(corrupt.read()).rejects.toThrow("无法校验");
    await expect(corrupt.submit({ request, plan })).rejects.toThrow("无法校验");
    expect(storage.values.get("legacy-settings-review:p")).toBe("broken-json");
    expect(writes).toBe(0);
});
test("different projects and request identities cannot consume a pending confirmation", async () => {
    const storage = cache(),
        api = { apply: async () => receipt, result: async () => receipt };
    const current = createLegacySettingsReviewSession("p", storage, api);
    await current.submit({ request, plan });
    expect(await createLegacySettingsReviewSession("q", storage, api).read()).toBeNull();
    await expect(current.submit({ request: { ...request, requestId: "different-review-0001" }, plan })).rejects.toThrow("原编号");
});
test("definite stale rejection can be left for a new preview while network or server uncertainty stays pending", async () => {
    const storage = cache();
    const rejected = createLegacySettingsReviewSession("p", storage, {
        apply: async () => {
            throw new ApiError("stale", { status: 409 });
        },
        result: async () => {
            throw new ApiError("not committed", { status: 404 });
        },
    });
    await expect(rejected.submit({ request, plan })).rejects.toThrow("stale");
    expect(await rejected.read()).toBeNull();
    const uncertain = createLegacySettingsReviewSession("p", storage, {
        apply: async () => {
            throw new ApiError("server failed", { status: 500 });
        },
        result: async () => {
            throw new ApiError("not committed", { status: 404 });
        },
    });
    await expect(uncertain.submit({ request, plan })).rejects.toThrow("server failed");
    expect(await uncertain.read()).not.toBeNull();
});
