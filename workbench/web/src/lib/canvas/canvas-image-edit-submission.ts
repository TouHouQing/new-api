import { canvasGenerationTaskDraft } from "@/lib/canvas/canvas-task-draft";
import type { runBackendCanvasGenerationTask } from "@/lib/canvas/canvas-project-generation";
import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";

type Submission = Parameters<typeof runBackendCanvasGenerationTask>[0];

/** A new edit target owns one stable intent, including its incoming edges. */
export function canvasImageEditSubmission(input: Omit<Submission, "mode" | "nodeId" | "clientOperationId"> & { target: CanvasNodeData; connections: readonly CanvasConnection[] }): Submission {
    const { target, connections, metadata, ...request } = input;
    if (!request.projectId.trim() || !target.id || target.type !== "image") throw new Error("请等待画布保存，并选择有效的图片编辑目标");
    return {
        ...request,
        mode: "image",
        nodeId: target.id,
        clientOperationId: `canvas-image-edit:${target.id}`,
        metadata: { ...metadata, canvasTaskDraft: canvasGenerationTaskDraft(target, connections) },
    };
}
