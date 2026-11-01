import { http } from "@/services/api/request";
import type { GenerationTask } from "@/services/api/task-center";
import type { ImageCropRect, ImageSplitParams, ImageUpscaleParams } from "@/lib/canvas/image-operation-plan";

export type ImageOperationRecipe =
    | { operation: "split"; split: ImageSplitParams }
    | { operation: "crop"; crop: ImageCropRect }
    | { operation: "crop"; cropPixels: ImagePixelCrop }
    | { operation: "resize"; resize: ImageUpscaleParams }
    | { operation: "mask"; mask: { width: number; height: number; mode: "keep" | "remove"; strokes: import("@/lib/canvas/image-mask-document").MaskStroke[] } }
    | { operation: "compose"; compose: ImageComposition }
    | { operation: "region"; region: ImageLayerWorkflowRegion }
    | { operation: "normalize"; normalize: { width: number; height: number; algorithm: "bilinear" | "high" } }
    | { operation: "background-patch"; patch: { width: number; height: number; generatedResourceId: string; generatedSha256: string; regions: ImageLayerWorkflowRegion[] } }
    | { operation: "trim-layers"; trimLayers: { id: string; resourceId: string; width: number; height: number; crop: ImagePixelCrop }[] };

export type ImageComposition = { width: number; height: number; layers: { id: string; resourceId: string; x: number; y: number; opacity?: number; visible?: boolean }[] };
export type ImageRasterSource = { sha256: string; width: number; height: number; orientation: number; format: string };
export type ImagePixelCrop = { x: number; y: number; width: number; height: number };
export type ImageAlphaBounds = {
    resourceId: string;
    source: ImageRasterSource;
    bounds: ImagePixelCrop | null;
    empty: boolean;
    trimNeeded: boolean;
    rasterInfo: { width: number; height: number; nonempty: boolean; opaque: boolean; transparent: boolean; transparentPixels: number };
};
export const readImageAlphaBounds = (resourceId: string, signal?: AbortSignal) => http.get<ImageAlphaBounds>(`/images/${encodeURIComponent(resourceId)}/alpha-bounds`, { signal });
export type ImageLayerGroupSource = {
    canvasId: string;
    nodeId: string;
    canvasRevision: number;
    resourceId: string;
    source: ImageRasterSource;
    composition: ImageComposition;
    layerSources: { id: string; resourceId: string; source: ImageRasterSource }[];
    snapshotSha256: string;
    ready: boolean;
};
export const readImageLayerGroupSource = (canvasId: string, nodeId: string, signal?: AbortSignal) => http.get<ImageLayerGroupSource>(`/canvas-projects/${encodeURIComponent(canvasId)}/image-layer-groups/${encodeURIComponent(nodeId)}/source`, { signal });
export type ImageLayerGroupCreateResult = { canvasId: string; nodeId: string; taskId: string; revision: number; requestSha256: string; replayed: boolean };
export const createImageLayerGroup = (canvasId: string, payload: { requestId: string; title?: string; width?: number; height?: number; sources: { nodeId: string; resourceId: string }[] }, signal?: AbortSignal) =>
    http.post<ImageLayerGroupCreateResult>(`/canvas-projects/${encodeURIComponent(canvasId)}/image-layer-groups`, payload, { signal });
export type ImageLayerMaterialsResult = { canvasId: string; nodeId: string; taskId?: string; nodeIds: string[]; emptyLayerIds: string[]; revision: number; sourceGroupSha256: string; requestSha256: string; replayed: boolean };
export const createImageLayerMaterials = (canvasId: string, nodeId: string, payload: { requestId: string; sourceGroupSha256: string }, signal?: AbortSignal) =>
    http.post<ImageLayerMaterialsResult>(`/canvas-projects/${encodeURIComponent(canvasId)}/image-layer-groups/${encodeURIComponent(nodeId)}/materials`, payload, { signal });

