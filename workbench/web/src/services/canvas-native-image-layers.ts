import { canonicalize } from "json-canonicalize";
import { imageLayerCompositeSignature } from "@/lib/canvas/canvas-image-layers";
import { getActiveUserScope } from "@/lib/user-scope";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { resourceIdFromStorageKey } from "@/services/api/resources";
import { applyImageOperation, createImageLayerGroup, readImageLayerGroupSource, type ImageComposition } from "@/services/api/image-operations";
import { ApiError } from "@/services/api/request";
import { getRemoteCanvasProject } from "@/services/api/user-data";
import { canvasEditLeases } from "@/services/canvas-edit-leases";
import { runCanvasImageOperation } from "@/services/canvas-image-operations";
import { loadAssetsForUse, loadCanvasProjectForEditing, saveRemoteUserDataNow } from "@/services/user-data-sync";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

const groupCreates = new Map<string, Promise<Awaited<ReturnType<typeof createImageLayerGroup>>>>();
export async function createNativeImageLayerGroup(projectId: string, nodes: CanvasNodeData[]) {
    const scope = getActiveUserScope(),
        key = `${scope}:${projectId}`;
    const running = groupCreates.get(key);
    if (running) return running;
    const action = async () => {
        const storage = localForageStorageForScope(scope),
            journalKey = `image-layer-group-create:${projectId}`;
        const raw = await storage.getItem(journalKey);
        const request = raw
            ? (JSON.parse(raw) as Parameters<typeof createImageLayerGroup>[1])
            : { requestId: crypto.randomUUID(), sources: nodes.map((node) => ({ nodeId: node.id, resourceId: resourceIdFromStorageKey(node.metadata?.storageKey || "") || "" })) };
        if (
            (raw && raw.length > 16384) ||
            typeof request.requestId !== "string" ||
            !/^[A-Za-z0-9._:-]{16,128}$/.test(request.requestId) ||
            !Array.isArray(request.sources) ||
            !request.sources.length ||
            request.sources.length > 32 ||
            request.sources.some((source) => !source.nodeId || !source.resourceId || source.nodeId.length > 128 || source.resourceId.length > 80)
        )
            throw new Error("请选择1至32张已保存的图片；若有未确认的图层操作，请保留浏览器数据并核对");
        await storage.setItem(journalKey, JSON.stringify(request));
        if (canonicalize(JSON.parse((await storage.getItem(journalKey)) || "null")) !== canonicalize(request)) throw new Error("本机未保存操作编号，本次未发送，请检查浏览器存储后重试");
        if (scope !== getActiveUserScope()) throw new DOMException("Aborted", "AbortError");
        await saveRemoteUserDataNow(projectId);
        let result: Awaited<ReturnType<typeof createImageLayerGroup>>;
        try {
            result = await createImageLayerGroup(projectId, request);
        } catch (error) {
            // Creation and queue admission are atomic. Definite rejections may
            // clear the local intent; an unknown reply retains the exact ID.
            if (error instanceof ApiError && [400, 403, 404, 409, 413, 429].includes(error.status || 0)) await storage.removeItem(journalKey);
            throw error;
        }
        if (scope !== getActiveUserScope()) throw new DOMException("Aborted", "AbortError");
        await loadCanvasProjectForEditing(projectId);
        if (scope !== getActiveUserScope()) throw new DOMException("Aborted", "AbortError");
        await storage.removeItem(journalKey);
        return result;
    };
    const pending = typeof navigator !== "undefined" && navigator.locks ? navigator.locks.request(`yingce-image-group:${key}`, action) : action();
    groupCreates.set(key, pending);
    try {
        return await pending;
    } finally {
        if (groupCreates.get(key) === pending) groupCreates.delete(key);
    }
}

