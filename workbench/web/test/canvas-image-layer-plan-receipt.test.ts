import { expect, test } from "bun:test";
import { readNativeImageLayerPlan, type NativeImageLayerPlanReceipt } from "@/lib/canvas/canvas-image-layer-plan-receipt";
import { latestImageLayerPlan } from "@/lib/canvas/canvas-image-layer-plan";
import type { GenerationTask } from "@/services/api/task-center";

const hash = "a".repeat(64);
const receipt: NativeImageLayerPlanReceipt = {
    version: 1,
    taskId: "plan-task",
    sourceNodeId: "source-node",
    resourceId: "original",
    source: { sha256: hash, width: 1600, height: 800, orientation: 1, format: "png" },
    referenceSize: { width: 1000, height: 500 },
    referenceSha256: "b".repeat(64),
    purpose: "materials",
    status: "ready",
    plan: {
        layers: [
            { name: "原图底板", description: "完整原图", kind: "background", generation: { prompt: "保留原图", background: "opaque" }, extraction: { method: "source" } },
            { name: "照片", description: "完整嵌入照片", kind: "object", generation: { prompt: "保留原像素", background: "transparent" }, extraction: { method: "source-region" } },
        ],
    },
};
const expected = { taskId: "plan-task", sourceNodeId: "source-node", storageKey: "resource:original", sha256: hash, purpose: "materials" as const };

test("uses the durable normalized proposal without parsing or inferring model output", () => {
    const plan = readNativeImageLayerPlan(receipt, expected);
    expect(plan.taskId).toBe("plan-task");
    expect(plan.layers[1].extraction).toEqual({ method: "source-region" });
    expect(plan.layers[1].bbox).toBeUndefined();
});

test("rejects stale source, purpose and task receipts while surfacing incomplete visual planning", () => {
    for (const change of [{ storageKey: "resource:replacement" }, { sha256: "c".repeat(64) }, { taskId: "another-task" }, { purpose: "recompose" as const }])
        expect(() => readNativeImageLayerPlan(receipt, { ...expected, ...change })).toThrow("原图不一致");
    expect(() => readNativeImageLayerPlan({ ...receipt, status: "needs_correction", plan: undefined, reason: "模型无法识别原图" }, expected)).toThrow("模型无法识别原图");
});

test("reopens an older usable stored plan after a newer invalid model reply without using the raw text", () => {
    const task = {
        id: "plan-task",
        projectId: "canvas",
        type: "canvas_text",
        status: "succeeded",
        model: "local-vision",
        createdAt: "2026-10-29T00:00:00Z",
        inputJson: JSON.stringify({ metadata: { edit: "layer-planning", sourceNodeId: "source-node", sourceStorageKey: "resource:original", nativeLayerPlanning: { source: receipt.source } } }),
        resultJson: JSON.stringify({ text: "this raw text is deliberately not JSON", imageLayerPlanning: receipt }),
    } as GenerationTask;
    const newer = { ...task, id: "invalid-task", createdAt: "2026-10-29T01:00:00Z", resultJson: JSON.stringify({ text: "not usable", imageLayerPlanning: { ...receipt, taskId: "invalid-task", status: "needs_correction", plan: undefined } }) };
    expect(latestImageLayerPlan([newer, task], "canvas", "source-node", "resource:original")?.taskId).toBe("plan-task");
    expect(latestImageLayerPlan([task], "canvas", "source-node", "resource:other")).toBeUndefined();
});
