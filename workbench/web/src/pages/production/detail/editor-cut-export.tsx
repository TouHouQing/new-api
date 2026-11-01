import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "antd";
import { getActiveUserScope } from "@/lib/user-scope";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { createCutRenderSession } from "@/services/cut-render-session";
import { cancelGenerationTask, refreshGenerationTaskStatus, waitForGenerationTask, type GenerationTask } from "@/services/api/task-center";
import { resourceFileUrl } from "@/services/api/resources";
import { listProjectCutRenders, type ProjectCutView } from "@/services/api/project-cuts";
import type { TimelineRenderResult } from "@/services/api/timeline-tasks";
import { legacyImportFieldLabel } from "@/lib/legacy-import-fields";
import { SendForReview } from "@/components/reviews/send-for-review";

export function EditorCutExport({ view, disabled, onBusyChange }: { view: ProjectCutView; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
    const scope = getActiveUserScope(),
        projectId = view.cut.projectId;
    const session = useMemo(() => createCutRenderSession(projectId, view.cut, localForageStorageForScope(scope)), [projectId, view.cut.id, view.cut.timelineSha256, scope]);
    const [pending, setPending] = useState(false),
        [running, setRunning] = useState(false),
        [submitting, setSubmitting] = useState(false),
        [cancelling, setCancelling] = useState(false);
    const [taskId, setTaskId] = useState(""),
        [detail, setDetail] = useState(""),
        [error, setError] = useState(""),
        [result, setResult] = useState<TimelineRenderResult>();
    const [history, setHistory] = useState<GenerationTask[]>([]),
        [cursor, setCursor] = useState<string>();
    const [previous, setPrevious] = useState<GenerationTask>(),
        [newIntent, setNewIntent] = useState(false),
        [loadingHistory, setLoadingHistory] = useState(true),
        [historyFailed, setHistoryFailed] = useState(false);
    const controller = useRef<AbortController | null>(null),
        alive = useRef(false),
        working = useRef(false);
    const current = () => alive.current && getActiveUserScope() === scope;
    const restore = async (next = false) => {
        setLoadingHistory(true);
        setHistoryFailed(false);
        try {
            const [intent, page] = await Promise.all([session.read(), listProjectCutRenders(projectId, view.cut.id, next ? cursor : undefined)]);
            if (!current()) return;
            setPending(!!intent);
            setHistory((items) => (next ? [...items, ...page.tasks] : page.tasks));
            setCursor(page.nextCursor);
            if (!next) setPrevious(page.tasks[0]);
        } catch (cause) {
            if (current()) {
                setHistoryFailed(true);
                setError(cause instanceof Error ? cause.message : "读取已有导出失败，请重新读取后继续");
            }
        } finally {
            if (current()) setLoadingHistory(false);
        }
    };
    useEffect(() => {
        alive.current = true;
        void restore();
        return () => {
            alive.current = false;
            controller.current?.abort();
            onBusyChange(false);
        };
    }, [session, onBusyChange]);
    const exportCut = async (chosen?: GenerationTask) => {
        const known = chosen || (!newIntent ? previous : undefined);
        if (disabled || loadingHistory || historyFailed || running || submitting || working.current || (!known && view.cut.archived)) return;
        working.current = true;
        const abort = new AbortController();
        controller.current?.abort();
        controller.current = abort;
        setSubmitting(true);
        onBusyChange(true);
        setError("");
        setResult(undefined);
        try {
            let task: GenerationTask;
            if (chosen || (!pending && known)) task = await refreshGenerationTaskStatus(known!.id);
            else {
                setPending(true);
                task = await session.submit();
            }
            if (!current()) return;
            setTaskId(task.id);
            setRunning(true);
            setDetail("正在读取导出任务");
            setSubmitting(false);
            onBusyChange(false);
            const done = await waitForGenerationTask(task.id, {
                signal: abort.signal,
                timeoutMs: 62 * 60 * 1000,
                intervalMs: 1500,
                onTaskUpdate: (item) => {
                    if (current()) setDetail(`${item.stage || "正在导出"} · ${item.progress || 0}%`);
                },
            });
            const media = JSON.parse(done.resultJson || "{}") as TimelineRenderResult;
            if (!media.resourceId) throw new Error("任务没有返回可下载的成片，请在任务中心核对");
            if (current()) {
                setPrevious(done);
                setNewIntent(false);
                setHistory((items) => [done, ...items.filter((item) => item.id !== done.id)]);
                setResult(media);
                setDetail("固定版本已导出，工作剪辑保留。再次核对会读取同一成片。");
            }
        } catch (cause) {
            if (current() && !abort.signal.aborted) setError(cause instanceof Error ? cause.message : "导出结果尚未确认，请核对原任务");
        } finally {
            working.current = false;
            if (current()) {
                setRunning(false);
                setSubmitting(false);
                onBusyChange(false);
            }
        }
    };
    const blockers = view.deliveryBlockers || (Array.isArray(view.metadata?.preservedOnly) ? view.metadata.preservedOnly.filter((field): field is string => typeof field === "string") : []);
    const preserved = blockers.length > 0;
    const readExisting = pending || (!newIntent && !!previous);
    return (
        <section aria-label="固定剪辑版本导出" className="flex flex-col gap-2">
            <strong>导出“{view.cut.title}”</strong>
            <p className="text-xs text-muted-foreground">使用这个已保存版本固定的原片、字幕和声音，关闭窗口后任务仍会继续；可在任务中心查看。</p>
            {preserved && <p role="alert">此旧版仍有未转换的高级设置，完成这些编辑并另存版本后再导出。</p>}
            {preserved && (
                <ul className="list-inside list-disc">
                    {blockers.map((field) => (
                        <li key={field} title={field}>
                            {legacyImportFieldLabel(field)}
                        </li>
                    ))}
                </ul>
            )}
            {loadingHistory && <p role="status">正在读取这版已有的导出…</p>}
            {historyFailed && (
                <Button disabled={loadingHistory} onClick={() => void restore()}>
                    重新读取导出记录
                </Button>
            )}
            <div className="flex flex-wrap gap-2">
                <Button
                    aria-label={readExisting ? "核对这版的导出" : "导出这个固定版本"}
                    loading={submitting}
                    disabled={disabled || loadingHistory || historyFailed || running || submitting || (!readExisting && (view.cut.archived || preserved))}
                    onClick={() => void exportCut()}
                >
                    {readExisting ? "核对这版的导出" : "导出这个固定版本"}
                </Button>
                {running && taskId && (
                    <Button
                        disabled={cancelling}
                        onClick={() => {
                            setCancelling(true);
                            void cancelGenerationTask(taskId)
                                .catch((cause) => {
                                    if (current()) setError(cause instanceof Error ? cause.message : "取消失败");
                                })
                                .finally(() => {
                                    if (current()) setCancelling(false);
                                });
                        }}
                    >
                        取消此版本导出
                    </Button>
                )}
            </div>
            {(pending || previous) && !newIntent && !running && !submitting && (
                <Button
                    className="self-start"
                    disabled={disabled || submitting || loadingHistory || historyFailed || view.cut.archived || preserved}
                    onClick={() => {
                        if (working.current) return;
                        working.current = true;
                        setSubmitting(true);
                        onBusyChange(true);
                        setError("");
                        void (async () => {
                            if (previous) {
                                const task = await refreshGenerationTaskStatus(previous.id);
                                if (!["succeeded", "failed", "cancelled"].includes(task.status)) throw new Error("已有导出仍在执行，请先完成或取消后再导出一份");
                            }
                            await session.prepareAnother();
                            if (current()) {
                                setPending(false);
                                setNewIntent(true);
                                setTaskId("");
                                setResult(undefined);
                                setDetail("可以重新导出一份；上一份任务和成片仍保留。");
                            }
                        })()
                            .catch((cause) => {
                                if (current()) setError(cause instanceof Error ? cause.message : "尚不能创建新导出");
                            })
                            .finally(() => {
                                working.current = false;
                                if (current()) {
                                    setSubmitting(false);
                                    onBusyChange(false);
                                }
                            });
                    }}
                >
                    重新导出一份
                </Button>
            )}
            {detail && <p role="status">{detail}</p>}
            {!!history.length && (
                <details>
                    <summary>这版的导出记录（{history.length}）</summary>
                    <div className="mt-2 flex flex-col gap-2">
                        {history.map((item) => (
                            <Button key={item.id} disabled={disabled || running || submitting || loadingHistory} onClick={() => void exportCut(item)}>
                                查看已有导出 · {item.createdAt ? new Date(item.createdAt).toLocaleString() : item.id.slice(-6)} ·{" "}
                                {{ queued: "排队中", running: "执行中", succeeded: "已完成", failed: "失败", cancelled: "已取消", text_replay: "存档记录" }[item.status] || item.status}
                            </Button>
                        ))}
                        {cursor && (
                            <Button disabled={loadingHistory || running || submitting} onClick={() => void restore(true)}>
                                更早的导出记录
                            </Button>
                        )}
                    </div>
                </details>
            )}
            {result && (
                <>
                    <video aria-label="固定版本成片预览" controls preload="metadata" src={resourceFileUrl(result.resourceId)} className="max-h-80 w-full bg-black" />
                    <a href={resourceFileUrl(result.resourceId)} download={result.fileName || "fixed-cut.mp4"}>
                        下载此版本MP4
                    </a>
                    {taskId && (
                        <SendForReview
                            projectId={projectId}
                            title={`${view.cut.title} · 成片审片`}
                            target={{ kind: "cut", cutId: view.cut.id, cutSha256: view.cut.timelineSha256, renderTaskId: taskId }}
                            disabled={disabled || preserved || view.cut.archived}
                        />
                    )}
                </>
            )}
            {error && <p role="alert">{error}</p>}
        </section>
    );
}
