import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Alert, Button, Checkbox, Input, InputNumber, Select, Space, Tag } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { useEditorHostContext, useEditorStoreContext } from "@/components/editor/editor-context";
import { getActiveUserScope } from "@/lib/user-scope";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { createLyricsDraftStore, type LyricsDraft } from "@/services/lyrics-draft";
import { ApiError } from "@/services/api/request";
import {
    applyProjectLyrics,
    getProjectLyricsResult,
    getProjectTranscript,
    getTranscriptVersion,
    previewProjectLyrics,
    type LyricsAnchor,
    type LyricsPreview,
    type LyricsRequest,
    type LyricsResult,
    type TranscriptView,
} from "@/services/api/project-transcripts";
import { downloadTranscriptFile } from "@/lib/timeline/transcript-editing";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";
import { TranscriptSourcePreview, type TranscriptListenRange } from "./transcript-source-preview";
import { TRANSCRIPT_MODAL_LAYOUT } from "./transcript-modal-layout";
import { lyricsAnchorsForAlignment, lyricsTextForAlignment } from "@/lib/timeline/lyrics-editing";

const fresh = (view: TranscriptView): LyricsRequest => ({
    requestId: crypto.randomUUID(),
    expectedRevision: view.transcript.revision,
    sourceRevisionId: view.document.lyrics?.sourceRevisionId ?? view.currentVersion.id,
    lyrics: lyricsTextForAlignment(view.document),
    anchors: lyricsAnchorsForAlignment(view.document),
});
const message = (error: unknown) => (error instanceof Error ? error.message : "歌词操作失败，请保留草稿后重试");

