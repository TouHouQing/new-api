import { nanoid } from "nanoid";

import { NODE_DEFAULT_SIZE } from "@/constant/canvas";
import { buildGenerationNodeTitle } from "@/lib/canvas/canvas-generation-title";
import { getGenerationCount, runCanvasGenerationTaskToConsumer } from "@/lib/canvas/canvas-project-generation";
import { canvasGenerationPromptMetadata } from "@/lib/canvas/canvas-generation-submission";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { canvasGenerationTaskDraft } from "@/lib/canvas/canvas-task-draft";
import { createDurableCanvasBatchRunner } from "@/services/canvas-generation-batch";
import { generationFailureMetadata } from "@/lib/generation-error";
import { TaskAdmissionUnconfirmedError } from "@/services/api/task-admission";

import type { CanvasGenerationExecution } from "./canvas-generation-executor-types";

const NODE_STATUS_LOADING = "loading" as const;
const NODE_STATUS_SUCCESS = "success" as const;

export async function executeTextGeneration(
    {
        nodeId,
        sourceNode,
        canvasConnections,
        prompt,
        effectivePrompt,
        generationConfig,
        generationContext,
        controller,
        editingTextNode,
        projectId,
        setNodes,
        setConnections,
        startGenerationRequest,
        finishGenerationRequest,
        bindGenerationTask,
        applyGenerationTaskResult,
        registerPendingNodeIds,
        taskContext,
        skillMetadata,
        retryContext,
    }: CanvasGenerationExecution,
    runTask?: Parameters<typeof runCanvasGenerationTaskToConsumer>[1]["runTask"],
) {
    const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
    // 独立文本份数（textCount），默认 1，不再复用餐图片数量 count（对齐上游 v0.16 语义）
    const textCount = getGenerationCount(String(sourceNode?.metadata?.textCount ?? 1));
    const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : CanvasNodeType.Text];
    const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
    const parentPosition = sourceNode?.position || { x: 0, y: 0 };
    const generateInPlace = !isConfigNode && !editingTextNode;
    const childIds = Array.from({ length: generateInPlace ? Math.max(0, textCount - 1) : textCount }, () => nanoid());
    registerPendingNodeIds(childIds);
    const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
        id,
        type: CanvasNodeType.Text,
        title: buildGenerationNodeTitle(effectivePrompt, "Generated Text"),
        position: {
            x: parentPosition.x + parentConfig.width + 96,
            y: parentPosition.y + parentConfig.height / 2 - textConfig.height / 2 + (index - (childIds.length - 1) / 2) * (textConfig.height + 36),
        },
        width: textConfig.width,
        height: textConfig.height,
        metadata: { ...canvasGenerationPromptMetadata(prompt, effectivePrompt), status: NODE_STATUS_LOADING, fontSize: 14, ...skillMetadata },
    }));
    const childConnections = childIds.map((childId) => ({ id: nanoid(), fromNodeId: nodeId, toNodeId: childId }));
    if (childIds.length) {
        setNodes((current) => [
            ...current.map((node) => (node.id === nodeId && isConfigNode ? { ...node, metadata: { ...node.metadata, ...canvasGenerationPromptMetadata(prompt, effectivePrompt), status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)),
            ...childNodes,
        ]);
        setConnections((current) => [...current, ...childConnections]);
    }

    const textTargetIds = generateInPlace ? [nodeId, ...childIds] : childIds;
    const submissions = textTargetIds.map((targetNodeId) => ({
        projectId,
        nodeId: targetNodeId,
        clientOperationId: `canvas-text:${nanoid()}`,
        ...retryContext,
        ...(textTargetIds.length > 1 && retryContext?.clientOperationId ? { clientOperationId: `${retryContext.clientOperationId}:${targetNodeId}` } : {}),
        mode: "text" as const,
        prompt: effectivePrompt,
        config: generationConfig,
        referenceImages: generationContext.referenceImages,
        referenceVideos: generationContext.referenceVideos,
        signal: controller.signal,
        metadata: {
            sourceNodeId: nodeId,
            ...taskContext,
            resolvedCharacterVersions: generationContext.resolvedCharacterVersions,
            ...skillMetadata,
            canvasTaskDraft: canvasGenerationTaskDraft(targetNodeId === nodeId ? sourceNode! : childNodes.find((node) => node.id === targetNodeId)!, [...canvasConnections, ...childConnections], targetNodeId === nodeId ? sourceNode : undefined),
        },
    }));
    const batchRunTask = runTask ?? (submissions.length > 1 ? createDurableCanvasBatchRunner(submissions) : undefined);
    textTargetIds.forEach((targetNodeId) => startGenerationRequest(targetNodeId, nodeId, nodeId, controller));
    const answers = await Promise.allSettled(
        textTargetIds.map((targetNodeId, index) =>
            runCanvasGenerationTaskToConsumer(submissions[index], {
                runTask: batchRunTask,
                bindTask: (task) => bindGenerationTask(targetNodeId, task),
                consumeTask: (task) => applyGenerationTaskResult(targetNodeId, task),
            })
                .then(() => ({ nodeId: targetNodeId }))
                .catch((error) => {
                    if (!controller.signal.aborted)
                        setNodes((current) =>
                            current.map((node) =>
                                node.id === targetNodeId
                                    ? { ...node, metadata: { ...node.metadata, ...(error instanceof TaskAdmissionUnconfirmedError ? { errorDetails: error.message } : { status: "error", ...generationFailureMetadata(error, prompt) }) } }
                                    : node,
                            ),
                        );
                    throw error;
                })
                .finally(() => finishGenerationRequest(targetNodeId, controller)),
        ),
    );
    if (controller.signal.aborted) return;
    const failed = answers.find((answer) => answer.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    if (isConfigNode) {
        setNodes((current) =>
            current.map((node) =>
                node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined, generationErrorCode: undefined, resourceReloadAvailable: undefined, failedPromptFingerprint: undefined } } : node,
            ),
        );
    }
}
