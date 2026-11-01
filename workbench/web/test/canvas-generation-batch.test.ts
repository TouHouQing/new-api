import { describe, expect, test } from "bun:test";
import { createDurableCanvasBatchRunner } from "@/services/canvas-generation-batch";
import { defaultConfig } from "@/stores/use-config-store";
import type { GenerationTask } from "@/services/api/task-center";

const inputs = () => ["first", "second", "third"].map((nodeId) => ({ projectId: "canvas", nodeId, clientOperationId: `canvas-image:${nodeId}`, mode: "image" as const, prompt: "晨光下的窗台", config: defaultConfig }));
describe("atomic native batch admission", () => {
    test("prepares all children and admits once before any observation, matching by original operation ID without list-only context", async () => {
        const source = inputs(),
            events: string[] = [],
            observed: string[] = [];
        const run = createDurableCanvasBatchRunner(
            source,
            {},
            {
                prepare: async (input) => {
                    events.push(`prepare:${input.clientOperationId}`);
                    return { type: "canvas_image", prompt: input.prompt };
                },
                admit: async (request) => {
                    events.push("admit");
                    expect(request.tasks).toHaveLength(3);
                    return source.map((input) => ({ id: `task-${input.nodeId}`, clientOperationId: input.clientOperationId, type: "canvas_image", status: "queued", prompt: "", attempts: 0, createdAt: "", updatedAt: "" })).reverse() as GenerationTask[];
                },
                wait: async (id, options) => {
                    expect(events.filter((event) => event.startsWith("prepare:"))).toHaveLength(3);
                    expect(events.filter((event) => event === "admit")).toHaveLength(1);
                    observed.push(id);
                    const complete = { ...options!.initialTask!, status: "succeeded" as const, resultJson: JSON.stringify({ mode: "image", images: [{ storageKey: `resource:${id}`, dataUrl: `/api/resources/${id}/file` }] }) };
                    options?.onTaskUpdate?.(complete);
                    return complete;
                },
            },
        );
        const bindings: string[] = [];
        const results = await Promise.all(source.map((input) => run({ ...input, onTaskCreated: (task) => bindings.push(`${input.nodeId}:${task.id}:${task.status}`) })));
        expect(observed.sort()).toEqual(["task-first", "task-second", "task-third"]);
        expect(bindings).toContain("first:task-first:succeeded");
        expect(results[0].images![0].storageKey).toBe("resource:task-first");
        expect(events.filter((event) => event === "admit")).toHaveLength(1);
    });
    test("a rejected batch starts no observers and does not retry individual model submissions", async () => {
        let admissions = 0,
            waits = 0;
        const source = inputs();
        const run = createDurableCanvasBatchRunner(
            source,
            {},
            {
                prepare: async () => ({ prompt: "原意图" }),
                admit: async () => {
                    admissions++;
                    throw new Error("积分不足，整批未执行");
                },
                wait: async () => {
                    waits++;
                    throw new Error("should not observe");
                },
            },
        );
        const results = await Promise.allSettled(source.map((input) => run(input)));
        expect(results.every((result) => result.status === "rejected")).toBe(true);
        expect(admissions).toBe(1);
        expect(waits).toBe(0);
    });
    test("aborting while references are prepared prevents admission", async () => {
        const controller = new AbortController(),
            source = inputs().map((input) => ({ ...input, signal: controller.signal }));
        let admissions = 0;
        const run = createDurableCanvasBatchRunner(
            source,
            {},
            {
                prepare: async () => {
                    controller.abort();
                    return { prompt: "原意图" };
                },
                admit: async () => {
                    admissions++;
                    return [];
                },
                wait: async () => {
                    throw new Error("should not observe");
                },
            },
        );
        const results = await Promise.allSettled(source.map((input) => run(input)));
        expect(results.every((result) => result.status === "rejected" && result.reason.name === "AbortError")).toBe(true);
        expect(admissions).toBe(0);
    });
    test("an incomplete receipt is visible and never causes automatic resubmission", async () => {
        let admissions = 0,
            waits = 0;
        const source = inputs();
        const run = createDurableCanvasBatchRunner(
            source,
            {},
            {
                prepare: async () => ({ prompt: "原意图" }),
                admit: async () => {
                    admissions++;
                    return [];
                },
                wait: async () => {
                    waits++;
                    throw new Error("should not observe");
                },
            },
        );
        await expect(run(source[0])).rejects.toThrow("批次提交回执不完整");
        await expect(run(source[1])).rejects.toThrow("批次提交回执不完整");
        expect(admissions).toBe(1);
        expect(waits).toBe(0);
    });
});
