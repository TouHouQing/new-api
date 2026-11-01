import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useSearchParams } from "react-router";
import { CanvasResourceIngestGate } from "./canvas-resource-ingest";
import { AppModal } from "@/components/ui/product/app-modal";
import "@/lib/plugins/builtin/editor/editor-shell";
import { AlertTriangle, Check, CircleDot, Download, Loader2, Maximize, Minimize, PanelRightClose, PanelRightOpen, Redo2, Sparkles, Undo2, X } from "lucide-react";

import type { ProjectAsset, ProjectDetail, ShotArtifact } from "@/services/api/projects";
import { linkProjectAsset, listProjectAssets } from "@/services/api/projects";
import { useEditorSlots, type EditorSlotRegistration } from "@/lib/plugins/editor-slot-registry";
import { pluginMayRenderEditorSlot } from "@/lib/plugins/plugin-permission-check";
import { EditorStoreProvider } from "@/components/editor/editor-context";
import { createEditorStore } from "@/stores/editor/editor-store";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { getActiveUserScope } from "@/lib/user-scope";
import { normalizeTimelineProject } from "@/lib/timeline/timeline-tracks";
import { createProjectTimelineSession, type TimelineRecoveryDraft } from "@/services/project-timeline-session";
import { TimelineRecoveryNotice } from "./timeline-recovery";
import { EditorReviewRework } from "@/components/reviews/review-rework";
import { EditorCutVersions } from "./editor-cut-versions";
import { EditorVideoRework } from "./editor-video-rework";
import { WorkspaceErrorState, WorkspaceLoadingState } from "@/components/layout/workspace-state";
import { Button } from "antd";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";
import { useEditorStoreContext } from "@/components/editor/editor-context";
import type { TimelineProject } from "@/types/timeline";

/** 插槽堆叠：只渲染通过权限检查的插件贡献；无可用插件时显示明确的缺失能力提示。
 *  缺权限插件不渲染，改为一行诊断提示；无贡献时显示空态（停用插件可见）。 */
function SlotStack({ slots, emptyHint }: { slots: EditorSlotRegistration[]; emptyHint: string }) {
    const allowed = slots.filter((slot) => pluginMayRenderEditorSlot(slot.pluginId, slot.slot).allowed);
    const denied = slots.filter((slot) => !pluginMayRenderEditorSlot(slot.pluginId, slot.slot).allowed);
    if (allowed.length === 0 && denied.length === 0) {
        return (
            <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-4 text-center">
                <p className="max-w-md text-sm text-[var(--previs-dock-fg)]">{emptyHint}</p>
            </div>
        );
    }
    return (
        <>
            {allowed.map((slot) => (
                <div key={slot.id} className="min-h-0 flex-1 overflow-hidden">
                    {slot.render({ pluginId: slot.pluginId })}
                </div>
            ))}
            {denied.map((slot) => {
                const verdict = pluginMayRenderEditorSlot(slot.pluginId, slot.slot);
                const missing = verdict.allowed === false && verdict.reason === "missing-permission" ? verdict.missing : null;
                return (
                    <div key={slot.id} title={`插件 ${slot.pluginId} 缺少 ${missing ?? "注册"}，已按 fail-closed 拒绝渲染`} className="flex min-h-8 shrink-0 items-center gap-2 bg-[var(--previs-danger)]/10 px-3 text-[11px] text-[var(--previs-danger)]">
                        <AlertTriangle className="size-3 shrink-0" />
                        <span className="truncate">{missing ? `插件 ${slot.pluginId} 缺少 ${missing} 权限，已停用该面板。` : `插件 ${slot.pluginId} 未注册，已停用该面板。`}</span>
                    </div>
                );
            })}
        </>
    );
}

/** 面板 Tab 条（Concat 式分类/属性切换）：只渲染激活槽，全部槽始终注册。 */
function PanelTabs({ tabs, active, onChange, trailing }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void; trailing?: React.ReactNode }) {
    return (
        <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-[var(--previs-sequencer-border)] bg-[var(--previs-sequencer-surface-raised)] px-1.5">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    onClick={() => onChange(tab.id)}
                    className={`h-7 rounded-md px-2.5 text-xs transition-colors ${active === tab.id ? "bg-[var(--previs-dock-active-surface)] text-[var(--previs-dock-fg-strong)]" : "text-[var(--previs-dock-fg)] hover:bg-[var(--previs-control-hover)]"}`}
                >
                    {tab.label}
                </button>
            ))}
            <div className="flex-1" />
            {trailing}
        </div>
    );
}

