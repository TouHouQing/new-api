import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button, Switch } from "antd";
import { Link } from "react-router";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceErrorState, WorkspaceLoadingState } from "@/components/layout/workspace-state";
import { listReviews, reviewStatusLabel } from "@/services/api/project-reviews";
import { useReviewActor } from "@/hooks/use-review-actor";

export function ReviewList({ projectId }: { projectId?: string }) {
    const [archived, setArchived] = useState(false);
    const actor = useReviewActor();
    const query = useInfiniteQuery({
        queryKey: ["reviews", actor, projectId || "inbox", archived],
        queryFn: ({ pageParam }) => listReviews(projectId, pageParam, archived),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (page) => page.nextCursor,
        refetchInterval: 20000,
    });
    const rows = query.data?.pages.flatMap((page) => page.reviews) || [];
    return (
        <section className="space-y-5" aria-label="项目审片列表">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold">审片</h1>
                    <p className="mt-1 text-sm text-muted-foreground">检查固定原片，留下具体意见，再核对修复版本。</p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                    <Switch checked={archived} onChange={setArchived} aria-label="查看归档审片" />
                    查看归档
                </label>
            </header>
            <p className="text-sm text-muted-foreground">在已完成的成片、镜头候选或角色图片旁选择“送审这一版”。协作者可在这里看到获准查看的审片。</p>
            {query.isLoading && <WorkspaceLoadingState label="正在读取审片" />}
            {query.isError && <WorkspaceErrorState title="审片读取失败" description="请检查登录状态或项目权限后重试。" onRetry={() => void query.refetch()} />}
            {!query.isLoading && !query.isError && !rows.length && <p className="py-8 text-muted-foreground">{archived ? "没有归档的审片。" : "暂无审片，先选择一份完成的原片送审。"}</p>}
            <ul className="divide-y divide-border">
                {rows.map((row) => (
                    <li key={row.id}>
                        <Link className="flex flex-wrap items-center justify-between gap-3 py-4 focus-visible:outline" to={`/reviews/${row.id}`}>
                            <div className="min-w-0">
                                <strong className="break-words">{row.title}</strong>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {new Date(row.createdAt).toLocaleString("zh-CN")} · {row.resourceKind === "video" ? "视频" : row.resourceKind === "audio" ? "音频" : "图片"}
                                    {row.parentReviewId ? " · 修复复审" : ""}
                                </p>
                            </div>
                            <span>{reviewStatusLabel(row.status)}</span>
                        </Link>
                    </li>
                ))}
            </ul>
            {query.hasNextPage && (
                <Button loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                    更早的审片
                </Button>
            )}
        </section>
    );
}
export default function ReviewsPage() {
    return (
        <WorkspacePage>
            <ReviewList />
        </WorkspacePage>
    );
}
