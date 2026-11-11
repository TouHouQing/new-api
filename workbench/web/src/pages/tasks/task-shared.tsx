import { AudioLines, Coins, FileText, Image as ImageIcon, Video, type LucideIcon } from "lucide-react";

import { CONTENT_MODERATION_ERROR_CODE, generationErrorMessage, isContentModerationError } from "@/lib/generation-error";
import { taskBillingDisplay, taskBillingLabel } from "@/lib/generation-task-billing";
import { generationTaskStatusLabel, mediaDeliverySummary } from "@/lib/generation-task-display";
import type { GenerationTask } from "@/services/api/task-center";
import { modelDisplayName, type AiConfig } from "@/stores/use-config-store";
import { RelativeTime } from "@/components/ui/product/relative-time";
import { translate } from "@/i18n";
import { nativeLayerWorkflowParentId } from "@/lib/native-layer-workflow-task";

export function getTaskCanvasContext(task: GenerationTask, canvasById: Map<string, { title: string; projectId?: string }>, projectNameById: Map<string, string>) {
    if (!task.projectId) return { canvasName: translate("library.tasks.shared.unboundCanvas"), projectName: "" };
    if (task.canvasContext?.status === "available")
        return {
            canvasName: task.canvasContext.title || translate("library.tasks.shared.untitledCanvas"),
            projectName: task.canvasContext.projectId ? projectNameById.get(task.canvasContext.projectId) || "" : "",
        };
    const projectName = projectNameById.get(task.projectId);
    if (task.canvasContext?.status === "unavailable") return projectName ? { canvasName: translate("library.tasks.shared.projectTask"), projectName } : { canvasName: "画布暂不可用", projectName: "" };
    const canvas = canvasById.get(task.projectId);
    if (canvas) return { canvasName: canvas.title || translate("library.tasks.shared.untitledCanvas"), projectName: canvas.projectId ? projectNameById.get(canvas.projectId) || "" : "" };
    return projectName ? { canvasName: translate("library.tasks.shared.projectTask"), projectName } : { canvasName: "未加载画布", projectName: "" };
}

export function taskCanvasProjectOptions(tasks: readonly GenerationTask[], canvases: readonly { id: string; title: string; projectId?: string }[], projectNameById: Map<string, string>) {
    const labels = new Map(canvases.map((canvas) => [canvas.id, canvas]));
    for (const task of tasks)
        if (task.projectId && task.canvasContext?.status === "available") labels.set(task.projectId, { id: task.projectId, title: task.canvasContext.title || translate("library.tasks.shared.untitledCanvas"), projectId: task.canvasContext.projectId });
    return Array.from(labels.values(), (canvas) => {
        const projectName = canvas.projectId ? projectNameById.get(canvas.projectId) : "";
        return { label: projectName ? `${canvas.title || translate("library.tasks.shared.untitledCanvas")} · ${projectName}` : canvas.title || translate("library.tasks.shared.untitledCanvas"), value: canvas.id };
    });
}

// Detail and cancellation replies omit list-only context; retain it only for
// the same immutable task/canvas binding, while a newer server context wins.
export function taskWithCanvasContext(next: GenerationTask, previous?: GenerationTask | null): GenerationTask {
    if (next.canvasContext || !previous?.canvasContext || next.id !== previous.id || next.projectId !== previous.projectId) return next;
    return { ...next, canvasContext: previous.canvasContext };
}

export function isTaskFailed(task: GenerationTask) {
    return task.status === "failed" || task.status === "cancelled";
}

export function taskAttentionReason(task: GenerationTask) {
    if (task.status === "cancelled") return providerCancelStatusLabel(task);
    if (task.mediaStage) return mediaDeliverySummary(task.status, task.mediaStage, task.type);
    if (task.errorCode === CONTENT_MODERATION_ERROR_CODE || isContentModerationError(task.error)) return translate("library.tasks.shared.moderationFailed");
    if (task.error) return generationErrorMessage(task.error);
    return task.stage || translate("library.tasks.shared.failedOpenDetail");
}

export function providerCancelStatusLabel(task: GenerationTask) {
    if (task.providerCancelStatus === "requested") return translate("library.tasks.cancel.requested");
    if (task.providerCancelStatus === "confirmed") return task.billing?.status === "refunded" ? "推理已确认停止，积分已退回" : "推理已确认停止";
    if (task.providerCancelStatus === "uncertain") {
        if (task.billing?.status === "settled") return translate("library.tasks.cancel.uncertainSettled");
        if (task.billing?.status === "refunded") return translate("library.tasks.cancel.uncertainRefunded");
        return task.providerCancelError || translate("library.tasks.cancel.uncertainPending");
    }
    return task.billing?.status === "refunded" ? translate("library.tasks.cancel.beforeUpstream") : translate("library.tasks.cancel.cancelled");
}

export function isTaskActive(task: GenerationTask) {
    return task.status === "queued" || task.status === "running";
}

