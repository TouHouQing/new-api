import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "antd";
import { Link, useSearchParams } from "react-router";
import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { useEditorHostContext, useEditorStoreApi, useEditorStoreContext } from "@/components/editor/editor-context";
import { getReviewRework, type ReviewView } from "@/services/api/project-reviews";
import { locateReviewRework } from "@/lib/timeline/review-rework";
import { reviewTime } from "./review-player";
import { useReviewActor } from "@/hooks/use-review-actor";

export function ReviewRework({ view, commentId }: { view: ReviewView; commentId: string }) {
    const [open, setOpen] = useState(false);
    const actor = useReviewActor();
    const query = useQuery({ queryKey: ["review-rework", actor, view.review.id, commentId], queryFn: () => getReviewRework(view.review.projectId, view.review.id, commentId), enabled: open });
    const result = query.data;
    return (
        <>
            <Button size="small" onClick={() => setOpen(true)}>
                查看返工来源
            </Button>
            <AppModal title="这条意见对应的原片" open={open} onCancel={() => setOpen(false)} footer={<Button onClick={() => setOpen(false)}>返回意见</Button>}>
                {query.isLoading && <p>正在核对原片与位置…</p>}
                {query.isError && <Button onClick={() => void query.refetch()}>重新读取返工来源</Button>}
                {result && (
                    <div className="space-y-3 text-sm">
                        <p>
                            审片位置：{reviewTime(result.location.programStartMs)}
                            {result.location.programEndMs !== result.location.programStartMs ? `–${reviewTime(result.location.programEndMs)}` : ""}
                            {result.location.wholeTarget ? " · 整片或完整片段" : ""}
                        </p>
                        <p>{result.location.sourceTimeKnown ? `原片区间：${reviewTime(result.location.sourceStartMs)}–${reviewTime(result.location.sourceEndMs)}` : "这是图片、文字或没有原始时钟的片段，不虚构原片时间。"}</p>
                        {result.location.clip && <p>具体片段：{result.location.clip.title || result.location.clip.id}</p>}
                        <p className="text-muted-foreground">先核对当前制作是否仍使用这份原片。修改后选择新版本送审并关联本轮，再检查修复效果。</p>
                        {view.role === "owner" &&
                            (result.source.kind === "cut" ? (
                                <Link className="underline" to={`/projects/${view.review.projectId}/editor?reviewId=${encodeURIComponent(view.review.id)}&reviewCommentId=${encodeURIComponent(commentId)}`}>
                                    到剪辑中核对这个片段
                                </Link>
                            ) : result.source.kind === "artifact" && result.source.unitId && result.source.shotId ? (
                                <Link
                                    className="underline"
                                    to={`/projects/${view.review.projectId}/workflow/${encodeURIComponent(result.source.unitId)}/${view.review.resourceKind === "video" ? "video" : "storyboard"}?shotId=${encodeURIComponent(result.source.shotId)}`}
                                >
                                    到对应镜头制作修复版
                                </Link>
                            ) : (
                                <Link className="underline" to={`/projects/${view.review.projectId}/assets`}>
                                    到项目资产制作修复版
                                </Link>
                            ))}
                    </div>
                )}
            </AppModal>
        </>
    );
}

export function EditorReviewRework() {
    const [params, setParams] = useSearchParams();
    const reviewId = params.get("reviewId") || "",
        commentId = params.get("reviewCommentId") || "";
    const { projectId } = useEditorHostContext();
    const actor = useReviewActor();
    const store = useEditorStoreApi(),
        { project } = useEditorStoreContext();
    const query = useQuery({ queryKey: ["review-rework", actor, projectId, reviewId, commentId], queryFn: () => getReviewRework(projectId, reviewId, commentId), enabled: !!reviewId && !!commentId });
    if (!reviewId || !commentId) return null;
    const match = query.data && project ? locateReviewRework(project, query.data.location) : null;
    return (
        <div role="status" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
            <span>{query.isLoading ? "正在核对审片来源…" : query.isError ? "返工来源读取失败，请重新核对。" : match ? "当前剪辑仍有同一原片和时钟的具体片段，可以定位后编辑。" : "这条意见的原片或剪辑时钟已变化，请核对原审片后手动选择返工范围。"}</span>
            {query.isError && (
                <Button size="small" onClick={() => void query.refetch()}>
                    重新核对来源
                </Button>
            )}
            {match && (
                <Button
                    size="small"
                    onClick={() => {
                        const current = store.getState();
                        const verified = query.data && current.project ? locateReviewRework(current.project, query.data.location) : null;
                        if (verified) {
                            current.pausePlayback();
                            current.selectClip(verified.clipId);
                            current.seekTransportMs(verified.timeMs);
                        }
                    }}
                >
                    定位原片段
                </Button>
            )}
            <Link className="underline" to={`/reviews/${encodeURIComponent(reviewId)}`}>
                查看原审片
            </Link>
            <Button
                size="small"
                onClick={() => {
                    const next = new URLSearchParams(params);
                    next.delete("reviewId");
                    next.delete("reviewCommentId");
                    setParams(next, { replace: true });
                }}
            >
                关闭返工提示
            </Button>
        </div>
    );
}
