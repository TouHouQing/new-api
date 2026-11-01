import { useEffect, useId, useRef, useState } from "react";
import { Alert, Button, Checkbox, Input, InputNumber, Pagination, Segmented, Space, Spin } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { useEditorHostContext, useEditorStoreApi, useEditorStoreContext } from "@/components/editor/editor-context";
import {
    getMediaAnalysis,
    saveMediaAnalysis,
    listMediaAnalysisHistory,
    previewMediaAnalysisMarkers,
    previewMediaAnalysisReframe,
    type MediaAnalysisDocument,
    type MediaAnalysisView,
    type MediaAnalysisRevision,
    type MediaAnalysisMarkerPreview,
    type MediaAnalysisReframePreview,
    type MediaAnalysisWrite,
} from "@/services/api/project-media-analysis";
import { getProjectTimeline } from "@/services/api/project-timeline";
import { resourceFileUrl } from "@/services/api/resources";
import { normalizeTimelineProject } from "@/lib/timeline/timeline-tracks";
import { timelineContentSignature } from "@/lib/timeline/transcript-cut-command";
import { MEDIA_ANALYSIS_MARKERS_COMMAND, MEDIA_ANALYSIS_REFRAME_COMMAND } from "@/lib/timeline/media-analysis-command";
import { ReframePlanPreview } from "./reframe-plan-preview";
import { ReframeManualPath } from "./reframe-manual-path";
import { ReferenceShotAdoption } from "./reference-shot-adoption";
import { BeatArrangementEditor } from "./beat-arrangement-editor";
import { TRANSCRIPT_MODAL_LAYOUT } from "./transcript-modal-layout";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";

