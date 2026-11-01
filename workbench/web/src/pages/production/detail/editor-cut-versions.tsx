import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Button, Input, Select, Checkbox } from "antd";
import { History } from "lucide-react";
import { AppModal } from "@/components/ui/product/app-modal";
import { useEditorHostContext, useEditorStoreApi } from "@/components/editor/editor-context";
import {
    applyProjectCut,
    createProjectCut,
    getProjectCut,
    listProjectCuts,
    previewProjectCutApply,
    readProjectCutApply,
    readProjectCutRequest,
    setProjectCutArchived,
    type CutApplyPreview,
    type CutApplyRequest,
    type CutApplyResult,
    type ProjectCut,
    type ProjectCutKind,
    type ProjectCutView,
} from "@/services/api/project-cuts";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";
import { getProjectCore } from "@/services/api/projects";
import { applyLegacyNative, getLegacyNativeStatus, previewLegacyNative, type LegacyNativePreview, type LegacyNativeRequest, type LegacyNativeStatus } from "@/services/api/production-import";
import { EditorCanvasCutImport } from "./editor-canvas-cut-import";
import { EditorLegacyVersions } from "./editor-legacy-versions";
import { EditorCutExport } from "./editor-cut-export";
import { legacyCutConversionLabel, legacyImportFieldLabel, legacyNativeSummary } from "@/lib/legacy-import-fields";

