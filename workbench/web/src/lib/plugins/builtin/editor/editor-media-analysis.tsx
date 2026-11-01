import { useEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, InputNumber, Select, Space, Spin } from "antd";
import { useEditorHostContext, useEditorStoreApi, useEditorStoreContext } from "@/components/editor/editor-context";
import { getActiveUserScope } from "@/lib/user-scope";
import { clipSourceOffset } from "@/lib/timeline/timeline-speed";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";
import { getMediaAnalysisCapabilities, createMediaAnalysisTask, createManualFraming, listMediaAnalyses, type AnalysisKind, type ProjectMediaAnalysis, type ManualFramingRequest } from "@/services/api/project-media-analysis";
import { getProjectTimeline } from "@/services/api/project-timeline";
import { normalizeTimelineProject } from "@/lib/timeline/timeline-tracks";
import { timelineContentSignature } from "@/lib/timeline/transcript-cut-command";
import { cancelGenerationTask, listGenerationTaskPage, retryGenerationTask, waitForGenerationTask, type GenerationTask } from "@/services/api/task-center";
import { MediaAnalysisEditor } from "./media-analysis-editor";

export const ANALYSIS_LABELS: Record<AnalysisKind, string> = { reference_video: "识别参考片分段", audio_structure: "分析音乐节拍", subject_track: "跟踪画面主体" };