export type ImageLayerWorkflowRegion = { width: number; height: number; bbox: number[]; shape: "rect" | "rounded-rect" | "ellipse"; radiusRatio?: number };
export type ImageLayerWorkflowModel = { logicalModelId?: string; model?: string; prompt: string; size?: string; quality?: string };
export type ImageLayerWorkflowRequest = {
    requestId: string;
    resumeTaskId?: string;
    planningTaskId?: string;
    sourceNodeId: string;
    resourceId: string;
    expectedSourceSha256: string;
    title?: string;
    maxCredits: number;
    layers: { name: string; method: "source" | "source-region" | "generate"; region?: ImageLayerWorkflowRegion; generation?: ImageLayerWorkflowModel; removal?: ImageLayerWorkflowModel; visible?: boolean }[];
    backgroundRegions?: ImageLayerWorkflowRegion[];
};
export type ImageLayerWorkflowResult = { canvasId: string; nodeId: string; taskId: string; childNodeIds: string[]; revision: number; requestSha256: string; replayed: boolean };
export const createImageLayerWorkflow = (canvasId: string, payload: ImageLayerWorkflowRequest, signal?: AbortSignal) => http.post<ImageLayerWorkflowResult>(`/canvas-projects/${encodeURIComponent(canvasId)}/image-layer-workflows`, payload, { signal });

export type ImageOperationRequest = {
    requestId: string;
    projectId: string;
    sourceNodeId: string;
    resourceId: string;
    recipe: ImageOperationRecipe;
    sourceGroupSha256?: string;
    clientCompositeSignature?: string;
    expectedSourceSha256?: string;
};

export type ImageOperationPiece = { x: number; y: number; width: number; height: number; outputWidth: number; outputHeight: number; row: number; column: number };
export type ImageOperationOutput = {
    resourceId: string;
    assetId: string;
    assetVersionId: string;
    storageKey: string;
    url: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
    piece: ImageOperationPiece;
};
export type ImageOperationResult = {
    images: ImageOperationOutput[];
    imageOperation: {
        version: 1;
        request: ImageOperationRequest;
        requestSha256: string;
        source: ImageRasterSource;
        layerSources?: ImageLayerGroupSource["layerSources"];
        trimGroup?: ImageLayerGroupSource;
        pieces: ImageOperationPiece[];
    };
};

export function createImageOperation(payload: ImageOperationRequest, signal?: AbortSignal) {
    return http.post<GenerationTask>("/images/operations", payload, { signal });
}

export type ImageOperationApplyResult = {
    taskId: string;
    canvasId: string;
    requestSha256: string;
    addedNodeIds: string[];
    existingNodeIds: string[];
    updatedNodeIds?: string[];
    revision: number;
    replayed: boolean;
};

export function applyImageOperation(taskId: string, requestId: string, signal?: AbortSignal, editProofs?: import("./user-data").CanvasEditProof[]) {
    return http.post<ImageOperationApplyResult>(`/images/operations/${encodeURIComponent(taskId)}/apply`, { requestId, ...(editProofs?.length ? { editProofs } : {}) }, { signal });
}

export function imageOperationResult(task: GenerationTask): ImageOperationResult {
    if (task.type !== "image_operation" || task.status !== "succeeded" || !task.resultJson) throw new Error("图片处理尚未完成");
    const result = JSON.parse(task.resultJson) as ImageOperationResult;
    if (result.imageOperation?.version !== 1 || !result.imageOperation.request?.resourceId || !Array.isArray(result.images) || result.images.length < 1 || result.images.length !== result.imageOperation.pieces?.length)
        throw new Error("图片处理结果不完整");
    if (
        result.images.some(
            (item, index) =>
                !item.resourceId ||
                !item.assetId ||
                !item.assetVersionId ||
                item.width <= 0 ||
                item.height <= 0 ||
                item.storageKey !== `resource:${item.resourceId}` ||
                item.width !== result.imageOperation.pieces[index].outputWidth ||
                item.height !== result.imageOperation.pieces[index].outputHeight,
        )
    )
        throw new Error("图片资源与处理配方不一致");
    return result;
}