const kindLabels: Record<ProjectCutKind, string> = { master: "母版", teaser: "预告", aspect: "画幅版", locale: "语言地区版", experiment: "创意对比", snapshot: "剪辑快照" };
type PendingSave = Parameters<typeof createProjectCut>[1];
export function EditorCutVersions({ onApplied }: { onApplied: () => Promise<void> }) {
    const host = useEditorHostContext(),
        store = useEditorStoreApi();
    const [open, setOpen] = useState(false),
        [ownBusy, setBusy] = useState(false),
        [loading, setLoading] = useState(false);
    const [canvasBusy, setCanvasBusy] = useState(false),
        [canvasDraft, setCanvasDraft] = useState(false);
    const [legacyVersionBusy, setLegacyVersionBusy] = useState(false),
        [legacyVersionDraft, setLegacyVersionDraft] = useState(false),
        [cutExportBusy, setCutExportBusy] = useState(false);
    const busy = ownBusy || canvasBusy || legacyVersionBusy || cutExportBusy;
    const [error, setError] = useState(""),
        [title, setTitle] = useState(""),
        [kind, setKind] = useState<ProjectCutKind>("master");
    const [language, setLanguage] = useState(""),
        [region, setRegion] = useState(""),
        [aspectRatio, setAspectRatio] = useState("");
    const [rows, setRows] = useState<ProjectCut[]>([]),
        [cursor, setCursor] = useState<string>(),
        [archived, setArchived] = useState(false);
    const [includeAutomatic, setIncludeAutomatic] = useState(false);
    const [selected, setSelected] = useState<ProjectCutView>(),
        [plan, setPlan] = useState<CutApplyPreview>(),
        [receipt, setReceipt] = useState<CutApplyResult>();
    const [needsReload, setNeedsReload] = useState(false),
        [discard, setDiscard] = useState(false),
        [pendingSave, setPendingSave] = useState<PendingSave>();
    const [legacy, setLegacy] = useState<LegacyNativeStatus>(),
        [legacyPlan, setLegacyPlan] = useState<LegacyNativePreview>();
    const planningReport = selected?.metadata?.report as { recoveredUnitId?: unknown; planningRecordId?: unknown } | undefined;
    const recoveredUnitId = typeof planningReport?.recoveredUnitId === "string" && /^[a-f0-9]{32}$/.test(planningReport.recoveredUnitId) ? planningReport.recoveredUnitId : "";
    const previsReport = (selected?.metadata?.report as LegacyNativePreview["report"] | undefined)?.previs;
    const legacyIntent = useRef<LegacyNativeRequest | null>(null);
    const applyIntent = useRef<CutApplyRequest | null>(null),
        lockOwned = useRef(false),
        listEpoch = useRef(0);
    const saveLabel = pendingSave ? (busy ? "正在保存版本" : "使用原编号重试保存") : "保存当前剪辑为新版本";
    useEffect(
        () => () => {
            listEpoch.current++;
            if (lockOwned.current) store.getState().setEditingBlocked(false);
            store.getState().setPanelDraftDirty("cut-versions", false);
        },
        [store],
    );
    useEffect(() => {
        store.getState().setPanelDraftDirty("cut-versions", open && (busy || needsReload || !!title.trim() || canvasDraft || legacyVersionDraft));
    }, [open, busy, needsReload, title, canvasDraft, legacyVersionDraft, store]);
    const list = async (next?: string, filter = archived, automatic = includeAutomatic) => {
        const epoch = ++listEpoch.current;
        setLoading(true);
        if (!next) {
            setRows([]);
            setCursor(undefined);
        }
        setError("");
        try {
            const result = await listProjectCuts(host.projectId, { archived: filter, includeAutomatic: automatic, cursor: next, limit: 20 });
            if (epoch === listEpoch.current) {
                setRows((previous) => (next ? [...previous, ...result.cuts] : result.cuts));
                setCursor(result.nextCursor);
            }
        } catch (cause) {
            if (epoch === listEpoch.current) setError(cause instanceof Error ? cause.message : "读取剪辑版本失败");
        } finally {
            if (epoch === listEpoch.current) setLoading(false);
        }
    };
    const enter = async () => {
        const current = store.getState();
        if (current.editingBlocked || current.hasPendingPanelEdits || current.inPreview) {
            setError("请先保存当前面板的校正或结束预览，再打开剪辑版本");
            return;
        }
        setError("");
        setBusy(true);
        current.setEditingBlocked(true);
        lockOwned.current = true;
        try {
            await current.flushSave();
            const saved = store.getState();
            if (saved.isDirty || saved.saving || host.getTimelineRevision?.() == null) throw new Error("请先成功保存当前剪辑");
            saved.pausePlayback();
            setOpen(true);
            await Promise.all([
                list(),
                getLegacyNativeStatus(host.projectId)
                    .then(setLegacy)
                    .catch((cause) => setError(cause instanceof Error ? cause.message : "旧工程状态读取失败，请关闭后重试")),
            ]);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "当前剪辑尚未保存");
            current.setEditingBlocked(false);
            lockOwned.current = false;
        } finally {
            setBusy(false);
        }
    };
    const leave = () => {
        setOpen(false);
        setPlan(undefined);
        setLegacyPlan(undefined);
        legacyIntent.current = null;
        setSelected(undefined);
        setReceipt(undefined);
        setDiscard(false);
        setTitle("");
        setPendingSave(undefined);
        applyIntent.current = null;
        store.getState().setPanelDraftDirty("cut-versions", false);
        if (lockOwned.current) store.getState().setEditingBlocked(false);
        lockOwned.current = false;
    };
    const close = () => {
        if (busy || needsReload) return;
        if (title.trim() || pendingSave || canvasDraft || legacyVersionDraft) {
            setDiscard(true);
            return;
        }
        leave();
    };
    const save = async () => {
        const revision = host.getTimelineRevision?.();
        if (revision == null || !title.trim() || busy) return;
        const input = pendingSave || { requestId: crypto.randomUUID(), expectedRevision: revision, title: title.trim(), kind, ...(kind === "locale" ? { language, region } : {}), aspectRatio };
        setPendingSave(input);
        setBusy(true);
        setError("");
        try {
            let result: ProjectCutView;
            try {
                result = await createProjectCut(host.projectId, input);
            } catch (cause) {
                try {
                    result = await readProjectCutRequest(host.projectId, input.requestId);
                } catch {
                    throw cause;
                }
            }
            setSelected(result);
            setPlan(undefined);
            setTitle("");
            setPendingSave(undefined);
            setReceipt(undefined);
            await list();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "保存结果尚未确认，可使用原编号重试");
        } finally {
            setBusy(false);
        }
    };
    const choose = async (cut: Pick<ProjectCut, "id">) => {
        setBusy(true);
        setError("");
        setPlan(undefined);
        setReceipt(undefined);
        applyIntent.current = null;
        try {
            setSelected(await getProjectCut(host.projectId, cut.id));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "版本读取失败");
        } finally {
            setBusy(false);
        }
    };
    const preview = async () => {
        const revision = host.getTimelineRevision?.();
        if (!selected || revision == null || busy) return;
        const input = { requestId: crypto.randomUUID(), expectedRevision: revision, timelineSha256: selected.cut.timelineSha256 };
        setBusy(true);
        setError("");
        try {
            const result = await previewProjectCutApply(host.projectId, selected.cut.id, input);
            applyIntent.current = { ...input, previewToken: result.previewToken };
            setPlan(result);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "请重新读取后预览");
        } finally {
            setBusy(false);
        }
    };
    const refreshWorking = async () => {
        await onApplied();
        setNeedsReload(false);
    };
    const apply = async () => {
        if (!selected || !plan || !applyIntent.current || busy || needsReload) return;
        const input = applyIntent.current;
        setBusy(true);
        setError("");
        try {
            let result: CutApplyResult;
            try {
                result = await applyProjectCut(host.projectId, selected.cut.id, input);
            } catch (cause) {
                try {
                    result = await readProjectCutApply(host.projectId, input.requestId);
                } catch {
                    throw cause;
                }
            }
            setReceipt(result);
            setNeedsReload(true);
            setPlan(undefined);
            applyIntent.current = null;
            await refreshWorking();
            await list();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "应用结果未确认，可按原编号重试");
        } finally {
            setBusy(false);
        }
    };
    const archive = async () => {
        if (!selected || busy || needsReload) return;
        setBusy(true);
        setError("");
        try {
            setSelected(await setProjectCutArchived(host.projectId, selected.cut, !selected.cut.archived));
            setPlan(undefined);
            applyIntent.current = null;
            await list();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "归档状态未更新");
        } finally {
            setBusy(false);
        }
    };
    const inspectLegacy = async () => {
        const revision = host.getTimelineRevision?.();
        if (revision == null || busy) return;
        setBusy(true);
        setError("");
        try {
            const core = await getProjectCore(host.projectId);
            const input = { expectedProjectRevision: core.project.revision, expectedTimelineRevision: revision };
            const result = await previewLegacyNative(host.projectId, input);
            legacyIntent.current = { ...input, previewToken: result.previewToken };
            setLegacyPlan(result);
            setPlan(undefined);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "转换预览失败");
        } finally {
            setBusy(false);
        }
    };
    const convertLegacy = async () => {
        if (!legacyIntent.current || !legacyPlan || busy) return;
        setBusy(true);
        setError("");
        try {
            let view: ProjectCutView;
            try {
                view = await applyLegacyNative(host.projectId, legacyIntent.current);
            } catch (cause) {
                const original = await previewLegacyNative(host.projectId, legacyIntent.current).catch(() => null);
                if (!original || original.previewToken !== legacyIntent.current.previewToken || original.cutId !== legacyPlan.cutId) throw cause;
                view = await getProjectCut(host.projectId, original.cutId);
            }
            setSelected(view);
            setLegacyPlan(undefined);
            legacyIntent.current = null;
            setLegacy((previous) => (previous ? { ...previous, cut: view.cut } : previous));
            await list();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "转换结果未确认，请按原预览重试");
        } finally {
            setBusy(false);
        }
    };
    return (
        <>
            <Button type="text" size="small" aria-label="剪辑版本" title="剪辑版本：保存母版、预告和画幅版本" icon={<History className="size-4" />} disabled={busy} onClick={() => void enter()} />
            {!open && error && (
                <span role="alert" className="max-w-64 text-xs text-[var(--previs-danger)]">
                    {error}
                </span>
            )}
            <AppModal open={open} title="剪辑版本" onCancel={close} closable={!busy && !needsReload} maskClosable={!busy && !needsReload} keyboard={!busy && !needsReload} footer={null} width={760}>
                <div className="flex max-h-[calc(100dvh-12rem)] flex-col gap-4 overflow-y-auto">
                    <p>把当前剪辑另存为固定版本。继续编辑时，各版独立保留；载入前会保存一份恢复版本。</p>
                    {open && (
                        <EditorCanvasCutImport
                            onBusyChange={setCanvasBusy}
                            onDirtyChange={setCanvasDraft}
                            onConverted={async (view) => {
                                setSelected(view);
                                setPlan(undefined);
                                setReceipt(undefined);
                                applyIntent.current = null;
                                await list();
                            }}
                        />
                    )}
                    {open && legacy?.available && (
                        <EditorLegacyVersions
                            disabled={ownBusy || canvasBusy || cutExportBusy || needsReload}
                            onBusyChange={setLegacyVersionBusy}
                            onDirtyChange={setLegacyVersionDraft}
                            onConverted={async (view) => {
                                setSelected(view);
                                setPlan(undefined);
                                setReceipt(undefined);
                                applyIntent.current = null;
                                await list();
                            }}
                        />
                    )}
                    {legacy?.available && (
                        <section aria-label="旧工程内容转换" className="flex flex-col gap-2">
                            <strong>旧工程的剪辑与制作内容</strong>
                            <p>把原始工程中的字幕、音轨、标题图形、文字稿及素材分析转换为原生编辑数据，保留原始记录与当前工作剪辑。</p>
                            {legacy.cut ? (
                                <Button className="self-start" disabled={busy || needsReload} onClick={() => void choose(legacy.cut!)}>
                                    查看转换剪辑
                                </Button>
                            ) : (
                                <Button className="self-start" disabled={busy || needsReload} onClick={() => void inspectLegacy()}>
                                    预览旧工程转换
                                </Button>
                            )}
                            {legacyPlan && (
                                <>
                                    <p>将增加一个独立剪辑版本：{legacyNativeSummary(legacyPlan.report)}。</p>
                                    {!!legacyPlan.report.preservedOnly.length && (
                                        <details>
                                            <summary>查看仍保留原始记录的高级设定</summary>
                                            <ul>
                                                {legacyPlan.report.preservedOnly.map((field) => (
                                                    <li key={field} title={field}>
                                                        {legacyImportFieldLabel(field)}
                                                    </li>
                                                ))}
                                            </ul>
                                        </details>
                                    )}
                                    {legacyPlan.report.warnings.map((warning, index) => (
                                        <p key={index}>{warning}</p>
                                    ))}
                                    <div className="flex flex-wrap gap-2">
                                        <Button type="primary" disabled={busy || needsReload} onClick={() => void convertLegacy()}>
                                            确认转换为独立剪辑
                                        </Button>
                                        <Button
                                            disabled={busy}
                                            onClick={() => {
                                                setLegacyPlan(undefined);
                                                legacyIntent.current = null;
                                            }}
                                        >
                                            返回
                                        </Button>
                                    </div>
                                </>
                            )}
                        </section>
                    )}
                    {recoveredUnitId && (
                        <section aria-label="已恢复的制作方案" className="space-y-2 text-sm">
                            <p>原工程镜头、意图和固定参考已另存到“原工程制作方案”章节，可继续编辑。项目当前目标可在方案历史中核对采用。</p>
                            <Link
                                className="underline"
                                to={`/production/${encodeURIComponent(host.projectId)}/chapters/${encodeURIComponent(recoveredUnitId)}`}
                                onClick={(event) => {
                                    if (busy || needsReload || title.trim() || canvasDraft || legacyVersionDraft) {
                                        event.preventDefault();
                                        setError("请先保存或处理当前版本窗口的修改，再打开制作方案");
                                    } else setOpen(false);
                                }}
                            >
                                打开原工程制作方案
                            </Link>
                        </section>
                    )}
                    {previsReport?.canvasId && (
                        <section aria-label="已转换的导演预演" className="space-y-2 text-sm">
                            <p>导演预演已在原画布提供编辑入口。进入后可继续摆场、修改动作与跟随摄影机，并回写构图或导出 3D 文件。</p>
                            <Link
                                className="underline"
                                to={`/canvas/${encodeURIComponent(previsReport.canvasId)}?focusNode=${encodeURIComponent(previsReport.nodeId)}`}
                                onClick={(event) => {
                                    if (busy || needsReload || title.trim() || canvasDraft || legacyVersionDraft) {
                                        event.preventDefault();
                                        setError("请先保存或处理当前窗口的修改，再打开导演预演");
                                    } else leave();
                                }}
                            >
                                打开导演预演所在画布
                            </Link>
                        </section>
                    )}
                    <section aria-label="另存剪辑版本" className="flex flex-col gap-2">
                        <label>
                            版本名称
                            <Input aria-label="剪辑版本名称" value={title} maxLength={200} disabled={busy || !!pendingSave || needsReload} placeholder="例如：第1集母版、竖屏预告" onChange={(event) => setTitle(event.target.value)} />
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <Select
                                aria-label="剪辑版本类型"
                                value={kind}
                                disabled={busy || !!pendingSave || needsReload}
                                className="min-w-36"
                                onChange={setKind}
                                options={Object.entries(kindLabels)
                                    .filter(([value]) => value !== "snapshot")
                                    .map(([value, label]) => ({ value, label }))}
                            />
                            <Select
                                aria-label="剪辑版本画幅"
                                value={aspectRatio}
                                disabled={busy || !!pendingSave || needsReload}
                                className="min-w-28"
                                onChange={setAspectRatio}
                                options={[{ value: "", label: "沿用当前剪辑画幅" }, ...["16:9", "9:16", "1:1", "4:3", "3:4"].map((value) => ({ value, label: value }))]}
                            />
                        </div>
                        {kind === "locale" && (
                            <div className="flex flex-wrap gap-2">
                                <Input aria-label="剪辑版本语言" value={language} maxLength={40} disabled={busy || !!pendingSave || needsReload} placeholder="语言，例如中文" onChange={(event) => setLanguage(event.target.value)} />
                                <Input aria-label="剪辑版本地区" value={region} maxLength={100} disabled={busy || !!pendingSave || needsReload} placeholder="地区" onChange={(event) => setRegion(event.target.value)} />
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">画幅会用于实际导出；沿用时保留当前尺寸、帧率和画面适配。语言用于标记版本，台词和配音可在载入后继续编辑。</p>
                        <Button type="primary" className="self-start" aria-label={saveLabel} aria-busy={busy && !!pendingSave} loading={busy && !!pendingSave} disabled={!title.trim() || busy || needsReload} onClick={() => void save()}>
                            {saveLabel}
                        </Button>
                    </section>
                    <section aria-label="已保存剪辑版本" className="flex flex-col gap-2">
                        {selected && <EditorCutExport key={`cut-export:${selected.cut.id}`} view={selected} disabled={ownBusy || canvasBusy || legacyVersionBusy || needsReload} onBusyChange={setCutExportBusy} />}
                        {!!selected?.deliveryBlockers?.length && <p role="alert">载入此版本后，以下设置仍需处理：{selected.deliveryBlockers.map(legacyImportFieldLabel).join("、")}。另存版本不会清除这些提示；请更新转换，或在导出面板明确核对放弃。</p>}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <strong>已保存版本</strong>
                            <Button size="small" aria-label="刷新版本列表" aria-busy={loading} loading={loading} disabled={busy || needsReload} onClick={() => void list()}>
                                刷新版本列表
                            </Button>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                            <Checkbox
                                checked={archived}
                                disabled={busy || needsReload}
                                onChange={(event) => {
                                    const next = event.target.checked;
                                    setArchived(next);
                                    setSelected(undefined);
                                    setPlan(undefined);
                                    setReceipt(undefined);
                                    applyIntent.current = null;
                                    void list(undefined, next);
                                }}
                            >
                                查看归档
                            </Checkbox>
                            <Checkbox
                                checked={includeAutomatic}
                                disabled={busy || needsReload}
                                onChange={(event) => {
                                    const next = event.target.checked;
                                    setIncludeAutomatic(next);
                                    setSelected(undefined);
                                    setPlan(undefined);
                                    setReceipt(undefined);
                                    applyIntent.current = null;
                                    void list(undefined, archived, next);
                                }}
                            >
                                显示自动恢复版本
                            </Checkbox>
                        </div>
                        {!includeAutomatic && <p className="text-xs text-muted-foreground">这里显示你主动保存的版本。编辑和载入前后的自动记录，可通过“显示自动恢复版本”查看。</p>}
                        {!loading && !rows.length && <p>还没有{archived ? "归档的" : "保存的"}剪辑版本。</p>}
                        {rows.map((cut) => (
                            <Button key={cut.id} className="h-auto min-h-10 justify-start whitespace-normal text-left" aria-pressed={selected?.cut.id === cut.id} disabled={busy || needsReload} onClick={() => void choose(cut)}>
                                {cut.title} · {kindLabels[cut.kind]}
                                {cut.language ? ` · ${cut.language}` : ""}
                                {cut.aspectRatio ? ` · ${cut.aspectRatio}` : ""}
                                {legacyCutConversionLabel(cut.sourceKey) ? ` · ${legacyCutConversionLabel(cut.sourceKey)}` : ""}
                            </Button>
                        ))}
                        {cursor && (
                            <Button disabled={busy || needsReload} loading={loading} onClick={() => void list(cursor)}>
                                加载更多剪辑版本
                            </Button>
                        )}
                    </section>
                    {selected && (
                        <section aria-label="剪辑版本详情" className="flex flex-col gap-2">
                            <strong>{selected.cut.title}</strong>
                            <p>
                                {selected.timeline.clips.length} 个片段 · {selected.timeline.tracks.length} 条轨道 · {formatTimelineTime(selected.timeline.durationMs)}
                            </p>
                            <p className="text-xs text-muted-foreground">此版本固定素材和时间线。载入后编辑会保存到工作剪辑，不会改写此版本。</p>
                            <div className="flex flex-wrap gap-2">
                                <Button disabled={busy || needsReload} onClick={() => void archive()}>
                                    {selected.cut.archived ? "恢复此版本" : "归档此版本"}
                                </Button>
                                {!selected.cut.archived && (
                                    <Button disabled={busy || needsReload || !!title.trim()} onClick={() => void preview()}>
                                        预览载入影响
                                    </Button>
                                )}
                            </div>
                        </section>
                    )}
                    {plan && (
                        <section aria-label="载入剪辑影响" className="flex flex-col gap-2">
                            <strong>将载入“{plan.title}”</strong>
                            <p>
                                当前：{plan.before.clips} 个片段 / {formatTimelineTime(plan.before.durationMs)}；载入后：{plan.after.clips} 个片段 / {formatTimelineTime(plan.after.durationMs)}。
                            </p>
                            <p>当前工作剪辑会保留为“应用前的剪辑”，可从版本列表恢复。</p>
                            <div className="flex flex-wrap gap-2">
                                <Button type="primary" aria-label="确认载入并保留当前剪辑" aria-busy={busy} loading={busy} disabled={busy || needsReload} onClick={() => void apply()}>
                                    确认载入并保留当前剪辑
                                </Button>
                                <Button
                                    disabled={busy}
                                    onClick={() => {
                                        setPlan(undefined);
                                        applyIntent.current = null;
                                    }}
                                >
                                    返回选择
                                </Button>
                            </div>
                        </section>
                    )}
                    {receipt && (
                        <div className="flex flex-col items-start gap-2">
                            <p role="status">
                                已完成载入，工作时间线版本 {receipt.appliedRevision}；应用前剪辑已保留。{receipt.replayed ? "已从服务端回执核对结果。" : ""}
                            </p>
                            <Button disabled={busy || needsReload} onClick={() => void choose({ id: receipt.plan.backupCutId })}>
                                查看载入前剪辑
                            </Button>
                        </div>
                    )}
                    {needsReload && (
                        <Button
                            aria-label="重新读取已应用剪辑"
                            aria-busy={busy}
                            loading={busy}
                            disabled={busy}
                            onClick={() => {
                                setBusy(true);
                                setError("");
                                void refreshWorking()
                                    .catch((cause) => setError(cause instanceof Error ? cause.message : "读取失败"))
                                    .finally(() => setBusy(false));
                            }}
                        >
                            重新读取已应用剪辑
                        </Button>
                    )}
                    {error && <p role="alert">{error}</p>}
                    <div className="flex justify-end">
                        <Button aria-label="完成" disabled={busy || needsReload} onClick={close}>
                            完成
                        </Button>
                    </div>
                </div>
            </AppModal>
            <AppModal
                open={discard}
                title="关闭尚有输入的版本窗口？"
                onCancel={() => setDiscard(false)}
                footer={
                    <>
                        <Button onClick={() => setDiscard(false)}>继续编辑</Button>
                        <Button onClick={leave}>关闭版本窗口</Button>
                    </>
                }
            >
                <p>当前工作剪辑和已保存版本均已保留。已预览或提交的画布转换可在下次打开时核对；尚未预览的选择和名称会放弃。</p>
            </AppModal>
        </>
    );
}
