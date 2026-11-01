import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Alert, Button, Checkbox, InputNumber, Radio, Select, Space } from "antd";
import { Wrench } from "lucide-react";
import { AppModal } from "@/components/ui/product/app-modal";
import { useEditorHostContext, useEditorStoreApi, useEditorStoreContext } from "@/components/editor/editor-context";
import { getActiveUserScope } from "@/lib/user-scope";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { createVideoReworkSession } from "@/services/video-rework-session";
import { createVideoReworkAdoptionSession } from "@/services/video-rework-adoption-session";
import { readVideoReworkHistory, readVideoReworkMedia, readVideoReworkSource, type VideoReworkHistory } from "@/services/api/video-reworks";
import { cancelGenerationTask, queryGenerationTask, waitForGenerationTask, type GenerationTask } from "@/services/api/task-center";
import type { VideoReworkEdit, VideoReworkSource, VideoReworkMediaView, VideoReworkRegion, VideoReworkResult } from "@/types/video-rework";
import { VideoReworkRegionPicker, VideoReworkComparison } from "./video-rework-preview";
import { readVideoReworkDraft, videoReworkDraftKey, type VideoReworkDraft } from "@/services/video-rework-draft";
import { withGenerationRequestLock } from "@/services/generation-request-snapshot";

const terminal = (task?: GenerationTask | null) => !!task && ["succeeded", "failed", "cancelled"].includes(task.status);
type Session = ReturnType<typeof createVideoReworkSession>;
type AdoptionSession = ReturnType<typeof createVideoReworkAdoptionSession>;
type Intent = NonNullable<Awaited<ReturnType<Session["read"]>>>;
type Adoption = NonNullable<Awaited<ReturnType<AdoptionSession["read"]>>>;
const message = (cause: unknown) => (cause instanceof Error ? cause.message : "处理未完成，请核对原记录后重试");

export function EditorVideoRework() {
    const host = useEditorHostContext();
    const [params] = useSearchParams(),
        enteredFromTask = useRef("");
    const { project, selectedClipId, editingBlocked, inPreview, hasPendingPanelEdits } = useEditorStoreContext();
    const [open, setOpen] = useState(false),
        [target, setTarget] = useState(""),
        [guard, setGuard] = useState(false);
    const [recoveryTaskId, setRecoveryTaskId] = useState<string>();
    const [closing, setClosing] = useState(false),
        [closeError, setCloseError] = useState("");
    const beforeClose = useRef<() => Promise<void>>(async () => {});
    const registerBeforeClose = useCallback((run: () => Promise<void>) => {
        beforeClose.current = run;
    }, []);
    async function leave(next?: string) {
        if (guard || closing) return;
        setClosing(true);
        setCloseError("");
        try {
            await beforeClose.current();
            if (next) {
                setRecoveryTaskId(undefined);
                setTarget(next);
            } else setOpen(false);
        } catch (cause) {
            setCloseError(`选择尚未保存：${message(cause)}`);
        } finally {
            setClosing(false);
        }
    }
    const clips = project?.clips.filter((c) => c.kind === "video" && c.directMedia?.storageKey?.startsWith("resource:")) ?? [];
    useEffect(() => {
        const requested = params.get("repairClipId"),
            taskId = params.get("repairTaskId") || undefined,
            key = `${host.projectId}:${requested}:${taskId}`;
        if (!requested || enteredFromTask.current === key || editingBlocked || inPreview || hasPendingPanelEdits || !clips.some((c) => c.id === requested)) return;
        enteredFromTask.current = key;
        setTarget(requested);
        setRecoveryTaskId(taskId);
        setOpen(true);
    }, [params, host.projectId, project, editingBlocked, inPreview, hasPendingPanelEdits]);
    return (
        <>
            <Button
                size="small"
                aria-label="修复片段"
                title="修复片段"
                icon={<Wrench className="size-3.5" />}
                disabled={!clips.length || editingBlocked || inPreview || hasPendingPanelEdits}
                onClick={() => {
                    setTarget(clips.find((c) => c.id === selectedClipId)?.id ?? clips[0].id);
                    setOpen(true);
                }}
            >
                <span className="hidden sm:inline">修复片段</span>
            </Button>
            {open && (
                <AppModal
                    open
                    centered
                    title="修复视频片段"
                    width={900}
                    footer={null}
                    closable={!guard && !closing}
                    maskClosable={!guard && !closing}
                    keyboard={!guard && !closing}
                    onCancel={() => void leave()}
                    styles={{ body: { maxHeight: "78dvh", overflowY: "auto" } }}
                >
                    <label className="mb-4 block">
                        要修复哪一次使用？
                        <Select
                            className="mt-1 w-full"
                            aria-label="要修复的视频片段"
                            value={target}
                            disabled={guard || closing}
                            options={clips.map((c) => ({ value: c.id, label: `${c.title || "视频"} · 成片 ${(c.startMs / 1000).toFixed(2)}–${((c.startMs + c.durationMs) / 1000).toFixed(2)} 秒` }))}
                            onChange={(next) => void leave(next)}
                        />
                    </label>
                    {closeError && <Alert type="error" title={closeError} showIcon />}
                    <VideoReworkEditor
                        key={`${host.projectId}:${target}:${recoveryTaskId ?? ""}:${getActiveUserScope()}`}
                        clipId={target}
                        recoveryTaskId={recoveryTaskId}
                        onClose={() => void leave()}
                        onGuardChange={setGuard}
                        registerBeforeClose={registerBeforeClose}
                    />
                </AppModal>
            )}
        </>
    );
}

