// 默认由后端 ffmpeg 渲染并把产物写入资源存储；浏览器 ffmpeg.wasm 只承担离线降级。
// 缺失媒体显式阻止交付，不能把遗漏片段的文件标记为完成。

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, PackageOpen, Server } from "lucide-react";

import { useEditorHostContext, useEditorStoreContext, useEditorStoreApi } from "@/components/editor/editor-context";
import { buildTimelineRenderPlan, type TimelineRenderSource } from "@/lib/timeline/timeline-to-ffmpeg";
import { exportTimelineToMp4, type TimelineExportProgress } from "@/lib/timeline/timeline-export";
import { resourceFileUrl } from "@/services/api/resources";
import { cancelGenerationTask, waitForGenerationTask } from "@/services/api/task-center";
import { type TimelineRenderResult } from "@/services/api/timeline-tasks";
import type { TimelineProject } from "@/types/timeline";
import { timelineExportPreflight } from "@/lib/timeline/timeline-export-preflight";
import { timelineOutputFormat } from "@/lib/timeline/timeline-output";
import { EditorOutputSettings } from "./editor-output-settings";
import { createWorkingRenderSession } from "@/services/working-render-session";
import { getActiveUserScope } from "@/lib/user-scope";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { EditorLegacyReview } from "./editor-legacy-review";
import { EditorRenderHistory } from "./editor-render-history";

type ExportState = {
    phase: "idle" | "running" | "done" | "error";
    mode: "remote" | "local" | null;
    percent: number;
    detail: string;
    result: TimelineRenderResult | null;
    taskId?: string;
};

/** 从时间线 clip 收集渲染源（按 nodeId 关联；directMedia 提供本地媒体定位）。 */
function collectRenderSources(project: TimelineProject): TimelineRenderSource[] {
    const seen = new Set<string>();
    const sources: TimelineRenderSource[] = [];
    for (const clip of project.clips) {
        if (clip.kind !== "video" && clip.kind !== "image") continue;
        const direct = clip.directMedia;
        if (!direct) continue;
        if (seen.has(clip.nodeId)) continue;
        seen.add(clip.nodeId);
        sources.push({
            nodeId: clip.nodeId,
            fileName: `input-${sources.length}.mp4`,
            durationMs: clip.durationMs,
            storageKey: direct.storageKey,
            url: direct.url,
        });
    }
    return sources;
}

