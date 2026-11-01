import { useEffect, useId, useRef, useState } from "react";
import { Alert, Button, Checkbox, Pagination, Radio, Space, Tag } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { useEditorHostContext, useEditorStoreApi, useEditorStoreContext } from "@/components/editor/editor-context";
import { previewTranscriptCut, type TranscriptCutPreview, type TranscriptCutRequest, type TranscriptView } from "@/services/api/project-transcripts";
import { getProjectTimeline } from "@/services/api/project-timeline";
import { createTimelineRenderTask, type TimelineRenderResult } from "@/services/api/timeline-tasks";
import { cancelGenerationTask, waitForGenerationTask } from "@/services/api/task-center";
import { resourceFileUrl } from "@/services/api/resources";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";
import { normalizeTimelineProject } from "@/lib/timeline/timeline-tracks";
import { timelineContentSignature, TRANSCRIPT_CUT_COMMAND } from "@/lib/timeline/transcript-cut-command";
import type { TimelineProject } from "@/types/timeline";
import { clipSourceOffset } from "@/lib/timeline/timeline-speed";
import { TRANSCRIPT_MODAL_LAYOUT } from "./transcript-modal-layout";

type Props = { view: TranscriptView; sourceClipId: string; onClose: () => void; onApplied: () => void };
const actionLabels = { trim: "裁剪", remove: "移除", split: "分段", move: "前移" };

