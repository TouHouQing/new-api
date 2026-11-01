import { getActiveUserScope } from "@/lib/user-scope";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { applyImageOperation, createImageLayerMaterials, imageOperationResult, readImageLayerGroupSource } from "@/services/api/image-operations";
import { ApiError } from "@/services/api/request";
import { getRemoteCanvasProject } from "@/services/api/user-data";
import { queryGenerationTask, waitForGenerationTask } from "@/services/api/task-center";
import { canvasEditLeases } from "@/services/canvas-edit-leases";
import { loadAssetsForUse, loadCanvasProjectForEditing, saveRemoteUserDataNow } from "@/services/user-data-sync";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import type { CanvasNodeData } from "@/types/canvas";

export async function saveNativeImageLayerMaterials(projectId: string, root: CanvasNodeData, signal: AbortSignal, observeOnly = false): Promise<string[]> {
    const scope = getActiveUserScope();
    const current = () => {
        if (signal.aborted || scope !== getActiveUserScope()) throw new DOMException("Aborted", "AbortError");
    };
    let taskId = root.metadata?.imageLayerMaterials?.taskId;
    if (!observeOnly) {
        await saveRemoteUserDataNow(projectId);
        current();
        const source = await readImageLayerGroupSource(projectId, root.id, signal);
        current();
        if (!source.ready) throw new Error("请先等待图层合成完成，再另存独立素材");
        const storage = localForageStorageForScope(scope),
            journalKey = `image-layer-materials:${projectId}:${root.id}`;
        const unconfirmed = await storage.getItem(journalKey);
        current();
        const marker = root.metadata?.imageLayerMaterials;
        if (!unconfirmed && marker?.status === "ready" && marker.sourceGroupSha256 === source.snapshotSha256 && marker.nodeIds?.length) {
            const project = useCanvasStore.getState().projects.find((project) => project.id === projectId);
            if (marker.nodeIds.every((id) => project?.nodes.some((node) => node.id === id))) return marker.nodeIds;
        }
        const submit = async () => {
            const raw = await storage.getItem(journalKey);
            const request = raw ? (JSON.parse(raw) as { requestId: string; sourceGroupSha256: string }) : { requestId: crypto.randomUUID(), sourceGroupSha256: source.snapshotSha256 };
            if ((raw && raw.length > 512) || !/^[a-f0-9-]{36}$/.test(request.requestId) || !/^[a-f0-9]{64}$/.test(request.sourceGroupSha256)) throw new Error("本机另存记录无法读取，请保留浏览器数据并从任务中心核对");
            await storage.setItem(journalKey, JSON.stringify(request));
            if ((await storage.getItem(journalKey)) !== JSON.stringify(request)) throw new Error("本机未保存另存编号，本次未发送，请检查浏览器存储后重试");
            current();
            let result;
            try {
                result = await createImageLayerMaterials(projectId, root.id, request, signal);
            } catch (error) {
                if (error instanceof ApiError && [400, 403, 404, 409, 413, 429].includes(error.status || 0)) await storage.removeItem(journalKey);
                throw error;
            }
            current();
            await loadCanvasProjectForEditing(projectId);
            current();
            await storage.removeItem(journalKey);
            return result;
        };
        const result = typeof navigator !== "undefined" && navigator.locks ? await navigator.locks.request(`yingce-materials:${scope}:${projectId}:${root.id}`, submit) : await submit();
        taskId = result.taskId;
        if (!taskId) {
            await saveRemoteUserDataNow(projectId);
            current();
            await loadCanvasProjectForEditing(projectId);
            current();
            const project = (await getRemoteCanvasProject(projectId)).project;
            current();
            const marker = project?.nodes.find((node) => node.id === root.id)?.metadata?.imageLayerMaterials;
            if (marker?.status !== "ready" || marker.sourceGroupSha256 !== result.sourceGroupSha256 || !result.nodeIds.length || result.nodeIds.some((id) => !project?.nodes.some((node) => node.id === id)))
                throw new Error("这次另存的历史记录已保留，素材节点已被后续编辑或撤销；请按当前图层重新另存");
            return result.nodeIds;
        }
    }
    if (!taskId) throw new Error("尚未提交服务器任务，请重新另存独立素材");
    let task = await queryGenerationTask(taskId, { signal });
    current();
    if (task.status === "failed" || task.status === "cancelled") throw new Error(task.status === "cancelled" ? "独立素材另存已取消，原图保持不变；需要时可重新另存" : "独立素材另存未完成，请在任务中心核对后重试");
    if (task.status !== "succeeded") task = await waitForGenerationTask(taskId, { signal, intervalMs: 1000, timeoutMs: 12 * 60_000 });
    current();
    if (task.imageLayerDeliveryStatus === "detached") throw new Error("图层已变化，裁剪结果保留在素材库，未添加到当前作品；可按当前图层重新另存");
    const result = imageOperationResult(task);
    await loadAssetsForUse(result.images.map((image) => image.assetId));
    current();
    const proofs = await canvasEditLeases.proofs(projectId, new Set([root.id]));
    current();
    const applied = await applyImageOperation(task.id, `image-layer-group-apply:${task.id}`, signal, proofs);
    current();
    await saveRemoteUserDataNow(projectId);
    current();
    await loadCanvasProjectForEditing(projectId);
    current();
    const project = (await getRemoteCanvasProject(projectId)).project;
    current();
    const live = project.nodes.find((node) => node.id === root.id)?.metadata?.imageLayerMaterials;
    const ids = [...applied.addedNodeIds, ...applied.existingNodeIds];
    if (live?.taskId !== task.id || live.status !== "ready" || !ids.length || ids.some((id) => !project?.nodes.some((node) => node.id === id))) throw new Error("这次另存的历史记录已保留；素材节点已被后续编辑或撤销，请按当前图层重新另存");
    return ids;
}
