import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Loader2 } from "lucide-react";

import { useEditorHostContext, useEditorStoreContext, useEditorStoreApi } from "@/components/editor/editor-context";
import { getActiveUserScope } from "@/lib/user-scope";
import { getSubtitleTracks } from "@/lib/timeline/timeline-tracks";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";
import { transcriptionForClip } from "@/lib/timeline/transcription-placement";
import { clipSourceOffset } from "@/lib/timeline/timeline-speed";
import { cancelGenerationTask, listGenerationTaskPage, queryGenerationTask, waitForGenerationTask, type GenerationTask } from "@/services/api/task-center";
import { createTimelineTranscriptionTask, type TimelineTranscriptionResult } from "@/services/api/timeline-tasks";
import { listProjectTranscripts, type ProjectTranscript, type TranscriptView } from "@/services/api/project-transcripts";
import { TranscriptEditor } from "./transcript-editor";

function binding(task: GenerationTask): { sourceClipId?: string; resourceId?: string } {
    try { return JSON.parse(task.inputJson ?? "{}"); } catch { return {}; }
}

function resultOf(task: GenerationTask): TimelineTranscriptionResult {
    const value = JSON.parse(task.resultJson ?? "{}");
    if (!Array.isArray(value.segments)) throw new Error("识别任务没有可用字幕，请在任务中心检查结果");
    return value;
}

