import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Alert, Button, Input, Pagination, Space, Spin, Tag } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { useEditorHostContext, useEditorStoreContext } from "@/components/editor/editor-context";
import { ApiError } from "@/services/api/request";
import { createProjectTranscript, getProjectTranscript, getTranscriptVersion, listTranscriptVersions, updateProjectTranscript, type TranscriptDocument, type TranscriptVersion, type TranscriptView } from "@/services/api/project-transcripts";
import { downloadTranscriptFile, transcriptChanges, transcriptSourceSrt } from "@/lib/timeline/transcript-editing";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";
import { TranscriptCutEditor } from "./transcript-cut-editor";
import { TranscriptSourcePreview, type TranscriptListenRange } from "./transcript-source-preview";
import { TranscriptReviewDetails } from "./transcript-review-details";
import { TRANSCRIPT_MODAL_LAYOUT } from "./transcript-modal-layout";
import { LyricsAlignmentEditor } from "./lyrics-alignment-editor";

type Props = {
    transcriptId?: string;
    taskId?: string;
    title?: string;
    onClose: () => void;
    onChanged: () => void;
    onAdopt?: (view: TranscriptView) => Promise<void>;
    sourceClipId?: string;
    onCutApplied?: () => void;
};

/** Corrections are saved separately; only explicit adoption updates subtitles. */
export function TranscriptEditor({ transcriptId, taskId, title, onClose, onChanged, onAdopt, sourceClipId, onCutApplied }: Props) {
    const { projectId } = useEditorHostContext();
    const { setPanelDraftDirty, editingBlocked } = useEditorStoreContext();
    const draftKey = useId();
    const alive = useRef(true),
        reading = useRef<AbortController | null>(null);
    const [view, setView] = useState<TranscriptView | null>(null);
    const [draft, setDraft] = useState<TranscriptDocument | null>(null);
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(true),
        [busy, setBusy] = useState(false);
    const [error, setError] = useState(""),
        [status, setStatus] = useState("");
    const [conflict, setConflict] = useState(false);
    const [recovery, setRecovery] = useState<{ id: string; revision: number } | null>(null);
    const [query, setQuery] = useState(""),
        [page, setPage] = useState(1);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [versions, setVersions] = useState<TranscriptVersion[]>([]);
    const [historyCursor, setHistoryCursor] = useState<number | undefined>();
    const [historyBusy, setHistoryBusy] = useState(false),
        [historyError, setHistoryError] = useState("");
    const [preview, setPreview] = useState<TranscriptView | null>(null);
    const [confirmation, setConfirmation] = useState<"close" | "reload" | "restore" | "archive" | null>(null);
    const [cutOpen, setCutOpen] = useState(false);
    const [lyricsOpen, setLyricsOpen] = useState(false);
    const [listenRange, setListenRange] = useState<TranscriptListenRange | null>(null);
    const listen = (startMs: number, endMs: number) => setListenRange((previous) => ({ startMs, endMs, request: (previous?.request ?? 0) + 1 }));
    const historyRequest = useRef<AbortController | null>(null);
    const dirty = !!view && !!draft && (name !== view.transcript.title || JSON.stringify(draft) !== JSON.stringify(view.document));
    const pending = dirty || busy;
    useEffect(() => {
        setPanelDraftDirty(draftKey, pending);
    }, [draftKey, pending, setPanelDraftDirty]);
    useEffect(() => () => setPanelDraftDirty(draftKey, false), [draftKey, setPanelDraftDirty]);

    const accept = (value: TranscriptView) => {
        setView(value);
        setDraft(structuredClone(value.document));
        setName(value.transcript.title);
        setRecovery(null);
        setConflict(false);
        setError("");
        setPage(1);
    };
    const read = async () => {
        reading.current?.abort();
        const controller = new AbortController();
        reading.current = controller;
        setLoading(true);
        setError("");
        setStatus("");
        try {
            const value = transcriptId ? await getProjectTranscript(projectId, transcriptId, controller.signal) : await createProjectTranscript(projectId, taskId!, title);
            if (alive.current && !controller.signal.aborted) accept(value);
        } catch (failure) {
            if (!alive.current || controller.signal.aborted) return;
            setError(failure instanceof Error ? failure.message : "文字稿读取失败");
            if (failure instanceof ApiError && failure.reason === "transcript_document_unreadable" && typeof failure.details?.transcriptId === "string" && typeof failure.details?.expectedRevision === "number") {
                setRecovery({ id: failure.details.transcriptId, revision: failure.details.expectedRevision });
            }
        } finally {
            if (alive.current && !controller.signal.aborted) setLoading(false);
        }
    };
    useEffect(() => {
        alive.current = true;
        void read();
        return () => {
            alive.current = false;
            reading.current?.abort();
            historyRequest.current?.abort();
        };
    }, [projectId, transcriptId, taskId]);

    const parentId = view?.transcript.id ?? recovery?.id;
    const expectedRevision = view?.transcript.revision ?? recovery?.revision;
    async function readVersions(before?: number) {
        if (!parentId) return;
        historyRequest.current?.abort();
        const controller = new AbortController();
        historyRequest.current = controller;
        setHistoryBusy(true);
        setHistoryError("");
        try {
            const result = await listTranscriptVersions(projectId, parentId, before, controller.signal);
            if (!alive.current || controller.signal.aborted) return;
            setVersions((previous) => (before ? [...previous, ...result.versions].filter((row, index, all) => all.findIndex((item) => item.id === row.id) === index) : result.versions));
            setHistoryCursor(result.nextBeforeVersion);
        } catch (failure) {
            if (alive.current && !controller.signal.aborted) setHistoryError(failure instanceof Error ? failure.message : "历史读取失败");
        } finally {
            if (alive.current && !controller.signal.aborted) setHistoryBusy(false);
        }
    }
    async function showVersion(id: string) {
        if (!parentId) return;
        historyRequest.current?.abort();
        const controller = new AbortController();
        historyRequest.current = controller;
        setHistoryBusy(true);
        setHistoryError("");
        try {
            const result = await getTranscriptVersion(projectId, parentId, id, controller.signal);
            if (alive.current && !controller.signal.aborted) setPreview(result);
        } catch (failure) {
            if (alive.current && !controller.signal.aborted) setHistoryError(failure instanceof Error ? failure.message : "历史版本无法读取");
        } finally {
            if (alive.current && !controller.signal.aborted) setHistoryBusy(false);
        }
    }
    async function mutate(action?: "archive" | "restore" | "restore_version") {
        if (!parentId || !expectedRevision || busy || editingBlocked) return;
        setError("");
        setStatus("");
        try {
            const changes = !action && view && draft ? transcriptChanges(view.document, draft) : undefined;
            const trimmed = name.trim();
            if (!action && (!trimmed || [...trimmed].length > 240)) throw new Error("文字稿名称需要1至240字");
            if (action === "restore_version" && !preview) throw new Error("请先查看具体历史版本");
            setBusy(true);
            const result = await updateProjectTranscript(projectId, parentId, {
                expectedRevision,
                ...(action ? { action, ...(action === "restore_version" ? { restoreRevisionId: preview!.currentVersion.id } : {}) } : { title: trimmed, ...(changes?.length ? { changes } : {}) }),
            });
            if (!alive.current) return;
            accept(result);
            setPreview(null);
            onChanged();
            setStatus(action === "archive" ? "已归档，原稿和历史版本保留" : action === "restore" ? "文字稿已恢复" : action === "restore_version" ? "已恢复为新版本，旧版本仍保留" : "文字稿已保存，可采用到当前片段字幕");
            if (historyOpen) void readVersions();
        } catch (failure) {
            if (alive.current) {
                setError(failure instanceof Error ? failure.message : "文字稿保存失败");
                if (failure instanceof ApiError && failure.status === 409) setConflict(true);
            }
        } finally {
            if (alive.current) setBusy(false);
        }
    }
    const filtered = useMemo(() => (draft?.segments ?? []).filter((segment) => !query.trim() || `${segment.text}\n${segment.speaker ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [draft, query]);
    const shown = filtered.slice((page - 1) * 25, page * 25);
    const lyricsMethod = (id: string) => {
        const method = draft?.lyrics?.lines.find((line) => line.segmentId === id)?.method;
        return method === "manual" ? "人工时间" : method === "source_words" ? "原词时间" : method === "source_segment" ? "原句时间" : "";
    };
    const editable = !!view && !view.transcript.archived && !loading && !busy && !editingBlocked && !conflict;
    function exportDraft() {
        if (!draft) return;
        downloadTranscriptFile(`文字稿草稿-${parentId}.json`, JSON.stringify({ projectId, transcriptId: parentId, expectedRevision, title: name, document: draft }, null, 2), "application/json");
    }
    function close() {
        if (busy) return;
        if (dirty) setConfirmation("close");
        else onClose();
    }

    return (
        <>
            <AppModal
                open
                centered
                styles={TRANSCRIPT_MODAL_LAYOUT}
                title="校正文字稿"
                width={880}
                onCancel={close}
                keyboard={!busy}
                maskClosable={false}
                footer={
                    <Space wrap>
                        <Button onClick={close} disabled={busy}>
                            关闭
                        </Button>
                        <Button onClick={exportDraft} disabled={!draft}>
                            导出我的草稿
                        </Button>
                        {view?.transcript.archived ? (
                            <Button onClick={() => void mutate("restore")} disabled={busy || editingBlocked}>
                                恢复文字稿
                            </Button>
                        ) : (
                            <Button type="primary" aria-label="保存校正" aria-busy={busy} onClick={() => void mutate()} loading={busy} disabled={!dirty || !editable}>
                                保存校正
                            </Button>
                        )}
                        {onAdopt && (
                            <Button
                                onClick={async () => {
                                    if (!view) return;
                                    setError("");
                                    setBusy(true);
                                    try {
                                        await onAdopt(view);
                                    } catch (failure) {
                                        if (alive.current) setError(failure instanceof Error ? failure.message : "采用字幕失败");
                                    } finally {
                                        if (alive.current) setBusy(false);
                                    }
                                }}
                                disabled={!view || dirty || busy || loading || view?.transcript.archived || editingBlocked}
                            >
                                采用已保存字幕
                            </Button>
                        )}
                        {sourceClipId && onCutApplied && (
                            <Button disabled={!view || dirty || busy || loading || view?.transcript.archived || editingBlocked} onClick={() => setCutOpen(true)}>
                                按文字剪切媒体
                            </Button>
                        )}
                    </Space>
                }
            >
                <div
                    onKeyDown={(event) => {
                        // Modal editing must not trigger background timeline shortcuts.
                        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                            event.preventDefault();
                            if (dirty && editable) void mutate();
                        }
                        event.stopPropagation();
                    }}
                >
                    <p className="mb-3 text-sm text-muted-foreground">校正文字和手动标注说话人。源时间保持不变；保存后再采用为当前片段的字幕。</p>
                    {loading && (
                        <Spin tip="正在读取文字稿">
                            <div className="h-20" />
                        </Spin>
                    )}
                    {error && <Alert type="error" showIcon title={error} className="mb-3" />}
                    {status && <Alert type="success" showIcon title={status} className="mb-3" />}
                    {(error || conflict) && !busy && (
                        <Button className="mb-3" onClick={() => (dirty ? setConfirmation("reload") : void read())}>
                            重新载入已保存版本
                        </Button>
                    )}
                    {view && draft && (
                        <>
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                <Tag color="blue">V{view.currentVersion.version}</Tag>
                                <Tag color="blue">{view.transcript.archived ? "已归档" : dirty ? "未保存校正" : "已保存"}</Tag>
                                <Tag color="blue">{draft.precision === "word" ? "含逐词时间" : "按句识别"}</Tag>
                                <span className="text-xs text-muted-foreground">时间均为源素材时间</span>
                            </div>
                            {draft.wordTextNeedsReview && <Alert className="mb-3" type="warning" title="文字已校正，逐词时间仍是原始识别结果，需要另行核对" />}
                            {draft.wordTimingIncomplete && <Alert className="mb-3" type="warning" title="部分词语没有可靠的逐词时间，已保留按句结果；请预听核对" />}
                            {draft.lyrics && <p className="mb-3 text-xs text-muted-foreground">歌词单独保存在新版本，原识别可在历史中查看。每句标出人工或原词时间；人工时间不代表已测得逐字时间。</p>}
                            <TranscriptSourcePreview resourceId={view.transcript.resourceId} range={listenRange} suspended={cutOpen || lyricsOpen || confirmation !== null} />
                            <label className="mb-3 block text-sm">
                                文字稿名称
                                <Input aria-label="文字稿名称" maxLength={240} value={name} disabled={!editable} onChange={(event) => setName(event.target.value)} />
                            </label>
                            <Input.Search
                                aria-label="搜索文字或说话人"
                                placeholder="搜索文字或说话人"
                                value={query}
                                allowClear
                                onChange={(event) => {
                                    setQuery(event.target.value);
                                    setPage(1);
                                }}
                            />
                            <div className="my-3 max-h-[42vh] space-y-3 overflow-y-auto pr-2" data-testid="transcript-segments">
                                {shown.map((segment) => (
                                    <div key={segment.id} className="border-b border-border pb-3">
                                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-xs text-muted-foreground">
                                                {formatTimelineTime(segment.startMs)}–{formatTimelineTime(segment.endMs)}
                                                {lyricsMethod(segment.id) && <Tag className="ml-2">{lyricsMethod(segment.id)}</Tag>}
                                            </span>
                                            <Button size="small" aria-label={`预听句 ${segment.id}`} disabled={cutOpen} onClick={() => listen(segment.startMs, segment.endMs)}>
                                                预听此句
                                            </Button>
                                            <Input
                                                size="small"
                                                aria-label={`说话人 ${segment.id}`}
                                                placeholder="说话人（手动）"
                                                style={{ width: 160 }}
                                                maxLength={80}
                                                value={segment.speaker ?? ""}
                                                disabled={!editable}
                                                onChange={(event) => setDraft((previous) => previous && { ...previous, segments: previous.segments.map((row) => (row.id === segment.id ? { ...row, speaker: event.target.value } : row)) })}
                                            />
                                        </div>
                                        <Input.TextArea
                                            aria-label={`文字 ${segment.id}`}
                                            autoSize={{ minRows: 1, maxRows: 6 }}
                                            value={segment.text}
                                            maxLength={8000}
                                            disabled={!editable}
                                            onChange={(event) => setDraft((previous) => previous && { ...previous, segments: previous.segments.map((row) => (row.id === segment.id ? { ...row, text: event.target.value } : row)) })}
                                        />
                                    </div>
                                ))}
                                {!shown.length && <p className="py-4 text-sm text-muted-foreground">没有匹配的文字</p>}
                            </div>
                            <Pagination size="small" current={page} pageSize={25} total={filtered.length} showSizeChanger={false} onChange={setPage} />
                            <Space wrap className="my-3">
                                <Button size="small" disabled={!editable || dirty} onClick={() => setLyricsOpen(true)}>
                                    对齐歌词
                                </Button>
                                <Button size="small" onClick={() => downloadTranscriptFile(`${name || "文字稿"}-源时间.srt`, transcriptSourceSrt(draft))}>
                                    导出源时间 SRT{dirty ? "（草稿）" : ""}
                                </Button>
                                <Button size="small" onClick={() => downloadTranscriptFile(`${name || "文字稿"}.txt`, draft.segments.map((row) => `${row.speaker ? `[${row.speaker}] ` : ""}${row.text}`).join("\n"))}>
                                    导出文字{dirty ? "（草稿）" : ""}
                                </Button>
                                {!view.transcript.archived && (
                                    <Button size="small" onClick={() => setConfirmation("archive")} disabled={dirty || busy || editingBlocked}>
                                        归档文字稿
                                    </Button>
                                )}
                            </Space>
                            <TranscriptReviewDetails view={view} dirty={dirty} onListen={listen} />
                        </>
                    )}
                    {parentId && (
                        <div className="border-t border-border pt-3">
                            <Button
                                size="small"
                                disabled={busy}
                                onClick={() => {
                                    setHistoryOpen(!historyOpen);
                                    if (!historyOpen) void readVersions();
                                }}
                            >
                                {historyOpen ? "收起历史版本" : "查看历史版本"}
                            </Button>
                            {historyOpen && (
                                <div className="mt-3 space-y-2">
                                    {historyError && (
                                        <Alert
                                            type="error"
                                            title={historyError}
                                            action={
                                                <Button size="small" onClick={() => void readVersions()}>
                                                    重试
                                                </Button>
                                            }
                                        />
                                    )}
                                    {versions.map((version) => (
                                        <div key={version.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                            <span>
                                                V{version.version} · {version.note} · {new Date(version.createdAt).toLocaleString()}
                                            </span>
                                            <Button size="small" disabled={historyBusy || busy} onClick={() => void showVersion(version.id)}>
                                                查看 V{version.version}
                                            </Button>
                                        </div>
                                    ))}
                                    {historyBusy && <Spin size="small" />}
                                    {historyCursor && (
                                        <Button size="small" disabled={historyBusy} onClick={() => void readVersions(historyCursor)}>
                                            加载更早版本
                                        </Button>
                                    )}
                                    {preview && (
                                        <div className="rounded border border-border p-3">
                                            <p className="mb-2 text-sm">
                                                V{preview.currentVersion.version} · {preview.document.segments.length} 句（只读预览）
                                            </p>
                                            <div className="mb-3 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm">{preview.document.segments.map((row) => `${row.speaker ? `[${row.speaker}] ` : ""}${row.text}`).join("\n")}</div>
                                            <Button size="small" onClick={() => setConfirmation("restore")} disabled={dirty || busy || editingBlocked}>
                                                将 V{preview.currentVersion.version} 恢复为新版本
                                            </Button>
                                            {dirty && <p className="mt-2 text-xs">请先保存或处理当前草稿，再恢复历史版本。</p>}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </AppModal>
            <AppModal
                open={confirmation !== null}
                title={confirmation === "restore" ? "恢复历史文字稿" : confirmation === "archive" ? "归档文字稿" : "当前文字稿尚未保存"}
                okText={confirmation === "restore" ? "恢复为新版本" : confirmation === "archive" ? "归档" : confirmation === "reload" ? "放弃输入并载入" : "放弃输入并关闭"}
                cancelText="继续保留"
                onCancel={() => setConfirmation(null)}
                onOk={() => {
                    const action = confirmation;
                    setConfirmation(null);
                    if (action === "close") onClose();
                    else if (action === "reload") void read();
                    else if (action === "restore") void mutate("restore_version");
                    else if (action === "archive") void mutate("archive");
                }}
            >
                <p>
                    {confirmation === "restore"
                        ? "将历史内容保存为新版本，保留现有历史。已采用的时间线字幕需要再次明确采用才会更新。"
                        : confirmation === "archive"
                          ? "归档后可在已归档文字稿中恢复，源素材和时间线字幕保留。"
                          : "未保存的输入将丢弃。可返回导出草稿，或先保存校正。"}
                </p>
            </AppModal>
            {cutOpen && view && sourceClipId && onCutApplied && <TranscriptCutEditor view={view} sourceClipId={sourceClipId} onClose={() => setCutOpen(false)} onApplied={onCutApplied} />}
            {lyricsOpen && view && (
                <LyricsAlignmentEditor
                    view={view}
                    onClose={() => setLyricsOpen(false)}
                    onSaved={(result) => {
                        if (result.current) accept(result.view);
                        else void read();
                        onChanged();
                        if (historyOpen) void readVersions();
                    }}
                />
            )}
        </>
    );
}
