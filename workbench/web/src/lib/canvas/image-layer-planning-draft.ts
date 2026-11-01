import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasNodeData } from "@/types/canvas";
import type { ImageLayerPlan, ImageLayerPlanningPurpose } from "./canvas-image-layer-plan";

export type ImageLayerPlanningDraft = {
    version: 1;
    plan: ImageLayerPlan;
    prompt: string;
    purpose: ImageLayerPlanningPurpose;
    regions: Array<[number, number, number, number]>;
    selectedLayer: number;
    plannerModel: string;
    maxCredits: number;
    planningMaxCredits: number;
    generationConfig: Pick<AiConfig, "model" | "imageModel" | "size" | "quality">;
};

export function readImageLayerPlanningDraft(node: CanvasNodeData): ImageLayerPlanningDraft | undefined {
    const draft = node.metadata?.imageLayerPlanningDraft;
    if (!draft || draft.version !== 1 || JSON.stringify(draft).length > 128 * 1024) return;
    const source = draft.plan?.source;
    if (!source || source.sourceNodeId !== node.id || node.metadata?.storageKey !== `resource:${source.resourceId}` || !/^[a-f0-9]{64}$/.test(source.sha256)) return;
    if (!Array.isArray(draft.plan.layers) || draft.plan.layers.length < 2 || draft.plan.layers.length > 8 || !["materials", "recompose"].includes(draft.purpose) || source.purpose !== draft.purpose) return;
    if (
        draft.plan.layers.some(
            (layer) =>
                !layer ||
                typeof layer.name !== "string" ||
                typeof layer.description !== "string" ||
                !["background", "object"].includes(layer.kind) ||
                !layer.generation ||
                typeof layer.generation.prompt !== "string" ||
                !["opaque", "transparent"].includes(layer.generation.background),
        )
    )
        return;
    if (typeof draft.prompt !== "string" || draft.prompt.length > 10000 || !Array.isArray(draft.regions) || draft.regions.length > 20) return;
    if (draft.regions.some((box) => !Array.isArray(box) || box.length !== 4 || box.some((value) => !Number.isFinite(value) || value < 0 || value > 1000) || box[0] >= box[2] || box[1] >= box[3])) return;
    if (![draft.maxCredits, draft.planningMaxCredits].every((value) => Number.isFinite(value) && value >= 0 && value <= 1000000)) return;
    if (!draft.generationConfig || !["model", "imageModel", "size", "quality"].every((key) => typeof draft.generationConfig[key as keyof typeof draft.generationConfig] === "string")) return;
    if (!Number.isInteger(draft.selectedLayer) || draft.selectedLayer < 0 || draft.selectedLayer >= draft.plan.layers.length || typeof draft.plannerModel !== "string") return;
    return structuredClone(draft);
}
