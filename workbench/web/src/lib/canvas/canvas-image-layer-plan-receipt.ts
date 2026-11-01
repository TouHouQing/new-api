import type { ImageLayerPlan, ImageLayerPlanningPurpose } from "./canvas-image-layer-plan";
import { parseImageLayerGeneration } from "./canvas-image-layers";

export type NativeImageLayerPlanReceipt = {
    version: 1;
    taskId: string;
    sourceNodeId: string;
    resourceId: string;
    source: { sha256: string; width: number; height: number; orientation: number; format: string };
    referenceSize: { width: number; height: number };
    referenceSha256: string;
    purpose: ImageLayerPlanningPurpose;
    status: "ready" | "needs_correction";
    plan?: ImageLayerPlan;
    reason?: string;
};

export function readNativeImageLayerPlan(value: NativeImageLayerPlanReceipt | undefined, expected: { taskId?: string; sourceNodeId: string; storageKey?: string; sha256?: string; purpose?: ImageLayerPlanningPurpose }): ImageLayerPlan {
    if (
        !value ||
        value.version !== 1 ||
        !value.taskId ||
        (expected.taskId && value.taskId !== expected.taskId) ||
        value.sourceNodeId !== expected.sourceNodeId ||
        `resource:${value.resourceId}` !== expected.storageKey ||
        !/^[a-f0-9]{64}$/.test(value.source?.sha256 || "") ||
        (expected.sha256 && value.source.sha256 !== expected.sha256) ||
        (expected.purpose && value.purpose !== expected.purpose)
    )
        throw new Error("规划与当前原图不一致，请重新核对原图和任务");
    if (value.status === "needs_correction") throw new Error(value.reason || "识图结果需要修正，原模型回复已保留在任务记录中");
    if (
        value.status !== "ready" ||
        !value.plan ||
        !Array.isArray(value.plan.layers) ||
        value.plan.layers.length < 2 ||
        value.plan.layers.length > 8 ||
        !/^[a-f0-9]{64}$/.test(value.referenceSha256) ||
        !Number.isSafeInteger(value.referenceSize?.width) ||
        !Number.isSafeInteger(value.referenceSize?.height) ||
        value.referenceSize.width < 1 ||
        value.referenceSize.height < 1
    )
        throw new Error("已保存的拆层规划格式无效，请检查原任务");
    value.plan.layers.forEach((layer, index) => {
        if (!layer.name || !layer.description || layer.kind !== (index ? "object" : "background")) throw new Error("已保存的图层结构无效");
        parseImageLayerGeneration(layer.generation, index);
    });
    return { ...value.plan, taskId: value.taskId, source: { sourceNodeId: value.sourceNodeId, resourceId: value.resourceId, sha256: value.source.sha256, width: value.source.width, height: value.source.height, purpose: value.purpose } };
}