function VideoReworkEditor({
    clipId,
    recoveryTaskId,
    onClose,
    onGuardChange,
    registerBeforeClose,
}: {
    clipId: string;
    recoveryTaskId?: string;
    onClose: () => void;
    onGuardChange: (guard: boolean) => void;
    registerBeforeClose: (run: () => Promise<void>) => void;
}) {
    const host = useEditorHostContext(),
        store = useEditorStoreApi(),
        scope = getActiveUserScope();
    const navigate = useNavigate();
    const storage = useMemo(() => localForageStorageForScope(scope), [scope]);
    const session = useMemo(() => createVideoReworkSession(host.projectId, clipId, storage), [host.projectId, clipId, storage]);
    const adoptionSession = useMemo(() => createVideoReworkAdoptionSession(host.projectId, clipId, storage), [host.projectId, clipId, storage]);
    const [source, setSource] = useState<VideoReworkSource>(),
        [candidate, setCandidate] = useState<VideoReworkMediaView>();
    const [candidateId, setCandidateId] = useState(""),
        [start, setStart] = useState(0),
        [end, setEnd] = useState(1),
        [candidateStart, setCandidateStart] = useState(0);
    const [region, setRegion] = useState<VideoReworkRegion>(),
        [audio, setAudio] = useState<VideoReworkEdit["audio"]>("original");
    const [intent, setIntent] = useState<Intent>(),
        [adoption, setAdoption] = useState<Adoption>(),
        [task, setTask] = useState<GenerationTask>();
    const [busy, setBusy] = useState(false),
        [loading, setLoading] = useState(true),
        [error, setError] = useState(""),
        [notice, setNotice] = useState("");
    const [needsReload, setNeedsReload] = useState(false);
    const [history, setHistory] = useState<VideoReworkHistory>({ entries: [] }),
        [historyBusy, setHistoryBusy] = useState(false),
        [historyError, setHistoryError] = useState("");
    const historyEpoch = useRef(0);
    const [draftBlocked, setDraftBlocked] = useState(false);
    useEffect(() => {
        onGuardChange(busy || needsReload);
        return () => onGuardChange(false);
    }, [busy, needsReload, onGuardChange]);
    const alive = useRef(true),
        lock = useRef(false),
        poll = useRef<AbortController | null>(null),
        candidateEpoch = useRef(0);
    const owned = () => alive.current && scope === getActiveUserScope();
    const rate = source?.clip.playbackRate ?? 1;
    const duration = (source?.clip.durationMs ?? 0) / 1000;
    const sourceStartMs = (source?.clip.sourceStartMs ?? 0) + Math.round(start * 1000 * rate);
    const sourceEndMs = (source?.clip.sourceStartMs ?? 0) + Math.round(end * 1000 * rate);
    const sourceLength = sourceEndMs - sourceStartMs;
    const candidates = host.assets.filter((a) => a.mediaType === "video" && !["archived", "deleted"].includes(a.status) && a.storageKey?.startsWith("resource:") && a.storageKey !== `resource:${source?.media.resourceId}`);
    let result: VideoReworkResult | undefined;
    try {
        const r = JSON.parse(task?.resultJson || "null") as VideoReworkResult | null;
        if (task?.status === "succeeded" && r?.video?.resourceId && r.video.assetVersionId && r.videoRework?.taskId === task.id && r.videoRework.plan.request.clipId === clipId) result = r;
    } catch {
        /* retain task and offer its original status */
    }
    const currentHasRepair = store.getState().project?.clips.some((c) => c.id === `repair-clip:${task?.id}` || (c.id === clipId && c.videoReworkOrigin?.version === 2 && c.videoReworkOrigin.taskId === task?.id));
    const originalLink = source?.clip.canvasOrigin ? `/canvas/${encodeURIComponent(source.clip.canvasOrigin.canvasId)}?focusNode=${encodeURIComponent(source.clip.canvasOrigin.nodeId)}` : `/production/${encodeURIComponent(host.projectId)}/canvases`;

    async function savedSource() {
        const state = store.getState();
        if (!owned() || state.editingBlocked || state.inPreview || state.hasPendingPanelEdits) throw new Error("请先保存当前面板修改或结束预览");
        await state.flushSave();
        const current = store.getState();
        if (!owned() || current.isDirty || current.saving || current.saveError) throw new Error(current.saveError || "请先成功保存剪辑");
        const value = await readVideoReworkSource(host.projectId, clipId);
        if (!owned() || host.getTimelineRevision?.() !== value.revision) throw new Error("服务端剪辑已变化，请重新载入剪辑后核对范围");
        return value;
    }
    async function watch(value: GenerationTask) {
        if (!owned()) return;
        setTask(value);
        poll.current?.abort();
        if (terminal(value)) return;
        const controller = new AbortController();
        poll.current = controller;
        try {
            const done = await waitForGenerationTask(value.id, {
                signal: controller.signal,
                intervalMs: 1500,
                timeoutMs: 22 * 60 * 1000,
                onTaskUpdate: (next) => {
                    if (owned() && !controller.signal.aborted) setTask(next);
                },
            });
            if (owned() && !controller.signal.aborted) {
                setTask(done);
                await host.refreshAssets();
            }
        } catch (cause) {
            if (owned() && !controller.signal.aborted) setError(message(cause));
        }
    }
    function populate(pending: Intent, current: VideoReworkSource) {
        const input = pending.request.edit;
        setIntent(pending);
        setStart((input.sourceStartMs - (current.clip.sourceStartMs ?? 0)) / (current.clip.playbackRate ?? 1) / 1000);
        setEnd((input.sourceEndMs - (current.clip.sourceStartMs ?? 0)) / (current.clip.playbackRate ?? 1) / 1000);
        setCandidateId(input.candidateResourceId);
        setCandidateStart(input.candidateStartMs / 1000);
        setAudio(input.audio);
        setRegion(input.region);
    }
    async function loadHistory(cursor?: string) {
        const epoch = ++historyEpoch.current;
        setHistoryBusy(true);
        setHistoryError("");
        try {
            const page = await readVideoReworkHistory(host.projectId, clipId, cursor);
            if (owned() && epoch === historyEpoch.current)
                setHistory((old) => ({ entries: cursor ? [...old.entries, ...page.entries.filter((row) => !old.entries.some((previous) => previous.taskId === row.taskId))] : page.entries, nextCursor: page.nextCursor }));
        } catch (cause) {
            if (owned() && epoch === historyEpoch.current) setHistoryError(message(cause));
        } finally {
            if (owned() && epoch === historyEpoch.current) setHistoryBusy(false);
        }
    }
    async function chooseHistory(taskId: string) {
        if (!source || adoption || needsReload) return;
        const original = await queryGenerationTask(taskId);
        if (!owned()) return;
        // A new choice is explicit, and cannot discard an unknown or active write.
        const previous = await session.read();
        if (previous && JSON.parse(original.inputJson || "{}").request?.requestId !== previous.request.requestId) await session.prepareAnother(previous.request.requestId);
        const pending = await session.recover(original);
        if (!owned()) return;
        populate(pending, source);
        setNotice("已找回服务端保存的原候选，没有重新生成。");
        void watch(original);
    }
    useEffect(() => {
        alive.current = true;
        void (async () => {
            try {
                const [current, previous, edit] = await Promise.all([savedSource(), session.read(), adoptionSession.read()]);
                let pending = previous;
                if (recoveryTaskId) {
                    const original = await queryGenerationTask(recoveryTaskId);
                    if (!owned()) return;
                    pending = await session.recover(original);
                    setNotice("已从服务端找回原修复任务，继续使用同一候选。");
                }
                if (!owned()) return;
                setSource(current);
                setIntent(pending ?? undefined);
                setAdoption(edit ?? undefined);
                void loadHistory();
                if (pending) {
                    populate(pending, current);
                    try {
                        const found = await session.verify();
                        if (found) void watch(found);
                    } catch {
                        if (owned()) setNotice("上一份提交尚未核对，可用原编号核对或重试，选择已保留。");
                    }
                } else {
                    setStart(0);
                    setEnd(Math.min(current.clip.durationMs / 1000, 30 / (current.clip.playbackRate ?? 1)));
                    try {
                        const draft = await readVideoReworkDraft(storage, host.projectId, clipId, current);
                        if (draft && owned()) {
                            setStart(draft.start);
                            setEnd(draft.end);
                            setCandidateId(draft.candidateId);
                            setCandidateStart(draft.candidateStart);
                            setAudio(draft.audio);
                            setRegion(draft.region);
                        }
                    } catch (cause) {
                        if (owned()) {
                            setDraftBlocked(true);
                            setError(message(cause));
                        }
                    }
                }
                if (edit?.phase === "submitted") setNotice("上次采用或撤销的回复尚需核对，请先核对原记录。");
            } catch (cause) {
                if (owned()) setError(message(cause));
            } finally {
                if (owned()) setLoading(false);
            }
        })();
        return () => {
            alive.current = false;
            poll.current?.abort();
            candidateEpoch.current++;
            historyEpoch.current++;
            if (lock.current) store.getState().setEditingBlocked(false);
        };
    }, [session, adoptionSession, recoveryTaskId]);
    useEffect(() => {
        const epoch = ++candidateEpoch.current;
        setCandidate(undefined);
        if (candidateId)
            void readVideoReworkMedia(host.projectId, candidateId)
                .then((value) => {
                    if (owned() && epoch === candidateEpoch.current) setCandidate(value);
                })
                .catch((cause) => {
                    if (owned() && epoch === candidateEpoch.current) setError(message(cause));
                });
    }, [candidateId, host.projectId]);
    async function saveDraft() {
        if (!owned() || !source || intent || loading || draftBlocked) return;
        const draft: VideoReworkDraft = { version: 1, projectId: host.projectId, clipId, clipSha256: source.clipSha256, sourceSha256: source.media.sha256, start, end, candidateId, candidateStart, audio, ...(region ? { region } : {}) };
        const key = videoReworkDraftKey(host.projectId, clipId);
        await withGenerationRequestLock(`yingce-${key}`, () => storage.setItem(key, JSON.stringify(draft)) as Promise<void>);
    }
    useEffect(() => {
        if (loading || intent || draftBlocked || !source) return;
        const timer = window.setTimeout(() => {
            void saveDraft().catch((cause) => {
                if (owned()) setError(`草稿保存失败：${message(cause)}`);
            });
        }, 150);
        return () => window.clearTimeout(timer);
    }, [loading, source, intent, start, end, candidateId, candidateStart, audio, region, draftBlocked]);
    // Close, switching occurrences and navigation flush the latest selection.
    const latestDraft = useRef(saveDraft);
    latestDraft.current = saveDraft;
    useEffect(() => {
        registerBeforeClose(() => latestDraft.current());
        return () => registerBeforeClose(async () => {});
    }, [registerBeforeClose]);

    async function action(run: () => Promise<void>) {
        if (busy || !owned()) return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            await run();
        } catch (cause) {
            if (owned()) setError(message(cause));
        } finally {
            if (owned()) setBusy(false);
        }
    }
    async function compose() {
        if (draftBlocked) throw new Error("请先核对并重设旧草稿");
        await saveDraft();
        let pending = await session.read();
        if (!pending) {
            const current = await savedSource();
            if (!source || !candidate || current.clipSha256 !== source.clipSha256 || current.media.sha256 !== source.media.sha256) throw new Error("原片段已变化，请关闭后重新选择范围");
            if (sourceLength < 100 || sourceLength > 30000 || start < 0 || end > duration || end <= start) throw new Error("请选择片段内 0.1–30 秒的源范围");
            if (candidate.media.width !== source.media.width || candidate.media.height !== source.media.height) throw new Error("候选尺寸须与原视频一致，请在画布按原尺寸制作候选");
            if (candidateStart < 0 || candidateStart * 1000 + sourceLength > candidate.media.durationMs) throw new Error("候选视频不足以覆盖所选范围，请缩短范围或选择更长候选");
            pending = await session.prepare(
                {
                    clipId,
                    clipSha256: current.clipSha256,
                    sourceResourceId: source.media.resourceId,
                    sourceSha256: source.media.sha256,
                    sourceStartMs,
                    sourceEndMs,
                    candidateResourceId: candidate.media.resourceId,
                    candidateSha256: candidate.media.sha256,
                    candidateStartMs: Math.round(candidateStart * 1000),
                    audio,
                    ...(region ? { region } : {}),
                },
                current.revision,
            );
        }
        if (!owned()) return;
        setIntent(pending);
        let created: GenerationTask;
        try {
            created = await session.submit(pending.request.requestId);
        } finally {
            const latest = await session.read();
            if (owned()) setIntent(latest ?? undefined);
        }
        if (owned()) {
            setNotice("修复已提交，关闭窗口后仍会继续处理。");
            void watch(created);
        }
    }
    async function previewAdoption(undo = false) {
        const current = await savedSource();
        const origin = current.clip.videoReworkOrigin;
        const command =
            undo && origin ? { op: "removeVideoRepair" as const, id: clipId, repairTaskId: origin.taskId, expectedClipSha256: current.clipSha256 } : result ? { op: "applyVideoRepair" as const, id: clipId, repairTaskId: result.videoRework.taskId } : null;
        if (!command) throw new Error("请先选择已完成的修复候选");
        const pending = await adoptionSession.prepare(command, current.revision);
        if (owned()) setAdoption(pending);
    }
    async function applyAdoption(verify = false) {
        if (!adoption) return;
        const state = store.getState();
        if (state.editingBlocked || state.inPreview || state.hasPendingPanelEdits) throw new Error("请先处理当前面板的修改");
        await state.flushSave();
        if (!owned() || store.getState().isDirty || store.getState().saveError) throw new Error("请先成功保存当前剪辑");
        store.getState().setEditingBlocked(true);
        lock.current = true;
        try {
            const receipt = verify ? await adoptionSession.verify() : await adoptionSession.apply(adoption.request.requestId);
            if (!receipt || !owned()) return;
            setNeedsReload(true);
            if (!host.reloadTimeline) throw new Error("采用已保存，请重新打开剪辑载入结果");
            await host.reloadTimeline();
            if (!owned()) return;
            await adoptionSession.clear(adoption.request.requestId);
            setAdoption(undefined);
            setNeedsReload(false);
            setSource(await readVideoReworkSource(host.projectId, clipId).catch(() => undefined));
            setNotice("已保存到剪辑，并保留修改前后的版本。可选择修复片段撤销这次修复。");
        } finally {
            if (lock.current) {
                store.getState().setEditingBlocked(false);
                lock.current = false;
            }
        }
    }
    const frozen = !!intent || busy || loading || !!adoption || needsReload || draftBlocked;
    return (
        <div className="space-y-4" data-video-rework-editor={clipId}>
            <p className="text-sm text-muted-foreground">选一段不满意的画面，换上新候选；也可以只替换圈出的区域。先播放对比，再确认采用。</p>
            {error && <Alert type="error" showIcon title={error} />}
            {notice && <Alert type="info" showIcon title={notice} />}
            {draftBlocked && (
                <Button
                    disabled={busy}
                    onClick={() =>
                        void action(async () => {
                            await storage.removeItem(videoReworkDraftKey(host.projectId, clipId));
                            if (owned()) {
                                setDraftBlocked(false);
                                setNotice("已按当前片段重设范围，原任务和素材保留。");
                            }
                        })
                    }
                >
                    按当前片段重设草稿
                </Button>
            )}
            {loading ? (
                <p role="status">正在核对原片段和上次记录…</p>
            ) : !source ? (
                <Button onClick={onClose}>返回剪辑</Button>
            ) : (
                <>
                    <details aria-label="服务端修复历史">
                        <summary>找回已有修复候选{history.entries.length ? `（${history.entries.length}）` : ""}</summary>
                        <div className="mt-2 space-y-2">
                            {historyError && (
                                <p role="alert" className="text-sm text-destructive">
                                    {historyError}
                                </p>
                            )}
                            {history.entries.map((row) => (
                                <Button key={row.taskId} className="h-auto whitespace-normal text-left" disabled={busy || !!adoption || needsReload} onClick={() => void action(() => chooseHistory(row.taskId))}>
                                    {new Date(row.createdAt).toLocaleString()} · 源 {(row.sourceStartMs / 1000).toFixed(2)}–{(row.sourceEndMs / 1000).toFixed(2)} 秒 · {{ original: "原声", candidate: "候选声音", mute: "静音" }[row.audio]} ·{" "}
                                    {({ succeeded: "已完成", failed: "失败", cancelled: "已停止", running: "处理中", queued: "排队中" } as Record<string, string>)[row.status] || row.status}
                                </Button>
                            ))}
                            <Space wrap>
                                <Button loading={historyBusy} disabled={busy} onClick={() => void loadHistory()}>
                                    刷新修复历史
                                </Button>
                                {history.nextCursor && (
                                    <Button loading={historyBusy} disabled={busy} onClick={() => void loadHistory(history.nextCursor)}>
                                        加载更早候选
                                    </Button>
                                )}
                            </Space>
                            {!historyBusy && !historyError && !history.entries.length && !history.nextCursor && <p className="text-sm text-muted-foreground">这个片段还没有修复记录。</p>}
                        </div>
                    </details>
                    {source.clip.videoReworkOrigin && !adoption && (
                        <Button disabled={busy} onClick={() => void action(() => previewAdoption(true))}>
                            预览撤销这次修复
                        </Button>
                    )}
                    <section className="space-y-2" aria-label="选择修复范围">
                        <h3 className="font-medium">1. 选范围</h3>
                        <Space wrap>
                            <label>
                                片段起点（秒）
                                <InputNumber aria-label="修复起点" min={0} max={duration} step={0.1} precision={3} value={start} disabled={frozen} onChange={(v) => setStart(Number(v ?? 0))} />
                            </label>
                            <label>
                                片段终点（秒）
                                <InputNumber aria-label="修复终点" min={0} max={duration} step={0.1} precision={3} value={end} disabled={frozen} onChange={(v) => setEnd(Number(v ?? 0))} />
                            </label>
                        </Space>
                        <p className="text-xs text-muted-foreground">
                            相对当前片段，共 {duration.toFixed(2)} 秒。所选源范围 {(sourceStartMs / 1000).toFixed(3)}–{(sourceEndMs / 1000).toFixed(3)} 秒，最长 30 秒。
                        </p>
                        <Checkbox checked={!!region} disabled={frozen} onChange={(e) => setRegion(e.target.checked ? { x: 0, y: 0, width: source.media.width, height: source.media.height } : undefined)}>
                            只替换所选区域
                        </Checkbox>
                        <VideoReworkRegionPicker media={source.media} timeMs={sourceStartMs} region={region} disabled={frozen} onChange={setRegion} />
                    </section>
                    <section className="space-y-2" aria-label="选择修复候选">
                        <h3 className="font-medium">2. 选候选</h3>
                        <div className="flex flex-wrap gap-2">
                            <Select
                                aria-label="修复候选视频"
                                className="min-w-0 flex-1"
                                style={{ minWidth: 180 }}
                                value={candidateId || undefined}
                                disabled={frozen}
                                placeholder="从项目视频中选择"
                                options={candidates.map((a) => ({ value: a.storageKey!.slice(9), label: a.title }))}
                                onChange={setCandidateId}
                            />
                            <Button
                                disabled={busy}
                                onClick={() =>
                                    void action(async () => {
                                        await host.refreshAssets();
                                    })
                                }
                            >
                                刷新素材
                            </Button>
                        </div>
                        {!intent && (
                            <Link
                                className="inline-block underline aria-disabled:opacity-50"
                                aria-disabled={frozen}
                                tabIndex={frozen ? -1 : 0}
                                to={originalLink}
                                onClick={(event) => {
                                    event.preventDefault();
                                    if (!frozen)
                                        void action(async () => {
                                            await saveDraft();
                                            if (owned()) navigate(originalLink);
                                        });
                                }}
                            >
                                在画布制作新候选
                            </Link>
                        )}
                        {candidate && (
                            <p className="text-xs text-muted-foreground">
                                候选 {candidate.media.width}×{candidate.media.height}，{(candidate.media.durationMs / 1000).toFixed(2)} 秒。原视频 {source.media.width}×{source.media.height}。
                            </p>
                        )}
                        <details>
                            <summary>候选从哪里开始</summary>
                            <label>
                                候选起点（秒）
                                <InputNumber aria-label="候选起点" min={0} step={0.1} precision={3} value={candidateStart} disabled={frozen} onChange={(v) => setCandidateStart(Number(v ?? 0))} />
                            </label>
                        </details>
                        <Radio.Group aria-label="修复声音选择" value={audio} disabled={frozen} onChange={(e) => setAudio(e.target.value)}>
                            <Radio value="original">保留原声</Radio>
                            <Radio value="candidate" disabled={!candidate?.hasAudio}>
                                采用候选声音
                            </Radio>
                            <Radio value="mute">所选段静音</Radio>
                        </Radio.Group>
                        <p className="text-xs text-muted-foreground">本步骤在本地合成已有视频，不运行生成模型。原配音、字幕和其他素材使用保留。</p>
                        <Space wrap>
                            <Button type="primary" loading={busy} disabled={loading || !!adoption || needsReload || (!!intent && !!task) || (!intent && !candidate)} onClick={() => void action(compose)}>
                                {intent ? "用原编号重试提交" : "合成修复候选"}
                            </Button>
                            {intent && (
                                <Button
                                    disabled={busy}
                                    onClick={() =>
                                        void action(async () => {
                                            const found = await session.verify();
                                            if (found && owned()) void watch(found);
                                        })
                                    }
                                >
                                    核对原任务
                                </Button>
                            )}
                            {task && !terminal(task) && (
                                <Button
                                    disabled={busy}
                                    onClick={() =>
                                        void action(async () => {
                                            await cancelGenerationTask(task.id);
                                            const found = await session.verify();
                                            if (found && owned()) void watch(found);
                                        })
                                    }
                                >
                                    停止这次修复
                                </Button>
                            )}
                        </Space>
                        {task && (
                            <p role="status">
                                {task.status === "succeeded" ? "修复候选已保存" : task.error || task.stage || task.status} {task.progress != null && task.status !== "succeeded" ? `${task.progress}%` : ""}
                            </p>
                        )}
                    </section>
                    {result && (
                        <section className="space-y-3" aria-label="播放对比与采用">
                            <h3 className="font-medium">3. 播放对比，再采用</h3>
                            <VideoReworkComparison result={result} />
                            <Space wrap>
                                <Button type="primary" disabled={busy || !!adoption || currentHasRepair || needsReload} onClick={() => void action(() => previewAdoption())}>
                                    {currentHasRepair ? "此候选已在剪辑中" : "预览采用影响"}
                                </Button>
                            </Space>
                        </section>
                    )}
                    {adoption && (
                        <section className="space-y-3 rounded-md border border-border p-3" aria-label="确认修复变更">
                            <p>
                                本次{adoption.request.commands[0].op === "removeVideoRepair" ? "撤销" : "采用"}涉及 {adoption.preview.changes.length} 个片段，成片时长 {(adoption.preview.before.durationMs / 1000).toFixed(2)} →{" "}
                                {(adoption.preview.after.durationMs / 1000).toFixed(2)} 秒。
                            </p>
                            <Space wrap>
                                <Button type="primary" loading={busy} disabled={needsReload} onClick={() => void action(() => applyAdoption())}>
                                    确认{adoption.request.commands[0].op === "removeVideoRepair" ? "撤销" : "采用"}
                                </Button>
                                <Button disabled={busy} onClick={() => void action(() => applyAdoption(true))}>
                                    核对原采用记录
                                </Button>
                                <Button
                                    disabled={busy || needsReload}
                                    onClick={() =>
                                        void action(async () => {
                                            await adoptionSession.clear(adoption.request.requestId);
                                            if (owned()) setAdoption(undefined);
                                        })
                                    }
                                >
                                    返回重新检查
                                </Button>
                            </Space>
                        </section>
                    )}
                    {needsReload && (
                        <Button disabled={busy} onClick={() => void action(() => applyAdoption(true))}>
                            载入已保存的剪辑
                        </Button>
                    )}
                    {intent && (terminal(task) || intent.phase === "rejected" || intent.phase === "prepared") && !adoption && (
                        <Button
                            disabled={busy || needsReload}
                            onClick={() =>
                                void action(async () => {
                                    await session.prepareAnother(intent.request.requestId);
                                    if (owned()) {
                                        setIntent(undefined);
                                        setTask(undefined);
                                        setSource(await savedSource());
                                    }
                                })
                            }
                        >
                            开始另一份修复
                        </Button>
                    )}
                </>
            )}
        </div>
    );
}