export function MediaAnalysisEditor({ analysisId, sourceClipId, initialRevisionId, onClose, onChanged }: { analysisId: string; sourceClipId: string; initialRevisionId?: string; onClose: () => void; onChanged: () => void }) {
    const host = useEditorHostContext(),
        store = useEditorStoreApi();
    const state = useEditorStoreContext();
    const draftKey = useId();
    const alive = useRef(true),
        reader = useRef<AbortController | null>(null),
        player = useRef<HTMLMediaElement | null>(null);
    const pending = useRef<{ signature: string; requestId: string } | null>(null);
    const [view, setView] = useState<MediaAnalysisView | null>(null),
        [draft, setDraft] = useState<MediaAnalysisDocument | null>(null);
    const [title, setTitle] = useState(""),
        [busy, setBusy] = useState(false),
        [loading, setLoading] = useState(true);
    const [planningDirty, setPlanningDirty] = useState(false),
        [readEpoch, setReadEpoch] = useState(0);
    const [error, setError] = useState(""),
        [status, setStatus] = useState(""),
        [page, setPage] = useState(1);
    const [versions, setVersions] = useState<MediaAnalysisRevision[]>([]),
        [nextVersion, setNextVersion] = useState<number | undefined>();
    const [history, setHistory] = useState(false),
        [historyPreview, setHistoryPreview] = useState<MediaAnalysisView | null>(null);
    const [plan, setPlan] = useState<MediaAnalysisMarkerPreview | MediaAnalysisReframePreview | null>(null);
    const [contentTab, setContentTab] = useState<"sections" | "beats">("sections");
    const [confirm, setConfirm] = useState<"close" | "reload" | "restore" | "archive" | null>(null);
    const dirty = !!view && !!draft && (title !== view.analysis.title || JSON.stringify(draft) !== JSON.stringify(view.document));
    const protectedDirty = dirty || planningDirty;
    useEffect(() => {
        state.setPanelDraftDirty(draftKey, protectedDirty);
        return () => state.setPanelDraftDirty(draftKey, false);
    }, [draftKey, protectedDirty, state.setPanelDraftDirty]);
    useEffect(() => {
        alive.current = true;
        void load();
        return () => {
            alive.current = false;
            reader.current?.abort();
            player.current?.pause();
        };
    }, [host.projectId, analysisId, initialRevisionId]);
    useEffect(() => {
        setPlan(null);
    }, [draft, title, state.project]);
    function accept(value: MediaAnalysisView) {
        setView(value);
        setDraft(structuredClone(value.document));
        setTitle(value.analysis.title);
        setPlan(null);
        setPage(1);
        setPlanningDirty(false);
        setReadEpoch((previous) => previous + 1);
        pending.current = null;
    }
    async function load() {
        reader.current?.abort();
        const controller = new AbortController();
        reader.current = controller;
        setLoading(true);
        setError("");
        try {
            const value = await getMediaAnalysis(host.projectId, analysisId, undefined, controller.signal);
            const adopted = initialRevisionId && initialRevisionId !== value.currentVersion.id ? await getMediaAnalysis(host.projectId, analysisId, initialRevisionId, controller.signal) : null;
            if (alive.current && !controller.signal.aborted) {
                accept(value);
                setHistoryPreview(adopted);
            }
        } catch (failure) {
            if (alive.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : "分析读取失败");
        } finally {
            if (alive.current && !controller.signal.aborted) setLoading(false);
        }
    }
    async function mutate(patch: Omit<MediaAnalysisWrite, "requestId" | "expectedRevision">, success: string) {
        if (!view || busy || state.editingBlocked || state.inPreview) return;
        const intent = { ...patch, expectedRevision: view.analysis.revision };
        const signature = JSON.stringify(intent);
        if (pending.current?.signature !== signature) pending.current = { signature, requestId: crypto.randomUUID() };
        setBusy(true);
        setError("");
        setStatus("");
        try {
            const result = await saveMediaAnalysis(host.projectId, analysisId, { ...intent, requestId: pending.current.requestId });
            if (!alive.current) return;
            accept(result.view);
            setStatus(success);
            setHistoryPreview(null);
            setVersions([]);
            setHistory(false);
            onChanged();
        } catch (failure) {
            if (alive.current) setError(failure instanceof Error ? failure.message : "修改未保存，草稿已保留");
        } finally {
            if (alive.current) setBusy(false);
        }
    }
    async function readHistory(before?: number) {
        if (busy) return;
        setBusy(true);
        setError("");
        try {
            const result = await listMediaAnalysisHistory(host.projectId, analysisId, before);
            if (alive.current) {
                setVersions((previous) => [...(before ? previous : []), ...result.versions]);
                setNextVersion(result.nextBeforeVersion);
                setHistory(true);
            }
        } catch (failure) {
            if (alive.current) setError(failure instanceof Error ? failure.message : "历史读取失败");
        } finally {
            if (alive.current) setBusy(false);
        }
    }
    function seek(timeMs: number) {
        state.pausePlayback();
        const media = player.current;
        if (!media) return;
        media.pause();
        media.currentTime = timeMs / 1000;
    }
    async function preview() {
        if (!view || dirty || busy || state.isDirty || state.saving || state.editingBlocked || state.inPreview) return;
        const before = store.getState().project;
        if (!before) return;
        setBusy(true);
        setError("");
        setStatus("");
        try {
            const saved = await getProjectTimeline(host.projectId);
            if (!alive.current) return;
            if (store.getState().project !== before || host.getTimelineRevision?.() !== saved.revision || timelineContentSignature(normalizeTimelineProject(saved.timeline)) !== timelineContentSignature(before))
                throw new Error("剪辑已变化或尚未保存，请先处理保存状态");
            const planner = view.analysis.kind === "subject_track" ? previewMediaAnalysisReframe : previewMediaAnalysisMarkers;
            const value = await planner(host.projectId, analysisId, { expectedTimelineRevision: saved.revision, analysisRevisionId: view.currentVersion.id, sourceClipId });
            if (!alive.current) return;
            if (store.getState().project !== before || store.getState().isDirty || host.getTimelineRevision?.() !== saved.revision) throw new Error("预览期间剪辑发生变化，请重新检查");
            if (timelineContentSignature(normalizeTimelineProject(value.beforeTimeline)) !== timelineContentSignature(before)) throw new Error("服务端剪辑与当前编辑器不一致，请保留草稿后重新载入");
            setPlan(value);
        } catch (failure) {
            if (alive.current) setError(failure instanceof Error ? failure.message : "采用预览失败");
        } finally {
            if (alive.current) setBusy(false);
        }
    }
    async function apply() {
        if (!plan || !view || dirty || busy || state.editingBlocked || state.inPreview) return;
        setBusy(true);
        setError("");
        try {
            const snapshot = store.getState();
            if (
                !snapshot.project ||
                snapshot.isDirty ||
                snapshot.saving ||
                snapshot.inPreview ||
                host.getTimelineRevision?.() !== plan.timelineRevision ||
                timelineContentSignature(snapshot.project) !== timelineContentSignature(normalizeTimelineProject(plan.beforeTimeline))
            )
                throw new Error("剪辑已变化，请重新预览");
            snapshot.dispatch({ op: "reframe" in plan ? MEDIA_ANALYSIS_REFRAME_COMMAND : MEDIA_ANALYSIS_MARKERS_COMMAND, payload: { before: snapshot.project, after: normalizeTimelineProject(plan.timeline) } });
            const applied = store.getState();
            if (applied.saveError || applied.project === snapshot.project) throw new Error(applied.saveError || "方案未采用");
            setPlan(null);
            await store.getState().flushSave();
            if (store.getState().saveError || store.getState().isDirty) throw new Error(store.getState().saveError || "标记已进入本地剪辑，但服务端尚未确认保存，请保留草稿后重试保存");
            if (alive.current) setStatus("reframe" in plan ? "构图已采用并保存，可在监视器预览、导出或用撤销恢复。" : "标记已采用并保存，可在时间线上点击定位，或用撤销恢复。");
        } catch (failure) {
            if (alive.current) setError(failure instanceof Error ? failure.message : "采用未完成");
        } finally {
            if (alive.current) setBusy(false);
        }
    }
    const shown = historyPreview?.document ?? draft;
    const shownVersion = historyPreview?.currentVersion ?? view?.currentVersion;
    const adoptedClip = initialRevisionId && shownVersion?.id === initialRevisionId ? state.project?.clips.find((clip) => clip.id === sourceClipId && clip.reframe?.analysisId === analysisId && clip.reframe.revisionId === initialRevisionId) : undefined;
    const manualFraming = view?.analysis.sourceKind === "manual_framing";
    const readOnly = busy || !!view?.analysis.archived || !!historyPreview || !!confirm || state.editingBlocked || state.inPreview;
    const entries = shown ? (view?.analysis.kind === "subject_track" ? shown.tracking : view?.analysis.kind === "audio_structure" && contentTab === "beats" ? shown.beats : shown.sections) : [];
    const offset = (page - 1) * 30;
    const close = () => {
        if (busy) return;
        if (protectedDirty) setConfirm("close");
        else onClose();
    };
    return (
        <AppModal open title="核对素材分析" centered styles={TRANSCRIPT_MODAL_LAYOUT} width={960} onCancel={close} footer={null} maskClosable={!busy && !protectedDirty} keyboard={!busy}>
            <div
                className="max-h-[75dvh] overflow-y-auto"
                onPlayCapture={(event) => {
                    state.pausePlayback();
                    const active = event.target;
                    event.currentTarget.querySelectorAll<HTMLMediaElement>("video,audio").forEach((media) => {
                        if (media !== active) media.pause();
                    });
                }}
            >
                {confirm && (
                    <Alert
                        className="sticky top-0 z-20 mb-4"
                        type="warning"
                        title={confirm === "close" || confirm === "reload" ? "未保存的修改将被丢弃" : confirm === "restore" ? "将另存为新的校正版本，当前草稿将被替换" : "归档后仍保留来源、版本和已采用的时间线标记"}
                        action={
                            <Space wrap>
                                <Button autoFocus onClick={() => setConfirm(null)}>
                                    继续编辑
                                </Button>
                                <Button
                                    danger={confirm === "close" || confirm === "reload"}
                                    onClick={() => {
                                        const action = confirm;
                                        setConfirm(null);
                                        if (action === "close") onClose();
                                        if (action === "reload") void load();
                                        if (action === "archive") void mutate({ archived: true }, "分析已归档");
                                        if (action === "restore" && historyPreview) void mutate({ restoreRevisionId: historyPreview.currentVersion.id }, "已另存历史校正为新版本");
                                    }}
                                >
                                    {confirm === "archive" ? "确认归档" : confirm === "restore" ? "确认恢复" : "放弃修改"}
                                </Button>
                            </Space>
                        }
                    />
                )}
                {loading && <Spin />}
                {error && <Alert type="error" title={error} className="mb-3" />}
                {status && <Alert type="success" title={status} className="mb-3" />}
                {!view && !loading && <Button onClick={() => void load()}>重试读取</Button>}
                {view && shown && (
                    <>
                        {view.evidence.legacyCropOnly === true && <Alert className="mb-3" type="info" title="旧记录未保存主体识别框，此处只显示历史构图框；原始置信度与分析文件来源保留。" />}
                        <p className="mb-3 text-xs text-muted-foreground">
                            {manualFraming ? "这是你创建的手工构图草稿，未运行自动跟踪或生成模型。请播放并核对位置，修改另存为新版本。" : "结果来自本地 CPU 测量，不代表镜头语义或人物身份识别。修改另存为校正版本，原始证据保留。"}
                        </p>
                        <label className="block text-sm">
                            分析名称
                            <Input aria-label="分析名称" value={title} maxLength={240} disabled={readOnly} onChange={(event) => setTitle(event.target.value)} />
                        </label>
                        <p className="my-2 text-xs">
                            源区间 {formatTimelineTime(view.source.startMs)}–{formatTimelineTime(view.source.endMs)} ·{" "}
                            {historyPreview ? `当前最新 v${view.currentVersion.version} · 正在预览 v${historyPreview.currentVersion.version}` : `校正 v${view.currentVersion.version}`}
                            {view.analysis.archived ? " · 已归档" : ""}
                        </p>
                        {adoptedClip ? (
                            <section aria-label="已采用构图预览">
                                <p className="text-xs">当前片段采用的构图 v{shownVersion?.version}。可播放或对比原画面；此处查看不会改变剪辑。</p>
                                <ReframePlanPreview
                                    clip={adoptedClip}
                                    onMedia={(node) => {
                                        player.current = node;
                                    }}
                                />
                            </section>
                        ) : view.analysis.kind === "audio_structure" ? (
                            <audio
                                ref={(node) => {
                                    player.current = node;
                                }}
                                src={resourceFileUrl(view.source.resourceId)}
                                controls
                                preload="metadata"
                                className="my-3 w-full"
                                aria-label="分析源音频"
                                onLoadedMetadata={(event) => {
                                    event.currentTarget.currentTime = view.source.startMs / 1000;
                                }}
                            />
                        ) : (
                            <video
                                ref={(node) => {
                                    player.current = node;
                                }}
                                src={resourceFileUrl(view.source.resourceId)}
                                controls
                                preload="metadata"
                                className="my-3 max-h-56 w-full bg-black"
                                aria-label="分析源视频"
                                onLoadedMetadata={(event) => {
                                    event.currentTarget.currentTime = view.source.startMs / 1000;
                                }}
                            />
                        )}
                        <Space wrap className="mb-3">
                            <Button type="primary" aria-label="保存校正" aria-busy={busy} disabled={readOnly || !dirty} loading={busy} onClick={() => void mutate({ title, document: draft! }, "人工校正已保存")}>
                                保存校正
                            </Button>
                            <Button
                                disabled={busy}
                                onClick={() => {
                                    if (protectedDirty) setConfirm("reload");
                                    else void load();
                                }}
                            >
                                重新读取
                            </Button>
                            <Button disabled={busy} onClick={() => void readHistory()}>
                                历史版本
                            </Button>
                            <Button
                                disabled={busy || (dirty && !view.analysis.archived)}
                                onClick={() => {
                                    if (view.analysis.archived) void mutate({ archived: false }, "分析已恢复");
                                    else setConfirm("archive");
                                }}
                            >
                                {view.analysis.archived ? "恢复分析" : "归档分析"}
                            </Button>
                            {historyPreview && (
                                <Button
                                    onClick={() => {
                                        setHistoryPreview(null);
                                        setPage(1);
                                    }}
                                >
                                    返回当前版本
                                </Button>
                            )}
                        </Space>
                        {history && (
                            <div className="mb-3 border-y border-border py-2">
                                <p className="text-sm">历史版本（初始来源保留）</p>
                                <Space wrap>
                                    {versions.map((version) => (
                                        <Button
                                            key={version.id}
                                            size="small"
                                            disabled={busy}
                                            onClick={async () => {
                                                setBusy(true);
                                                try {
                                                    const previous = await getMediaAnalysis(host.projectId, analysisId, version.id);
                                                    if (alive.current) {
                                                        setHistoryPreview(previous);
                                                        setPage(1);
                                                    }
                                                } catch (failure) {
                                                    if (alive.current) setError(failure instanceof Error ? failure.message : "版本读取失败");
                                                } finally {
                                                    if (alive.current) setBusy(false);
                                                }
                                            }}
                                        >
                                            v{version.version} · {version.note}
                                        </Button>
                                    ))}
                                </Space>
                                {nextVersion && (
                                    <Button disabled={busy} onClick={() => void readHistory(nextVersion)}>
                                        更早的版本
                                    </Button>
                                )}
                                {historyPreview && historyPreview.currentVersion.id !== view.currentVersion.id && (
                                    <Button disabled={busy || view.analysis.archived || state.editingBlocked} onClick={() => setConfirm("restore")}>
                                        恢复此校正版本
                                    </Button>
                                )}
                            </div>
                        )}
                        {view.analysis.kind === "audio_structure" && (
                            <Segmented
                                className="mb-3"
                                aria-label="查看音乐分析内容"
                                value={contentTab}
                                onChange={(value) => {
                                    setContentTab(value as "sections" | "beats");
                                    setPage(1);
                                }}
                                options={[
                                    { label: `结构分段 ${shown.sections.length}`, value: "sections" },
                                    { label: `节拍 ${shown.beats.length}`, value: "beats" },
                                ]}
                            />
                        )}
                        {view.analysis.kind === "subject_track" && !manualFraming && view.evidence.points?.some((point) => point.review_required || point.confidence < 0.65 || point.reason) && (
                            <Alert className="mb-3" type="warning" title="部分区间跟踪不可靠，请定位画面并人工校正。" />
                        )}
                        {view.analysis.kind === "subject_track" && !historyPreview && draft && <ReframeManualPath key={`${analysisId}:${view.currentVersion.id}`} view={view} draft={draft} disabled={readOnly} onChange={setDraft} />}
                        {manualFraming && !historyPreview && draft && (
                            <div className="my-3">
                                <Button
                                    disabled={readOnly || draft.tracking.length >= 100}
                                    onClick={() => {
                                        const timeMs = Math.round((player.current?.currentTime ?? 0) * 1000);
                                        const points = draft.tracking;
                                        if (timeMs <= view.source.startMs || timeMs >= view.source.endMs - 1 || points.some((point) => Math.abs(point.timeMs - timeMs) < 10)) {
                                            setError("请在原片中定位一个与已有关键点相隔至少0.01秒的中间位置");
                                            return;
                                        }
                                        const right = points.findIndex((point) => point.timeMs > timeMs),
                                            a = points[right - 1],
                                            b = points[right];
                                        if (!a || !b) return;
                                        const fraction = (timeMs - a.timeMs) / (b.timeMs - a.timeMs);
                                        const point = {
                                            id: `manual:${crypto.randomUUID()}`,
                                            timeMs,
                                            roi: { ...a.roi },
                                            crop: { ...a.crop, x: a.crop.x + (b.crop.x - a.crop.x) * fraction, y: a.crop.y + (b.crop.y - a.crop.y) * fraction },
                                            manual: true,
                                            reviewed: false,
                                        };
                                        setDraft({ ...draft, tracking: [...points.slice(0, right), point, ...points.slice(right)] });
                                        setPage(Math.floor(right / 30) + 1);
                                        setError("");
                                    }}
                                >
                                    在原片当前位置添加构图点
                                </Button>
                                <p className="mt-2 text-xs">先在上方原片定位，再添加中间点并调整位置。起点和终点保留，画幅大小固定；每个修改后的点都需要核对。</p>
                            </div>
                        )}
                        {entries.length === 0 && <p className="my-4 text-sm">此区间没有可用候选。安静音频可能没有节拍；可尝试其他区间或手动剪辑。</p>}
                        <div className="space-y-2">
                            {entries.slice(offset, offset + 30).map((entry, index) => {
                                const actual = index + offset;
                                const time = "timeMs" in entry ? entry.timeMs : entry.startMs;
                                const tracking = "crop" in entry;
                                const measuredIndex = tracking && /^point:(\d+)$/.exec(entry.id);
                                const measured = measuredIndex ? view.evidence.points?.[Number(measuredIndex[1])] : undefined;
                                return (
                                    <div key={entry.id} className="flex flex-wrap items-center gap-2 border-b border-border py-2">
                                        <Checkbox
                                            aria-label={`核对第${actual + 1}项`}
                                            disabled={readOnly}
                                            checked={tracking ? entry.reviewed : entry.approved}
                                            onChange={(event) =>
                                                setDraft((previous) => {
                                                    if (!previous) return previous;
                                                    const field = tracking ? "tracking" : "timeMs" in entry ? "beats" : "sections";
                                                    return {
                                                        ...previous,
                                                        [field]: previous[field].map((item) =>
                                                            item.id === entry.id ? { ...item, [tracking ? "reviewed" : "approved"]: event.target.checked, ...(tracking && manualFraming ? { manual: event.target.checked } : {}) } : item,
                                                        ),
                                                    };
                                                })
                                            }
                                        >
                                            已核对
                                        </Checkbox>
                                        <Button size="small" onClick={() => seek(time)}>
                                            查看 {formatTimelineTime(time)}
                                        </Button>
                                        <InputNumber
                                            aria-label={`第${actual + 1}项源时间秒`}
                                            min={view.source.startMs / 1000}
                                            max={(view.source.endMs - 1) / 1000}
                                            precision={3}
                                            value={time / 1000}
                                            disabled={readOnly || (manualFraming && tracking && ["point:0", "point:1"].includes(entry.id))}
                                            onChange={(value) => {
                                                if (value === null) return;
                                                setDraft((previous) => {
                                                    if (!previous) return previous;
                                                    const field = tracking ? "tracking" : "timeMs" in entry ? "beats" : "sections";
                                                    const changed = {
                                                        ...previous,
                                                        [field]: previous[field].map((item) =>
                                                            item.id === entry.id ? { ...item, ["startMs" in entry ? "startMs" : "timeMs"]: Math.round(value * 1000), ...(tracking ? { manual: true, reviewed: false } : {}) } : item,
                                                        ),
                                                    };
                                                    if (tracking) changed.tracking.sort((a, b) => a.timeMs - b.timeMs);
                                                    return changed;
                                                });
                                            }}
                                        />
                                        {"title" in entry && (
                                            <>
                                                <Input
                                                    aria-label={`第${actual + 1}项名称`}
                                                    className="max-w-52"
                                                    value={entry.title}
                                                    maxLength={160}
                                                    disabled={readOnly}
                                                    onChange={(event) => setDraft((previous) => (previous ? { ...previous, sections: previous.sections.map((item) => (item.id === entry.id ? { ...item, title: event.target.value } : item)) } : previous))}
                                                />
                                                <label className="text-xs">
                                                    终点秒{" "}
                                                    <InputNumber
                                                        aria-label={`第${actual + 1}项源终点秒`}
                                                        precision={3}
                                                        value={entry.endMs / 1000}
                                                        disabled={readOnly}
                                                        onChange={(value) => {
                                                            if (value !== null)
                                                                setDraft((previous) => (previous ? { ...previous, sections: previous.sections.map((item) => (item.id === entry.id ? { ...item, endMs: Math.round(value * 1000) } : item)) } : previous));
                                                        }}
                                                    />
                                                </label>
                                            </>
                                        )}
                                        {tracking && (
                                            <>
                                                <span className="text-xs">
                                                    构图左 {entry.crop.x.toFixed(3)} / 上 {entry.crop.y.toFixed(3)} ·{" "}
                                                    {entry.manual ? "手动校正" : measured && (measured.review_required || measured.confidence < 0.65 || measured.reason) ? "跟踪不可靠，请校正" : "待核对"}
                                                </span>
                                                {manualFraming && entry.id.startsWith("manual:") && (
                                                    <Button size="small" disabled={readOnly} onClick={() => setDraft((previous) => (previous ? { ...previous, tracking: previous.tracking.filter((point) => point.id !== entry.id) } : previous))}>
                                                        删除中间构图点
                                                    </Button>
                                                )}
                                                <details className="basis-full">
                                                    <summary className="cursor-pointer text-xs">{manualFraming || view.evidence.legacyCropOnly === true ? "调整此点的构图位置" : "调整此点的跟踪框和构图"}</summary>
                                                    <p className="my-2 text-xs">比例为 0–1。修改后请重新核对画面并勾选已核对。</p>
                                                    <div className="grid gap-2 sm:grid-cols-2">
                                                        {(manualFraming || view.evidence.legacyCropOnly === true ? (["crop"] as const) : (["roi", "crop"] as const)).map((field) => (
                                                            <fieldset key={field} className="grid grid-cols-2 gap-2">
                                                                <legend className="text-xs">{field === "roi" ? "主体框" : "构图框"}</legend>
                                                                {(["x", "y", "width", "height"] as const).map((key) => (
                                                                    <label key={key} className="text-xs">
                                                                        {{ x: "左边", y: "上边", width: "宽度", height: "高度" }[key]}
                                                                        <InputNumber
                                                                            aria-label={`第${actual + 1}项${field}${key}`}
                                                                            className="w-full"
                                                                            min={key === "width" || key === "height" ? 0.001 : 0}
                                                                            max={1}
                                                                            step={0.01}
                                                                            value={entry[field][key]}
                                                                            disabled={readOnly || (manualFraming && (key === "width" || key === "height"))}
                                                                            onChange={(value) => {
                                                                                if (value !== null)
                                                                                    setDraft((previous) =>
                                                                                        previous
                                                                                            ? {
                                                                                                  ...previous,
                                                                                                  tracking: previous.tracking.map((point) =>
                                                                                                      point.id === entry.id ? { ...point, [field]: { ...point[field], [key]: value }, manual: true, reviewed: false } : point,
                                                                                                  ),
                                                                                              }
                                                                                            : previous,
                                                                                    );
                                                                            }}
                                                                        />
                                                                    </label>
                                                                ))}
                                                            </fieldset>
                                                        ))}
                                                    </div>
                                                </details>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {entries.length > 30 && <Pagination className="my-3" current={page} pageSize={30} total={entries.length} showSizeChanger={false} onChange={setPage} />}
                        {view.analysis.kind === "reference_video" && (
                            <div hidden={!!historyPreview}>
                                <ReferenceShotAdoption key={`${view.currentVersion.id}:${readEpoch}`} projectId={host.projectId} view={view} disabled={readOnly || dirty || state.isDirty || state.saving} onBusy={setBusy} onDraftDirty={setPlanningDirty} />
                            </div>
                        )}
                        {view.analysis.kind === "audio_structure" && !historyPreview && (
                            <BeatArrangementEditor key={`${view.currentVersion.id}:${readEpoch}`} view={view} sourceClipId={sourceClipId} disabled={readOnly || dirty} onBusy={setBusy} onDraftDirty={setPlanningDirty} />
                        )}
                        {!historyPreview && (
                            <div className="mt-4 border-t border-border pt-3">
                                <p className="mb-2 text-sm">采用到当前选中的片段，保留其他片段和音轨。</p>
                                <Button disabled={busy || dirty || view.analysis.archived || state.isDirty || state.saving || state.editingBlocked || !sourceClipId} onClick={() => void preview()}>
                                    {view.analysis.kind === "subject_track" ? "预览跟随构图" : "预览采用标记"}
                                </Button>
                                {plan && (
                                    <div className="mt-3">
                                        {"reframe" in plan ? (
                                            <>
                                                <p>
                                                    {plan.replaced ? "替换此片段的构图" : "采用新的跟随构图"} · {plan.reframe.keys.length} 个关键点
                                                </p>
                                                {plan.timeline.clips
                                                    .filter((clip) => clip.id === sourceClipId)
                                                    .map((clip) => (
                                                        <ReframePlanPreview key={clip.id} clip={clip} />
                                                    ))}
                                            </>
                                        ) : (
                                            <p>
                                                新增 {plan.added.length} 个标记，替换此分析在这个片段实例中的 {plan.removedIds.length} 个旧标记。
                                            </p>
                                        )}
                                        {plan.warnings.map((warning) => (
                                            <p key={warning} className="my-2 text-xs">
                                                {warning}
                                            </p>
                                        ))}
                                        <Button type="primary" disabled={busy} onClick={() => void apply()}>
                                            确认采用到时间线
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                        <details className="mt-4">
                            <summary className="cursor-pointer text-xs">{manualFraming ? "初始构图建议与来源" : "原始测量与来源"}</summary>
                            <p className="my-2 break-all text-xs">
                                SHA256 {view.source.sha256} · {view.source.bytes} 字节 · {view.evidence.method}
                            </p>
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(view.evidence, null, 2)}</pre>
                        </details>
                    </>
                )}
            </div>
        </AppModal>
    );
}
