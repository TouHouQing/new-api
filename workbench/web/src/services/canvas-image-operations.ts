import { canonicalize } from "json-canonicalize";
import { resourceIdFromStorageKey } from "@/services/api/resources";
import { applyImageOperation, createImageOperation, imageOperationResult, type ImageOperationRecipe, type ImageOperationResult } from "@/services/api/image-operations";
import { canvasEditLeases } from "@/services/canvas-edit-leases";
import { queryGenerationTask, waitForGenerationTask, retryGenerationTask, recoverGenerationTaskMedia, type GenerationTask } from "@/services/api/task-center";
import { runGenerationConsumer } from "@/services/generation-consumer-lifecycle";
import { getActiveUserScope } from "@/lib/user-scope";
import { loadAssetsForUse, loadCanvasProjectForEditing, saveRemoteUserDataNow } from "@/services/user-data-sync";
import { persistCanvasGenerationEffect } from "@/services/canvas-generation-consumer";
import { imageOperationNodes, mergeImageOperationNodes } from "@/lib/canvas/canvas-image-operation";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useAssetStore } from "@/stores/use-asset-store";
import type { CanvasNodeData } from "@/types/canvas";

function throwIfAborted(signal: AbortSignal) {
    if (signal.aborted) throw new DOMException("The operation was aborted", "AbortError");
}

// Identical pixel operations reuse the same durable task across windows and
// refreshes; there is no browser-only receipt or random child asset identity.
export async function runCanvasImageOperation(
    input: {
        projectId: string;
        node: CanvasNodeData;
        recipe: ImageOperationRecipe;
        sourceGroupSha256?: string;
        clientCompositeSignature?: string;
        expectedSourceSha256?: string;
        intentId?: string;
        existingTaskId?: string;
        retryFailed?: boolean;
        onTask?: (task: GenerationTask) => void;
        signal?: AbortSignal;
    },
    consume: (task: GenerationTask, result: ImageOperationResult, signal: AbortSignal) => Promise<void>,
) {
    return runGenerationConsumer(input.signal, async (signal) => {
        const scope = getActiveUserScope();
        const resourceId = resourceIdFromStorageKey(input.node.metadata?.storageKey || "");
        if (!resourceId) throw new Error("请先等待原图保存到服务器，再处理图片");
        const request = {
            projectId: input.projectId,
            sourceNodeId: input.node.id,
            resourceId,
            recipe: input.recipe,
            ...(input.expectedSourceSha256 ? { expectedSourceSha256: input.expectedSourceSha256 } : {}),
            ...(input.sourceGroupSha256 ? { sourceGroupSha256: input.sourceGroupSha256, clientCompositeSignature: input.clientCompositeSignature } : {}),
        };
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalize({ ...request, ...(input.intentId ? { intentId: input.intentId } : {}) })));
        const requestId = `image-operation-v1:${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")}`;
        throwIfAborted(signal);
        let task = input.existingTaskId ? await queryGenerationTask(input.existingTaskId, { signal }) : await createImageOperation({ ...request, requestId }, signal);
        if (task.status === "cancelled" || task.status === "failed") {
            if (input.retryFailed === false) throw new Error(task.status === "cancelled" ? "合成已取消，当前设置已保留；需要时点击重试合成" : "上次合成未完成，当前设置已保留；请检查任务后重试合成");
            throwIfAborted(signal);
            task = task.canRecoverMedia ? await recoverGenerationTaskMedia(task.id) : await retryGenerationTask(task.id);
        }
        input.onTask?.(task);
        if (task.status !== "succeeded") task = await waitForGenerationTask(task.id, { signal, intervalMs: 1000, timeoutMs: 12 * 60_000, onTaskUpdate: input.onTask });
        if (input.retryFailed === false && task.imageLayerDeliveryStatus === "detached") throw new Error("图层已变化，本次结果保留在素材库；当前设置已保留，可重新合成");
        throwIfAborted(signal);
        const result = imageOperationResult(task);
        await loadAssetsForUse(result.images.map((item) => item.assetId));
        throwIfAborted(signal);
        if (scope !== getActiveUserScope()) throw new DOMException("The operation was aborted", "AbortError");
        if (result.images.some((item) => !useAssetStore.getState().assets.some((asset) => asset.id === item.assetId))) throw new Error("处理结果已保存，但素材尚未加载，请重试获取结果");
        await consume(task, result, signal);
        return task;
    });
}

export async function loadImageOperation(taskId: string, signal?: AbortSignal) {
    const task = await queryGenerationTask(taskId, { signal });
    return { task, result: imageOperationResult(task) };
}

export async function adoptImageOperationToCanvas(taskId: string) {
    return runGenerationConsumer(undefined, async (signal) => {
        const scope = getActiveUserScope();
        const { task, result } = await loadImageOperation(taskId, signal);
        if (!task.projectId || !result.imageOperation.request.sourceNodeId) throw new Error("这个处理任务未绑定原画布，可从素材库选择结果图片");
        await loadCanvasProjectForEditing(task.projectId);
        throwIfAborted(signal);
        if (scope !== getActiveUserScope()) throw new DOMException("Aborted", "AbortError");
        await loadAssetsForUse(result.images.map((item) => item.assetId));
        throwIfAborted(signal);
        if (result.imageOperation.request.sourceGroupSha256 || result.imageOperation.trimGroup) {
            const sourceId = result.imageOperation.request.sourceNodeId;
            const proofs = await canvasEditLeases.proofs(task.projectId, new Set([sourceId]));
            await applyImageOperation(task.id, `image-layer-group-apply:${task.id}`, signal, proofs);
            await loadCanvasProjectForEditing(task.projectId);
            throwIfAborted(signal);
            if (scope !== getActiveUserScope()) throw new DOMException("Aborted", "AbortError");
            const current = useCanvasStore
                .getState()
                .projects.find((project) => project.id === task.projectId)
                ?.nodes.find((node) => node.id === sourceId);
            const updated = result.imageOperation.trimGroup
                ? current?.metadata?.imageLayerMaterials?.taskId === task.id &&
                  current.metadata.imageLayerMaterials.status === "ready" &&
                  Boolean(current.metadata.imageLayerMaterials.nodeIds?.length) &&
                  current.metadata.imageLayerMaterials.nodeIds!.every((id) =>
                      useCanvasStore
                          .getState()
                          .projects.find((project) => project.id === task.projectId)
                          ?.nodes.some((node) => node.id === id),
                  )
                : current?.metadata?.imageOperationTaskId === task.id && current.metadata.storageKey === result.images[0].storageKey;
            return { projectId: task.projectId, added: 0, updated, historical: !updated };
        }
        const project = useCanvasStore.getState().projects.find((item) => item.id === task.projectId);
        const source = project?.nodes.find((item) => item.id === result.imageOperation.request.sourceNodeId);
        if (!project || !source) throw new Error("源画布或图片已删除，处理结果仍保留在素材库");
        const children = imageOperationNodes(task, result, source, project.nodes);
        const merged = mergeImageOperationNodes(project.nodes, project.connections, source.id, children);
        if (merged.added)
            await persistCanvasGenerationEffect({
                projectId: project.id,
                effectKey: `image-operation:${task.id}:adopt`,
                previousNodes: project.nodes,
                nodes: merged.nodes,
                previousConnections: project.connections,
                connections: merged.connections,
                signal,
            });
        throwIfAborted(signal);
        await saveRemoteUserDataNow(project.id);
        throwIfAborted(signal);
        return { projectId: project.id, added: merged.added };
    });
}
