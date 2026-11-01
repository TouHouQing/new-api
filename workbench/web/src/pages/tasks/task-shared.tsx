import { Coins } from "lucide-react";

import { CONTENT_MODERATION_ERROR_CODE, generationErrorMessage, isContentModerationError } from "@/lib/generation-error";
import { taskBillingDisplay, taskBillingLabel } from "@/lib/generation-task-billing";
import { mediaDeliverySummary } from "@/lib/generation-task-display";
import type { GenerationTask, TaskStatus } from "@/services/api/task-center";
import { modelDisplayName, type AiConfig } from "@/stores/use-config-store";
import { RelativeTime } from "@/components/ui/product/relative-time";

export function getTaskCanvasContext(task: GenerationTask, canvasById: Map<string, { title: string; projectId?: string }>, projectNameById: Map<string, string>) {
    if (!task.projectId) return { canvasName: "未绑定画布", projectName: "" };
    if (task.canvasContext?.status === "available") return { canvasName: task.canvasContext.title || "未命名画布", projectName: task.canvasContext.projectId ? projectNameById.get(task.canvasContext.projectId) || "" : "" };
    const projectName = projectNameById.get(task.projectId);
    if (task.canvasContext?.status === "unavailable") return projectName ? { canvasName: "项目级任务", projectName } : { canvasName: "画布暂不可用", projectName: "" };
    const canvas = canvasById.get(task.projectId);
    if (canvas) return { canvasName: canvas.title || "未命名画布", projectName: canvas.projectId ? projectNameById.get(canvas.projectId) || "" : "" };
    return projectName ? { canvasName: "项目级任务", projectName } : { canvasName: "未加载画布", projectName: "" };
}

export function taskCanvasProjectOptions(tasks: readonly GenerationTask[], canvases: readonly { id: string; title: string; projectId?: string }[], projectNameById: Map<string, string>) {
    const labels = new Map(canvases.map((canvas) => [canvas.id, canvas]));
    for (const task of tasks) if (task.projectId && task.canvasContext?.status === "available") labels.set(task.projectId, { id: task.projectId, title: task.canvasContext.title || "未命名画布", projectId: task.canvasContext.projectId });
    return Array.from(labels.values(), (canvas) => {
        const projectName = canvas.projectId ? projectNameById.get(canvas.projectId) : "";
        return { label: projectName ? `${canvas.title || "未命名画布"} · ${projectName}` : canvas.title || "未命名画布", value: canvas.id };
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
    if (task.errorCode === CONTENT_MODERATION_ERROR_CODE || isContentModerationError(task.error)) return "内容审核未通过，请修改输入后新建任务";
    if (task.error) return generationErrorMessage(task.error);
    return task.stage || "生成失败，打开详情查看原因";
}

export function providerCancelStatusLabel(task: GenerationTask) {
    if (task.providerCancelStatus === "requested") return "已请求上游取消，正在等待确认";
    if (task.providerCancelStatus === "confirmed") return task.billing?.status === "refunded" ? "推理已确认停止，积分已退回" : "推理已确认停止";
    if (task.providerCancelStatus === "uncertain") {
        if (task.billing?.status === "settled") return "上游未能取消，费用已结算";
        if (task.billing?.status === "refunded") return "上游取消结果未确认，积分已退回";
        return task.providerCancelError || "上游无法确认取消，费用待核对";
    }
    return task.billing?.status === "refunded" ? "任务在调用上游前取消，积分已退回" : "任务已取消，可按原输入重新提交";
}

export function statusDotClassName(status: TaskStatus) {
    if (status === "succeeded") return "task-record-dot is-success";
    if (status === "running") return "task-record-dot is-active is-pulsing";
    if (status === "queued") return "task-record-dot is-queued";
    if (status === "failed") return "task-record-dot is-failed";
    return "task-record-dot is-idle";
}

export function taskMediaKind(task: GenerationTask): "text" | "image" | "video" | "audio" {
    if (task.type === "canvas_audio") return "audio";
    const value = `${task.type} ${task.operation || ""}`.toLowerCase();
    if (value.includes("video") || value.includes("视频")) return "video";
    if (value.includes("image") || value.includes("图片") || value.includes("画面")) return "image";
    return "text";
}

export function TaskDate({ value }: { value?: string }) {
    if (!value || !Number.isFinite(Date.parse(value))) return <span className="text-xs text-foreground/38">-</span>;
    return <RelativeTime className="task-record-date-value" value={value} />;
}

export function TaskBilling({ billing }: { billing?: GenerationTask["billing"] }) {
    if (!billing) return <span className="task-record-billing-empty text-xs text-foreground/30">-</span>;
    const display = taskBillingDisplay(billing);
    return (
        <div className={`task-record-billing ${display.tone === "uncertain" ? "is-uncertain" : ""}`} title={taskBillingLabel(billing)}>
            <Coins className="size-4" />
            <span>
                <strong>{display.amount}</strong>
                <small>{display.refundNote ? `${display.note} · ${display.refundNote}` : display.note}</small>
            </span>
        </div>
    );
}

export function formatModelName(config: AiConfig, task: Pick<GenerationTask, "type" | "operation" | "provider" | "model">) {
    if (task.type === "image_operation" && task.operation === "layer-workflow") return "图层工作流 · 模型费用见子任务";
    if (task.type === "image_operation" && task.provider === "local") return "本地图片处理 · 无需模型";
    const raw = (task.model || task.provider || "").trim();
    const model = raw.includes("::") ? raw.split("::").pop()?.trim() || raw : raw;

    // 工作流名称是任务快照，不属于模型渠道，不能交给模型展示名解析器再次映射成“系统模型”。
    if (task.provider === "runninghub") return raw || "工作流";
    if (!model) return "工作流";
    if (model === "version-router") return "版本对比工作流";
    if (model === "image-raster-v1") return "本地图片处理 · 无需模型";
    if (model === "workflow-router") return "工作流路由";
    if (model === "internal-agent") return "内置工作流";
    if (model === "openai-compatible") return "OpenAI 兼容接口";
    return modelDisplayName(config, raw);
}