/** 顶部工具栏（Concat 主菜单区）：项目名 + 全局撤销/重做 + 保存状态 + 导出主按钮。 */
function EditorTopBar({
    onExport,
    onCutApplied,
    isFullscreen,
    onToggleFullscreen,
    aiOpen,
    onToggleAi,
}: {
    onExport: () => void;
    onCutApplied: () => Promise<void>;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
    aiOpen: boolean;
    onToggleAi: () => void;
}) {
    const { project, history, isDirty, saving, saveError, undo, redo } = useEditorStoreContext();
    const canUndo = (history?.undoStack.length ?? 0) > 0;
    const canRedo = (history?.redoStack.length ?? 0) > 0;

    return (
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--previs-sequencer-border)] bg-[var(--previs-sequencer-surface-raised)] px-3">
            <button
                type="button"
                aria-label="撤销"
                title="撤销（Cmd/Ctrl+Z）"
                onClick={undo}
                disabled={!canUndo}
                className="grid size-8 place-items-center rounded-md text-[var(--previs-dock-fg)] hover:bg-[var(--previs-control-hover)] disabled:pointer-events-none disabled:opacity-35"
            >
                <Undo2 className="size-4" />
            </button>
            <button
                type="button"
                aria-label="重做"
                title="重做（Cmd/Ctrl+Shift+Z）"
                onClick={redo}
                disabled={!canRedo}
                className="grid size-8 place-items-center rounded-md text-[var(--previs-dock-fg)] hover:bg-[var(--previs-control-hover)] disabled:pointer-events-none disabled:opacity-35"
            >
                <Redo2 className="size-4" />
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-1.5">
                <EditorVideoRework />
                <EditorCutVersions onApplied={onCutApplied} />
                <span className="grid size-8 place-items-center" title={saveError ?? (saving ? "保存中" : isDirty ? "有未保存的更改" : "已保存")}>
                    {saveError ? (
                        <AlertTriangle className="size-4 text-[var(--previs-danger)]" aria-label="保存失败" />
                    ) : saving ? (
                        <Loader2 className="size-4 animate-spin text-[var(--previs-dock-fg)]" aria-label="保存中" />
                    ) : isDirty ? (
                        <CircleDot className="size-3.5 text-[var(--previs-warning)]" aria-label="未保存" />
                    ) : (
                        <Check className="size-4 text-[var(--previs-success)]" aria-label="已保存" />
                    )}
                </span>
                <button
                    type="button"
                    aria-label="AI 剪辑助手"
                    aria-pressed={aiOpen}
                    title="AI 剪辑助手（编辑意图转时间线指令）"
                    onClick={onToggleAi}
                    className={`grid size-8 place-items-center rounded-md transition-colors ${aiOpen ? "bg-[var(--previs-dock-active-surface)] text-[var(--previs-dock-fg-strong)]" : "text-[var(--previs-dock-fg)] hover:bg-[var(--previs-control-hover)]"}`}
                >
                    <Sparkles className="size-4" />
                </button>
                <button
                    type="button"
                    aria-label={isFullscreen ? "退出全屏" : "全屏编辑"}
                    title={isFullscreen ? "退出全屏（Esc）" : "全屏编辑"}
                    onClick={onToggleFullscreen}
                    className="grid size-8 place-items-center rounded-md text-[var(--previs-dock-fg)] hover:bg-[var(--previs-control-hover)]"
                >
                    {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
                </button>
                <button type="button" aria-label="导出" title="导出" onClick={onExport} className="grid size-8 place-items-center rounded-md text-[var(--previs-dock-fg)] hover:bg-[var(--previs-control-hover)] hover:text-[var(--previs-dock-fg-strong)]">
                    <Download className="size-4" />
                </button>
            </div>
        </header>
    );
}