export function imageLayerCompositionRecipe(group: NonNullable<CanvasNodeMetadata["imageLayerGroup"]>, nodes: CanvasNodeData[]): ImageComposition {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return {
        width: group.width,
        height: group.height,
        layers: group.layers.map((layer) => {
            const source = byId.get(layer.nodeId);
            const resourceId = resourceIdFromStorageKey(source?.metadata?.storageKey || "");
            if (!source || !resourceId || source.type !== "image") throw new Error("请先等待所有图层保存为服务器图片，再合成");
            return { id: source.id, resourceId, x: layer.x, y: layer.y, visible: layer.visible, opacity: layer.opacity ?? 1 };
        }),
    };
}

/** The native task and canvas receipt remain authoritative if this browser
 * closes. A completed old job cannot publish over a newer local group edit. */
export async function composeNativeImageLayerGroup(input: { projectId: string; root: CanvasNodeData; nodes: CanvasNodeData[]; nodesRef: { current: CanvasNodeData[] }; signal: AbortSignal }) {
    const scope = getActiveUserScope(),
        group = input.root.metadata?.imageLayerGroup;
    if (!group) throw new Error("图层组已删除");
    const signature = imageLayerCompositeSignature(group, input.nodes);
    const composition = imageLayerCompositionRecipe(group, input.nodes);
    const current = () => {
        if (input.signal.aborted || scope !== getActiveUserScope()) throw new DOMException("Aborted", "AbortError");
        const root = input.nodesRef.current.find((node) => node.id === input.root.id);
        return root?.metadata?.imageLayerGroup && imageLayerCompositeSignature(root.metadata.imageLayerGroup, input.nodesRef.current) === signature ? root : undefined;
    };
    await saveRemoteUserDataNow(input.projectId);
    if (!current()) return;
    const source = await readImageLayerGroupSource(input.projectId, input.root.id, input.signal);
    if (!current()) return;
    if (canonicalize(source.composition) !== canonicalize(composition)) throw new Error("图层编辑尚未与服务器一致，当前设置已保留，请同步后重试");
    let resultNode: CanvasNodeData | undefined;
    await runCanvasImageOperation(
        {
            projectId: input.projectId,
            node: { ...input.root, metadata: { ...input.root.metadata, storageKey: `resource:${source.resourceId}` } },
            recipe: { operation: "compose", compose: source.composition },
            sourceGroupSha256: source.snapshotSha256,
            clientCompositeSignature: signature,
            intentId: group.compositeIntentId,
            existingTaskId: group.pendingSignature === signature ? group.pendingTaskId : undefined,
            retryFailed: false,
            signal: input.signal,
        },
        async (task, _result, signal) => {
            if (!current()) return;
            const proofs = await canvasEditLeases.proofs(input.projectId, new Set([input.root.id]));
            if (!current()) return;
            await applyImageOperation(task.id, `image-layer-group-apply:${task.id}`, signal, proofs);
            if (!current()) return;
            const remote = (await getRemoteCanvasProject(input.projectId)).project;
            if (!current()) return;
            const node = remote.nodes.find((node) => node.id === input.root.id);
            if (!node?.metadata?.imageLayerGroup?.nativeComposition || imageLayerCompositeSignature(node.metadata.imageLayerGroup, remote.nodes) !== signature) throw new Error("服务器保留了后续图层版本，请刷新核对；本次结果仍在素材库");
            if (!node.metadata.assetId) throw new Error("合成结果尚未登记为原生素材，请从任务中心核对");
            await loadAssetsForUse([node.metadata.assetId]);
            if (!current()) return;
            await loadCanvasProjectForEditing(input.projectId);
            if (scope !== getActiveUserScope() || signal.aborted) throw new DOMException("Aborted", "AbortError");
            // Loading the current native revision also preserves ordinary edits in
            // other fields through the established canvas rebase path.
            const live = useCanvasStore
                .getState()
                .projects.find((project) => project.id === input.projectId)
                ?.nodes.find((candidate) => candidate.id === input.root.id);
            resultNode = live?.metadata?.imageLayerGroup && imageLayerCompositeSignature(live.metadata.imageLayerGroup, input.nodesRef.current) === signature ? live : node;
        },
    );
    return current() ? resultNode : undefined;
}
