import { getActiveUserScope } from "@/lib/user-scope";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { createImageLayerWorkflow, type ImageLayerWorkflowRequest, type ImageLayerWorkflowResult } from "@/services/api/image-operations";
import { ApiError } from "@/services/api/request";
import { getRemoteCanvasProject } from "@/services/api/user-data";
import { isNativeLayerWorkflowCurrent } from "@/lib/native-layer-workflow-task";
import { loadCanvasProjectForEditing, saveRemoteUserDataNow } from "@/services/user-data-sync";

const pending = new Map<string, Promise<ImageLayerWorkflowResult | undefined>>();

/** Store the exact confirmed plan before submission. An unknown HTTP reply may
 * be replayed, including after closing the page, without resubmitting models. */
export async function submitNativeLayerWorkflow(projectId: string, sourceNodeId: string, request?: Omit<ImageLayerWorkflowRequest, "requestId">, signal?: AbortSignal) {
    const scope = getActiveUserScope(),
        purpose = request?.resumeTaskId || "initial",
        key = `${scope}:${projectId}:${sourceNodeId}:${purpose}`;
    if (pending.has(key)) return pending.get(key)!;
    const current = () => {
        signal?.throwIfAborted();
        if (scope !== getActiveUserScope()) throw new DOMException("Aborted", "AbortError");
    };
    const run = async () => {
        const storage = localForageStorageForScope(scope),
            journalKey = `native-layer-workflow:${projectId}:${sourceNodeId}${purpose === "initial" ? "" : `:resume:${purpose}`}`;
        const raw = await storage.getItem(journalKey);
        current();
        if (!raw && !request) return undefined;
        const body: ImageLayerWorkflowRequest = raw ? JSON.parse(raw) : { ...request!, requestId: crypto.randomUUID() };
        if (
            (raw && raw.length > 524288) ||
            !/^[a-f0-9-]{36}$/.test(body.requestId) ||
            body.sourceNodeId !== sourceNodeId ||
            !body.resourceId ||
            !/^[a-f0-9]{64}$/.test(body.expectedSourceSha256) ||
            !Array.isArray(body.layers) ||
            body.layers.length < 2 ||
            body.layers.length > 8 ||
            !Number.isFinite(body.maxCredits) ||
            body.maxCredits < 0
        )
            throw new Error("本机拆层记录无法读取，请保留浏览器数据并核对任务中心");
        const encoded = JSON.stringify(body);
        await storage.setItem(journalKey, encoded);
        if ((await storage.getItem(journalKey)) !== encoded) throw new Error("未能保存拆层操作编号，本次尚未提交");
        current();
        await saveRemoteUserDataNow(projectId);
        current();
        let result: ImageLayerWorkflowResult;
        try {
            result = await createImageLayerWorkflow(projectId, body, signal);
        } catch (error) {
            if (error instanceof ApiError && [400, 403, 404, 409, 413, 429].includes(error.status || 0)) await storage.removeItem(journalKey);
            throw error;
        }
        current();
        await loadCanvasProjectForEditing(projectId);
        current();
        const project = (await getRemoteCanvasProject(projectId)).project;
        current();
        await storage.removeItem(journalKey);
        if (!isNativeLayerWorkflowCurrent(project?.nodes, result)) throw new Error("拆层历史已保留，但节点已被后续编辑或删除；请在任务中心查看原任务，按当前原图重新确认拆层");
        return result;
    };
    const action = typeof navigator !== "undefined" && navigator.locks ? navigator.locks.request(`yingce-layer-workflow:${key}`, run) : run();
    pending.set(key, action);
    try {
        return await action;
    } finally {
        if (pending.get(key) === action) pending.delete(key);
    }
}
