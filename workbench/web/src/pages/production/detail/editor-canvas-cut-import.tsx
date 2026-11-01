import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Select, Upload } from "antd";
import { AssetLibraryPickerModal } from "@/components/assets/asset-library-picker-modal";
import { useEditorHostContext } from "@/components/editor/editor-context";
import { getActiveUserScope } from "@/lib/user-scope";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";
import { getProjectCore, listProjectCanvases, type ProjectCanvas } from "@/services/api/projects";
import { readCanvasCutSource, type CanvasCutClip, type CanvasCutSourcePage } from "@/services/api/canvas-timeline-cut";
import { resourceIdFromStorageKey, uploadResourceFile } from "@/services/api/resources";
import { createCanvasCutConversion, type CanvasCutConversionState } from "@/services/canvas-cut-conversion";
import type { ProjectCutView } from "@/services/api/project-cuts";
import type { Asset } from "@/stores/use-asset-store";

type Form = { canvasId: string; title: string; mappings: Record<string, string>; texts: Record<string, string>; names: Record<string, string> };
const emptyForm = (): Form => ({ canvasId: "", title: "", mappings: {}, texts: {}, names: {} });
const mediaKind = (clip: CanvasCutClip | null) => (clip?.kind === "video" || clip?.kind === "audio" || clip?.kind === "image" ? clip.kind : undefined);
const labels = { video: "视频", image: "图片", audio: "声音", subtitle: "字幕", text: "文字" };
const own = <T,>(values: Record<string, T>, id: string): T | undefined => (Object.hasOwn(values, id) ? values[id] : undefined);
function assetResource(asset?: Asset) {
    return asset && (asset.kind === "video" || asset.kind === "image" || asset.kind === "audio") ? resourceIdFromStorageKey(asset.data.storageKey ?? "") : null;
}