export function EditorTranscription() {
    const { projectId } = useEditorHostContext();
    const editorStore = useEditorStoreApi();
    const { project, dispatch, selectedClipId, isDirty, saving, editingBlocked } = useEditorStoreContext();
    const clips = useMemo(() => (project?.clips ?? []).filter((clip) => (clip.kind === "audio" || clip.kind === "video") && clip.directMedia?.storageKey?.startsWith("resource:")), [project]);
    const [selectedId, setSelectedId] = useState("");
    const [language, setLanguage] = useState("");
    const [history, setHistory] = useState<GenerationTask[]>([]);
    const [historyCursor, setHistoryCursor] = useState("");
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState(false);
    const historyRequest = useRef<AbortController | null>(null);
    const [runningTask, setRunningTask] = useState<GenerationTask | null>(null);
    const [creating, setCreating] = useState(false);
    const [progress, setProgress] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    const [recognized, setRecognized] = useState<GenerationTask | null>(null);
    const [editor, setEditor] = useState<{ transcriptId?: string; taskId?: string } | null>(null);
    const [transcripts, setTranscripts] = useState<ProjectTranscript[]>([]);
    const [transcriptCursor, setTranscriptCursor] = useState("");
    const [archivedTranscripts, setArchivedTranscripts] = useState(false);
    const [transcriptsLoading, setTranscriptsLoading] = useState(false);
    const [transcriptError, setTranscriptError] = useState("");
    const transcriptRequest = useRef<AbortController | null>(null);
    const active = useRef(true);
    const polling = useRef<AbortController | null>(null);
    const submitting = useRef<symbol | null>(null);
    const owner = `${getActiveUserScope()}:${projectId}`;
    const currentOwner = useRef(owner);
    currentOwner.current = owner;
    function openEditor(selection: { transcriptId?: string; taskId?: string }) { editorStore.getState().pausePlayback(); setEditor(selection); }

    useEffect(() => {
        if (!clips.some((clip) => clip.id === selectedId)) setSelectedId(clips.find((clip) => clip.id === selectedClipId)?.id ?? clips.find((clip) => clip.kind === "audio")?.id ?? clips[0]?.id ?? "");
    }, [clips, selectedId, selectedClipId]);

    useEffect(() => {
        active.current = true;
        setHistory([]); setHistoryCursor(""); setRecognized(null);
        setCreating(false); setRunningTask(null); setProgress(""); submitting.current = null;
        void readHistory();
        return () => { active.current = false; historyRequest.current?.abort(); polling.current?.abort(); transcriptRequest.current?.abort(); };
    }, [owner, projectId]);

    async function readHistory(cursor = "") {
        historyRequest.current?.abort();
        const controller = new AbortController(); historyRequest.current = controller;
        setHistoryLoading(true); setHistoryError(false); setMessage(null); setFailed(false);
        try {
            const page = await listGenerationTaskPage({ limit: 30, projectId, type: "timeline_transcription", activeOnly: false, ...(cursor ? { cursor } : {}) }, controller.signal);
            const details = await Promise.all(page.tasks.map((task) => queryGenerationTask(task.id, { signal: controller.signal })));
            if (active.current && currentOwner.current === owner) {
                setHistory((previous) => Array.from(new Map([...(cursor ? previous : []), ...details].map((task) => [task.id, task])).values()));
                setHistoryCursor(page.nextCursor || "");
            }
        } catch (error) {
            if (!controller.signal.aborted && active.current && currentOwner.current === owner) { setHistoryError(true); setFailed(true); setMessage(error instanceof Error ? error.message : "无法读取已有识别任务"); }
        } finally {
            if (!controller.signal.aborted && active.current && currentOwner.current === owner) setHistoryLoading(false);
        }
    }

    const selected = clips.find((clip) => clip.id === selectedId);
    const resourceId = selected?.directMedia?.storageKey?.slice("resource:".length);
    async function readTranscripts(cursor = "") {
        transcriptRequest.current?.abort();
        const controller = new AbortController(); transcriptRequest.current = controller;
        setTranscriptsLoading(true); setTranscriptError("");
        try {
            const result = await listProjectTranscripts(projectId, { resourceId, archived: archivedTranscripts, ...(cursor ? { cursor } : {}) }, controller.signal);
            if (active.current && currentOwner.current === owner && !controller.signal.aborted) {
                setTranscripts((previous) => [...(cursor ? previous : []), ...result.transcripts].filter((row, index, all) => all.findIndex((item) => item.id === row.id) === index));
                setTranscriptCursor(result.nextCursor ?? "");
            }
        } catch (error) { if (active.current && !controller.signal.aborted) setTranscriptError(error instanceof Error ? error.message : "文字稿列表读取失败"); }
        finally { if (active.current && !controller.signal.aborted) setTranscriptsLoading(false); }
    }
    useEffect(() => {
        setTranscripts([]); setTranscriptCursor(""); void readTranscripts();
        return () => transcriptRequest.current?.abort();
    }, [owner, resourceId, archivedTranscripts]);
    const previous = history.find((task) => binding(task).sourceClipId === selectedId && binding(task).resourceId === resourceId && ["queued", "running", "succeeded"].includes(task.status));
    const completed = recognized && binding(recognized).sourceClipId === selectedId ? recognized : previous?.status === "succeeded" ? previous : null;
    const busy = creating || runningTask !== null;
    let entries: ReturnType<typeof transcriptionForClip> = [];
    let resultError = "";
    if (completed && selected) {
        try {
            const result = resultOf(completed);
            if (result.resourceId !== resourceId) throw new Error("片段的素材已更换，请重新识别");
            entries = transcriptionForClip(result.segments, selected);
        } catch (error) { resultError = error instanceof Error ? error.message : "识别结果无效"; }
    }

    const observe = async (task: GenerationTask) => {
        const controller = new AbortController();
        polling.current?.abort();
        polling.current = controller;
        setRunningTask(task);
        const done = await waitForGenerationTask(task.id, {
            signal: controller.signal, timeoutMs: 25 * 60 * 1000, intervalMs: 1500,
            onTaskUpdate: (value) => { if (active.current && currentOwner.current === owner) setProgress(value.stage || "正在识别…"); },
        });
        if (active.current && currentOwner.current === owner) {
            setRecognized(done);
            setHistory((tasks) => [done, ...tasks.filter((item) => item.id !== done.id)]);
            setMessage("识别完成，请检查字幕后采用");
        }
    };

    const transcribe = async (resume?: GenerationTask) => {
        if (!selected || !resourceId || submitting.current || editingBlocked) return;
        const submission = Symbol("transcription-submission");
        submitting.current = submission;
        setCreating(true);
        setFailed(false); setMessage(null); setProgress("正在提交…");
        try {
            if (!resume && (isDirty || saving)) throw new Error("请等待当前剪辑保存完成后再识别");
            const task = resume ?? await createTimelineTranscriptionTask({ projectId, resourceId, sourceClipId: selected.id, language });
            if (!active.current || currentOwner.current !== owner) return;
            await observe(task);
        } catch (error) {
            if (active.current && currentOwner.current === owner && !(error instanceof DOMException && error.name === "AbortError")) {
                setFailed(true); setMessage(error instanceof Error ? error.message : "识别失败，请检查本地语音服务");
            }
        } finally {
            if (submitting.current === submission) {
                submitting.current = null;
                if (active.current && currentOwner.current === owner) { setCreating(false); setRunningTask(null); setProgress(""); }
            }
        }
    };

    const adopt = async (view: TranscriptView) => {
        if (!selected || editingBlocked) return;
        try {
            // A stable bounded node ID also supports long imported occurrence IDs.
            const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(selected.id));
            if (!active.current || currentOwner.current !== owner) return;
            const state = editorStore.getState();
            if (state.editingBlocked || state.inPreview) throw new Error("请先结束当前剪辑操作，再采用字幕");
            const current = state.project;
            const clip = current?.clips.find((item) => item.id === selected.id);
            if (!current || !clip || clip.directMedia?.storageKey !== `resource:${view.transcript.resourceId}`) throw new Error("当前片段的素材已变化，请重新选择");
            const track = getSubtitleTracks(current.tracks).find((item) => !item.locked);
            if (!track) throw new Error("请先添加或解锁字幕轨道");
            const mapped = transcriptionForClip(view.document.segments, clip);
            if (!mapped.length) throw new Error("当前裁剪范围内没有可采用的文字");
            const sourceStart = clip.sourceStartMs ?? 0;
            const segmentIds = view.document.segments.filter((row) => row.endMs > sourceStart && row.startMs < sourceStart + clipSourceOffset(clip, clip.durationMs) && transcriptionForClip([row], clip).length > 0).map((row) => row.id);
            const nodeId = `transcription:${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")}`;
            dispatch({ op: "rebuildSubtitleClips", payload: { nodeId, entries: mapped, trackId: track.id, transcript: { id: view.transcript.id, revisionId: view.currentVersion.id, sourceClipId: clip.id, segmentIds } } });
            if (editorStore.getState().project === current) throw new Error(editorStore.getState().saveError || "字幕未能采用，请重试");
            setFailed(false); setMessage(`已采用 V${view.currentVersion.version} 的 ${mapped.length} 条字幕，按当前片段位置和裁剪范围对齐，可撤销`);
            setEditor(null);
            void readTranscripts();
        } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "采用字幕失败"); throw error; }
    };

    if (!project) return null;
    return <div className="flex h-full flex-col bg-[var(--previs-sequencer-surface)]"><div className="director-scroll min-h-0 flex-1 overflow-y-auto p-3">
        {!clips.length ? <div className="flex flex-col items-center gap-2 p-4 text-center"><AudioLines className="size-5" /><p className="text-xs">先把有声音的音频或视频加入时间线，再生成字幕。</p></div> : <>
            <label className="mb-3 block text-xs text-[var(--previs-dock-fg)]">要识别的片段
                <select aria-label="要识别的片段" value={selectedId} disabled={busy} onChange={(event) => { setSelectedId(event.target.value); setMessage(null); }} className="mt-1 w-full rounded-md border border-[var(--previs-sequencer-border)] bg-[var(--previs-sequencer-surface-raised)] p-2">
                    {clips.map((clip) => <option key={clip.id} value={clip.id}>{clip.title || clip.directMedia?.title || "音视频片段"} · {formatTimelineTime(clip.startMs)}–{formatTimelineTime(clip.startMs + clip.durationMs)}</option>)}
                </select>
            </label>
            <label className="mb-3 block text-xs text-[var(--previs-dock-fg)]">对白语言
                <select aria-label="对白语言" value={language} disabled={busy} onChange={(event) => setLanguage(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--previs-sequencer-border)] bg-[var(--previs-sequencer-surface-raised)] p-2"><option value="">自动识别</option><option value="zh">中文</option><option value="en">英文</option><option value="ja">日文</option><option value="ko">韩文</option></select>
            </label>
            <button type="button" disabled={busy || historyLoading || historyError || editingBlocked || isDirty || saving} onClick={() => void transcribe(previous && ["queued", "running"].includes(previous.status) ? previous : undefined)} className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--previs-accent)] p-2 text-xs text-[var(--previs-on-accent)] disabled:opacity-40">{(busy || historyLoading) && <Loader2 className="size-3.5 animate-spin" />}{historyLoading ? "正在读取识别记录…" : busy ? "正在识别…" : previous && ["queued", "running"].includes(previous.status) ? "继续查看识别" : completed ? "重新识别" : "生成自动字幕"}</button>
            {busy && <><p role="status" className="mt-2 text-xs">{progress}</p><button type="button" className="mt-2 text-xs underline" onClick={() => { if (runningTask) void cancelGenerationTask(runningTask.id).catch((error) => { setFailed(true); setMessage(error instanceof Error ? error.message : "取消失败"); }); }}>取消识别</button></>}
            {completed && <div className="mt-3 space-y-2 text-xs text-[var(--previs-dock-fg)]"><p>{resultError || (entries.length ? `当前片段可采用 ${entries.length} 条字幕` : "当前裁剪范围内没有识别到对白")}</p>{entries.slice(0, 3).map((entry) => <p key={entry.index}>{formatTimelineTime(entry.startMs)} · {entry.text}</p>)}<button type="button" disabled={busy || !!resultError || editingBlocked} onClick={() => openEditor({ taskId: completed.id })} className="w-full rounded-md border border-[var(--previs-sequencer-border)] p-2 disabled:opacity-40">校正并采用字幕</button></div>}
            {historyLoading ? <p role="status" className="mt-3 text-xs">正在读取识别历史…</p> : historyError ? <button type="button" onClick={() => void readHistory(historyCursor)} className="mt-3 text-xs underline">重试读取识别历史</button> : historyCursor ? <button type="button" disabled={busy} onClick={() => void readHistory(historyCursor)} className="mt-3 text-xs underline">加载更早的识别结果</button> : null}
            <div className="mt-4 space-y-2 border-t border-[var(--previs-sequencer-border)] pt-3 text-xs"><div className="flex items-center justify-between"><span>此素材的文字稿</span><button type="button" className="underline" onClick={() => setArchivedTranscripts(!archivedTranscripts)}>{archivedTranscripts ? "查看使用中" : "查看已归档"}</button></div>
                {transcriptsLoading && <p role="status">正在读取文字稿…</p>}
                {transcriptError && <p role="alert">{transcriptError}<button type="button" className="ml-2 underline" onClick={() => void readTranscripts(transcriptCursor)}>重试</button></p>}
                {!transcriptsLoading && !transcriptError && !transcripts.length && <p className="opacity-70">{archivedTranscripts ? "没有已归档的文字稿" : "识别完成后，可保存和校正文字稿"}</p>}
                {transcripts.map((item) => <button key={item.id} type="button" onClick={() => openEditor({ transcriptId: item.id })} className="block w-full truncate rounded border border-[var(--previs-sequencer-border)] p-2 text-left">{item.title}{item.archived ? " · 已归档" : ""}</button>)}
                {transcriptCursor && !transcriptError && <button type="button" className="underline" disabled={transcriptsLoading} onClick={() => void readTranscripts(transcriptCursor)}>加载更多文字稿</button>}
            </div>
            {message && <p role={failed ? "alert" : "status"} className={`mt-3 text-xs leading-relaxed ${failed ? "text-[var(--previs-danger)]" : "text-[var(--previs-dock-fg)]"}`}>{message}</p>}
            <p className="mt-3 text-xs leading-relaxed text-[var(--previs-dock-fg)]/70">使用本地语音模型，不调用付费服务。识别结果会保存在任务中心；关闭后可回来继续查看。采用前可调整片段位置，字幕按当前剪辑对齐。</p>
        </>}
    </div>{editor && <TranscriptEditor key={`${owner}:${editor.transcriptId ?? editor.taskId}`} {...editor} title={selected?.title} onClose={() => { setEditor(null); void readTranscripts(); }} onChanged={() => void readTranscripts()} onAdopt={selected ? adopt : undefined} sourceClipId={selected?.id} onCutApplied={() => { setEditor(null); setFailed(false); setMessage("已按文字剪切并保存，可通过顶部撤销恢复"); }} />}</div>;
}