export function EditorExport() {
    const { project, hasPendingPanelEdits, editingBlocked, inPreview } = useEditorStoreContext();
    const host = useEditorHostContext(),
        { projectId, aspectRatio } = host,
        store = useEditorStoreApi();
    const deliveryPending = Boolean(host.deliveryBlockers?.length);
    const scope = getActiveUserScope();
    const session = useMemo(() => createWorkingRenderSession(projectId, localForageStorageForScope(scope)), [projectId, scope]);
    const [resumable, setResumable] = useState(false),
        [restoring, setRestoring] = useState(true),
        [restoreError, setRestoreError] = useState("");
    const controller = useRef<AbortController | null>(null),
        alive = useRef(false),
        ownedLock = useRef(false),
        working = useRef(false);
    const owner = `${scope}:${projectId}`,
        activeOwner = useRef(owner);
    activeOwner.current = owner;
    const [restoreRetry, setRestoreRetry] = useState(0);
    const [hasSavedExports, setHasSavedExports] = useState(false);
    const current = () => alive.current && getActiveUserScope() === scope && activeOwner.current === owner;
    useEffect(() => {
        alive.current = true;
        setRestoring(true);
        setRestoreError("");
        setResumable(false);
        void session
            .read()
            .then((intent) => {
                if (current()) setResumable(!!intent);
            })
            .catch((cause) => {
                if (current()) setRestoreError(cause instanceof Error ? cause.message : "上次导出读取失败");
            })
            .finally(() => {
                if (current()) setRestoring(false);
            });
        return () => {
            alive.current = false;
            controller.current?.abort();
            if (ownedLock.current) store.getState().setEditingBlocked(false);
        };
    }, [session, scope, store, restoreRetry]);
    const output = useMemo(() => timelineOutputFormat(aspectRatio, project?.output), [aspectRatio, project?.output]);
    const [state, setState] = useState<ExportState>({ phase: "idle", mode: null, percent: 0, detail: "", result: null });

    const [cancelling, setCancelling] = useState(false);
    const [cancelError, setCancelError] = useState("");
    const sources = useMemo(() => (project ? collectRenderSources(project) : []), [project]);
    const plan = useMemo(() => (project ? buildTimelineRenderPlan(project, sources, output) : null), [project, sources, output]);
    const preflight = useMemo(() => (project ? timelineExportPreflight(project, output.width) : null), [project, output.width]);

    // The working edit becomes a fixed native cut before the queue write.
    // Recovery reuses both request identities and never submits a new snapshot.
    const renderRemote = async (fresh = false) => {
        if (!project || restoring || restoreError || working.current || state.phase === "running") return;
        if ((!resumable || fresh) && (deliveryPending || preflight?.blockers.length || hasPendingPanelEdits || editingBlocked || inPreview)) return;
        working.current = true;
        setCancelError("");
        const abort = new AbortController();
        controller.current?.abort();
        controller.current = abort;
        setState({ phase: "running", mode: "remote", percent: 0, detail: resumable && !fresh ? "核对上次导出…" : "保存导出快照…", result: null });
        try {
            if (fresh) await session.prepareAnother();
            let revision: number | undefined;
            if (!(await session.read())) {
                const editing = store.getState();
                if (editing.editingBlocked || editing.hasPendingPanelEdits || editing.inPreview) throw new Error("请先应用或放弃面板中的修改，再导出当前剪辑");
                editing.setEditingBlocked(true);
                ownedLock.current = true;
                await editing.flushSave();
                if (!current()) return;
                const saved = store.getState();
                revision = host.getTimelineRevision?.() ?? undefined;
                if (saved.isDirty || saved.saving || revision == null) throw new Error("当前剪辑尚未成功保存，请保留草稿后重试");
            }
            const submitted = await session.submit(revision),
                created = submitted.task;
            if (!current()) return;
            setResumable(true);
            if (ownedLock.current) {
                store.getState().setEditingBlocked(false);
                ownedLock.current = false;
            }
            setState({ phase: "running", mode: "remote", percent: created.progress ?? 0, detail: "正在核对固定快照导出…", result: null, taskId: created.id });
            const done = await waitForGenerationTask(created.id, {
                signal: abort.signal,
                timeoutMs: 62 * 60 * 1000,
                intervalMs: 1500,
                onTaskUpdate: (task) => {
                    if (current()) setState({ phase: "running", mode: "remote", percent: task.progress ?? 0, detail: `${task.stage || "正在导出"} · ${task.progress || 0}%`, result: null, taskId: created.id });
                },
            });
            const parsed = JSON.parse(done.resultJson ?? "{}") as TimelineRenderResult;
            if (!parsed.resourceId) throw new Error("渲染任务未返回产物，请在任务中心核对");
            if (current()) setState({ phase: "done", mode: "remote", percent: 100, detail: `渲染完成：${parsed.fileName ?? "timeline.mp4"}`, result: parsed, taskId: created.id });
        } catch (error) {
            if (current()) {
                setResumable(!!(await session.read().catch(() => null)));
                setState((previous) => ({ ...previous, phase: "error", mode: "remote", percent: 0, detail: error instanceof Error ? error.message : "导出结果尚未确认", result: null }));
            }
        } finally {
            if (ownedLock.current) {
                store.getState().setEditingBlocked(false);
                ownedLock.current = false;
            }
            working.current = false;
        }
    };

    // 降级路径：ffmpeg.wasm 浏览器本地合成（无后端/离线时可用）。
    const exportLocalMp4 = async () => {
        if (deliveryPending) return;
        if (!project || sources.length === 0 || preflight?.blockers.length || preflight?.offlineReason || state.phase === "running") return;
        setState({ phase: "running", mode: "local", percent: 0, detail: "准备导出", result: null });
        try {
            const { blob, warnings } = await exportTimelineToMp4(project, sources, {
                context: output,
                onProgress: (p: TimelineExportProgress) => setState({ phase: "running", mode: "local", percent: p.percent, detail: p.detail, result: null }),
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "timeline-export.mp4";
            a.click();
            URL.revokeObjectURL(url);
            setState({ phase: "done", mode: "local", percent: 100, detail: warnings.length ? `导出完成，已开始下载；${warnings.join("；")}` : "导出完成，已开始下载", result: null });
        } catch (error) {
            setState({
                phase: "error",
                mode: "local",
                percent: 0,
                detail: error instanceof Error ? error.message : "导出失败",
                result: null,
            });
        }
    };

    if (!project) return null;

    return (
        <div className="flex h-full flex-col bg-[var(--previs-sequencer-surface)]">
            <div className="director-scroll min-h-0 flex-1 overflow-y-auto p-3">
                <EditorRenderHistory key={owner} projectId={projectId} onExistingChange={setHasSavedExports} />
                <EditorOutputSettings />
                <EditorLegacyReview />
                <div className="mb-3 rounded-md border border-[var(--previs-sequencer-border)] bg-[var(--previs-control-hover)] p-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[var(--previs-dock-fg-strong)]">导出检查</span>
                        <span className="text-[10px] text-[var(--previs-dock-fg)]/60">{((preflight?.durationMs ?? 0) / 1000).toFixed(1)} 秒</span>
                    </div>
                    {preflight && preflight.durationMs > 0 ? (
                        <p className="mt-2 text-xs leading-relaxed text-[var(--previs-dock-fg)]">
                            {preflight.videoCount} 段画面 · {preflight.audioCount} 段独立声音 · {preflight.textCount} 段字幕 · {preflight.graphicCount} 段标题或图形
                            <br />
                            MP4 · {output.width}×{output.height} · {output.fps} 帧/秒
                        </p>
                    ) : (
                        <p className="mt-2 text-[11px] text-[var(--previs-dock-fg)]/55">添加画面、标题或图形后即可导出。</p>
                    )}
                </div>

                {preflight?.blockers.map((blocker) => (
                    <p key={blocker} role="alert" className="mb-2 text-xs text-[var(--previs-danger)]">
                        {blocker}
                    </p>
                ))}
                <div className="mb-3 flex items-center justify-between rounded-md border border-[var(--previs-sequencer-border)] bg-[var(--previs-control-hover)] px-2.5 py-2 text-[11px] text-[var(--previs-dock-fg)]/70">
                    <span className="flex items-center gap-1.5">
                        <PackageOpen className="size-3.5 text-[var(--previs-dock-fg)]/60" />
                        画面素材
                    </span>
                    <span className="tabular-nums text-[var(--previs-dock-fg)]/80">{sources.length} 个</span>
                </div>

                <button
                    type="button"
                    onClick={() => void renderRemote()}
                    disabled={restoring || !!restoreError || state.phase === "running" || (!resumable && (deliveryPending || Boolean(preflight?.blockers.length) || hasPendingPanelEdits || editingBlocked || inPreview))}
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--previs-accent)] px-2 py-1.5 text-xs font-medium text-[var(--previs-on-accent)] hover:bg-[var(--previs-accent-hover)] disabled:opacity-40"
                >
                    {state.phase === "running" && state.mode === "remote" ? <Loader2 className="size-3.5 animate-spin" /> : <Server className="size-3.5" />}
                    {state.phase === "running" && state.mode === "remote" ? "正在导出…" : restoring ? "正在读取导出记录…" : resumable ? "核对上次导出" : hasSavedExports ? "导出当前剪辑的新成片" : "导出成片"}
                </button>

                {restoreError && (
                    <p role="alert" className="mt-2 text-xs text-[var(--previs-danger)]">
                        {restoreError}{" "}
                        <button type="button" className="underline" onClick={() => setRestoreRetry((value) => value + 1)}>
                            重读导出记录
                        </button>
                    </p>
                )}
                {resumable && (
                    <div className="mt-2 flex flex-col gap-2">
                        <p className="text-xs text-[var(--previs-dock-fg)]/70">上次导出使用固定快照。核对会读取同一任务；如需导出现在的修改，请明确选择新导出。</p>
                        <button
                            type="button"
                            className="text-left text-xs underline"
                            disabled={state.phase === "running" || restoring || !!restoreError || hasPendingPanelEdits || editingBlocked || inPreview || !!preflight?.blockers.length}
                            onClick={() => void renderRemote(true)}
                        >
                            另行导出当前剪辑
                        </button>
                    </div>
                )}
                {hasPendingPanelEdits && <p className="mt-2 text-xs text-[var(--previs-dock-fg)]/70">请先应用或放弃面板中的修改，再开始新的导出。</p>}

                <details className="mt-3 text-xs text-[var(--previs-dock-fg)]">
                    <summary className="cursor-pointer">离线导出</summary>
                    {preflight?.offlineReason && <p className="mt-2 leading-relaxed">{preflight.offlineReason}</p>}
                    <button
                        type="button"
                        onClick={exportLocalMp4}
                        disabled={deliveryPending || sources.length === 0 || Boolean(preflight?.blockers.length || preflight?.offlineReason) || state.phase === "running" || hasPendingPanelEdits || editingBlocked || inPreview}
                        className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-md border border-[var(--previs-sequencer-border)] px-2 py-1.5 text-xs text-[var(--previs-dock-fg)]/80 hover:bg-[var(--previs-control-hover)] disabled:opacity-40"
                    >
                        {state.phase === "running" && state.mode === "local" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                        {state.phase === "running" && state.mode === "local" ? "导出中…" : "下载基础剪辑"}
                    </button>
                </details>

                {state.phase === "running" && state.mode === "remote" && state.taskId && (
                    <button
                        type="button"
                        disabled={cancelling}
                        onClick={() => {
                            if (!state.taskId) return;
                            setCancelling(true);
                            setCancelError("");
                            void cancelGenerationTask(state.taskId)
                                .catch((error) => setCancelError(error instanceof Error ? error.message : "取消导出失败，请重试"))
                                .finally(() => setCancelling(false));
                        }}
                        className="mt-2 text-xs underline"
                    >
                        {cancelling ? "正在取消…" : "取消导出"}
                    </button>
                )}
                {cancelError && (
                    <p role="alert" className="mt-2 text-xs">
                        {cancelError}
                    </p>
                )}
                {state.phase === "running" && (
                    <div className="mt-3">
                        <div className="mb-1 flex justify-between text-[var(--fs-label)] text-[var(--previs-dock-fg)]/70">
                            <span>{state.detail}</span>
                            <span className="tabular-nums">{state.percent}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--previs-control-hover)]">
                            <div className="h-full rounded-full bg-[var(--previs-accent)] transition-all" style={{ width: `${state.percent}%` }} />
                        </div>
                    </div>
                )}

                {state.phase === "done" && state.result && state.mode === "remote" && (
                    <div className="mt-2 overflow-hidden rounded-md border border-[var(--previs-sequencer-border)] bg-[var(--previs-control-hover)]">
                        <video src={resourceFileUrl(state.result.resourceId)} controls className="w-full bg-black" style={{ aspectRatio: `${state.result.width || output.width}/${state.result.height || output.height}`, maxHeight: 360 }} />
                        <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px] text-[var(--previs-dock-fg)]/80">
                            <span className="truncate">{state.result.fileName ?? "timeline.mp4"}</span>
                            <a href={resourceFileUrl(state.result.resourceId)} download={state.result.fileName ?? "timeline.mp4"} className="flex shrink-0 items-center gap-1 text-[var(--previs-accent)] hover:underline">
                                <Download className="size-3" />
                                下载
                            </a>
                        </div>
                    </div>
                )}
                {state.phase === "done" && (!state.result || state.mode !== "remote") && <p className="mt-2 text-[var(--fs-label)] text-[var(--previs-success)]">{state.detail}</p>}
                {state.phase === "error" && <p className="mt-2 text-[var(--fs-label)] text-[var(--previs-danger)]">{state.detail}</p>}

                <p className="mt-3 text-[11px] leading-relaxed text-[var(--previs-dock-fg)]/55">导出会保留原素材和当前剪辑，完成后可预览并下载。声音与文字按时间线设置合成。</p>
                {sources.length === 0 && !preflight?.graphicCount && !preflight?.textCount && <p className="mt-1 text-[11px] text-[var(--previs-dock-fg)]/55">从左侧素材库添加画面后继续。</p>}
            </div>
        </div>
    );
}
