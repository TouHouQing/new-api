import type { ImageLayerPlan } from "./canvas-image-layer-plan";
import { experimentalLayerPrompt } from "./canvas-image-layers";
import { resolveImageLayerExtractions } from "./canvas-image-layer-strategy";
import type { ImageLayerWorkflowModel, ImageLayerWorkflowRequest } from "@/services/api/image-operations";

/** A reviewed plan remains bound to its original bytes, even if the node now shows another image. */
export function confirmedImageLayerWorkflow(
    plan: ImageLayerPlan,
    source: { sourceNodeId: string; resourceId: string; sha256: string; width: number; height: number },
    maxCredits: number,
    generation?: Omit<ImageLayerWorkflowModel, "prompt">,
    removal?: Omit<ImageLayerWorkflowModel, "prompt">,
): Omit<ImageLayerWorkflowRequest, "requestId"> {
    if (!plan.taskId || !plan.source || plan.source.sourceNodeId !== source.sourceNodeId || plan.source.resourceId !== source.resourceId || plan.source.sha256 !== source.sha256 || plan.source.width !== source.width || plan.source.height !== source.height)
        throw new Error("原图已变化，确认的规划不适用于当前图片；请重新识图。");
    if (!Number.isFinite(maxCredits) || maxCredits < 0 || maxCredits > 1000000) throw new Error("拆层预算无效");
    const names = plan.layers.map((layer) => layer.name.trim());
    if (names.some((name) => !name || name.length > 80) || new Set(names).size !== names.length) throw new Error("图层名称须简短且不重复");
    const removals = plan.layers.map((layer, index) => index > 0 && Boolean(layer.removeFromBackground));
    const extractions = resolveImageLayerExtractions(
        plan.layers.length,
        plan.layers.map((layer) => layer.extraction || { method: "generate" }),
        removals,
    );
    if (extractions.some((layer) => layer.method === "generate") && (!generation || (!generation.logicalModelId && !generation.model))) throw new Error("含 AI 重绘的图层需要选择可用图片模型");
    const region = (value: NonNullable<(typeof extractions)[number]["region"]>) => ({ ...value, width: source.width, height: source.height });
    const patches = removals.flatMap((remove, index) => (remove ? [extractions[index]] : []));
    return {
        planningTaskId: plan.taskId,
        sourceNodeId: source.sourceNodeId,
        resourceId: source.resourceId,
        expectedSourceSha256: source.sha256,
        title: "AI 图层拆分",
        maxCredits,
        layers: plan.layers.map((layer, index) => ({
            name: names[index],
            method: extractions[index].method,
            visible: index === 0 || removals[index],
            ...(extractions[index].region ? { region: region(extractions[index].region!) } : {}),
            ...(extractions[index].method === "generate"
                ? {
                      generation: { ...generation!, prompt: experimentalLayerPrompt(layer.generation, layer.bbox) },
                      ...(index > 0 && removal ? { removal: { ...removal, prompt: `仅保留${layer.description}，去除非目标背景，保持原图尺寸、位置及比例，输出真实透明 PNG。` } } : {}),
                  }
                : {}),
        })),
        ...(extractions[0].method === "generate" && patches.length && patches.every((item) => item.method === "source-region" && item.region) ? { backgroundRegions: patches.map((item) => region(item.region!)) } : {}),
    };
}
