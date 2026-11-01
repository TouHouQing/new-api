import type { GenerationTask } from "@/services/api/task-center";
import type { CanvasNodeData } from "@/types/canvas";
import type { ImageLayerWorkflowResult } from "@/services/api/image-operations";

export function isNativeLayerWorkflowCurrent(nodes: CanvasNodeData[] | undefined, result: ImageLayerWorkflowResult): boolean {
    const root = nodes?.find((node) => node.id === result.nodeId);
    return Boolean(
        root?.metadata?.nativeImageLayerWorkflow?.taskId === result.taskId &&
        root.metadata.nativeImageLayerWorkflow.requestSha256 === result.requestSha256 &&
        result.childNodeIds.every((id) => nodes?.some((node) => node.id === id && node.metadata?.nativeImageLayerWorkflowParentId === result.taskId)),
    );
}

export function nativeLayerWorkflowParentId(task: Pick<GenerationTask, "id" | "type" | "operation" | "inputJson">): string | undefined {
    if (task.type === "image_operation" && task.operation === "layer-workflow") return task.id;
    try {
        const input = JSON.parse(task.inputJson || "{}");
        const modelParent = input.metadata?.imageLayerWorkflow?.taskId;
        if (typeof modelParent === "string" && /^[a-f0-9]{32}$/.test(modelParent)) return modelParent;
        const request = input.request?.requestId;
        if (task.type === "image_operation" && typeof request === "string") return /^layer-flow:([a-f0-9]{32}):/.exec(request)?.[1];
    } catch {
        /* Historical malformed inputs cannot authorize a workflow action. */
    }
    return undefined;
}