/** 底部状态栏：时长 / 片段数 / 轨道数 / 快捷键提示。 */
function EditorStatusBar({ projectName }: { projectName: string }) {
    const { project } = useEditorStoreContext();
    const clipCount = project?.clips.length ?? 0;
    const trackCount = project?.tracks.length ?? 0;
    const durationMs = project?.durationMs ?? 0;

    return (
        <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-[var(--previs-sequencer-border)] bg-[var(--previs-sequencer-surface-raised)] px-3 text-[10px] text-[var(--previs-dock-fg)]">
            <span className="truncate text-[var(--previs-dock-fg-strong)]">{projectName}</span>
            <span className="tabular-nums">时长 {formatTimelineTime(durationMs)}</span>
            <span>片段 {clipCount}</span>
            <span>轨道 {trackCount}</span>
            <div className="flex-1" />
            <span className="hidden sm:inline">⌘Z 撤销 · ⇧⌘Z 重做 · 拖拽移动 / 边缘裁剪片段</span>
        </footer>
    );
}

export default function ProjectEditorView({ detail }: { detail: ProjectDetail }) {
    const [params] = useSearchParams();
    const resourceId = params.get("addResource");
    const requestId = params.get("addRequestId");
    const canvasId = params.get("sourceCanvas") ?? undefined,
        nodeId = params.get("sourceNode") ?? undefined;
    if (resourceId !== null || requestId !== null)
        return <CanvasResourceIngestGate key={`${detail.project.id}:${resourceId}:${requestId}:${canvasId}:${nodeId}`} projectId={detail.project.id} resourceId={resourceId ?? ""} requestId={requestId ?? ""} canvasId={canvasId} nodeId={nodeId} />;
    return <ProjectEditorWorkspace detail={detail} />;
}