export function LyricsAlignmentEditor({ view, onClose, onSaved }: { view: TranscriptView; onClose: () => void; onSaved: (result: LyricsResult) => void }) {
    const { projectId } = useEditorHostContext();
    const { setPanelDraftDirty, editingBlocked } = useEditorStoreContext();
    const panelId = useId();
    const [scope] = useState(getActiveUserScope),
        [editorId] = useState(() => crypto.randomUUID());
    const store = useMemo(() => createLyricsDraftStore(localForageStorageForScope(scope), projectId, view.transcript.id, editorId), [scope, projectId, view.transcript.id, editorId]);
    const [input, setInput] = useState<LyricsRequest>(() => fresh(view));
    const [submitted, setSubmitted] = useState<LyricsRequest>();
    const [source, setSource] = useState<TranscriptView>();
    const [plan, setPlan] = useState<LyricsPreview>();
    const [recoveries, setRecoveries] = useState<{ key: string; draft: LyricsDraft }[]>([]);
    const [busy, setBusy] = useState(false),
        [ready, setReady] = useState(false),
        [saved, setSaved] = useState(false);
    const [error, setError] = useState(""),
        [storageError, setStorageError] = useState(""),
        [status, setStatus] = useState("");
    const [range, setRange] = useState<TranscriptListenRange | null>(null),
        [clock, setClock] = useState(0);
    const alive = useRef(false),
        guard = useRef(false),
        latest = useRef({ input, submitted, saved });
    latest.current = { input, submitted, saved };
    const current = () => alive.current && getActiveUserScope() === scope;
    useEffect(() => {
        alive.current = true;
        let cancelled = false;
        void store
            .recover()
            .then((rows) => {
                if (current() && !cancelled) setRecoveries(rows);
            })
            .catch((failure) => {
                if (current() && !cancelled) setStorageError(message(failure));
            })
            .finally(() => {
                if (current() && !cancelled) setReady(true);
            });
        return () => {
            cancelled = true;
            alive.current = false;
            const state = latest.current;
            if (!state.saved) void (state.input.lyrics.trim() || state.submitted ? store.write(state.input, state.submitted) : store.clear()).catch(() => undefined);
        };
    }, [store, scope]);
    useEffect(() => {
        if (!ready || saved) return;
        const timer = setTimeout(() => {
            if (guard.current) return;
            const value = latest.current;
            void (value.input.lyrics.trim() || value.submitted ? store.write(value.input, value.submitted) : store.clear())
                .then(() => {
                    if (current()) setStorageError("");
                })
                .catch((failure) => {
                    if (current()) setStorageError(message(failure));
                });
        }, 200);
        return () => clearTimeout(timer);
    }, [input, submitted, ready, saved, store]);
    useEffect(() => {
        const controller = new AbortController();
        setSource(undefined);
        void getTranscriptVersion(projectId, view.transcript.id, input.sourceRevisionId, controller.signal)
            .then((value) => {
                if (current() && !controller.signal.aborted) setSource(value);
            })
            .catch((failure) => {
                if (current() && !controller.signal.aborted) setError(message(failure));
            });
        return () => controller.abort();
    }, [projectId, view.transcript.id, input.sourceRevisionId]);
    useEffect(() => {
        setPanelDraftDirty(panelId, !saved && (!!input.lyrics.trim() || busy || !!submitted));
        return () => setPanelDraftDirty(panelId, false);
    }, [panelId, input.lyrics, busy, submitted, saved, setPanelDraftDirty]);
    const disabled = busy || !ready || saved || editingBlocked || !!submitted;
    function change(update: Partial<LyricsRequest>) {
        if (disabled || guard.current) return;
        setInput((previous) => ({ ...previous, ...update, previewToken: undefined }));
        setPlan((previous) => previous && { ...previous, canApply: false });
        setError("");
        setStatus("");
    }
    function anchor(line: number, update: Partial<LyricsAnchor>) {
        const existing = input.anchors.find((item) => item.line === line) ?? { line, reviewed: false };
        change({ anchors: [...input.anchors.filter((item) => item.line !== line), { ...existing, ...update }] });
    }
    async function preview() {
        if (guard.current || disabled || !source) return;
        guard.current = true;
        setBusy(true);
        setError("");
        try {
            const value = await previewProjectLyrics(projectId, view.transcript.id, input);
            if (current()) {
                setPlan(value);
                setInput((previous) => ({ ...previous, previewToken: value.previewToken }));
            }
        } catch (failure) {
            if (current()) setError(message(failure));
        } finally {
            guard.current = false;
            if (current()) setBusy(false);
        }
    }
    async function finish(result: LyricsResult) {
        if (!current()) return;
        setSaved(true);
        setSubmitted(undefined);
        setStatus(result.current ? "歌词已保存为新文字稿版本。返回后可采用到当前片段字幕。" : "已找回原歌词版本；之后的校正仍保留，当前内容未覆盖。请返回查看当前版本或历史。");
        try {
            await store.clear();
        } catch (failure) {
            if (current()) setStorageError(`歌词已保存；本机草稿清理失败：${message(failure)}`);
        }
        if (current()) onSaved(result);
    }
    async function save(queryOnly = false) {
        if (guard.current || busy || saved || editingBlocked || (!submitted && !plan?.canApply)) return;
        const request = submitted ?? input;
        guard.current = true;
        setBusy(true);
        setError("");
        try {
            if (!submitted) {
                await store.write(request, request);
                if (!current()) return;
                setSubmitted(request);
            }
            const result = queryOnly ? await getProjectLyricsResult(projectId, view.transcript.id, request.requestId) : await applyProjectLyrics(projectId, view.transcript.id, request);
            await finish(result);
        } catch (failure) {
            if (!current()) return;
            try {
                await finish(await getProjectLyricsResult(projectId, view.transcript.id, request.requestId));
            } catch {
                if (!current()) return;
                if (failure instanceof ApiError && [400, 409, 422].includes(failure.status ?? 0) && !queryOnly) {
                    setSubmitted(undefined);
                    setPlan(undefined);
                    setInput((previous) => ({ ...previous, previewToken: undefined }));
                    setError(`${message(failure)}。草稿保留；可载入当前版本后重新核对。`);
                } else setError(`${message(failure)}。尚未确认保存结果，已保留原编号；请核对或沿用原编号重试。`);
            }
        } finally {
            guard.current = false;
            if (current()) setBusy(false);
        }
    }
    async function reloadBase() {
        if (disabled || guard.current) return;
        guard.current = true;
        setBusy(true);
        try {
            const latestView = await getProjectTranscript(projectId, view.transcript.id);
            if (latestView.transcript.archived) throw new Error("文字稿已归档，请返回恢复后继续");
            if (current()) {
                setInput((previous) => ({ ...previous, expectedRevision: latestView.transcript.revision, requestId: crypto.randomUUID(), previewToken: undefined, anchors: previous.anchors.map((row) => ({ ...row, reviewed: false })) }));
                setPlan(undefined);
                setError("");
                setStatus("已载入当前版本；草稿仍保留，请重新试听核对。");
            }
        } catch (failure) {
            if (current()) setError(message(failure));
        } finally {
            guard.current = false;
            if (current()) setBusy(false);
        }
    }
    const spans = source?.document.words?.length ? source.document.words : (source?.document.segments ?? []);
    const listen = (startMs: number, endMs: number) => setRange((previous) => ({ startMs, endMs, request: (previous?.request ?? 0) + 1 }));
    function lineRange(row: LyricsPreview["lines"][number]) {
        const selected = input.anchors.find((anchor) => anchor.line === row.index);
        if (selected?.startMs !== undefined && selected.endMs !== undefined) return { startMs: selected.startMs, endMs: selected.endMs };
        if (selected?.startSpanId && selected.endSpanId) {
            const start = spans.findIndex((span) => span.id === selected.startSpanId),
                end = spans.findIndex((span) => span.id === selected.endSpanId);
            if (start >= 0 && end >= start) return { startMs: spans[start].startMs, endMs: Math.max(...spans.slice(start, end + 1).map((span) => span.endMs)) };
        }
        return row.selected;
    }
    return (
        <AppModal
            open
            title="对齐歌词"
            width={940}
            centered
            styles={TRANSCRIPT_MODAL_LAYOUT}
            maskClosable={false}
            keyboard={!busy}
            onCancel={() => {
                if (!busy) onClose();
            }}
            footer={
                <Space wrap>
                    <Button onClick={onClose} disabled={busy}>
                        返回文字稿
                    </Button>
                    <Button onClick={() => downloadTranscriptFile("歌词对齐草稿.json", JSON.stringify({ input, submitted }, null, 2), "application/json")}>导出草稿</Button>
                    <Button onClick={() => void preview()} disabled={disabled || !input.lyrics.trim() || !source}>
                        预览歌词时间
                    </Button>
                    {submitted ? (
                        <>
                            <Button onClick={() => void save(true)} disabled={busy || editingBlocked}>
                                核对保存结果
                            </Button>
                            <Button onClick={() => void save()} disabled={busy || editingBlocked}>
                                沿用原编号重试保存
                            </Button>
                        </>
                    ) : (
                        <Button type="primary" aria-label="保存歌词新版本" onClick={() => void save()} disabled={disabled || !plan?.canApply} loading={busy}>
                            保存歌词新版本
                        </Button>
                    )}
                </Space>
            }
        >
            <div className="min-w-0" onKeyDown={(event) => event.stopPropagation()}>
                <p className="mb-3 text-sm text-muted-foreground">填入完整歌词，试听并逐句确认时间，再保存为新版本。原始识别保留；这里不会重新生成歌曲或识别。</p>
                {error && <Alert className="mb-3" type="error" title={error} />}
                {storageError && <Alert className="mb-3" type="warning" title={storageError} />}
                {status && <Alert className="mb-3" type="success" title={status} />}
                {!!recoveries.length && !saved && (
                    <details className="mb-3">
                        <summary>本机有 {recoveries.length} 份歌词草稿</summary>
                        {recoveries.map((row) => (
                            <div key={row.key} className="my-2 flex flex-wrap items-center gap-2">
                                <span>
                                    {new Date(row.draft.changedAt).toLocaleString()} · {row.draft.request.lyrics.slice(0, 30)}
                                </span>
                                <Button
                                    size="small"
                                    disabled={disabled}
                                    onClick={() => {
                                        setInput(structuredClone(row.draft.request));
                                        setSubmitted(row.draft.submitted ? structuredClone(row.draft.submitted) : undefined);
                                        setPlan(undefined);
                                        setStatus("草稿已复制到当前窗口；采用前需重新预览，待核对请求保留原编号。");
                                    }}
                                >
                                    恢复这份草稿
                                </Button>
                            </div>
                        ))}
                    </details>
                )}
                <Input.TextArea
                    aria-label="完整歌词"
                    value={input.lyrics}
                    maxLength={65536}
                    rows={7}
                    disabled={disabled}
                    placeholder={"[Verse]\n每句歌词一行\n[Chorus]\n重复副歌也按顺序填写"}
                    onChange={(event) => {
                        change({ lyrics: event.target.value, anchors: [] });
                        setPlan(undefined);
                    }}
                />
                <TranscriptSourcePreview label="歌词源音频" resourceId={view.transcript.resourceId} range={range} suspended={busy} onClockMs={setClock} />
                <p className="mb-2 text-xs text-muted-foreground">
                    原音频当前位置 {formatTimelineTime(clock)} · 来源固定版本 {input.sourceRevisionId}。人工时间与原词测量会分别标记。
                </p>
                {!submitted && !saved && (
                    <Button size="small" className="mb-3" disabled={disabled} onClick={() => void reloadBase()}>
                        载入当前版本并重新核对
                    </Button>
                )}
                {plan?.warnings.map((value) => (
                    <Alert className="mb-2" key={value} type="warning" title={value} />
                ))}
                <div className="space-y-3" data-testid="lyrics-lines">
                    {plan?.lines.map((row) =>
                        row.kind === "section" ? (
                            <p key={row.index} className="text-sm font-medium">
                                {row.text} · 结构标签，不设演唱时间
                            </p>
                        ) : (
                            <div key={row.index} className="min-w-0 border-b border-border pb-3">
                                <p className="mb-2 text-sm">
                                    {row.index + 1}. {row.text} <Tag>{row.selected?.method === "source_words" ? "原词测量" : row.selected?.method === "source_segment" ? "原句时间" : row.selected ? "人工时间" : "尚未匹配"}</Tag>
                                </p>
                                {row.issue && <p className="mb-2 text-xs text-amber-600">{row.issue}</p>}
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <Select
                                        aria-label={`歌词 ${row.index + 1} 原词起点`}
                                        className="min-w-0 flex-1"
                                        style={{ minWidth: 180 }}
                                        disabled={disabled}
                                        showSearch
                                        optionFilterProp="label"
                                        placeholder="原词起点"
                                        value={input.anchors.find((a) => a.line === row.index)?.startSpanId}
                                        options={spans.map((span) => ({ value: span.id, label: `${formatTimelineTime(span.startMs)} ${span.text}` }))}
                                        onChange={(id) => anchor(row.index, { startSpanId: id, endSpanId: id, startMs: undefined, endMs: undefined, reviewed: false })}
                                    />
                                    <Select
                                        aria-label={`歌词 ${row.index + 1} 原词终点`}
                                        className="min-w-0 flex-1"
                                        style={{ minWidth: 180 }}
                                        disabled={disabled}
                                        showSearch
                                        optionFilterProp="label"
                                        placeholder="原词终点"
                                        value={input.anchors.find((a) => a.line === row.index)?.endSpanId}
                                        options={spans.map((span) => ({ value: span.id, label: `${formatTimelineTime(span.endMs)} ${span.text}` }))}
                                        onChange={(id) => anchor(row.index, { endSpanId: id, startMs: undefined, endMs: undefined, reviewed: false })}
                                    />
                                    {lineRange(row) && (
                                        <Button
                                            size="small"
                                            disabled={busy || lineRange(row)!.endMs <= lineRange(row)!.startMs}
                                            onClick={() => {
                                                const value = lineRange(row)!;
                                                listen(value.startMs, value.endMs);
                                            }}
                                        >
                                            试听本句
                                        </Button>
                                    )}
                                </div>
                                {!!row.candidates.length && (
                                    <Space wrap className="mt-2">
                                        {row.candidates.map((candidate, index) => (
                                            <Button
                                                key={index}
                                                size="small"
                                                disabled={disabled}
                                                onClick={() => anchor(row.index, { startSpanId: candidate.sourceSpanIds?.[0], endSpanId: candidate.sourceSpanIds?.at(-1), startMs: undefined, endMs: undefined, reviewed: false })}
                                            >
                                                使用 {formatTimelineTime(candidate.startMs)}–{formatTimelineTime(candidate.endMs)}
                                            </Button>
                                        ))}
                                    </Space>
                                )}
                                <details className="mt-2 text-sm">
                                    <summary>手动标记时间（毫秒）</summary>
                                    <Space wrap className="mt-2">
                                        <InputNumber
                                            aria-label={`歌词 ${row.index + 1} 起点毫秒`}
                                            min={0}
                                            max={view.transcript.sourceDurationMs}
                                            precision={0}
                                            disabled={disabled}
                                            value={input.anchors.find((a) => a.line === row.index)?.startMs}
                                            onChange={(value) => anchor(row.index, { startMs: value ?? undefined, startSpanId: undefined, endSpanId: undefined, reviewed: false })}
                                        />
                                        <Button size="small" disabled={disabled} onClick={() => anchor(row.index, { startMs: clock, startSpanId: undefined, endSpanId: undefined, reviewed: false })}>
                                            当前位置设为起点
                                        </Button>
                                        <InputNumber
                                            aria-label={`歌词 ${row.index + 1} 终点毫秒`}
                                            min={0}
                                            max={view.transcript.sourceDurationMs}
                                            precision={0}
                                            disabled={disabled}
                                            value={input.anchors.find((a) => a.line === row.index)?.endMs}
                                            onChange={(value) => anchor(row.index, { endMs: value ?? undefined, startSpanId: undefined, endSpanId: undefined, reviewed: false })}
                                        />
                                        <Button size="small" disabled={disabled} onClick={() => anchor(row.index, { endMs: clock, startSpanId: undefined, endSpanId: undefined, reviewed: false })}>
                                            当前位置设为终点
                                        </Button>
                                    </Space>
                                </details>
                                <Checkbox
                                    className="mt-2"
                                    disabled={disabled}
                                    checked={input.anchors.find((a) => a.line === row.index)?.reviewed ?? false}
                                    onChange={(event) => {
                                        const existing = input.anchors.find((a) => a.line === row.index);
                                        const selected = row.selected;
                                        anchor(row.index, {
                                            ...(!existing && row.candidates.length === 1 && selected?.sourceSpanIds?.length ? { startSpanId: selected.sourceSpanIds[0], endSpanId: selected.sourceSpanIds.at(-1) } : {}),
                                            reviewed: event.target.checked,
                                        });
                                    }}
                                >
                                    已试听核对本句
                                </Checkbox>
                            </div>
                        ),
                    )}
                </div>
                {plan && <p className="mt-3 text-sm">{plan.canApply ? "全部歌词已核对，可以保存新版本。" : "调整或核对后，请重新预览；仍有未完成的歌词时不能保存。"}</p>}
            </div>
        </AppModal>
    );
}
