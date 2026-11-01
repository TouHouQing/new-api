import { useEffect, useRef, useState } from "react";
import { App, Button, InputNumber } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { queryGenerationTask } from "@/services/api/task-center";
import type { ImageLayerWorkflowRequest } from "@/services/api/image-operations";
import { submitNativeLayerWorkflow } from "@/services/canvas-native-layer-workflow";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import type { CanvasNodeData } from "@/types/canvas";

export function CanvasLayerWorkflowResume({ node, onOpenChange }: { node: CanvasNodeData; onOpenChange?: (open: boolean) => void }) {
    const { message } = App.useApp();
    const [open, setOpen] = useState(false),
        [busy, setBusy] = useState(false),
        [budget, setBudget] = useState<number | null>(0),
        [error, setError] = useState("");
    const controller = useRef<AbortController | null>(null);
    useEffect(() => () => controller.current?.abort(), []);
    const projects = useCanvasStore((state) => state.projects);
    const project = projects.find((project) => project.nodes.some((item) => item.id === node.id));
    const marker = node.metadata?.nativeImageLayerWorkflow;
    if (!marker || !project || !["failed", "cancelled"].includes(marker.status)) return null;
    const children = project.nodes.filter((child) => child.metadata?.nativeImageLayerWorkflowParentId === marker.taskId);
    const changeOpen = (next: boolean) => {
        setOpen(next);
        onOpenChange?.(next);
    };
    const submit = async () => {
        if (busy || budget === null || !Number.isFinite(budget) || budget < 0) return;
        setBusy(true);
        setError("");
        const abort = new AbortController();
        controller.current = abort;
        try {
            const task = await queryGenerationTask(marker.taskId, { signal: abort.signal });
            if (task.status !== "failed" && task.status !== "cancelled") throw new Error("原任务状态已变化，请刷新后再继续");
            const input = JSON.parse(task.inputJson || "{}");
            if (input.kind !== "native-image-layer-workflow" || input.canvasId !== project.id || !Array.isArray(input.request?.layers)) throw new Error("未取得原任务的固定计划，请在任务中心核对");
            const request: ImageLayerWorkflowRequest = { ...input.request, resumeTaskId: task.id, maxCredits: budget, title: `${(node.title || "图层").slice(0, 60)} · 继续制作` };
            const result = await submitNativeLayerWorkflow(project.id, request.sourceNodeId, request, abort.signal);
            if (!result) throw new Error("尚未取得继续制作回执，请保留页面记录并核对任务中心");
            message.success("已新建图层组，完成层直接复用；未完成层在后台继续制作");
            changeOpen(false);
        } catch (failure) {
            if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : "继续制作未成功，请稍后重试");
        } finally {
            if (controller.current === abort) {
                controller.current = null;
                setBusy(false);
            }
        }
    };
    return (
        <>
            <Button
                size="small"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                    event.stopPropagation();
                    changeOpen(true);
                }}
            >
                继续未完成图层
            </Button>
            <AppModal
                title="继续制作图层"
                open={open}
                width={420}
                centered
                onCancel={() => changeOpen(false)}
                footer={
                    <>
                        <Button onClick={() => changeOpen(false)}>返回画布</Button>
                        <Button type="primary" loading={busy} disabled={budget === null} onClick={() => void submit()}>
                            确认并新建图层组
                        </Button>
                    </>
                }
            >
                <div className="space-y-3 text-sm" data-canvas-no-zoom onPointerDown={(event) => event.stopPropagation()}>
                    <p>完成层复用原文件和版本，未完成层按原计划重新制作。新建图层组会保留这次制作记录，原图和原图层组继续保留。</p>
                    <ul className="space-y-1">
                        {children.map((child) => (
                            <li key={child.id}>
                                {child.title} · {child.metadata?.status === "success" ? "复用已完成素材" : "继续未完成步骤"}
                            </li>
                        ))}
                    </ul>
                    <label className="flex flex-wrap items-center gap-2">
                        本次图片生成积分上限
                        <InputNumber aria-label="继续制作积分上限" min={0} max={1_000_000} value={budget} onChange={setBudget} />
                    </label>
                    <p className="text-xs text-muted-foreground">0 仅允许免费处理。上次任务的模型结果或费用仍待核对时，会保留当前记录并暂停重新提交。</p>
                    {error ? (
                        <p role="alert" className="text-destructive">
                            {error}
                        </p>
                    ) : null}
                </div>
            </AppModal>
        </>
    );
}
