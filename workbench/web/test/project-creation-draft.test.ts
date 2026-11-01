import { expect, test } from "bun:test";
import { createProjectCreationDraftStore } from "@/services/project-creation-draft";
import type { ProjectCreationInput } from "@/services/api/projects";

const input = (key: string): ProjectCreationInput => ({
    name: "创作草稿",
    type: "short-drama",
    aspectRatio: "9:16",
    sourceType: "idea",
    idempotencyKey: key,
    creativeBrief: { version: 1, goal: "product", audience: "", keyMessage: "展示商品", targetDurationMs: 15000, language: "zh-CN", tone: "", constraints: [] },
    starter: { entry: "idea" },
});
test("project creation keeps exact unknown request and other window drafts across reopen", async () => {
    const values = new Map<string, string>();
    const storage = {
        getItem: async (key: string) => values.get(key) ?? null,
        setItem: async (key: string, value: string) => {
            values.set(key, value);
        },
        removeItem: async (key: string) => {
            values.delete(key);
        },
        keys: async () => [...values.keys()],
    };
    const a = createProjectCreationDraftStore(storage, "window-a"),
        b = createProjectCreationDraftStore(storage, "window-b");
    const first = input("create-original-request-1"),
        second = input("create-original-request-2");
    await Promise.all([a.write(first, first), b.write(second)]);
    const recovered = await createProjectCreationDraftStore(storage, "new-window").recover();
    expect(recovered).toHaveLength(2);
    expect(recovered.find((row) => row.key === a.key)?.draft.submitted).toEqual(first);
    await a.clear();
    expect((await b.recover()).map((row) => row.key)).toEqual([b.key]);
    await expect(b.write(second, { ...second, name: "different body" })).rejects.toThrow("不完整");
    expect((await b.recover())[0].draft.input).toEqual(second);
});
