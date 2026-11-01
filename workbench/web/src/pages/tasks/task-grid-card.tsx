import { Button } from "antd";
import { nativeLayerWorkflowParentId } from "@/lib/native-layer-workflow-task";
import { IconButton } from "@/components/ui/base/buttons";
import { Tooltip } from "@/components/ui/base/tooltip";
import { AudioLines, Eye, FileText, Image as ImageIcon, RotateCcw, Video, XCircle } from "lucide-react";

import { MediaPreview } from "@/components/media-preview";
import { CONTENT_MODERATION_ERROR_CODE, isContentModerationError } from "@/lib/generation-error";
import { canCancelGenerationTask, generationTaskShowsProgress, generationTaskStageLabel, generationTaskStatusLabel } from "@/lib/generation-task-display";
import type { GenerationTask } from "@/services/api/task-center";
import { isTaskFailed, statusDotClassName, taskAttentionReason, TaskDate } from "./task-shared";
import { TaskVideoThumbnail } from "./task-video-thumbnail";
import { progressFillStyle } from "@/lib/progress-fill";

export function TaskGridCard({ task, actingId, onOpen, onRetry, onCancel }: { task: GenerationTask; actingId: string; onOpen: () => void; onRetry: () => void; onCancel?: () => void }) {
    const isActive = task.status === "queued" || task.status === "running";
    const isFailed = isTaskFailed(task);
    const needsAttention = task.status === "failed" || task.providerCancelStatus === "uncertain";
    const retryDisabled = task.providerCancelStatus === "requested" || task.errorCode === CONTENT_MODERATION_ERROR_CODE || isContentModerationError(task.error);
    const isVideo = task.previewKind === "video";
    const thumbnailUrl = isVideo ? task.previewPosterUrl : task.previewUrl;
    const fallbackVideo = task.type.includes("video");
    const stageLabel = generationTaskStageLabel(task);
    const showsProgress = generationTaskShowsProgress(task);
    const Icon = task.type === "canvas_audio" ? AudioLines : fallbackVideo ? Video : task.type.includes("image") ? ImageIcon : FileText;
    return (
        <article data-task-id={task.id} className={`product-collection-card task-grid-card${needsAttention ? " is-attention" : ""}`}>
            <div className="task-grid-thumb">
                {thumbnailUrl ? <MediaPreview src={thumbnailUrl} kind="image" loading="lazy" className="h-full w-full object-cover" /> : isVideo && task.previewUrl ? <TaskVideoThumbnail src={task.previewUrl} /> : <Icon />}
                <div className="task-grid-overlay">
                    {onCancel && canCancelGenerationTask(task) && (
                        <Tooltip title="取消任务">
                            <Button type="text" size="small" danger aria-label="取消任务" icon={<XCircle className="size-3.5" />} loading={actingId === task.id} onClick={onCancel} />
                        </Tooltip>
                    )}
                    <Tooltip title="查看详情">
                        <IconButton size="sm" variant="ghost" icon={Eye} aria-label="查看详情" onClick={onOpen} />
                    </Tooltip>
                    {isFailed ? (
                        <Tooltip
                            title={
                                task.providerCancelStatus === "requested"
                                    ? "正在核对取消，确认后可重试"
                                    : retryDisabled
                                      ? "内容审核失败，无法自动重试"
                                      : task.canRecoverMedia
                                        ? "重试保存，不重新生成"
                                        : task.type === "video_rework"
                                          ? "返回剪辑核对原范围和候选"
                                          : nativeLayerWorkflowParentId(task)
                                            ? "打开画布，保留完成层并确认继续制作"
                                            : "重试任务"
                            }
                        >
                            <Button
                                type="text"
                                size="small"
                                icon={<RotateCcw className="size-3.5" />}
                                aria-label={task.canRecoverMedia ? "重试保存" : task.type === "video_rework" ? "返回剪辑修复" : nativeLayerWorkflowParentId(task) ? "打开画布继续图层" : "重试任务"}
                                loading={actingId === task.id}
                                disabled={retryDisabled}
                                onClick={onRetry}
                            />
                        </Tooltip>
                    ) : null}
                </div>
            </div>
            <div className="task-grid-body">
                <button type="button" className="task-grid-title" title={task.prompt} onClick={onOpen}>
                    {task.prompt || "未命名任务"}
                </button>
                <div className="task-grid-meta">
                    <span className={`task-grid-status ${needsAttention ? "is-failed" : isActive ? "is-active" : task.status === "succeeded" ? "is-success" : ""}`}>
                        <i className={statusDotClassName(task.status)} />
                        {generationTaskStatusLabel(task)}
                    </span>
                    <span className="task-grid-date">
                        <TaskDate value={task.createdAt} />
                    </span>
                </div>
                {isActive && !showsProgress ? (
                    <p>{stageLabel}</p>
                ) : isActive ? (
                    <div className="task-grid-progress" role="progressbar" aria-label={stageLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={task.progress || 0}>
                        <span>{stageLabel}</span>
                        <strong>{task.progress || 0}%</strong>
                        <i>
                            <b style={progressFillStyle(task.progress || 0)} />
                        </i>
                    </div>
                ) : null}
                {isFailed ? (
                    <p className={needsAttention ? "task-grid-error" : "text-sm text-muted-foreground"} title={needsAttention ? task.error || undefined : undefined}>
                        {taskAttentionReason(task)}
                    </p>
                ) : null}
            </div>
        </article>
    );
}
