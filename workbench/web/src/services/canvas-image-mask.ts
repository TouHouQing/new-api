import { canonicalize } from "json-canonicalize";
import { getActiveUserScope } from "@/lib/user-scope";
import { readImageMaskDocument, type ImageMaskDocument } from "@/lib/canvas/image-mask-document";
import { stampCanvasNodeChanges } from "@/lib/canvas/canvas-node-timestamps";
import { getRemoteCanvasProject } from "@/services/api/user-data";
import { saveRemoteUserDataNow } from "@/services/user-data-sync";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

/** Ordinary native canvas edits use its persisted mutation session, CAS and
 * unknown-reply recovery. Only an actual server read confirms this draft. */
export async function saveCanvasImageMask(projectId: string, nodeId: string, document: ImageMaskDocument, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const scope = getActiveUserScope();
    const source = nodes.find((node) => node.id === nodeId);
    if (!source || source.type !== CanvasNodeType.Image) throw new Error("原图节点已删除，请保留当前遮罩后重新打开");
    const checked = readImageMaskDocument(document, source.metadata?.storageKey || "");
    if (!useCanvasStore.getState().projects.some((project) => project.id === projectId)) throw new Error("原画布已关闭，遮罩尚未保存到服务器");
    const changed = stampCanvasNodeChanges(
        nodes,
        nodes.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, imageMaskDocument: checked } } : node)),
    );
    useCanvasStore.getState().updateProject(projectId, { nodes: changed, connections });
    await saveRemoteUserDataNow(projectId);
    if (scope !== getActiveUserScope()) throw new Error("账号已切换，已停止旧账号的遮罩保存确认");
    const saved = (await getRemoteCanvasProject(projectId)).project.nodes.find((node) => node.id === nodeId);
    if (scope !== getActiveUserScope()) throw new Error("账号已切换，已停止读取旧账号的遮罩");
    if (saved?.metadata?.storageKey !== checked.sourceStorageKey || canonicalize(saved.metadata.imageMaskDocument) !== canonicalize(checked)) throw new Error("服务器上的原图或遮罩已变化，请保留当前笔画并核对项目后重试");
    return useCanvasStore.getState().projects.find((project) => project.id === projectId)?.nodes;
}
