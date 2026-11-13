import { CollectionToolbar } from "@/components/layout/collection-toolbar";
import { App, Button, Form, Input } from "antd";
import { Switch } from "@/components/ui/base/switch";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { AppModal } from "@/components/ui/product/app-modal";
import { LayoutGrid, List, Plus, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { currentLocale, translate } from "@/i18n";

import { MediaPreview } from "@/components/media-preview";
import { PageHeader, PaginationBar, WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceNoResultsState, WorkspaceState } from "@/components/layout/workspace-state";
import { CONTENT_MODERATION_ERROR_CODE, generationErrorMessage, isContentModerationError } from "@/lib/generation-error";
import { canCancelGenerationTask, formatTaskKind, generationTaskStatusLabel, mediaDeliverySummary, operationOptions, statusLabel, videoReworkEditorURL } from "@/lib/generation-task-display";
import { useTaskCancellationStatus } from "@/hooks/use-task-cancellation-status";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { buildVideoOperationPrompt } from "@/lib/prompts";
import { backendProviderConfig, logicalModelIDForConfig } from "@/services/api/generation-task";
import { isNewAPIWorkbench } from "@/lib/workbench-host";

import {
    cancelGenerationTask,
    createGenerationTask,
    formatTaskLog,
    listTaskLogs,
    queryFailedVideoProviderTask,
    queryGenerationTask,
    retryGenerationTask,
    recoverGenerationTaskMedia,
    type CreateTaskInput,
    type GenerationTask,
    type TaskLog,
} from "@/services/api/task-center";
import { listTaskHistory, type TaskHistoryPage } from "@/services/api/task-history";
import { syncGenerationTaskToCanvasStore } from "@/lib/canvas/canvas-generation-task-sync";
import { adoptImageOperationToCanvas } from "@/services/canvas-image-operations";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { resolveModelRequestConfig, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { listProjects, type ProjectSummary } from "@/services/api/projects";
import { TaskDetailModal } from "./task-detail-modal";
import { TaskGridCard } from "./task-grid-card";
import { TaskGroupHeader, type TaskGroup } from "./task-group-header";
import { TaskListRow } from "./task-list-row";
import { isTaskRetryBlocked, taskDeliveryFacts, formatModelName, getTaskCanvasContext, isTaskFailed, providerCancelStatusLabel, taskCanvasProjectOptions, taskWithCanvasContext, taskMediaKind } from "./task-shared";
import { TaskStatusFilterBar, type TaskStatusFilter } from "./task-status-filter";
import { Select } from "@/components/ui/base/select";
import { nativeLayerWorkflowParentId } from "@/lib/native-layer-workflow-task";
import { PendingCanvasAdmissions } from "./pending-canvas-admissions";
import { DEFAULT_TASK_HISTORY_ROUTE, type TaskKindFilter } from "./task-history-route";
import { useTaskHistoryRoute } from "./use-task-history-route";

import "./tasks-page.css";
type TaskViewMode = "list" | "grid";

function preferenceKeys() {
    const userId = useUserStore.getState().user?.id ?? "anon";
    return { view: `task-center-view.${userId}`, group: `task-center-group.${userId}` };
}

function readTaskPreference(key: string, fallback: string): string {
    try {
        return window.localStorage.getItem(key) ?? fallback;
    } catch (error) {
        console.warn("读取任务中心偏好失败", error);
        return fallback;
    }
}

function writeTaskPreference(key: string, value: string): void {
    try {
        window.localStorage.setItem(key, value);
    } catch (error) {
        console.warn("保存任务中心偏好失败", error);
    }
}

export default function TasksPage() {
    const { message, modal } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [historyRoute, setHistoryRoute] = useTaskHistoryRoute();
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const projects = useCanvasStore((state) => state.projects);
    const shortDramaEnabled = useUserStore((state) => state.features.shortDramaEnabled);
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const userId = useUserStore((state) => state.user?.id);
    const [form] = Form.useForm<CreateTaskInput & { operation: string }>();
    const { view: viewPreferenceKey, group: groupPreferenceKey } = preferenceKeys();
    const [domainProjects, setDomainProjects] = useState<ProjectSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [historyError, setHistoryError] = useState("");
    const [actingId, setActingId] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const { keyword, projectFilter, kindFilter, modelFilter, statusFilter, page, pageSize } = historyRoute;
    const setStatusFilter = useCallback((value: TaskStatusFilter) => setHistoryRoute({ statusFilter: value }), [setHistoryRoute]);
    const setPage = useCallback((value: number) => setHistoryRoute({ page: value }), [setHistoryRoute]);
    const debouncedKeyword = useDebouncedValue(keyword);
    const [viewMode, setViewMode] = useState<TaskViewMode>(() => (readTaskPreference(viewPreferenceKey, "list") === "grid" ? "grid" : "list"));
    const [groupEnabled, setGroupEnabled] = useState<boolean>(() => readTaskPreference(groupPreferenceKey, "0") === "1");
    const [retryingGroup, setRetryingGroup] = useState("");
    const [detailTask, setDetailTask] = useState<GenerationTask | null>(null);
    const [cancelConfirmationOpen, setCancelConfirmationOpen] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [mediaPreview, setMediaPreview] = useState<{ url: string; kind: "image" | "video"; title: string } | null>(null);
    const [tasks, setTasks] = useState<GenerationTask[]>([]);
    const [history, setHistory] = useState<TaskHistoryPage | null>(null);
    const historyRequestSequence = useRef(0);
    const historyController = useRef<AbortController | null>(null);
    const detailRequestSequence = useRef(0);
    useEffect(() => {
        setHistory(null);
        setTasks([]);
        setDetailTask(null);
        setDomainProjects([]);
        detailRequestSequence.current++;
    }, [userId]);
    useTaskCancellationStatus(
        detailTask,
        (value) => {
            setDetailTask((current) => (current?.id === value.id ? taskWithCanvasContext(value, current) : current));
            setTasks((current) => current.map((row) => (row.id === value.id ? taskWithCanvasContext(value, row) : row)));
        },
        (text) => {
            void message.warning(text);
        },
    );
    const syncedCanvasTaskIdsRef = useRef(new Set<string>());
    const tasksRef = useRef<GenerationTask[]>([]);
    const canvasById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
    const domainProjectNameById = useMemo(() => new Map(domainProjects.map((item) => [item.project.id, item.project.name])), [domainProjects]);
    const projectOptions = useMemo(() => taskCanvasProjectOptions(tasks, history?.canvases || [], domainProjectNameById), [domainProjectNameById, history?.canvases, tasks]);
    const modelOptions = useMemo(() => (history?.models || []).map((model) => ({ value: model, label: formatModelName(effectiveConfig, { type: "", model }) })), [effectiveConfig, history?.models]);
    const visibleTasks = tasks;
    const taskStats = history?.stats || { total: 0, today: 0, active: 0, succeeded: 0, failed: 0, recorded: 0 };
    const groupingActive = viewMode === "list" && groupEnabled;
    const visibleTaskGroups = useMemo(() => (groupingActive ? groupTasksByCanvas(tasks, canvasById, domainProjectNameById) : []), [canvasById, domainProjectNameById, tasks, groupingActive]);

    const changeViewMode = (mode: TaskViewMode) => {
        setViewMode(mode);
        writeTaskPreference(viewPreferenceKey, mode);
    };

    const changeGroupEnabled = (enabled: boolean) => {
        setGroupEnabled(enabled);
        writeTaskPreference(groupPreferenceKey, enabled ? "1" : "0");
    };

    const retryGroupTasks = async (key: string, items: GenerationTask[]) => {
        const retryable = items.filter(
            (task) =>
                isTaskFailed(task) &&
                !isTaskRetryBlocked(task) &&
                (task.type !== "video_rework" || task.canRecoverMedia) &&
                (!nativeLayerWorkflowParentId(task) || task.canRecoverMedia) &&
                task.errorCode !== CONTENT_MODERATION_ERROR_CODE &&
                !isContentModerationError(task.error),
        );
        if (!retryable.length) return;
        setRetryingGroup(key);
        try {
            for (const task of retryable) {
                await runAction(task.id);
            }
        } finally {
            setRetryingGroup("");
        }
    };

    function cancelTask(task: GenerationTask) {
        setCancelConfirmationOpen(true);
        modal.confirm({
            title: "取消生成任务？",
            content: "提交取消后将核对推理是否停止及本次费用；原素材、已有文件和历史记录会保留。",
            okText: "取消任务",
            cancelText: "继续等待",
            okButtonProps: { danger: true },
            focusTriggerAfterClose: false,
            afterClose: () => setCancelConfirmationOpen(false),
            onOk: async () => {
                setActingId(task.id);
                try {
                    const current = await queryGenerationTask(task.id);
                    if (!canCancelGenerationTask(current)) throw new Error("任务状态已变化，请查看最新状态与可用操作");
                    const next = await cancelGenerationTask(task.id);
                    setTasks((previous) => previous.map((row) => (row.id === task.id ? taskWithCanvasContext(next, row) : row)));
                    setDetailTask((previous) => (previous?.id === task.id ? taskWithCanvasContext(next, previous) : previous));
                    syncGenerationTaskToCanvasStore(next);
                    void message.success(next.providerCancelStatus === "requested" ? "取消请求已保存，正在核对推理与费用" : "任务已取消");
                } catch (failure) {
                    void message.error(failure instanceof Error ? failure.message : "取消任务失败");
                } finally {
                    setActingId("");
                }
            },
        });
    }
    const renderTaskRow = (task: GenerationTask) => (
        <TaskListRow
            key={task.id}
            task={task}
            canvasById={canvasById}
            projectNameById={domainProjectNameById}
            effectiveConfig={effectiveConfig}
            creditsEnabled={creditsEnabled}
            actingId={actingId}
            onOpen={() => void openTaskDetail(task)}
            onRetry={() => void runAction(task.id)}
            onCancel={() => cancelTask(task)}
            onPreview={() => {
                if (task.type === "canvas_audio") {
                    void openTaskDetail(task);
                } else if (task.previewUrl) {
                    setMediaPreview({ url: task.previewUrl, kind: task.previewKind === "video" ? "video" : "image", title: task.prompt || formatTaskKind(task) });
                }
            }}
        />
    );

    const renderTaskGridCard = (task: GenerationTask) => (
        <TaskGridCard key={task.id} task={task} effectiveConfig={effectiveConfig} actingId={actingId} onOpen={() => void openTaskDetail(task)} onRetry={() => void runAction(task.id)} onCancel={() => cancelTask(task)} />
    );

    useEffect(() => {
        if (!shortDramaEnabled) {
            setDomainProjects([]);
            return;
        }
        let cancelled = false;
        void listProjects()
            .then((result) => {
                if (!cancelled) setDomainProjects(result.projects);
            })
            .catch((error) => {
                if (cancelled) return;
                // 领域项目只是任务页的辅助筛选数据；读取失败不能阻断任务列表，但必须清空旧快照并留下可检索的诊断。
                setDomainProjects([]);
                console.warn("加载任务关联项目失败，已禁用本次项目筛选", error);
            });
        return () => {
            cancelled = true;
        };
    }, [shortDramaEnabled, userId]);

    const syncCompletedCanvasTasks = useCallback(async (items: GenerationTask[]) => {
        const pendingTaskIds = new Set(
            useCanvasStore
                .getState()
                .projects.flatMap((project) => project.nodes)
                .filter((node) => node.metadata?.taskId && (node.metadata.status !== "success" || !node.metadata.content))
                .map((node) => node.metadata!.taskId!),
        );
        const candidates = items.filter((task) => task.status === "succeeded" && pendingTaskIds.has(task.id) && task.projectId && task.type.startsWith("canvas_") && !syncedCanvasTaskIdsRef.current.has(task.id));
        await Promise.all(
            candidates.map(async (task) => {
                syncedCanvasTaskIdsRef.current.add(task.id);
                try {
                    const detail = task.resultJson ? task : await queryGenerationTask(task.id);
                    await syncGenerationTaskToCanvasStore(detail);
                } catch {
                    syncedCanvasTaskIdsRef.current.delete(task.id);
                }
            }),
        );
    }, []);

    const loadTasks = useCallback(
        async (showLoading = false) => {
            historyController.current?.abort();
            const controller = new AbortController();
            const sequence = ++historyRequestSequence.current;
            historyController.current = controller;
            if (showLoading) setLoading(true);
            try {
                const result = await listTaskHistory(
                    {
                        page,
                        pageSize,
                        q: debouncedKeyword.trim() || undefined,
                        projectId: projectFilter === "all" ? undefined : projectFilter,
                        kind: kindFilter === "all" ? undefined : kindFilter,
                        model: modelFilter === "all" ? undefined : modelFilter,
                        status: statusFilter === "all" ? undefined : statusFilter,
                        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                    },
                    controller.signal,
                );
                if (controller.signal.aborted || sequence !== historyRequestSequence.current) return undefined;
                setHistoryError("");
                setHistory(result);
                setTasks((current) => reconcileTaskSummaries(current, result.tasks));
                const maxPage = Math.max(1, Math.ceil(result.total / pageSize));
                if (page > maxPage) setPage(maxPage);
                void syncCompletedCanvasTasks(result.tasks);
                return result.tasks;
            } catch (error) {
                if (controller.signal.aborted || sequence !== historyRequestSequence.current) return undefined;
                setHistoryError(error instanceof Error ? error.message : t("library.tasks.page.loadFailed"));
                return undefined;
            } finally {
                if (!controller.signal.aborted && sequence === historyRequestSequence.current) setLoading(false);
            }
        },
        [debouncedKeyword, kindFilter, message, modelFilter, page, pageSize, projectFilter, statusFilter, syncCompletedCanvasTasks, userId, t],
    );

    const openTaskDetail = useCallback(
        async (task: GenerationTask) => {
            const requestSequence = ++detailRequestSequence.current;
            setDetailTask(task);
            setTaskLogs([]);
            setDetailLoading(true);
            setLogsLoading(true);
            try {
                const [detail, logs] = await Promise.all([queryGenerationTask(task.id), listTaskLogs(task.id)]);
                if (requestSequence !== detailRequestSequence.current) return;
                setDetailTask(taskWithCanvasContext(detail, task));
                setTaskLogs(logs);
            } catch (error) {
                if (requestSequence === detailRequestSequence.current) message.error(error instanceof Error ? error.message : t("library.tasks.page.detailLoadFailed"));
            } finally {
                if (requestSequence === detailRequestSequence.current) {
                    setDetailLoading(false);
                    setLogsLoading(false);
                }
            }
        },
        [message, t],
    );

    useEffect(() => {
        tasksRef.current = tasks;
    }, [tasks]);

    useEffect(() => {
        setTasks([]);
        let stopped = false;
        let timer = 0;
        const poll = async (initial = false) => {
            const next = await loadTasks(initial);
            if (stopped) return;
            const items = next || tasksRef.current;
            const hasActiveTasks = items.some((task) => task.status === "queued" || task.status === "running" || task.providerCancelStatus === "requested");
            timer = window.setTimeout(() => void poll(false), document.hidden ? 60_000 : hasActiveTasks ? 10_000 : 60_000);
        };
        const handleVisibility = () => {
            if (document.hidden) return;
            window.clearTimeout(timer);
            void poll(false);
        };
        void poll(true);
        document.addEventListener("visibilitychange", handleVisibility);
        return () => {
            stopped = true;
            historyRequestSequence.current++;
            historyController.current?.abort();
            window.clearTimeout(timer);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [loadTasks]);

    const runAction = async (id: string) => {
        setActingId(id);
        try {
            const currentTask = await queryGenerationTask(id);
            const repairURL = videoReworkEditorURL(currentTask);
            if (repairURL && !currentTask.canRecoverMedia) {
                navigate(repairURL);
                message.info("请核对原片段范围和候选后继续修复");
                return;
            }
            if (nativeLayerWorkflowParentId(currentTask) && !currentTask.canRecoverMedia) {
                if (!currentTask.projectId) throw new Error("原画布已不可用，完成素材仍保留在素材库");
                navigate(`/canvas/${encodeURIComponent(currentTask.projectId)}`);
                message.info(isNewAPIWorkbench ? "请选中原图层组，使用“继续未完成图层”确认计划" : "请选中原图层组，使用“继续未完成图层”确认计划和积分上限");
                return;
            }
            const savingMedia = Boolean(currentTask.mediaStage);
            const next = currentTask.status === "queued" || currentTask.status === "running" || currentTask.status === "succeeded" ? currentTask : savingMedia ? await recoverGenerationTaskMedia(id) : await retryGenerationTask(id);
            setTasks((items) => items.map((item) => (item.id === id ? taskWithCanvasContext(next, item) : item)));
            setDetailTask((current) => (current?.id === id ? { ...current, ...next } : current));
            setStatusFilter("active");
            message.success(next.status === "succeeded" ? t("library.tasks.page.taskCompleted") : savingMedia ? t("library.tasks.page.recoveringMedia") : t("library.tasks.page.taskQueued"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("library.tasks.page.actionFailed"));
        } finally {
            setActingId("");
        }
    };

    const queryProviderTask = async (task: GenerationTask) => {
        setActingId(task.id);
        try {
            const result = await queryFailedVideoProviderTask(task.id);
            if (!result.recovered) {
                setTaskLogs(await listTaskLogs(task.id));
                message.info(result.providerStatus ? t("library.tasks.page.upstreamPendingWithStatus", { status: result.providerStatus }) : t("library.tasks.page.upstreamPending"));
                return;
            }
            setDetailTask((current) => (current?.id === result.task.id ? taskWithCanvasContext(result.task, current) : current));
            setTasks((items) => items.map((item) => (item.id === task.id ? { ...item, ...result.task } : item)));
            setTaskLogs(await listTaskLogs(task.id));
            await syncGenerationTaskToCanvasStore(result.task);
            window.dispatchEvent(new CustomEvent("wallet:updated"));
            void loadTasks(false);
            if (result.billingSettled) message.success(t("library.tasks.page.upstreamRecoveredSettled"));
            else message.warning(t("library.tasks.page.upstreamRecoveredUnsettled"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("library.tasks.page.upstreamQueryFailed"));
        } finally {
            setActingId("");
        }
    };

    const submitTask = async () => {
        const values = await form.validateFields();
        setCreating(true);
        try {
            {
                const videoModel = values.model?.trim() || effectiveConfig.videoModel || effectiveConfig.model;
                if (values.operation !== "compare_versions" && !isAiConfigReady(effectiveConfig, videoModel)) {
                    message.error("暂时没有可用的视频模型，请先选择模型或联系管理员配置。");
                    return;
                }
                const requestConfig = resolveModelRequestConfig(effectiveConfig, videoModel);
                const task = await createGenerationTask({
                    projectId: values.projectId,
                    type: `video_${values.operation}`,
                    operation: values.operation,
                    prompt: values.prompt,
                    provider: values.operation === "compare_versions" ? "internal-agent" : "openai-compatible",
                    model: values.operation === "compare_versions" ? "version-router" : requestConfig.model,
                    ...(values.operation !== "compare_versions" && logicalModelIDForConfig(requestConfig) ? { logicalModelId: logicalModelIDForConfig(requestConfig) } : {}),
                    input: {
                        source: "tasks-page",
                        mode: values.operation === "compare_versions" ? "workflow" : "video",
                        prompt: buildVideoOperationPrompt(values.operation, values.prompt, operationOptions.find((item) => item.value === values.operation)?.label || "其他视频操作"),
                        config: values.operation === "compare_versions" ? undefined : backendProviderConfig(requestConfig),
                        metadata: { videoEditOperation: values.operation },
                    },
                });
                setTasks((items) => [task, ...items]);
            }
            setStatusFilter("active");
            setCreateOpen(false);
            form.resetFields();
            message.success(t("library.tasks.page.created"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("library.tasks.page.createFailed"));
        } finally {
            setCreating(false);
        }
    };

    const detailContext = detailTask ? getTaskCanvasContext(detailTask, canvasById, domainProjectNameById) : null;
    // 搜索或筛选（不含状态）把已有任务全部过滤掉时显示「无结果」，而不是「还没有任务」。
    const searchOrFilterActive = Boolean(keyword.trim() || projectFilter !== "all" || kindFilter !== "all" || modelFilter !== "all");
    const filtersActive = searchOrFilterActive || statusFilter !== "all";
    const resetFilters = () => {
        setHistoryRoute({ ...DEFAULT_TASK_HISTORY_ROUTE, pageSize });
    };
    const renderTaskList = (items: GenerationTask[]) => (
        <div className="task-center-list" data-billing={creditsEnabled || undefined}>
            {items.map(renderTaskRow)}
        </div>
    );

    return (
        <>
            <WorkspacePage grid className="library-page task-center-page">
                <div className="studio-band">
                    <PageHeader
                        title={t("library.tasks.page.title")}
                        description={t("library.tasks.page.description")}
                        meta={
                            <span className="app-projects-header-meta">
                                {t("library.tasks.page.taskCount", { count: history?.total || 0 })} · {t("library.tasks.filter.today")} {taskStats.today}
                            </span>
                        }
                        actions={
                            <Button type="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>
                                {t("library.tasks.page.newTask")}
                            </Button>
                        }
                    />
                    <PendingCanvasAdmissions onRecovered={() => void loadTasks(false)} />
                    {/* 第一行：状态切换和视图；第二行：搜索与筛选。分两行排，窄屏不会把控件挤成一团。 */}
                    <div className="task-center-statusbar">
                        <TaskStatusFilterBar
                            stats={taskStats}
                            value={statusFilter}
                            onChange={(value) => {
                                setStatusFilter(value);
                                setPage(1);
                            }}
                        />
                        <div className="task-center-view-controls">
                            {viewMode === "list" ? (
                                <label className="task-center-group-toggle">
                                    <Switch size="sm" checked={groupEnabled} onChange={changeGroupEnabled} />
                                    <span>{t("library.tasks.page.groupByCanvas")}</span>
                                </label>
                            ) : null}
                            <SegmentedControl<TaskViewMode>
                                ariaLabel={t("library.tasks.page.viewMode")}
                                size="sm"
                                value={viewMode}
                                options={[
                                    { value: "list", icon: <List className="size-3.5" />, title: t("library.tasks.page.listView") },
                                    { value: "grid", icon: <LayoutGrid className="size-3.5" />, title: t("library.tasks.page.gridView") },
                                ]}
                                onChange={changeViewMode}
                            />
                        </div>
                    </div>
                    <CollectionToolbar active={filtersActive} onReset={resetFilters}>
                        <Input
                            id="task-search"
                            name="taskSearch"
                            allowClear
                            className="app-list-search task-center-search"
                            prefix={<Search className="size-4 text-foreground/40" />}
                            value={keyword}
                            placeholder={t("library.tasks.page.searchPlaceholder")}
                            onChange={(event) => setHistoryRoute({ keyword: event.target.value })}
                        />
                        <Select
                            showSearch
                            optionFilterProp="label"
                            aria-label="按画布筛选"
                            className="task-center-filter is-wide"
                            value={projectFilter}
                            onChange={(value) => setHistoryRoute({ projectFilter: value })}
                            options={[{ label: t("library.tasks.page.allCanvases"), value: "all" }, ...projectOptions]}
                        />
                        <Select
                            aria-label="按类型筛选"
                            className="task-center-filter"
                            value={kindFilter}
                            onChange={(value) => setHistoryRoute({ kindFilter: value as TaskKindFilter })}
                            options={[
                                { label: t("library.tasks.page.allKinds"), value: "all" },
                                { label: t("library.tasks.page.kindText"), value: "text" },
                                { label: t("library.tasks.page.kindImage"), value: "image" },
                                { label: t("library.tasks.page.kindVideo"), value: "video" },
                                { label: "声音", value: "audio" },
                            ]}
                        />
                        <Select
                            showSearch
                            optionFilterProp="label"
                            aria-label="按模型筛选"
                            className="task-center-filter is-wide"
                            value={modelFilter}
                            onChange={(value) => setHistoryRoute({ modelFilter: value })}
                            options={[{ label: t("library.tasks.page.allModels"), value: "all" }, ...modelOptions]}
                        />
                    </CollectionToolbar>
                </div>

                <div className="collection-content task-center-content">
                    {historyError ? (
                        <WorkspaceState
                            compact
                            icon="error"
                            title={tasks.length ? "创作历史暂未刷新" : "创作历史加载失败"}
                            description={historyError}
                            action={
                                <Button icon={<RefreshCw className="size-3.5" />} onClick={() => void loadTasks(true)}>
                                    重试加载
                                </Button>
                            }
                        />
                    ) : null}
                    {loading && !tasks.length ? (
                        <TaskCenterSkeleton viewMode={viewMode} label={t("library.tasks.page.loading")} />
                    ) : visibleTasks.length ? (
                        viewMode === "grid" ? (
                            <div className="task-center-grid">{visibleTasks.map(renderTaskGridCard)}</div>
                        ) : groupingActive ? (
                            <div className="task-center-groups">
                                {visibleTaskGroups.map((group) => (
                                    <section key={group.key} className="task-center-group">
                                        <TaskGroupHeader group={group} retrying={retryingGroup === group.key} onRetryFailed={() => void retryGroupTasks(group.key, group.tasks)} />
                                        {renderTaskList(group.tasks)}
                                    </section>
                                ))}
                            </div>
                        ) : (
                            renderTaskList(visibleTasks)
                        )
                    ) : historyError ? null : searchOrFilterActive ? (
                        <WorkspaceNoResultsState compact query={keyword} onClear={resetFilters} />
                    ) : (
                        <WorkspaceState
                            compact
                            title={taskEmptyState(statusFilter).title}
                            description={taskEmptyState(statusFilter).description}
                            action={
                                <Button className="library-primary-action" type="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>
                                    {t("library.tasks.page.newTask")}
                                </Button>
                            }
                        />
                    )}
                    <PaginationBar
                        current={page}
                        pageSize={pageSize}
                        total={history?.total || 0}
                        pageSizeOptions={[20, 50, 100]}
                        onChange={(nextPage, nextPageSize) => setHistoryRoute({ page: nextPageSize !== pageSize ? 1 : nextPage, pageSize: nextPageSize })}
                    />
                </div>
            </WorkspacePage>
            <AppModal className="library-modal" title={t("library.tasks.create.title")} open={createOpen} onCancel={() => setCreateOpen(false)} onOk={submitTask} confirmLoading={creating} okText={t("library.tasks.create.submit")} destroyOnHidden={false}>
                <Form form={form} layout="vertical" initialValues={{ operation: "text_to_video" }}>
                    <Form.Item name="operation" label={t("library.tasks.create.operation")} rules={[{ required: true, message: t("library.tasks.create.operationRequired") }]}>
                        <Select options={operationOptions} />
                    </Form.Item>
                    <Form.Item name="prompt" label={t("library.tasks.create.prompt")} rules={[{ required: true, message: t("library.tasks.create.promptRequired") }]}>
                        <Input.TextArea rows={5} placeholder={t("library.tasks.create.promptPlaceholder")} />
                    </Form.Item>
                    <Form.Item name="projectId" label={t("library.tasks.create.canvas")}>
                        <Select allowClear showSearch optionFilterProp="label" options={projectOptions} placeholder={projectOptions.length ? t("library.tasks.create.canvasPlaceholder") : t("library.tasks.create.noCanvas")} />
                    </Form.Item>
                    <Form.Item name="model" label={t("library.tasks.create.model")}>
                        <Input placeholder={t("library.tasks.create.modelPlaceholder")} />
                    </Form.Item>
                </Form>
            </AppModal>
            <TaskDetailModal
                task={detailTask}
                loading={detailLoading}
                logs={taskLogs}
                logsLoading={logsLoading}
                actingId={actingId}
                canvasName={detailContext ? (detailContext.projectName ? `${detailContext.canvasName} · ${detailContext.projectName}` : detailContext.canvasName) : ""}
                modelName={detailTask ? formatModelName(effectiveConfig, detailTask) : ""}
                creditsEnabled={creditsEnabled}
                confirmationOpen={cancelConfirmationOpen}
                additionalFacts={taskDeliveryFacts(detailTask)}
                additionalActions={
                    detailTask ? (
                        <>
                            {detailTask.operation === "cloud_agent" && detailTask.projectId && detailTask.canvasContext?.status === "available" ? (
                                <Button onClick={() => navigate(`/canvas/${encodeURIComponent(detailTask.projectId!)}?agent=1&agentRun=${encodeURIComponent(detailTask.id)}`)}>查看原对话</Button>
                            ) : null}
                            {detailTask.type === "image_operation" && detailTask.operation !== "layer-workflow" && detailTask.status === "succeeded" && detailTask.projectId ? (
                                <Button
                                    loading={actingId === detailTask.id}
                                    onClick={async () => {
                                        setActingId(detailTask.id);
                                        try {
                                            const adopted = await adoptImageOperationToCanvas(detailTask.id);
                                            let notice = "处理结果已在原画布中";
                                            if (adopted.historical) notice = "已找到历史回执，保留了画布的后续编辑；本次未重新覆盖";
                                            else if (adopted.updated) notice = "合成结果已回写原图层组，请打开画布核对当前版本";
                                            else if (adopted.added) notice = "处理结果已添加到原画布";
                                            message.success(notice);
                                            navigate(`/canvas/${encodeURIComponent(adopted.projectId)}`);
                                        } catch (error) {
                                            message.error(error instanceof Error ? error.message : "无法添加处理结果");
                                        } finally {
                                            setActingId("");
                                        }
                                    }}
                                >
                                    添加到原画布
                                </Button>
                            ) : null}
                            {canCancelGenerationTask(detailTask) ? (
                                <Button danger loading={actingId === detailTask.id} onClick={() => cancelTask(detailTask)}>
                                    取消任务
                                </Button>
                            ) : null}
                            {videoReworkEditorURL(detailTask) ? <Button onClick={() => navigate(videoReworkEditorURL(detailTask)!)}>返回剪辑修复</Button> : null}
                        </>
                    ) : null
                }
                onClose={() => {
                    detailRequestSequence.current++;
                    setDetailTask(null);
                }}
                onRetry={(task) => void runAction(task.id)}
                onQueryProvider={(task) => void queryProviderTask(task)}
                onExportDiagnostics={(task) => navigate(`/settings?section=diagnostics&taskId=${encodeURIComponent(task.id)}${task.projectId ? `&projectId=${encodeURIComponent(task.projectId)}` : ""}`)}
                onPreviewMedia={setMediaPreview}
            />
            <AppModal
                title={<span className="block truncate pr-8">{mediaPreview?.title || t("library.tasks.detail.previewTitle")}</span>}
                open={Boolean(mediaPreview)}
                onCancel={() => setMediaPreview(null)}
                footer={null}
                centered
                width="min(1040px, calc(100vw - 32px))"
                className="library-modal task-center-preview-modal"
            >
                {mediaPreview ? (
                    <MediaPreview
                        src={mediaPreview.url}
                        kind={mediaPreview.kind}
                        alt={mediaPreview.title}
                        controls={mediaPreview.kind === "video"}
                        className="max-h-[76vh] w-full bg-black object-contain"
                        fallbackClassName="task-center-preview-unavailable"
                    />
                ) : null}
            </AppModal>
        </>
    );
}

/** 首次读取的占位：列表模式给行骨架，网格模式给卡片骨架，切换后形状一致不跳。 */
function TaskCenterSkeleton({ viewMode, label }: { viewMode: TaskViewMode; label: string }) {
    if (viewMode === "grid") {
        return (
            <div className="task-center-grid" aria-busy="true" aria-label={label}>
                {Array.from({ length: 8 }, (_, index) => (
                    <div key={index} className="task-center-card is-skeleton" aria-hidden="true">
                        <div className="task-center-card-media" />
                        <div className="task-center-card-body">
                            <span className="task-center-skeleton-line" />
                            <span className="task-center-skeleton-line is-sm" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }
    return (
        <div className="task-center-list" aria-busy="true" aria-label={label}>
            {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="task-center-row is-skeleton" aria-hidden="true">
                    <span className="task-center-thumb" />
                    <div className="task-center-row-main">
                        <span className="task-center-skeleton-line" />
                        <span className="task-center-skeleton-line is-sm" />
                    </div>
                </div>
            ))}
        </div>
    );
}

function reconcileTaskSummaries(current: GenerationTask[], next: GenerationTask[]) {
    if (current.length === 0) return next;
    const currentById = new Map(current.map((task) => [task.id, task]));
    let changed = false;
    const reconciled = next.map((task) => {
        const previous = currentById.get(task.id);
        if (
            previous?.updatedAt === task.updatedAt &&
            previous.previewUrl === task.previewUrl &&
            previous.previewPosterUrl === task.previewPosterUrl &&
            previous.billing?.status === task.billing?.status &&
            previous.billing?.amountMicrocredits === task.billing?.amountMicrocredits &&
            previous.billing?.chargedMicrocredits === task.billing?.chargedMicrocredits &&
            previous.billing?.refundedMicrocredits === task.billing?.refundedMicrocredits
        )
            return previous;
        changed = true;
        return task;
    });
    return changed ? reconciled : current;
}

function groupTasksByCanvas(tasks: GenerationTask[], canvasById: Map<string, { title: string; projectId?: string }>, projectNameById: Map<string, string>): TaskGroup[] {
    const groups: TaskGroup[] = [];
    const byKey = new Map<string, TaskGroup>();
    for (const task of tasks) {
        const context = getTaskCanvasContext(task, canvasById, projectNameById);
        const key = `${context.projectName}\u0000${context.canvasName}`;
        let group = byKey.get(key);
        if (!group) {
            group = { key, title: context.canvasName, projectName: context.projectName, tasks: [] };
            byKey.set(key, group);
            groups.push(group);
        }
        group.tasks.push(task);
    }
    return groups;
}

function taskEmptyState(status: TaskStatusFilter) {
    if (status === "recorded") return { title: "没有对话记录", description: "Agent 对话和文本存档会显示在这里，模型实际生成另有执行记录。" };
    if (status === "all") return { title: translate("library.tasks.empty.allTitle"), description: translate("library.tasks.empty.allDescription") };
    if (status === "active") return { title: translate("library.tasks.empty.activeTitle"), description: translate("library.tasks.empty.activeDescription") };
    if (status === "succeeded") return { title: translate("library.tasks.empty.succeededTitle"), description: translate("library.tasks.empty.succeededDescription") };
    return { title: translate("library.tasks.empty.failedTitle"), description: translate("library.tasks.empty.failedDescription") };
}