/** CPU tools share the native queue and persist results outside this panel. */
export function EditorMediaAnalysis() {
    const host = useEditorHostContext(),
        { projectId } = host;
    const { project, selectedClipId, isDirty, saving, editingBlocked, inPreview } = useEditorStoreContext();
    const store = useEditorStoreApi();
    const owner = `${getActiveUserScope()}:${projectId}`;
    const current = useRef(owner);
    current.current = owner;
    const alive = useRef(true),
        read = useRef<AbortController | null>(null),
        poll = useRef<AbortController | null>(null),
        submitting = useRef(false);
    const [selected, setSelected] = useState("");
    const [kind, setKind] = useState<AnalysisKind>("reference_video");
    const [longReference, setLongReference] = useState(false);
    const [startMs, setStartMs] = useState(0),
        [endMs, setEndMs] = useState(1000);
    const [roi, setROI] = useState({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    const [aspect, setAspect] = useState(9 / 16);
    const manualIntent = useRef<{ signature: string; input: ManualFramingRequest } | null>(null);
    const [capabilities, setCapabilities] = useState<Awaited<ReturnType<typeof getMediaAnalysisCapabilities>> | null>(null);
    const [rows, setRows] = useState<ProjectMediaAnalysis[]>([]),
        [cursor, setCursor] = useState("");
    const [archived, setArchived] = useState(false),
        [loading, setLoading] = useState(false),
        [busy, setBusy] = useState(false);
    const [tasks, setTasks] = useState<GenerationTask[]>([]),
        [task, setTask] = useState<GenerationTask | null>(null);
    const [error, setError] = useState(""),
        [status, setStatus] = useState("");
    const [editing, setEditing] = useState<string | null>(null);
    const clips = (project?.clips ?? []).filter((clip) => ["audio", "video"].includes(clip.kind) && clip.directMedia?.storageKey?.startsWith("resource:"));
    const clip = clips.find((item) => item.id === selected);
    const resourceId = clip?.directMedia?.storageKey?.slice(9);
    const valid = () => alive.current && current.current === owner;

    useEffect(() => {
        if (!clips.some((item) => item.id === selected)) setSelected(clips.find((item) => item.id === selectedClipId)?.id ?? clips[0]?.id ?? "");
    }, [project, selectedClipId, selected]);
    useEffect(() => {
        if (kind === "reference_video" && clip) setLongReference(!!capabilities?.maxReferenceIntervalMs && clipSourceOffset(clip, clip.durationMs) > 60000);
    }, [selected, kind, capabilities?.maxReferenceIntervalMs, clip?.durationMs, clip?.sourceStartMs, clip?.playbackRate]);
    useEffect(() => {
        if (!clip) return;
        const start = clip.sourceStartMs ?? 0;
        setStartMs(start);
        setEndMs(start + Math.min(clipSourceOffset(clip, clip.durationMs), kind === "subject_track" ? 120000 : kind === "reference_video" && longReference ? 1800000 : 60000));
        if (clip.kind === "audio" && kind !== "audio_structure") setKind("audio_structure");
    }, [selected, kind, longReference, clip?.durationMs, clip?.sourceStartMs, clip?.playbackRate]);
    useEffect(() => {
        alive.current = true;
        setTask(null);
        setEditing(null);
        setBusy(false);
        setStatus("");
        setError("");
        setCapabilities(null);
        submitting.current = false;
        manualIntent.current = null;
        const controller = new AbortController();
        getMediaAnalysisCapabilities(controller.signal)
            .then((value) => {
                if (valid()) setCapabilities(value);
            })
            .catch((failure) => {
                if (!controller.signal.aborted && valid()) setError(String(failure.message ?? failure));
            });
        return () => {
            alive.current = false;
            controller.abort();
            read.current?.abort();
            poll.current?.abort();
        };
    }, [owner]);
    async function refresh(next = "") {
        read.current?.abort();
        const controller = new AbortController();
        read.current = controller;
        setLoading(true);
        setError("");
        try {
            const [page, pending] = await Promise.all([
                listMediaAnalyses(projectId, { resourceId, archived, ...(next ? { cursor: next } : {}) }, controller.signal),
                listGenerationTaskPage({ projectId, type: "media_analysis", activeOnly: false, limit: 20 }, controller.signal),
            ]);
            if (!valid() || controller.signal.aborted) return;
            setRows((previous) => Array.from(new Map([...(next ? previous : []), ...page.analyses].map((row) => [row.id, row])).values()));
            setCursor(page.nextCursor ?? "");
            setTasks(pending.tasks);
        } catch (failure) {
            if (!controller.signal.aborted && valid()) setError(failure instanceof Error ? failure.message : "分析列表读取失败");
        } finally {
            if (valid() && !controller.signal.aborted) setLoading(false);
        }
    }
    useEffect(() => {
        setRows([]);
        setCursor("");
        void refresh();
        return () => read.current?.abort();
    }, [owner, resourceId, archived]);
    async function observe(value: GenerationTask) {
        poll.current?.abort();
        const controller = new AbortController();
        poll.current = controller;
        setTask(value);
        try {
            const done = await waitForGenerationTask(value.id, {
                signal: controller.signal,
                initialTask: value,
                timeoutMs: 22 * 60000,
                onTaskUpdate: (update) => {
                    if (valid()) setTask(update);
                },
            });
            if (!valid() || controller.signal.aborted) return;
            setTask(done);
            await refresh();
            if (done.status === "cancelled") {
                setStatus("已取消分析，原素材和已保存的结果保留。");
                return;
            }
            if (done.status !== "succeeded") throw new Error(done.error || "分析未完成，原素材已保留，可在任务列表继续");
            const result = JSON.parse(done.resultJson ?? "{}");
            if (!result.analysisId) throw new Error("任务缺少分析记录，请刷新列表检查");
            setStatus("分析完成。请核对结果后再采用。");
            store.getState().pausePlayback();
            setEditing(result.analysisId);
        } catch (failure) {
            if (!controller.signal.aborted && valid()) setError(failure instanceof Error ? failure.message : "分析状态读取失败");
        }
    }
    async function start() {
        if (submitting.current || !clip || !resourceId || isDirty || saving || editingBlocked || inPreview) return;
        submitting.current = true;
        setBusy(true);
        setError("");
        setStatus("");
        try {
            const value = await createMediaAnalysisTask(projectId, {
                requestId: crypto.randomUUID(),
                resourceId,
                sourceClipId: clip.id,
                kind,
                startMs,
                endMs,
                ...(kind === "reference_video" && longReference ? { longReference: true } : {}),
                options: kind === "subject_track" ? { roi, anchorTimeMs: startMs, targetAspect: aspect } : {},
            });
            if (valid()) await observe(value);
        } catch (failure) {
            if (valid()) setError(failure instanceof Error ? failure.message : "分析启动失败");
        } finally {
            if (valid()) {
                setBusy(false);
                submitting.current = false;
            }
        }
    }
    async function manual() {
        if (submitting.current || !clip || clip.kind !== "video" || !resourceId || isDirty || saving || editingBlocked || inPreview) return;
        submitting.current = true;
        setBusy(true);
        setError("");
        setStatus("");
        try {
            const intent = { resourceId, sourceClipId: clip.id, startMs, endMs, targetAspect: aspect };
            const signature = JSON.stringify(intent);
            if (manualIntent.current?.signature !== signature) {
                const before = store.getState().project;
                const saved = await getProjectTimeline(projectId);
                if (!valid()) return;
                if (!before || store.getState().project !== before || store.getState().isDirty || host.getTimelineRevision?.() !== saved.revision || timelineContentSignature(normalizeTimelineProject(saved.timeline)) !== timelineContentSignature(before))
                    throw new Error("剪辑已变化，请先处理保存状态再创建构图");
                manualIntent.current = { signature, input: { ...intent, requestId: crypto.randomUUID(), expectedTimelineRevision: saved.revision } };
            }
            const result = await createManualFraming(projectId, manualIntent.current.input);
            if (!valid()) return;
            manualIntent.current = null;
            store.getState().pausePlayback();
            setEditing(result.view.analysis.id);
            setStatus("手工构图草稿已保存。请预览并核对位置；未调用跟踪或生成模型。");
            await refresh();
        } catch (failure) {
            if (valid()) setError(failure instanceof Error ? failure.message : "构图未确认创建，可使用相同参数重试");
        } finally {
            if (valid()) {
                setBusy(false);
                submitting.current = false;
            }
        }
    }
    const activeTask = task && ["queued", "running"].includes(task.status);
    return (
        <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3" aria-label="素材分析">
            <p className="text-sm">先找分段、节拍或主体，再决定怎么剪。</p>
            <p className="text-xs text-muted-foreground">本地 CPU 分析，不调用生成模型。结果需要人工核对。</p>
            <label className="text-xs">
                源片段
                <Select
                    aria-label="分析源片段"
                    showSearch
                    optionFilterProp="label"
                    className="mt-1 w-full"
                    disabled={busy}
                    value={selected || undefined}
                    onChange={setSelected}
                    options={clips.map((item, index) => ({ value: item.id, label: `${index + 1}. ${item.title || item.id} · ${formatTimelineTime(item.startMs)}–${formatTimelineTime(item.startMs + item.durationMs)}` }))}
                />
            </label>
            <label className="text-xs">
                分析内容
                <Select
                    aria-label="分析内容"
                    className="mt-1 w-full"
                    disabled={busy}
                    value={kind}
                    onChange={setKind}
                    options={(Object.keys(ANALYSIS_LABELS) as AnalysisKind[]).filter((value) => clip?.kind !== "audio" || value === "audio_structure").map((value) => ({ value, label: ANALYSIS_LABELS[value] }))}
                />
            </label>
            <div className="grid grid-cols-2 gap-2">
                <label className="text-xs">
                    源起点（秒）
                    <InputNumber
                        aria-label="分析源起点秒"
                        className="w-full"
                        min={0}
                        precision={3}
                        value={startMs / 1000}
                        onChange={(value) => {
                            if (value !== null) setStartMs(Math.round(value * 1000));
                        }}
                    />
                </label>
                <label className="text-xs">
                    源终点（秒）
                    <InputNumber
                        aria-label="分析源终点秒"
                        className="w-full"
                        min={0}
                        precision={3}
                        value={endMs / 1000}
                        onChange={(value) => {
                            if (value !== null) setEndMs(Math.round(value * 1000));
                        }}
                    />
                </label>
            </div>
            {kind === "reference_video" && (
                <>
                    <Checkbox checked={longReference} disabled={busy || !capabilities?.maxReferenceIntervalMs} onChange={(event) => setLongReference(event.target.checked)}>
                        长参考：自动保存分段检查点
                    </Checkbox>
                    <p className="text-xs text-muted-foreground">最多30分钟。失败或中断后恢复同一任务，会继续使用已保存的检查点；不会把检查点接缝当成镜头切点。仍需人工核对分段。</p>
                </>
            )}
            {kind === "subject_track" && (
                <details>
                    <summary className="cursor-pointer text-xs">跟踪框与构图</summary>
                    <p className="my-2 text-xs">在所选源起点定位主体。比例为 0–1；按所选画幅生成平移构图候选，遮挡后停止自动跟踪。</p>
                    <div className="grid grid-cols-2 gap-2">
                        {(["x", "y", "width", "height"] as const).map((key) => (
                            <label key={key} className="text-xs">
                                {{ x: "左边", y: "上边", width: "宽度", height: "高度" }[key]}
                                <InputNumber
                                    aria-label={`跟踪框${key}`}
                                    min={key === "width" || key === "height" ? 0.01 : 0}
                                    max={1}
                                    step={0.01}
                                    value={roi[key]}
                                    onChange={(value) => {
                                        if (value !== null) setROI((previous) => ({ ...previous, [key]: value }));
                                    }}
                                />
                            </label>
                        ))}
                    </div>
                </details>
            )}
            {!capabilities?.available && <Alert type="warning" title={capabilities?.reason ?? "正在检查本地分析服务"} />}
            {kind === "subject_track" && (
                <label className="text-xs">
                    构图画幅
                    <Select
                        aria-label="构图画幅"
                        className="mt-1 w-full"
                        disabled={busy}
                        value={aspect}
                        onChange={setAspect}
                        options={[
                            { value: 9 / 16, label: "竖屏 9:16" },
                            { value: 16 / 9, label: "横屏 16:9" },
                            { value: 1, label: "方形 1:1" },
                            { value: 4 / 3, label: "横屏 4:3" },
                        ]}
                    />
                </label>
            )}
            {(isDirty || saving || inPreview) && <p className="text-xs">结束拖动并等待剪辑保存后可开始分析。</p>}
            <Button
                type="primary"
                aria-label="开始分析"
                aria-busy={busy}
                loading={busy}
                disabled={busy || !clip || !capabilities?.available || !capabilities.actions.includes(kind) || isDirty || saving || editingBlocked || inPreview || !!activeTask || endMs <= startMs}
                onClick={() => void start()}
            >
                开始分析
            </Button>
            {kind === "subject_track" && (
                <>
                    <Button aria-label="手工设置构图" disabled={busy || clip?.kind !== "video" || isDirty || saving || editingBlocked || inPreview || !!activeTask || endMs - startMs < 50 || endMs - startMs > 120000} onClick={() => void manual()}>
                        手工设置构图
                    </Button>
                    <p className="text-xs text-muted-foreground">跟踪不可用时也能使用。先设置固定画幅，再核对起点、终点和中间关键位置。</p>
                </>
            )}
            {activeTask && (
                <Space direction="vertical">
                    <span className="text-xs" role="status">
                        {task.status === "queued" ? "已排队，关闭页面也会继续" : "正在分析原素材"}
                    </span>
                    <Button
                        size="small"
                        onClick={async () => {
                            try {
                                const stopped = await cancelGenerationTask(task.id);
                                if (valid()) {
                                    setTask(stopped);
                                    setStatus("已取消，原素材不变");
                                    await refresh();
                                }
                            } catch (failure) {
                                if (valid()) setError(failure instanceof Error ? failure.message : "取消失败");
                            }
                        }}
                    >
                        取消分析
                    </Button>
                </Space>
            )}
            {error && <Alert type="error" title={error} />}
            {status && (
                <p role="status" className="text-xs">
                    {status}
                </p>
            )}
            <div className="flex items-center justify-between">
                <strong className="text-sm">已保存的分析</strong>
                <Button aria-label="刷新分析列表" aria-busy={loading} size="small" loading={loading} onClick={() => void refresh()}>
                    刷新
                </Button>
            </div>
            <Checkbox checked={archived} onChange={(event) => setArchived(event.target.checked)}>
                查看已归档
            </Checkbox>
            {loading && <Spin size="small" />}
            {!loading && rows.length === 0 && <p className="text-xs text-muted-foreground">当前素材还没有{archived ? "归档" : "保存"}的分析结果。</p>}
            {rows.map((row) => (
                <Button
                    key={row.id}
                    className="h-auto text-left"
                    onClick={() => {
                        store.getState().pausePlayback();
                        setEditing(row.id);
                    }}
                >
                    {row.title} · v{row.revision}
                </Button>
            ))}
            {cursor && <Button onClick={() => void refresh(cursor)}>加载更多分析</Button>}
            <details>
                <summary className="cursor-pointer text-xs">最近分析任务</summary>
                {tasks.map((value) => (
                    <div key={value.id} className="my-2 flex flex-wrap gap-1 text-xs">
                        <span>
                            {value.status} · {value.id.slice(-8)}
                        </span>
                        {["queued", "running"].includes(value.status) && (
                            <Button size="small" onClick={() => void observe(value)}>
                                查看进度
                            </Button>
                        )}
                        {["failed", "cancelled"].includes(value.status) && (
                            <Button
                                size="small"
                                onClick={async () => {
                                    try {
                                        const retried = await retryGenerationTask(value.id);
                                        if (valid()) await observe(retried);
                                    } catch (failure) {
                                        if (valid()) setError(failure instanceof Error ? failure.message : "恢复任务失败");
                                    }
                                }}
                            >
                                恢复分析
                            </Button>
                        )}
                    </div>
                ))}
            </details>
            {editing && <MediaAnalysisEditor key={`${owner}:${editing}`} analysisId={editing} sourceClipId={selected} onClose={() => setEditing(null)} onChanged={() => void refresh()} />}
        </section>
    );
}
