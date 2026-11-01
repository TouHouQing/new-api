import { latestImageLayerPlan, type ImageLayerPlan, type ImageLayerPlanningPurpose } from "@/lib/canvas/canvas-image-layer-plan";
import { readNativeImageLayerPlan, type NativeImageLayerPlanReceipt } from "@/lib/canvas/canvas-image-layer-plan-receipt";
import { http } from "@/services/api/request";
import { resourceIdFromStorageKey } from "@/services/api/resources";
import { queryGenerationTask } from "@/services/api/task-center";

type PlanningHistoryPage = {
    source: { sha256: string };
    entries: { taskId: string; status: string; model: string; createdAt: string; legacy: boolean; planning?: NativeImageLayerPlanReceipt }[];
    nextCursor?: string;
};

/** 按原图读取持久规划，独立翻页，不受其他创作任务数量影响。 */
export class ImageLayerPlanningPendingError extends Error {
    constructor(readonly taskId: string) {
        super(`已有识图任务仍在进行（${taskId}），请稍后读取已有规划；本次没有重复提交。`);
    }
}
export class ImageLayerPlanningEmptyError extends Error {}

export async function readImageLayerPlanningHistory(projectId: string, sourceNodeId: string, sourceStorageKey: string | undefined, signal: AbortSignal, purpose?: ImageLayerPlanningPurpose) {
    const resourceId = resourceIdFromStorageKey(sourceStorageKey || "");
    if (!resourceId) throw new Error("原图尚未保存完成，请先完成保存");
    let cursor = "";
    let newerCorrection = false;
    const seen = new Set<string>();
    do {
        signal.throwIfAborted();
        if (seen.has(cursor)) throw new Error("规划历史分页重复，请重新打开规划");
        seen.add(cursor);
        const page = await http.get<PlanningHistoryPage>(`/canvas-projects/${encodeURIComponent(projectId)}/image-layer-plans`, { params: { sourceNodeId, resourceId, limit: 20, ...(cursor ? { cursor } : {}) }, signal });
        for (const entry of page.entries) {
            signal.throwIfAborted();
            if (!["succeeded", "failed", "canceled", "cancelled"].includes(entry.status)) throw new ImageLayerPlanningPendingError(entry.taskId);
            if (entry.status !== "succeeded") continue;
            let plan: ImageLayerPlan | undefined;
            if (entry.legacy) {
                const task = await queryGenerationTask(entry.taskId, { signal });
                plan = latestImageLayerPlan([task], projectId, sourceNodeId, sourceStorageKey);
            } else if (entry.planning?.status === "needs_correction") {
                newerCorrection = true;
                continue;
            } else {
                if (purpose && entry.planning?.purpose !== purpose) continue;
                plan = readNativeImageLayerPlan(entry.planning, { taskId: entry.taskId, sourceNodeId, storageKey: sourceStorageKey, sha256: page.source.sha256 });
            }
            if (plan)
                return {
                    ...plan,
                    model: entry.model,
                    warnings: [...(plan.warnings || []), `已读取 ${entry.createdAt} 的已有规划，没有新增模型调用；请核对当前要求。`, ...(newerCorrection ? ["较新的识图结果需要修正，当前显示此前可用的规划；原回复仍保留在任务记录中。"] : [])],
                };
        }
        cursor = page.nextCursor || "";
    } while (cursor);
    if (newerCorrection) throw new Error("识图回复已保存，但未形成可用规划；请在任务中心查看原回复，调整描述后重新识图。");
    throw new ImageLayerPlanningEmptyError("这张原图还没有符合当前用途的可用规划，请先识图规划。");
}