export function EditorCanvasCutImport({ onBusyChange, onDirtyChange, onConverted }: { onBusyChange: (busy: boolean) => void; onDirtyChange: (dirty: boolean) => void; onConverted: (cut: ProjectCutView) => Promise<void> }) {
    const host = useEditorHostContext(),
        scope = getActiveUserScope();
    const conversion = useMemo(() => createCanvasCutConversion(host.projectId, localForageStorageForScope(scope)), [host.projectId, scope]);
    const [expanded, setExpanded] = useState(false),
        [busy, setBusy] = useState(false),
        [error, setError] = useState("");
    const [canvases, setCanvases] = useState<ProjectCanvas[]>([]),
        [canvasPage, setCanvasPage] = useState(0),
        [moreCanvases, setMoreCanvases] = useState(false);
    const [form, setForm] = useState<Form>(emptyForm),
        [source, setSource] = useState<CanvasCutSourcePage>(),
        [cursor, setCursor] = useState(0);
    const [recoveredForm, setRecoveredForm] = useState(false);
    const [state, setState] = useState<CanvasCutConversionState | null>(null),
        [pickerClip, setPickerClip] = useState<CanvasCutClip | null>(null);
    const [uploads, setUploads] = useState<Record<string, { file: File; requestId: string }>>({});
    const known = useRef(new Map<string, CanvasCutClip>()),
        working = useRef(false),
        alive = useRef(true),
        initialized = useRef(false);
    const owner = `${scope}:${host.projectId}`,
        activeOwner = useRef(owner);
    const [stateOwner, setStateOwner] = useState(owner),
        workSequence = useRef(0);
    activeOwner.current = owner;
    const current = () => alive.current && activeOwner.current === owner && getActiveUserScope() === scope;
    const locked = state?.state !== "complete" && !!state?.pending.submitted;
    const ready = state?.state === "ready" ? state.pending.plan : undefined;
    const dirty = expanded && state?.state !== "complete" && (!!form.canvasId || !!form.title || !!state);
    useEffect(() => {
        onDirtyChange(dirty);
    }, [dirty, onDirtyChange]);
    useEffect(() => {
        alive.current = true;
        activeOwner.current = owner;
        initialized.current = false;
        workSequence.current++;
        working.current = false;
        known.current.clear();
        setStateOwner(owner);
        setExpanded(false);
        setCanvases([]);
        setCanvasPage(0);
        setMoreCanvases(false);
        setForm(emptyForm());
        setSource(undefined);
        setState(null);
        setUploads({});
        setPickerClip(null);
        setRecoveredForm(false);
        setBusy(false);
        setError("");
        return () => {
            alive.current = false;
            activeOwner.current = "";
            workSequence.current++;
            onBusyChange(false);
            onDirtyChange(false);
        };
    }, [conversion, onBusyChange, onDirtyChange]);

    async function work(action: () => Promise<void>) {
        if (working.current || !current()) return;
        const sequence = ++workSequence.current;
        working.current = true;
        setBusy(true);
        onBusyChange(true);
        setError("");
        try {
            await action();
        } catch (cause) {
            if (current()) setError(cause instanceof Error ? cause.message : "操作未完成，请保留选择后重试");
        } finally {
            if (workSequence.current === sequence) {
                working.current = false;
                if (current()) {
                    setBusy(false);
                    onBusyChange(false);
                }
            }
        }
    }
    async function fetchCanvases(page: number) {
        const result = await listProjectCanvases(host.projectId, page, 40);
        if (current()) {
            setCanvases((previous) => (page === 1 ? result.canvases : [...previous, ...result.canvases]));
            setCanvasPage(page);
            setMoreCanvases(result.hasMore);
        }
    }
    async function fetchSource(canvasId: string, pageCursor = 0, sha?: string) {
        const result = await readCanvasCutSource(host.projectId, canvasId, { cursor: pageCursor, limit: 25, sourceSha256: sha });
        if (current()) {
            for (const clip of result.clips) known.current.set(clip.id, clip);
            setSource(result);
            setCursor(pageCursor);
        }
        return result;
    }
    async function initialize() {
        if (initialized.current) return;
        await work(async () => {
            await fetchCanvases(1);
            const restored = await conversion.restore();
            if (!current()) return;
            setState(restored);
            if (restored) {
                setRecoveredForm(true);
                const input = restored.pending.input;
                setForm({ canvasId: input.canvasId, title: input.title, mappings: Object.fromEntries(input.mappings.map((row) => [row.clipId, row.resourceId])), texts: Object.fromEntries(input.texts.map((row) => [row.clipId, row.text])), names: {} });
                if (restored.state !== "complete") await fetchSource(input.canvasId, 0, input.sourceSha256);
            }
            initialized.current = true;
        });
    }
    async function selectCanvas(canvasId: string) {
        await work(async () => {
            await conversion.clearCompleted();
            const result = await readCanvasCutSource(host.projectId, canvasId, { limit: 25 });
            if (!current()) return;
            const sameSource = form.canvasId === canvasId && source?.sourceSha256 === result.sourceSha256;
            if (!sameSource) known.current.clear();
            for (const clip of result.clips) known.current.set(clip.id, clip);
            setSource(result);
            setCursor(0);
            setState(null);
            if (!sameSource) setRecoveredForm(false);
            setUploads({});
            setForm((previous) => ({ ...(sameSource ? previous : emptyForm()), canvasId, title: previous.canvasId === canvasId && previous.title ? previous.title : Array.from(`原画布剪辑 · ${result.title}`).slice(0, 200).join("") }));
        });
    }
    function setSelection(clip: CanvasCutClip, resourceId: string, title: string) {
        setState(null);
        setForm((previous) => ({ ...previous, mappings: { ...previous.mappings, [clip.id]: resourceId }, names: { ...previous.names, [clip.id]: title } }));
    }
    async function prepare() {
        await work(async () => {
            if (!source || !form.title.trim()) throw new Error("请选择原画布并填写剪辑名称");
            const revision = host.getTimelineRevision?.();
            if (revision == null) throw new Error("请先读取当前工作剪辑");
            const core = await getProjectCore(host.projectId);
            const prepared = await conversion.prepare({
                canvasId: source.canvasId,
                canvasRevision: source.canvasRevision,
                sourceSha256: source.sourceSha256,
                title: form.title.trim(),
                expectedProjectRevision: core.project.revision,
                expectedTimelineRevision: revision,
                mappings: Object.entries(form.mappings).map(([clipId, resourceId]) => ({ clipId, resourceId })),
                texts: Object.entries(form.texts).map(([clipId, text]) => ({ clipId, text })),
            });
            if (current()) setState(prepared);
        });
    }
    async function apply() {
        if (!ready) return;
        await work(async () => {
            try {
                const result = await conversion.apply(ready);
                if (current()) {
                    setState(result);
                    if (result.state === "complete") await onConverted(result.cut);
                }
            } catch (cause) {
                const restored = await conversion.restore().catch(() => undefined);
                if (current()) setState((previous) => restored ?? (previous?.state === "ready" ? { ...previous, pending: { ...previous.pending, submitted: true } } : previous));
                throw cause;
            }
        });
    }
    async function upload(clip: CanvasCutClip, file: File, requestId: string) {
        const kind = mediaKind(clip);
        if (!kind || working.current || !current()) return;
        setUploads((previous) => ({ ...previous, [clip.id]: { file, requestId } }));
        await work(async () => {
            const resource = await uploadResourceFile(file, kind, { fileName: file.name, idempotencyKey: requestId });
            if (current()) {
                setSelection(clip, resource.id, file.name);
                setUploads((previous) => {
                    const next = { ...previous };
                    delete next[clip.id];
                    return next;
                });
            }
        });
    }
    const pickerKind = mediaKind(pickerClip);
    const remainingMedia = Math.max(0, (source?.needsResourceCount ?? 0) - Object.keys(form.mappings).filter((id) => known.current.get(id)?.needsResource).length);
    const remainingText = Math.max(0, (source?.needsTextCount ?? 0) - Object.entries(form.texts).filter(([id, text]) => known.current.get(id)?.needsText && text.trim()).length);
    if (stateOwner !== owner) return null;
    return (
        <details
            className="flex flex-col gap-2"
            open={expanded}
            onToggle={(event) => {
                const next = event.currentTarget.open;
                setExpanded(next);
                if (next) void initialize();
            }}
        >
            <summary className="cursor-pointer py-2 font-medium">导入原画布剪辑</summary>
            {expanded && (
                <section aria-label="原画布剪辑转换" className="flex flex-col gap-3 py-2">
                    <p className="text-xs text-muted-foreground">把画布中已有的剪辑另存为影策版本，再从版本详情预览载入。原画布和当前工作剪辑均保留。</p>
                    {state?.state === "complete" ? (
                        <>
                            <p role="status">“{state.cut.cut.title}”已转换为独立剪辑版本。</p>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    disabled={busy}
                                    onClick={() =>
                                        void work(async () => {
                                            await onConverted(state.cut);
                                        })
                                    }
                                >
                                    查看已转换剪辑
                                </Button>
                                <Button
                                    disabled={busy}
                                    onClick={() =>
                                        void work(async () => {
                                            await conversion.clearCompleted();
                                            if (current()) {
                                                setState(null);
                                                setSource(undefined);
                                                known.current.clear();
                                                setForm(emptyForm());
                                            }
                                        })
                                    }
                                >
                                    转换另一份剪辑
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <label>
                                来源画布
                                <Select
                                    aria-label="原剪辑来源画布"
                                    className="w-full"
                                    showSearch
                                    optionFilterProp="label"
                                    value={form.canvasId || undefined}
                                    disabled={busy || locked}
                                    placeholder="选择本项目的画布"
                                    options={canvases.map((canvas) => ({ value: canvas.id, label: canvas.title || "未命名画布" }))}
                                    onChange={(id) => void selectCanvas(id)}
                                />
                            </label>
                            <Button className="self-start" size="small" disabled={busy || locked} onClick={() => void work(() => fetchCanvases(1))}>
                                刷新来源画布
                            </Button>
                            {!source && !!form.canvasId && !locked && (
                                <Button className="self-start" disabled={busy} onClick={() => void selectCanvas(form.canvasId)}>
                                    重新读取原画布剪辑
                                </Button>
                            )}
                            {moreCanvases && (
                                <Button className="self-start" disabled={busy || locked} onClick={() => void work(() => fetchCanvases(canvasPage + 1))}>
                                    更多来源画布
                                </Button>
                            )}
                            {source && (
                                <>
                                    <label>
                                        新版本名称
                                        <Input
                                            aria-label="原画布转换版本名称"
                                            value={form.title}
                                            maxLength={200}
                                            disabled={busy || locked}
                                            onChange={(event) => {
                                                setState(null);
                                                setForm((previous) => ({ ...previous, title: event.target.value }));
                                            }}
                                        />
                                    </label>
                                    <p className="text-xs">
                                        共 {source.clipCount} 个片段。{recoveredForm ? "已恢复先前填写的选择，请预览核对全部片段。" : `还需选择 ${remainingMedia} 份原片、补充 ${remainingText} 条文字。`}相同节点的不同片段分别选择，不自动猜测旧候选。
                                    </p>
                                    {source.clips.map((clip) => (
                                        <div key={clip.id} data-canvas-cut-clip-id={clip.id} className="flex flex-col gap-2 border-b border-[var(--previs-sequencer-border)] py-3">
                                            <strong className="text-sm">
                                                {clip.title || clip.text?.slice(0, 40) || `${labels[clip.kind]}片段`} · {formatTimelineTime(clip.startMs)}
                                            </strong>
                                            <p className="text-xs text-muted-foreground">
                                                {labels[clip.kind]} · {formatTimelineTime(clip.durationMs)}
                                                {clip.kind === "video" || clip.kind === "audio" ? ` · 原片起点 ${formatTimelineTime(clip.sourceStartMs)} · ${clip.playbackRate} 倍速` : ""}
                                            </p>
                                            {clip.sourceWarning && <p className="text-xs">{clip.sourceWarning}</p>}
                                            {mediaKind(clip) ? (
                                                <>
                                                    <p className="text-xs">{own(form.mappings, clip.id) ? `已选择：${own(form.names, clip.id) || "指定原片"}` : clip.pinnedAvailable ? "保留原剪辑固定的原片" : "原片未固定或不可用，请选择确切素材"}</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        <Button size="small" disabled={busy || locked} aria-label={`选择原片 ${clip.id}`} onClick={() => setPickerClip(clip)}>
                                                            从素材库选择
                                                        </Button>
                                                        <Upload
                                                            accept={`${mediaKind(clip)}/*`}
                                                            disabled={busy || locked}
                                                            showUploadList={false}
                                                            beforeUpload={(file) => {
                                                                void upload(clip, file, crypto.randomUUID());
                                                                return Upload.LIST_IGNORE;
                                                            }}
                                                        >
                                                            <Button size="small" disabled={busy || locked}>
                                                                上传原片
                                                            </Button>
                                                        </Upload>
                                                        {own(uploads, clip.id) && (
                                                            <Button
                                                                size="small"
                                                                disabled={busy || locked}
                                                                onClick={() => {
                                                                    const pending = own(uploads, clip.id);
                                                                    if (pending) void upload(clip, pending.file, pending.requestId);
                                                                }}
                                                            >
                                                                重试上传原文件
                                                            </Button>
                                                        )}
                                                        {own(form.mappings, clip.id) && clip.pinnedAvailable && (
                                                            <Button
                                                                size="small"
                                                                disabled={busy || locked}
                                                                onClick={() => {
                                                                    setState(null);
                                                                    setForm((previous) => {
                                                                        const mappings = { ...previous.mappings };
                                                                        delete mappings[clip.id];
                                                                        return { ...previous, mappings };
                                                                    });
                                                                }}
                                                            >
                                                                保留原片
                                                            </Button>
                                                        )}
                                                    </div>
                                                </>
                                            ) : clip.needsText ? (
                                                <Input.TextArea
                                                    aria-label={`补充旧字幕 ${clip.id}`}
                                                    maxLength={2000}
                                                    value={own(form.texts, clip.id) || ""}
                                                    disabled={busy || locked}
                                                    placeholder="填写此片段原本应显示的文字"
                                                    onChange={(event) => {
                                                        setState(null);
                                                        setForm((previous) => ({ ...previous, texts: { ...previous.texts, [clip.id]: event.target.value } }));
                                                    }}
                                                />
                                            ) : (
                                                <p className="whitespace-pre-wrap text-xs">{clip.text}</p>
                                            )}
                                        </div>
                                    ))}
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            disabled={busy || locked || cursor === 0}
                                            onClick={() =>
                                                void work(async () => {
                                                    await fetchSource(source.canvasId, Math.max(0, cursor - 25), source.sourceSha256);
                                                })
                                            }
                                        >
                                            上一页片段
                                        </Button>
                                        <Button
                                            disabled={busy || locked || source.nextCursor === undefined}
                                            onClick={() =>
                                                void work(async () => {
                                                    await fetchSource(source.canvasId, source.nextCursor!, source.sourceSha256);
                                                })
                                            }
                                        >
                                            下一页片段
                                        </Button>
                                        <Button disabled={busy || locked} onClick={() => void selectCanvas(source.canvasId)}>
                                            重新读取原画布剪辑
                                        </Button>
                                    </div>
                                    {!locked && (
                                        <Button
                                            className="self-start"
                                            aria-label="预览转换为独立剪辑"
                                            aria-busy={busy}
                                            disabled={busy || !form.title.trim() || (!recoveredForm && (remainingMedia > 0 || remainingText > 0))}
                                            loading={busy}
                                            onClick={() => void prepare()}
                                        >
                                            预览转换为独立剪辑
                                        </Button>
                                    )}
                                </>
                            )}
                            {ready && (
                                <div className="flex flex-col gap-2">
                                    <p>
                                        将保留 {ready.summary.clips} 个片段、{ready.summary.tracks} 条轨道，时长 {formatTimelineTime(ready.summary.durationMs)}。{ready.pinnedMedia} 份固定原片、{ready.explicitMedia} 份明确选择的原片、
                                        {ready.supplementedTexts} 条补充文字。
                                    </p>
                                    {ready.warnings.map((warning) => (
                                        <p key={warning} className="text-xs">
                                            {warning}
                                        </p>
                                    ))}
                                    <Button type="primary" className="self-start" aria-label={locked ? "使用原编号核对并重试转换" : "确认转换为独立剪辑版本"} aria-busy={busy} disabled={busy} loading={busy} onClick={() => void apply()}>
                                        {locked ? "使用原编号核对并重试转换" : "确认转换为独立剪辑版本"}
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                    {error && (
                        <p role="alert" className="text-sm text-[var(--previs-danger)]">
                            {error}
                        </p>
                    )}
                    {error && !initialized.current && (
                        <Button className="self-start" disabled={busy} onClick={() => void initialize()}>
                            重新读取转换状态
                        </Button>
                    )}
                </section>
            )}
            <AssetLibraryPickerModal
                open={!!pickerClip}
                remoteLibrary
                remoteKind={pickerKind}
                acceptRemoteItems
                allowCharacters={false}
                items={[]}
                categoryLabels={{}}
                multiple={false}
                title="选择此片段的确切原片"
                confirmLabel={() => "使用此原片"}
                remoteItemDisabledReason={(asset) => (!assetResource(asset) ? "请先将原文件上传到平台，再选择此素材" : undefined)}
                onClose={() => setPickerClip(null)}
                onConfirm={(_ids, picked) => {
                    const item = picked?.[0],
                        id = assetResource(item?.asset);
                    if (!current() || !pickerClip || !id || item?.asset?.kind !== pickerKind) throw new Error("请选择当前账号保存在平台的对应类型原片");
                    setSelection(pickerClip, id, item?.title || "所选原片");
                    setPickerClip(null);
                }}
            />
        </details>
    );
}
