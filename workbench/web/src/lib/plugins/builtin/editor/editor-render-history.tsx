import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Button } from "antd";
import { Link } from "react-router";
import { getActiveUserScope } from "@/lib/user-scope";
import { projectRenderPage, projectRenderResult, projectRenderCutId } from "@/services/project-render-history";
import { queryGenerationTask, type TaskStatus } from "@/services/api/task-center";
import { getProjectCut } from "@/services/api/project-cuts";
import { resourceFileUrl } from "@/services/api/resources";
import { SendForReview } from "@/components/reviews/send-for-review";

const statuses: Record<TaskStatus, string> = { queued: "等待导出", running: "正在导出", succeeded: "已完成", failed: "导出失败", cancelled: "已取消", text_replay: "存档记录" };
const date = (value: string) => (Number.isNaN(new Date(value).getTime()) ? "时间未记录" : new Date(value).toLocaleString());
export function EditorRenderHistory({ projectId, onExistingChange }: { projectId: string; onExistingChange?: (found: boolean) => void }) {
    const scope = getActiveUserScope(),
        [selected, setSelected] = useState(""),
        [previewFailed, setPreviewFailed] = useState(false);
    const requireOwner = () => {
        if (getActiveUserScope() !== scope) throw new Error("账号已切换，请重新读取当前项目的成片");
    };
    const history = useInfiniteQuery({
        queryKey: ["project-renders", scope, projectId],
        initialPageParam: undefined as string | undefined,
        queryFn: async ({ pageParam, signal }) => {
            requireOwner();
            const page = await projectRenderPage(projectId, pageParam, signal);
            requireOwner();
            return page;
        },
        getNextPageParam: (last) => last.nextCursor,
        refetchOnWindowFocus: true,
    });
    const tasks = Array.from(new Map((history.data?.pages.flatMap((page) => page.tasks) || []).map((task) => [task.id, task])).values());
    useEffect(() => {
        onExistingChange?.(tasks.length > 0);
        if (!selected && tasks[0]) setSelected(tasks[0].id);
    }, [history.data, onExistingChange, selected]);
    const task = useQuery({
        queryKey: ["project-render", scope, projectId, selected],
        enabled: !!selected,
        queryFn: async ({ signal }) => {
            requireOwner();
            const result = await queryGenerationTask(selected, { signal });
            requireOwner();
            if (result.projectId !== projectId || result.type !== "timeline_render") throw new Error("成片与当前项目不匹配");
            return result;
        },
        refetchInterval: (query) => (query.state.data && ["queued", "running"].includes(query.state.data.status) ? 2500 : false),
    });
    const cutId = task.data ? projectRenderCutId(task.data) : undefined;
    const cut = useQuery({
        queryKey: ["project-render-cut", scope, projectId, cutId],
        enabled: !!cutId,
        queryFn: async ({ signal }) => {
            requireOwner();
            const value = await getProjectCut(projectId, cutId!, signal);
            requireOwner();
            return value;
        },
    });
    useEffect(() => setPreviewFailed(false), [selected, task.data?.resultJson]);
    if (getActiveUserScope() !== scope) return null;
    let result: ReturnType<typeof projectRenderResult> | undefined,
        resultError = "";
    if (task.data?.status === "succeeded")
        try {
            result = projectRenderResult(task.data, projectId);
        } catch (error) {
            resultError = error instanceof Error ? error.message : "无法读取成片";
        }
    return (
        <section aria-label="项目已有成片" className="mb-4 space-y-2 border-b border-[var(--previs-sequencer-border)] pb-3 text-xs text-[var(--previs-dock-fg)]">
            <div className="flex items-center justify-between gap-2">
                <strong>已有成片与导出记录</strong>
                <Button
                    size="small"
                    loading={history.isFetching}
                    onClick={() => {
                        void history.refetch();
                        if (selected) void task.refetch();
                    }}
                >
                    刷新记录
                </Button>
            </div>
            <p className="leading-relaxed opacity-70">这些记录保存在项目中，换浏览器也能找回。查看和下载会使用已有文件。</p>
            {history.isPending ? (
                <p role="status">正在读取成片记录…</p>
            ) : history.isError ? (
                <p role="alert">{history.error.message}</p>
            ) : !tasks.length ? (
                <p>还没有导出记录。完成剪辑后，可在下方导出成片。</p>
            ) : (
                <>
                    <select aria-label="选择已有成片记录" className="w-full rounded-md border border-[var(--previs-sequencer-border)] bg-[var(--previs-sequencer-surface-raised)] p-2" value={selected} onChange={(event) => setSelected(event.target.value)}>
                        {selected && !tasks.some((value) => value.id === selected) && <option value={selected}>{task.data ? `${statuses[task.data.status]} · ${date(task.data.createdAt)}` : "正在核对已选记录…"}</option>}
                        {tasks.map((value) => (
                            <option key={value.id} value={value.id}>
                                {statuses[value.status] || "待核对"} · {date(value.createdAt)}
                            </option>
                        ))}
                    </select>
                    {history.hasNextPage && (
                        <Button size="small" loading={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
                            更早的成片
                        </Button>
                    )}
                    {task.isPending ? (
                        <p role="status">正在读取所选成片…</p>
                    ) : task.isError ? (
                        <p role="alert">
                            {task.error.message}
                            <Button size="small" onClick={() => void task.refetch()}>
                                重新读取成片
                            </Button>
                        </p>
                    ) : (
                        task.data && (
                            <>
                                {cut.data ? (
                                    <p>
                                        来源：{cut.data.cut.title}
                                        {cut.data.cut.archived ? " · 已归档版本" : ""}
                                    </p>
                                ) : cut.isError ? (
                                    <p>来源版本暂时无法读取，原文件和任务记录仍可核对。</p>
                                ) : !cutId ? (
                                    <p>这份早期成片未记录固定剪辑版本，请核对其画面。</p>
                                ) : null}
                                {task.data.status !== "succeeded" && (
                                    <p role={task.data.status === "failed" ? "alert" : "status"}>
                                        {statuses[task.data.status]}
                                        {task.data.status === "running" ? ` · ${task.data.progress || 0}%` : ""}
                                        {task.data.error ? `：${task.data.error}` : ""}
                                    </p>
                                )}
                                {resultError && <p role="alert">{resultError}</p>}
                                {result && (
                                    <>
                                        <video aria-label="已有成片预览" controls preload="metadata" src={resourceFileUrl(result.resourceId)} className="max-h-56 w-full bg-black" onError={() => setPreviewFailed(true)} />
                                        {previewFailed ? (
                                            <p role="alert">成片文件暂不可用，请恢复文件或查看任务记录。</p>
                                        ) : (
                                            <a className="inline-block font-medium text-[var(--previs-accent)] underline" href={resourceFileUrl(result.resourceId)} download={result.fileName}>
                                                下载已有成片
                                            </a>
                                        )}
                                        <p className="opacity-70">
                                            {result.width && result.height ? `${result.width}×${result.height} · ` : ""}
                                            {result.durationMs ? `${(result.durationMs / 1000).toFixed(1)} 秒` : ""}
                                        </p>
                                    </>
                                )}
                                {result && !previewFailed && cut.data && (
                                    <div className="flex flex-col items-start gap-1">
                                        <SendForReview
                                            projectId={projectId}
                                            title={`${cut.data.cut.title} · 成片审片`}
                                            target={{ kind: "cut", cutId: cut.data.cut.id, cutSha256: cut.data.cut.timelineSha256, renderTaskId: task.data.id }}
                                            disabled={cut.data.cut.archived || !!cut.data.deliveryBlockers?.length}
                                        />
                                        {!!cut.data.deliveryBlockers?.length && <p className="opacity-70">请先核对该版本尚未完成的内容，再送审。</p>}
                                    </div>
                                )}
                            </>
                        )
                    )}
                </>
            )}
            <Link className="inline-block underline" to="/tasks">
                查看任务记录
            </Link>
        </section>
    );
}
