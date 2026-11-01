import { expect, test } from "bun:test";
import { confirmedImageLayerWorkflow } from "@/lib/canvas/confirmed-image-layer-workflow";
import type { ImageLayerPlan } from "@/lib/canvas/canvas-image-layer-plan";

const source = { sourceNodeId: "original", resourceId: "photo", sha256: "a".repeat(64), width: 1600, height: 800 };
const plan: ImageLayerPlan = {
    taskId: "saved-plan",
    source: { ...source, purpose: "materials" },
    layers: [
        { name: "原图", description: "完整原图", kind: "background", generation: { prompt: "保留完整原图", background: "opaque" }, extraction: { method: "source" } },
        {
            name: "完整照片",
            description: "右侧整张照片",
            kind: "object",
            generation: { prompt: "保留完整照片", background: "transparent" },
            extraction: { method: "source-region", region: { bbox: [510, 50, 950, 900], shape: "rounded-rect", radiusRatio: 0.05 } },
        },
    ],
};

test("reviewed original-pixel layers need no image model, preserving shape, full canvas and original hash", () => {
    const request = confirmedImageLayerWorkflow(plan, source, 0);
    expect(request.expectedSourceSha256).toBe(source.sha256);
    expect(request.layers[1]).toMatchObject({ method: "source-region", region: { width: 1600, height: 800, bbox: [510, 50, 950, 900], shape: "rounded-rect", radiusRatio: 0.05 } });
    expect(request.layers.every((layer) => !layer.generation && !layer.removal)).toBe(true);
});

test("review cannot admit missing bounds, changed source, unbound legacy proposal, or contradictory background removal", () => {
    expect(() => confirmedImageLayerWorkflow({ ...plan, source: undefined }, source, 0)).toThrow("原图已变化");
    expect(() => confirmedImageLayerWorkflow(plan, { ...source, sha256: "b".repeat(64) }, 0)).toThrow("原图已变化");
    expect(() => confirmedImageLayerWorkflow({ ...plan, layers: [plan.layers[0], { ...plan.layers[1], extraction: { method: "source-region" } }] }, source, 0)).toThrow("区域无效");
    expect(() => confirmedImageLayerWorkflow({ ...plan, layers: [plan.layers[0], { ...plan.layers[1], removeFromBackground: true }] }, source, 0)).toThrow("保留原图底图");
});

test("confirmed generated background is restricted to reviewed regions and keeps per-layer instructions", () => {
    const reviewed: ImageLayerPlan = {
        ...plan,
        layers: [
            { ...plan.layers[0], extraction: { method: "generate" } },
            { ...plan.layers[1], removeFromBackground: true },
        ],
    };
    expect(() => confirmedImageLayerWorkflow(reviewed, source, 0)).toThrow("选择可用图片模型");
    const request = confirmedImageLayerWorkflow(reviewed, source, 2, { logicalModelId: "local-image", size: "1600x800" });
    expect(request.backgroundRegions?.[0].bbox).toEqual([510, 50, 950, 900]);
    expect(request.layers[0].generation?.prompt).toContain("保留完整原图");
    expect(request.layers[1].generation).toBeUndefined();
});