/** 内容审核失败的任务按原输入重试仍会失败，界面上不提供自动重试。 */
export function isTaskRetryBlocked(task: GenerationTask) {
    return task.providerCancelStatus === "requested" || task.errorCode === CONTENT_MODERATION_ERROR_CODE || isContentModerationError(task.error);
}

export function taskRetryActionLabel(task: GenerationTask) {
    if (task.canRecoverMedia) return translate("library.tasks.row.retrySave");
    if (task.type === "video_rework") return "返回剪辑修复";
    if (nativeLayerWorkflowParentId(task)) return "打开画布继续图层";
    return translate("library.tasks.row.retryTask");
}

export function taskDeliveryFacts(task?: GenerationTask | null): Array<{ label: string; value: string }> {
    const facts: Array<{ label: string; value: string }> = [];
    if (task?.canvasDeliveryStatus) {
        let value = "任务结束后自动保存，关闭页面也会继续";
        if (task.canvasDeliveryStatus === "applied") value = "已同步到原画布";
        else if (task.canvasDeliveryStatus === "skipped") value = "原节点已移除或更换，结果保留在任务中";
        else if (task.status === "succeeded") value = "作品已生成，等待同步画布；服务会自动重试保存，无需重新生成";
        facts.push({ label: "画布保存", value });
    }
    if (task?.imageLayerDeliveryStatus) {
        let value = "已记录回写，当前作品以画布版本为准";
        if (task.imageLayerDeliveryStatus === "pending") value = "等待回写；原图层组与已生成素材均保留";
        else if (task.imageLayerDeliveryStatus === "detached") value = "图层已变化，结果作为独立素材保留";
        facts.push({ label: "图层组回写", value });
    }
    return facts;
}

export type TaskTone = "running" | "queued" | "success" | "failed" | "cancelled" | "recorded";

export function taskTone(task: GenerationTask): TaskTone {
    if (task.providerCancelStatus === "uncertain") return "failed";
    if (task.status === "text_replay") return "recorded";
    if (task.status === "running") return "running";
    if (task.status === "queued") return "queued";
    if (task.status === "succeeded") return "success";
    if (task.status === "cancelled") return "cancelled";
    return "failed";
}

/** 状态胶囊：圆点 + 文案，颜色由 data-tone 决定，运行中圆点会呼吸。 */
export function TaskStatusPill({ task, className = "" }: { task: GenerationTask; className?: string }) {
    return (
        <span className={`task-center-status ${className}`} data-tone={taskTone(task)}>
            <i aria-hidden="true" />
            {generationTaskStatusLabel(task)}
        </span>
    );
}

export function taskMediaKind(task: GenerationTask): "text" | "image" | "video" | "audio" {
    if (task.type === "canvas_audio") return "audio";
    const value = `${task.type} ${task.operation || ""}`.toLowerCase();
    if (value.includes("video") || value.includes("视频")) return "video";
    if (value.includes("image") || value.includes("图片") || value.includes("画面")) return "image";
    return "text";
}

export function taskKindIcon(task: GenerationTask): LucideIcon {
    const kind = taskMediaKind(task);
    if (kind === "audio") return AudioLines;
    return kind === "video" ? Video : kind === "image" ? ImageIcon : FileText;
}

export function TaskDate({ value }: { value?: string }) {
    if (!value || !Number.isFinite(Date.parse(value))) return <span className="task-center-muted">-</span>;
    return <RelativeTime value={value} />;
}

export function TaskBilling({ billing }: { billing?: GenerationTask["billing"] }) {
    if (!billing) return <span className="task-center-muted">-</span>;
    const display = taskBillingDisplay(billing);
    return (
        <span className="task-center-billing" data-tone={display.tone} title={taskBillingLabel(billing)}>
            <Coins aria-hidden="true" />
            <span>
                <strong>{display.amount}</strong>
                <small>{display.refundNote ? `${display.note} · ${display.refundNote}` : display.note}</small>
            </span>
        </span>
    );
}

export function formatModelName(config: AiConfig, task: Pick<GenerationTask, "type" | "operation" | "provider" | "model">) {
    if (task.type === "image_operation" && task.operation === "layer-workflow") return "图层工作流 · 模型费用见子任务";
    if (task.type === "image_operation" && task.provider === "local") return "本地图片处理 · 无需模型";
    const raw = (task.model || task.provider || "").trim();
    const model = raw.includes("::") ? raw.split("::").pop()?.trim() || raw : raw;

    // 工作流名称是任务快照，不属于模型渠道，不能交给模型展示名解析器再次映射成“系统模型”。
    if (task.provider === "runninghub") return raw || translate("library.tasks.model.workflow");
    if (!model) return translate("library.tasks.model.workflow");
    if (model === "version-router") return translate("library.tasks.model.versionRouter");
    if (model === "workflow-router") return translate("library.tasks.model.workflowRouter");
    if (model === "internal-agent") return translate("library.tasks.model.internalAgent");
    if (model === "openai-compatible") return translate("library.tasks.model.openaiCompatible");
    if (model === "image-raster-v1") return "本地图片处理 · 无需模型";
    return modelDisplayName(config, raw);
}