export function TranscriptCutEditor({ view, sourceClipId, onClose, onApplied }: Props) {
    const { projectId, aspectRatio, getTimelineRevision } = useEditorHostContext();
    const editorStore = useEditorStoreApi();
    const { project, isDirty, saving, editingBlocked, inPreview, setPanelDraftDirty } = useEditorStoreContext();
    const source = project?.clips.find((clip) => clip.id === sourceClipId);
    const start = source?.sourceStartMs ?? 0,
        end = start + (source ? clipSourceOffset(source, source.durationMs) : 0);
    const [unit, setUnit] = useState<"segment" | "word">("segment");
    const [preservePauses, setPreservePauses] = useState(true);
    const wordAvailable = !!view.document.words?.length && !view.document.wordTimingIncomplete && !view.document.wordTextNeedsReview;
    const segments = (unit === "word" ? (view.document.words ?? []) : view.document.segments).filter((row) => row.endMs > start && row.startMs < end);
    const [kept, setKept] = useState(() => segments.map((row) => row.id));
    const [mode, setMode] = useState<"ripple" | "clip_only">("ripple");
    const [page, setPage] = useState(1);
    const [plan, setPlan] = useState<TranscriptCutPreview | null>(null);
    const [request, setRequest] = useState<TranscriptCutRequest | null>(null);
    const [baseline, setBaseline] = useState<TimelineProject | null>(null);
    const [checking, setChecking] = useState(false),
        [applying, setApplying] = useState(false);
    const [error, setError] = useState("");
    const [rendering, setRendering] = useState(false),
        [renderTaskId, setRenderTaskId] = useState("");
    const [renderUrl, setRenderUrl] = useState("");
    const [renderStatus, setRenderStatus] = useState("");
    const [cancelBusy, setCancelBusy] = useState(false);
    const renderCancelled = useRef(false);
    const [localApplied, setLocalApplied] = useState(false);
    const active = useRef(true),
        controller = useRef<AbortController | null>(null),
        renderPoll = useRef<AbortController | null>(null);
    const draftKey = useId();
    useEffect(() => {
        setPanelDraftDirty(draftKey, applying);
    }, [draftKey, applying, setPanelDraftDirty]);
    useEffect(() => {
        active.current = true;
        return () => {
            active.current = false;
            controller.current?.abort();
            renderPoll.current?.abort();
            setPanelDraftDirty(draftKey, false);
        };
    }, [draftKey, setPanelDraftDirty]);
    const blocked = !source || source.directMedia?.storageKey !== `resource:${view.transcript.resourceId}` || isDirty || saving || editingBlocked || inPreview;
    const busy = checking || applying || rendering;
    function invalidate() {
        controller.current?.abort();
        renderPoll.current?.abort();
        setPlan(null);
        setRequest(null);
        setBaseline(null);
        setRenderUrl("");
        setRenderStatus("");
        setError("");
    }
    async function check() {
        if (blocked || busy || !kept.length) return;
        const snapshot = editorStore.getState().project;
        if (!snapshot) return;
        controller.current?.abort();
        const abort = new AbortController();
        controller.current = abort;
        setChecking(true);
        setError("");
        setPlan(null);
        setRenderUrl("");
        try {
            const saved = await getProjectTimeline(projectId, abort.signal);
            if (!getTimelineRevision || getTimelineRevision() !== saved.revision) throw new Error("服务端剪辑已更新，请先载入最新版本再进行文字剪切");
            if (timelineContentSignature(normalizeTimelineProject(saved.timeline)) !== timelineContentSignature(snapshot)) throw new Error("剪辑与服务端版本不同，请先保存或重新载入剪辑");
            const input: TranscriptCutRequest = { expectedTimelineRevision: saved.revision, transcriptRevisionId: view.currentVersion.id, sourceClipId, mode, unit, preservePauses, ...(unit === "word" ? { keepWordIds: kept } : { keepSegmentIds: kept }) };
            const result = await previewTranscriptCut(projectId, view.transcript.id, input, abort.signal);
            if (!active.current || abort.signal.aborted) return;
            if (editorStore.getState().project !== snapshot || getTimelineRevision() !== saved.revision) throw new Error("检查期间剪辑已变化，请重新检查影响");
            setBaseline(snapshot);
            setRequest(input);
            setPlan(result);
        } catch (failure) {
            if (active.current && !abort.signal.aborted) setError(failure instanceof Error ? failure.message : "检查文字剪切失败");
        } finally {
            if (active.current && !abort.signal.aborted) setChecking(false);
        }
    }
    async function render() {
        if (!plan || busy || localApplied) return;
        renderPoll.current?.abort();
        const abort = new AbortController();
        renderPoll.current = abort;
        setRendering(true);
        setError("");
        setRenderTaskId("");
        setCancelBusy(false);
        renderCancelled.current = false;
        setRenderStatus("正在提交本地预览…");
        try {
            const task = await createTimelineRenderTask({ projectId, timeline: plan.timeline, aspectRatio });
            if (!active.current || abort.signal.aborted) return;
            setRenderTaskId(task.id);
            const done = await waitForGenerationTask(task.id, {
                signal: abort.signal,
                intervalMs: 1500,
                timeoutMs: 25 * 60 * 1000,
                onTaskUpdate: (task) => {
                    if (active.current) {
                        renderCancelled.current = task.status === "cancelled";
                        setRenderStatus(task.stage || "正在渲染预览…");
                    }
                },
            });
            if (!active.current || abort.signal.aborted) return;
            const result = JSON.parse(done.resultJson || "{}") as TimelineRenderResult;
            if (!result.resourceId) throw new Error("预览文件未就绪，请在任务中心检查");
            setRenderUrl(resourceFileUrl(result.resourceId));
            setRenderStatus("预览已就绪，确认满意后应用剪切");
        } catch (failure) {
            if (active.current && !abort.signal.aborted) {
                if (renderCancelled.current) setRenderStatus("预览已取消，可重新渲染或继续应用剪切");
                else setError(failure instanceof Error ? failure.message : "预览渲染失败");
            }
        } finally {
            if (active.current && !abort.signal.aborted) setRendering(false);
        }
    }
    async function cancelRender() {
        if (!renderTaskId || cancelBusy) return;
        const observed = renderPoll.current;
        setCancelBusy(true);
        try {
            await cancelGenerationTask(renderTaskId);
        } catch (failure) {
            if (active.current && renderPoll.current === observed && !observed?.signal.aborted) setError(failure instanceof Error ? failure.message : "取消失败");
        } finally {
            if (active.current && renderPoll.current === observed && !observed?.signal.aborted) setCancelBusy(false);
        }
    }
    async function apply() {
        if (!plan || !request || !baseline || busy || blocked || localApplied) return;
        setApplying(true);
        setError("");
        try {
            const confirmed = await previewTranscriptCut(projectId, view.transcript.id, request);
            if (!active.current) return;
            const state = editorStore.getState();
            if (confirmed.previewToken !== plan.previewToken || state.project !== baseline || state.editingBlocked || state.inPreview || state.isDirty || state.saving) throw new Error("剪辑或预览已变化，请重新检查影响");
            state.dispatch({ op: TRANSCRIPT_CUT_COMMAND, payload: { before: baseline, after: plan.timeline } });
            if (editorStore.getState().project === baseline) throw new Error(editorStore.getState().saveError || "文字剪切未应用");
            setLocalApplied(true);
            await editorStore.getState().flushSave();
            if (!active.current) return;
            if (editorStore.getState().saveError) throw new Error("剪切已保留在当前剪辑，但保存失败。请返回剪辑处理顶部的保存提示，可撤销或导出草稿。");
            onApplied();
        } catch (failure) {
            if (active.current) setError(failure instanceof Error ? failure.message : "应用文字剪切失败");
        } finally {
            if (active.current) setApplying(false);
        }
    }
    return (
        <AppModal
            open
            centered
            styles={TRANSCRIPT_MODAL_LAYOUT}
            title="按文字剪切媒体"
            width={900}
            maskClosable={false}
            keyboard={!applying}
            onCancel={() => {
                if (!applying) onClose();
            }}
            footer={
                <Space wrap>
                    <Button disabled={applying} onClick={onClose}>
                        {localApplied ? "返回剪辑处理保存" : "暂不剪切"}
                    </Button>
                    <Button aria-label="检查剪切影响" loading={checking} disabled={busy || blocked || !kept.length || localApplied} onClick={() => void check()}>
                        检查剪切影响
                    </Button>
                    <Button type="primary" aria-label="应用剪切" loading={applying} disabled={!plan || busy || blocked || localApplied} onClick={() => void apply()}>
                        应用剪切
                    </Button>
                </Space>
            }
        >
            <p className="mb-3 text-sm text-muted-foreground">勾选要保留的文字，其余时间将被剪掉，包括首尾未选中的时间。这里会实际剪切音视频；原素材和文字稿保留，应用后可一次撤销。</p>
            <div className="mb-3 flex flex-wrap items-center gap-3">
                <Radio.Group
                    aria-label="文字剪辑精度"
                    value={unit}
                    disabled={busy || localApplied}
                    onChange={(event) => {
                        const next = event.target.value as "segment" | "word";
                        invalidate();
                        setUnit(next);
                        setPage(1);
                        setKept((next === "word" ? (view.document.words ?? []) : view.document.segments).filter((row) => row.endMs > start && row.startMs < end).map((row) => row.id));
                    }}
                >
                    <Radio value="segment">按句选择</Radio>
                    <Radio value="word" disabled={!wordAvailable}>
                        按词选择
                    </Radio>
                </Radio.Group>
                <Checkbox
                    checked={preservePauses}
                    disabled={busy || localApplied}
                    onChange={(event) => {
                        invalidate();
                        setPreservePauses(event.target.checked);
                    }}
                >
                    保留相邻文字间的自然停顿
                </Checkbox>
            </div>
            {!wordAvailable && !!view.document.words?.length && <p className="mb-3 text-xs text-muted-foreground">逐词时间不完整或文字已校正，请使用按句选择并预听核对。</p>}
            <Radio.Group
                value={mode}
                disabled={busy || localApplied}
                onChange={(event) => {
                    invalidate();
                    setMode(event.target.value);
                }}
                className="mb-3"
            >
                <Space orientation="vertical">
                    <Radio value="ripple">所有轨道一起跟随剪切（画面、字幕和声音）</Radio>
                    <Radio value="clip_only">仅剪当前片段及其字幕，其他轨道保持原位置</Radio>
                </Space>
            </Radio.Group>
            {blocked && !localApplied && <Alert className="mb-3" type="warning" title={isDirty || saving ? "请先等待当前剪辑保存完成" : "当前片段不可剪切，请检查素材和编辑状态"} />}
            {error && <Alert type="error" showIcon title={error} className="mb-3" />}
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <Tag color="blue">V{view.currentVersion.version}</Tag>
                <span>
                    此片段内共 {segments.length} {unit === "word" ? "词" : "句"}，已保留 {kept.length} 项
                </span>
                <Button
                    size="small"
                    disabled={busy || localApplied}
                    onClick={() => {
                        invalidate();
                        setKept(segments.map((row) => row.id));
                    }}
                >
                    全部保留
                </Button>
                <Button
                    size="small"
                    disabled={busy || localApplied}
                    onClick={() => {
                        invalidate();
                        setKept([]);
                    }}
                >
                    清空选择
                </Button>
            </div>
            <div className="mb-3 max-h-[32vh] space-y-2 overflow-y-auto">
                {segments.slice((page - 1) * 25, page * 25).map((row) => (
                    <div key={row.id} className="rounded border border-border p-2">
                        <Checkbox
                            aria-label={`保留 ${row.id}`}
                            disabled={busy || localApplied}
                            checked={kept.includes(row.id)}
                            onChange={(event) => {
                                invalidate();
                                setKept((previous) => (event.target.checked ? [...previous, row.id] : previous.filter((id) => id !== row.id)));
                            }}
                        >
                            <span className="text-xs text-muted-foreground">
                                {formatTimelineTime(Math.max(start, row.startMs))}–{formatTimelineTime(Math.min(end, row.endMs))} · 源时间
                            </span>
                            <p className="mt-1 text-sm">{row.text}</p>
                        </Checkbox>
                    </div>
                ))}
            </div>
            <Pagination size="small" current={page} total={segments.length} pageSize={25} showSizeChanger={false} onChange={setPage} />
            {plan && (
                <div className="mt-4 border-t border-border pt-3">
                    <p className="mb-2 text-sm font-medium">
                        剪去 {(plan.removedMs / 1000).toFixed(2)} 秒 · 作品总时长 {(plan.beforeDurationMs / 1000).toFixed(2)} → {(plan.afterDurationMs / 1000).toFixed(2)} 秒
                    </p>
                    {plan.warnings.map((warning) => (
                        <Alert key={warning} type="warning" showIcon title={warning} className="mb-2" />
                    ))}
                    <p className="my-2 text-sm">将影响 {plan.changes.length} 个片段：</p>
                    <div className="max-h-32 overflow-y-auto text-sm">
                        {plan.changes.map((change) => (
                            <p key={change.clipId}>
                                {actionLabels[change.action]} · {change.title || `${change.kind} ${change.clipId.slice(0, 12)}`}
                                {change.resultClipIds.length > 1 ? ` → ${change.resultClipIds.length} 段` : ""}
                            </p>
                        ))}
                    </div>
                    <Space className="my-3" wrap>
                        <Button aria-label="渲染剪切预览" loading={rendering} disabled={busy || localApplied || !!renderUrl} onClick={() => void render()}>
                            {renderUrl ? "预览已就绪" : "渲染剪切预览"}
                        </Button>
                        <span className="text-xs text-muted-foreground">使用本地合成查看完整效果，不运行生成模型。</span>
                        {rendering && renderTaskId && (
                            <Button size="small" aria-label="取消渲染" loading={cancelBusy} disabled={cancelBusy} onClick={() => void cancelRender()}>
                                取消渲染
                            </Button>
                        )}
                    </Space>
                    {renderStatus && (
                        <p role="status" className="mb-2 text-xs">
                            {renderStatus}
                            {rendering ? "；关闭后仍可到任务中心查看" : ""}
                        </p>
                    )}
                    {renderUrl && <video aria-label="文字剪切预览" controls preload="metadata" src={renderUrl} className="mx-auto max-h-80 max-w-full rounded bg-black" />}
                </div>
            )}
        </AppModal>
    );
}