function ProjectEditorWorkspace({ detail }: { detail: ProjectDetail }) {
    const [searchParams] = useSearchParams();
    const focusClip = searchParams.get("focusClip");
    // 插槽注册（全部 8 种始终注册；左/右栏 Tab 决定当前渲染哪个）。
    const previewSlots = useEditorSlots("preview-renderer");
    const timelineSlots = useEditorSlots("timeline-panel");
    const assetSlots = useEditorSlots("asset-ingest");
    const transcriptionSlots = useEditorSlots("transcription-provider");
    const analysisSlots = useEditorSlots("media-analysis");
    const inspectorSlots = useEditorSlots("inspector");
    const subtitleSlots = useEditorSlots("subtitle-tool");
    const exportSlots = useEditorSlots("export-renderer");
    const aiSlots = useEditorSlots("ai-assistant");

    const [leftTab, setLeftTab] = useState("asset");
    const [rightTab, setRightTab] = useState("inspector");
    const [panelNotice, setPanelNotice] = useState("");
    const [mobilePanel, setMobilePanel] = useState("preview");

    const [rightCollapsed, setRightCollapsed] = useState(false);
    const [assets, setAssets] = useState<ProjectAsset[]>(detail.assets);
    const workbenchRef = useRef<HTMLDivElement | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    // AI 助手浮层由顶栏按钮打开，支持 Esc 和遮罩点击关闭，避免长期遮挡编辑区。
    const [aiOpen, setAiOpen] = useState(false);
    useEffect(() => {
        if (!aiOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setAiOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [aiOpen]);

    // 底部时间线高度（px）：分隔条拖拽调整（120–480）。
    const [timelineH, setTimelineH] = useState(240);
    const splitterRef = useRef<{ startY: number; startH: number } | null>(null);
    const scope = getActiveUserScope();
    const projectId = detail.project.id;
    const assetOwnerKey = JSON.stringify([scope, projectId]);
    const activeAssetOwnerKeyRef = useRef(assetOwnerKey);
    const assetRefreshSequenceRef = useRef(0);
    activeAssetOwnerKeyRef.current = assetOwnerKey;

    const refreshAssets = useCallback(async (): Promise<ProjectAsset[] | null> => {
        const requestedOwnerKey = assetOwnerKey;
        const requestSequence = assetRefreshSequenceRef.current + 1;
        assetRefreshSequenceRef.current = requestSequence;
        try {
            const list = (await listProjectAssets(projectId)).assets;
            // 项目、账号或刷新序号变化都说明当前响应已经过期；旧响应不得覆盖新上下文的素材快照。
            if (activeAssetOwnerKeyRef.current !== requestedOwnerKey || assetRefreshSequenceRef.current !== requestSequence) {
                return null;
            }
            setAssets(list);
            return list;
        } catch (error) {
            // 过期请求的错误不属于当前编辑器上下文，也不应产生误导性告警。
            if (activeAssetOwnerKeyRef.current !== requestedOwnerKey) return null;
            // 资产列表属于读展示路径：保留当前快照，避免网络抖动让编辑器清空素材。
            // 但不能把快照当成同步成功；记录项目上下文，便于定位并在下次进入时重试。
            console.warn("刷新项目素材列表失败，已保留当前快照", { projectId, scope, error });
            return null;
        }
    }, [assetOwnerKey, projectId, scope]);

    useEffect(() => {
        const onFsChange = () => setIsFullscreen(document.fullscreenElement === workbenchRef.current);
        document.addEventListener("fullscreenchange", onFsChange);
        return () => document.removeEventListener("fullscreenchange", onFsChange);
    }, []);

    const toggleFullscreen = () => {
        const operation = document.fullscreenElement ? document.exitFullscreen() : workbenchRef.current?.requestFullscreen();
        void operation?.catch((error) => {
            console.warn("切换编辑器全屏状态失败", { projectId, error });
        });
    };

    const detailAssetsRef = useRef(detail.assets);
    detailAssetsRef.current = detail.assets;

    // 挂载、切换项目或切换账号时先恢复详情快照，再以服务端列表校准。
    // detail.assets 只用于切换瞬间占位；refreshAssets 内部负责丢弃过期和乱序响应。
    useEffect(() => {
        setAssets(detailAssetsRef.current);
        void refreshAssets();
        return () => {
            // 使当前 owner 下仍在途的请求失效，避免组件卸载后提交 state。
            assetRefreshSequenceRef.current += 1;
        };
    }, [assetOwnerKey, refreshAssets]);

    const [deliveryBlockers, setDeliveryBlockers] = useState<string[]>([]);
    const timelineSession = useMemo(
        () =>
            createProjectTimelineSession(projectId, localForageStorageForScope(scope), undefined, undefined, (current) => {
                if (activeAssetOwnerKeyRef.current === assetOwnerKey) setDeliveryBlockers(current.deliveryBlockers ?? []);
            }),
        [projectId, scope],
    );
    const [timelineLoadError, setTimelineLoadError] = useState<string | null>(null);
    const [timelineReloadKey, setTimelineReloadKey] = useState(0);
    const [reloadPending, setReloadPending] = useState(false);
    const [recoveryDrafts, setRecoveryDrafts] = useState<TimelineRecoveryDraft[]>([]);
    const [recoveryError, setRecoveryError] = useState<string | null>(null);
    const [restoring, setRestoring] = useState(false);
    const store = useMemo(
        () =>
            createEditorStore({
                saveTimeline: async (project: TimelineProject) => {
                    await timelineSession.save(project);
                },
            }),
        [timelineSession],
    );
    const editorProject = store((state) => state.project);
    const editorSaveError = store((state) => state.saveError);
    const panelDraftPending = store((state) => state.hasPendingPanelEdits);
    const selectRightTab = (next: string) => {
        if (next !== rightTab && store.getState().hasPendingPanelEdits) {
            setPanelNotice("请先在当前面板应用或放弃修改，再切换面板。");
            return false;
        }
        setPanelNotice("");
        setRightTab(next);
        return true;
    };
    const blocker = useBlocker(panelDraftPending);
    const [pendingLeftTab, setPendingLeftTab] = useState<string | null>(null);
    useEffect(() => {
        if (!panelDraftPending) return;
        const preventUnload = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener("beforeunload", preventUnload);
        return () => window.removeEventListener("beforeunload", preventUnload);
    }, [panelDraftPending]);

    // Server revision is authoritative; old browser drafts only migrate when
    // the project has no cut yet. Failed reads never create an empty save.
    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();
        setTimelineLoadError(null);
        setRecoveryDrafts([]);
        setRecoveryError(null);
        setRestoring(false);
        void timelineSession
            .listRecoveryDrafts()
            .then((drafts) => {
                if (!cancelled) setRecoveryDrafts(drafts);
            })
            .catch((error) => {
                if (!cancelled) setRecoveryError(error instanceof Error ? error.message : "读取本机草稿失败");
            });
        void (async () => {
            try {
                const loaded = await timelineSession.load(controller.signal);
                if (!cancelled) {
                    store.getState().load(loaded);
                    const focused = loaded.clips.find((clip) => clip.id === focusClip);
                    if (focused) {
                        store.getState().selectClip(focused.id);
                        store.getState().seekTransportMs(focused.startMs);
                    }
                }
            } catch (error) {
                if (!cancelled) setTimelineLoadError(error instanceof Error ? error.message : "时间线读取失败");
            } finally {
                if (!cancelled) setReloadPending(false);
            }
        })();
        return () => {
            cancelled = true;
            controller.abort();
            // 卸载前冲刷尚未落盘的改动（如切页发生在防抖窗口内），避免最后几次操作丢失。
            // flushSave 失败时 editor-store 会保留 isDirty；这里必须留下错误证据，不能假装已保存。
            const flushSave = store.getState().flushSave;
            if (flushSave) {
                void flushSave().catch((error) => {
                    console.error("编辑器卸载前保存时间线失败，待下次操作重试", { projectId, error });
                });
            }
        };
    }, [timelineSession, projectId, store, timelineReloadKey]);

    // 画布产物自动同步：detail.shotArtifacts 中当前采用(storyboard/action_board/
    // 分镜/导出成片，且 ready + 有资源)尚未作为素材进本项目时，自动
    // linkProjectAsset(source=canvas) 并入素材库 —— 剪辑器“素材选项”直接可用画布产物。
    // 后端幂等（已链接直接返回）；单个失败不阻塞其余资源，但会记录告警，
    // 下次进入编辑器时再次尝试补同步。
    // 该集合只表示“当前用户、当前项目会话已处理过”，切换账号或项目时必须清空，避免跨作用域复用 resource ID。
    const syncedCanvasResourcesRef = useRef<Set<string>>(new Set());
    const syncedAssetOwnerKeyRef = useRef(assetOwnerKey);
    useEffect(() => {
        if (syncedAssetOwnerKeyRef.current === assetOwnerKey) return;
        syncedAssetOwnerKeyRef.current = assetOwnerKey;
        syncedCanvasResourcesRef.current.clear();
    }, [assetOwnerKey]);
    const canvasSyncKeys = detail.shotArtifacts
        .filter((a): a is ShotArtifact & { resourceId: string } => a.selected && a.status === "ready" && !!a.resourceId && ["storyboard", "action_board", "start_frame", "end_frame", "video", "delivery"].includes(a.type))
        .map((a) => `resource:${a.resourceId}`)
        .join(",");
    useEffect(() => {
        if (!canvasSyncKeys) return;
        const keys = canvasSyncKeys.split(",");
        // 已同步过的(本会话 ref)或已存在于项目素材的(storageKey 命中)均跳过 ——
        // storageKey 与 assetFromUploadedResource 合成格式一致(resource:<id>)。
        const existing = new Set(assets.map((a) => a.storageKey));
        const pending = keys.filter((key) => !syncedCanvasResourcesRef.current.has(key) && !existing.has(key));
        if (!pending.length) return;
        let cancelled = false;
        void (async () => {
            for (const key of pending) {
                if (cancelled) break;
                const resourceId = key.slice("resource:".length);
                try {
                    await linkProjectAsset(projectId, { assetId: resourceId, category: "material", source: "canvas" });
                    // 请求返回时组件可能已经切换项目；旧请求不能把结果记入新项目的会话集合。
                    if (cancelled) break;
                    syncedCanvasResourcesRef.current.add(key);
                } catch (error) {
                    // 单个资源同步失败不阻塞其他资源；失败项不加入已完成集合，
                    // 这样下次进入编辑器仍会重试，而不是把未同步伪装成成功。
                    console.warn("画布产物同步到项目素材失败", { projectId, resourceId, error });
                }
            }
            if (!cancelled) {
                // 统一经过带 owner 与请求序号校验的刷新入口，防止同步后的旧请求覆盖新项目快照。
                await refreshAssets();
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [assets, canvasSyncKeys, projectId, refreshAssets]);

    const downloadDraftAndReload = async () => {
        const snapshot = store.getState().project;
        if (snapshot) {
            const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = `timeline-draft-${projectId}.json`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        setReloadPending(true);
        await store.getState().flushSave();
        setTimelineReloadKey((value) => value + 1);
    };
    const restoreRecovery = async (draft: TimelineRecoveryDraft) => {
        const state = store.getState();
        if (!state.project || state.isDirty || state.saving || state.inPreview || state.editingBlocked) {
            setRecoveryError("请先保存当前修改，再恢复草稿");
            return false;
        }
        state.setEditingBlocked(true);
        setRestoring(true);
        setRecoveryError(null);
        try {
            const restored = await timelineSession.restoreRecovery(draft.key, state.project);
            if (activeAssetOwnerKeyRef.current !== assetOwnerKey) return false;
            store.getState().load(restored);
            const drafts = await timelineSession.listRecoveryDrafts();
            if (activeAssetOwnerKeyRef.current === assetOwnerKey) setRecoveryDrafts(drafts);
            return true;
        } catch (error) {
            setRecoveryError(error instanceof Error ? error.message : "恢复草稿失败");
            return false;
        } finally {
            store.getState().setEditingBlocked(false);
            if (activeAssetOwnerKeyRef.current === assetOwnerKey) setRestoring(false);
        }
    };
    const removeRecovery = async (draft: TimelineRecoveryDraft) => {
        setRestoring(true);
        try {
            await timelineSession.removeRecovery(draft.key);
            const drafts = await timelineSession.listRecoveryDrafts();
            if (activeAssetOwnerKeyRef.current === assetOwnerKey) {
                setRecoveryDrafts(drafts);
                setRecoveryError(null);
            }
        } catch (error) {
            if (activeAssetOwnerKeyRef.current === assetOwnerKey) setRecoveryError(error instanceof Error ? error.message : "删除本机副本失败");
        } finally {
            if (activeAssetOwnerKeyRef.current === assetOwnerKey) setRestoring(false);
        }
    };
    const recoveryNotice = (
        <TimelineRecoveryNotice
            key={assetOwnerKey}
            drafts={recoveryDrafts}
            current={editorProject}
            busy={restoring}
            error={recoveryError}
            onRestore={restoreRecovery}
            onRemove={removeRecovery}
            onDownload={(draft) => {
                const url = URL.createObjectURL(new Blob([draft.raw], { type: "application/json" }));
                const link = document.createElement("a");
                link.href = url;
                link.download = `timeline-recovery-${projectId}.json`;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
        />
    );
    if (reloadPending) return <WorkspaceLoadingState label="正在重新读取时间线" detail="当前草稿已另存，服务端版本读取完成后继续编辑" />;
    if (timelineLoadError && !editorProject)
        return (
            <div>
                {recoveryNotice}
                <WorkspaceErrorState title="时间线读取失败" description={timelineLoadError} onRetry={() => setTimelineReloadKey((value) => value + 1)} />
            </div>
        );
    if (!editorProject) return <WorkspaceLoadingState label="正在读取项目时间线" detail="从服务端恢复镜头、剪辑和声音" />;
    return (
        <EditorStoreProvider
            store={store}
            host={{
                projectId,
                aspectRatio: detail.project.aspectRatio,
                assets,
                refreshAssets,
                getTimelineRevision: timelineSession.getRevision,
                deliveryBlockers,
                reloadTimeline: async () => {
                    const current = await timelineSession.load();
                    store.getState().load(current);
                },
                focusInspector: () => {
                    selectRightTab("inspector");
                    setRightCollapsed(false);
                },
            }}
        >
            <div ref={workbenchRef} data-mobile-panel={mobilePanel} className="editor-workbench relative flex h-full min-h-0 min-w-0 flex-col bg-[var(--previs-workspace-bg)]">
                {recoveryNotice}
                <EditorReviewRework />
                {(editorSaveError || timelineLoadError) && (
                    <div role="alert" className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <span>{editorSaveError || timelineLoadError}</span>
                        <Button size="small" onClick={() => void store.getState().flushSave()}>
                            重试保存
                        </Button>
                        <Button size="small" onClick={() => void downloadDraftAndReload()}>
                            下载草稿并重新读取
                        </Button>
                    </div>
                )}
                <EditorTopBar
                    onExport={() => {
                        selectRightTab("export");
                        setRightCollapsed(false);
                        setMobilePanel("right");
                    }}
                    onCutApplied={async () => {
                        const current = await timelineSession.load();
                        store.getState().load(current);
                    }}
                    isFullscreen={isFullscreen}
                    onToggleFullscreen={toggleFullscreen}
                    aiOpen={aiOpen}
                    onToggleAi={() => setAiOpen((v) => !v)}
                />
                {deliveryBlockers.length > 0 && (
                    <div role="status" className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--previs-sequencer-border)] px-3 py-2 text-xs text-[var(--previs-dock-fg)]">
                        <span>还有 {deliveryBlockers.length} 项旧版设置待处理，完成核对后才能导出。</span>
                        <Button
                            size="small"
                            onClick={() => {
                                selectRightTab("export");
                                setRightCollapsed(false);
                                setMobilePanel("right");
                            }}
                        >
                            查看处理方式
                        </Button>
                    </div>
                )}
                {/* AI 助手浮层：常驻挂载、随开关显隐，关闭再开保留会话与输入（状态在 SlotStack 内）。 */}
                <div className={aiOpen ? "contents" : "hidden"}>
                    <button type="button" aria-label="关闭 AI 助手" tabIndex={-1} className="fixed inset-0 z-30 cursor-default bg-transparent" onClick={() => setAiOpen(false)} />
                    <div className="absolute right-2 top-14 z-40 flex h-[640px] max-h-[calc(100%-3.75rem)] w-[460px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border border-[var(--previs-sequencer-border)] bg-[var(--previs-sequencer-surface)] shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
                        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--previs-sequencer-border)] px-3">
                            <Sparkles className="size-4 text-[var(--previs-dock-fg)]/80" />
                            <span className="text-xs font-medium text-[var(--previs-dock-fg-strong)]">AI 剪辑助手</span>
                            <span className="hidden truncate text-[10px] text-[var(--previs-dock-fg)]/45 sm:inline">编辑意图 → 时间线指令（宿主校验）</span>
                            <div className="flex-1" />
                            <button type="button" aria-label="关闭" title="关闭（Esc）" onClick={() => setAiOpen(false)} className="grid size-7 place-items-center rounded-md text-[var(--previs-dock-fg)] hover:bg-[var(--previs-control-hover)]">
                                <X className="size-4" />
                            </button>
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                            <SlotStack slots={aiSlots} emptyHint="AI 助手插件未加载。" />
                        </div>
                    </div>
                </div>

                <div className="editor-mobile-tabs hidden" aria-label="切换编辑工作区">
                    <PanelTabs
                        tabs={[
                            { id: "preview", label: "画面预览" },
                            { id: "left", label: "素材与分析" },
                            { id: "right", label: "检查与导出" },
                        ]}
                        active={mobilePanel}
                        onChange={(tab) => {
                            setMobilePanel(tab);
                            if (tab === "right") setRightCollapsed(false);
                        }}
                    />
                </div>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2">
                    {/* 上区：左栏 + 预览 + 右栏 */}
                    <div className="editor-top-panels flex min-h-0 min-w-0 flex-1 gap-2">
                        {/* 左栏：素材 / 转写（Tab 化） */}
                        <aside data-editor-panel="left" className="flex h-full w-64 shrink-0 flex-col overflow-hidden rounded-xl bg-[var(--previs-sequencer-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                            <PanelTabs
                                tabs={[
                                    { id: "asset", label: "素材" },
                                    { id: "transcription", label: "自动字幕" },
                                    { id: "analysis", label: "素材分析" },
                                ]}
                                active={leftTab}
                                onChange={(tab) => {
                                    if (tab === leftTab) return;
                                    if (panelDraftPending) setPendingLeftTab(tab);
                                    else setLeftTab(tab);
                                }}
                            />
                            {leftTab === "asset" ? (
                                <SlotStack slots={assetSlots} emptyHint="素材库插件未加载。" />
                            ) : leftTab === "analysis" ? (
                                <SlotStack slots={analysisSlots} emptyHint="素材分析插件未加载。" />
                            ) : (
                                <SlotStack slots={transcriptionSlots} emptyHint="转写插件未加载。" />
                            )}
                        </aside>

                        {/* 中栏：预览（占满剩余高度） */}
                        <main data-editor-panel="preview" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-[var(--previs-sequencer-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                            <SlotStack slots={previewSlots} emptyHint="预览插件未加载。" />
                        </main>

                        {/* 右栏：检查 / 字幕 / 导出（Tab 化，可折叠为窄条；AI 助手已移至顶栏浮层） */}
                        {rightCollapsed ? (
                            <aside data-editor-panel="right" className="flex h-full w-9 shrink-0 flex-col items-center overflow-hidden rounded-xl bg-[var(--previs-sequencer-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                                <button
                                    type="button"
                                    aria-label="展开检查器"
                                    title="展开检查器"
                                    onClick={() => setRightCollapsed(false)}
                                    className="mt-1.5 grid size-8 place-items-center rounded-md text-[var(--previs-dock-fg)] hover:bg-[var(--previs-control-hover)]"
                                >
                                    <PanelRightOpen className="size-4" />
                                </button>
                            </aside>
                        ) : (
                            <aside data-editor-panel="right" className="flex h-full w-80 shrink-0 flex-col overflow-hidden rounded-xl bg-[var(--previs-sequencer-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                                <PanelTabs
                                    tabs={[
                                        { id: "inspector", label: "检查" },
                                        { id: "subtitle", label: "文字与图形" },
                                        { id: "export", label: "导出" },
                                    ]}
                                    active={rightTab}
                                    onChange={selectRightTab}
                                    trailing={
                                        <button
                                            type="button"
                                            aria-label="折叠检查器"
                                            disabled={panelDraftPending}
                                            title="折叠检查器"
                                            onClick={() => setRightCollapsed(true)}
                                            className="grid size-7 place-items-center rounded-md text-[var(--previs-dock-fg)] hover:bg-[var(--previs-control-hover)]"
                                        >
                                            <PanelRightClose className="size-3.5" />
                                        </button>
                                    }
                                />
                                {panelNotice && panelDraftPending && (
                                    <p role="alert" className="px-3 py-2 text-xs text-[var(--previs-danger)]">
                                        {panelNotice}
                                    </p>
                                )}
                                {rightTab === "inspector" ? (
                                    <SlotStack slots={inspectorSlots} emptyHint="检查器插件未加载。" />
                                ) : rightTab === "subtitle" ? (
                                    <SlotStack slots={subtitleSlots} emptyHint="字幕工具插件未加载。" />
                                ) : (
                                    <SlotStack slots={exportSlots} emptyHint="导出插件未加载。" />
                                )}
                            </aside>
                        )}
                    </div>

                    {/* 预览/时间线拖拽分隔条（pointer capture，data-canvas-no-zoom 防画布缩放） */}
                    <div
                        className="group relative z-10 -my-1 flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center"
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label="调整时间线高度"
                        data-canvas-no-zoom
                        onPointerDown={(e) => {
                            splitterRef.current = { startY: e.clientY, startH: timelineH };
                            e.currentTarget.setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={(e) => {
                            const drag = splitterRef.current;
                            if (!drag) return;
                            const next = drag.startH - (e.clientY - drag.startY);
                            setTimelineH(Math.min(480, Math.max(120, next)));
                        }}
                        onPointerUp={() => {
                            splitterRef.current = null;
                        }}
                        onPointerCancel={() => {
                            splitterRef.current = null;
                        }}
                    >
                        <div className="h-1 w-10 rounded-full bg-[var(--previs-sequencer-border)] transition-colors group-hover:bg-[var(--previs-dock-fg-strong)]/60" />
                    </div>

                    {/* 时间线：横跨编辑面板全宽（左栏到右栏） */}
                    <div className="flex h-full shrink-0 flex-col overflow-hidden rounded-xl bg-[var(--previs-sequencer-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.3)]" style={{ height: `${timelineH}px` }}>
                        <SlotStack slots={timelineSlots} emptyHint="时间线面板插件未加载。" />
                    </div>
                </div>

                <EditorStatusBar projectName={detail.project.name} />
                <AppModal
                    open={blocker.state === "blocked" || pendingLeftTab !== null}
                    title="还有修改未保存"
                    okText="放弃修改并离开"
                    cancelText="继续编辑"
                    okButtonProps={{ danger: true }}
                    onCancel={() => {
                        setPendingLeftTab(null);
                        if (blocker.state === "blocked") blocker.reset();
                    }}
                    onOk={() => {
                        if (blocker.state === "blocked") blocker.proceed();
                        else if (pendingLeftTab) {
                            setLeftTab(pendingLeftTab);
                            setPendingLeftTab(null);
                        }
                    }}
                >
                    <p>请先在当前面板保存校正。保存请求仍在进行时，请等待结果后再离开。</p>
                </AppModal>
            </div>
        </EditorStoreProvider>
    );
}
