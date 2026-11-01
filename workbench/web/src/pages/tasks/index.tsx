import { CollectionToolbar } from "@/components/layout/collection-toolbar";
import { App, Button, Drawer, Form, Input, Modal, Typography } from "antd";
import { Switch } from "@/components/ui/base/switch";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { Bug, LayoutGrid, List, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { MediaPreview } from "@/components/media-preview";
import { PageHeader, PaginationBar, WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceState } from "@/components/layout/workspace-state";
import { CONTENT_MODERATION_ERROR_CODE, generationErrorMessage, isContentModerationError } from "@/lib/generation-error";
import { canCancelGenerationTask, formatTaskKind, generationTaskStatusLabel, mediaDeliverySummary, operationOptions, statusLabel, videoReworkEditorURL } from "@/lib/generation-task-display";
import { useTaskCancellationStatus } from "@/hooks/use-task-cancellation-status";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { buildVideoOperationPrompt } from "@/lib/prompts";
import { backendProviderConfig, logicalModelIDForConfig } from "@/services/api/generation-task";

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
import { TaskGridCard } from "./task-grid-card";
import { TaskGroupHeader, type TaskGroup } from "./task-group-header";
import { TaskListRow } from "./task-list-row";
import { formatModelName, getTaskCanvasContext, isTaskFailed, providerCancelStatusLabel, taskCanvasProjectOptions, taskWithCanvasContext } from "./task-shared";
import { TaskStatusFilterBar, type TaskStatusFilter } from "./task-status-filter";
import { Select } from "@/components/ui/base/select";
import { nativeLayerWorkflowParentId } from "@/lib/native-layer-workflow-task";
import { PendingCanvasAdmissions } from "./pending-canvas-admissions";
import { DEFAULT_TASK_HISTORY_ROUTE, type TaskKindFilter } from "./task-history-route";
import { useTaskHistoryRoute } from "./use-task-history-route";

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
                isTaskFailed(task) && (task.type !== "video_rework" || task.canRecoverMedia) && (!nativeLayerWorkflowParentId(task) || task.canRecoverMedia) && task.errorCode !== CONTENT_MODERATION_ERROR_CODE && !isContentModerationError(task.error),
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
            onPreview={() => task.previewUrl && setMediaPreview({ url: task.previewUrl, kind: task.previewKind === "video" ? "video" : "image", title: task.prompt || formatTaskKind(task) })}
        />
    );

    const renderTaskGridCard = (task: GenerationTask) => <TaskGridCard key={task.id} task={task} actingId={actingId} onOpen={() => void openTaskDetail(task)} onRetry={() => void runAction(task.id)} onCancel={() => cancelTask(task)} />;

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
                setHistoryError(error instanceof Error ? error.message : "任务加载失败");
                return undefined;
            } finally {
                if (!controller.signal.aborted && sequence === historyRequestSequence.current) setLoading(false);
            }
        },
        [debouncedKeyword, kindFilter, message, modelFilter, page, pageSize, projectFilter, statusFilter, syncCompletedCanvasTasks, userId],
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
                if (requestSequence === detailRequestSequence.current) message.error(error instanceof Error ? error.message : "任务详情加载失败");
            } finally {
                if (requestSequence === detailRequestSequence.current) {
                    setDetailLoading(false);
                    setLogsLoading(false);
                }
            }
        },
        [message],
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
                message.info("请选中原图层组，使用“继续未完成图层”确认计划和积分上限");
                return;
            }
            const savingMedia = Boolean(currentTask.mediaStage);
            const next = currentTask.status === "queued" || currentTask.status === "running" || currentTask.status === "succeeded" ? currentTask : savingMedia ? await recoverGenerationTaskMedia(id) : await retryGenerationTask(id);
            setTasks((items) => items.map((item) => (item.id === id ? taskWithCanvasContext(next, item) : item)));
            setDetailTask((current) => (current?.id === id ? { ...current, ...next } : current));
            setStatusFilter("active");
            message.success(next.status === "succeeded" ? "任务已完成" : savingMedia ? "正在恢复作品保存，不会重新生成" : "任务已在队列中");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失败");
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
                message.info(`上游任务仍在处理中${result.providerStatus ? `（${result.providerStatus}）` : ""}`);
                return;
            }
            setDetailTask((current) => (current?.id === result.task.id ? taskWithCanvasContext(result.task, current) : current));
            setTasks((items) => items.map((item) => (item.id === task.id ? { ...item, ...result.task } : item)));
            setTaskLogs(await listTaskLogs(task.id));
            await syncGenerationTaskToCanvasStore(result.task);
            window.dispatchEvent(new CustomEvent("wallet:updated"));
            void loadTasks(false);
            if (result.billingSettled) message.success("已获取上游视频，任务已恢复并完成结算");
            else message.warning("已获取上游视频，任务已恢复，计费状态待管理员核对");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "查询上游任务失败");
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
            message.success("任务已创建");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "任务创建失败");
        } finally {
            setCreating(false);
        }
    };

    return (
        <>
            <WorkspacePage grid className="library-page task-library-page">
                <div className="studio-band">
                    <PageHeader
                        title="创作历史"
                        description="查看文本、图片、视频和声音任务，跟踪进度并继续未完成的创作。"
                        meta={
                            <span className="app-projects-header-meta" aria-busy={loading}>
                                {history?.total || 0} 个任务
                            </span>
                        }
                        actions={
                            <Button type="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>
                                新建任务
                            </Button>
                        }
                    />
                    <PendingCanvasAdmissions onRecovered={() => void loadTasks(false)} />
                    <CollectionToolbar
                        active={Boolean(keyword || projectFilter !== "all" || kindFilter !== "all" || modelFilter !== "all" || statusFilter !== "all")}
                        onReset={() => setHistoryRoute({ ...DEFAULT_TASK_HISTORY_ROUTE, pageSize })}
                        trailing={
                            <div className="flex flex-wrap items-center gap-2">
                                {viewMode === "list" ? (
                                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-foreground/55">
                                        <Switch size="sm" checked={groupEnabled} onChange={changeGroupEnabled} />
                                        <span>按画布分组</span>
                                    </label>
                                ) : null}
                                <div className="task-view-switch">
                                    <SegmentedControl<TaskViewMode>
                                        ariaLabel="任务视图"
                                        size="sm"
                                        value={viewMode}
                                        options={[
                                            { value: "list", icon: <List className="size-3.5" />, title: "列表视图" },
                                            { value: "grid", icon: <LayoutGrid className="size-3.5" />, title: "网格视图" },
                                        ]}
                                        onChange={changeViewMode}
                                    />
                                </div>
                            </div>
                        }
                    >
                        <TaskStatusFilterBar stats={taskStats} value={statusFilter} onChange={setStatusFilter} />
                        <Input
                            id="task-search"
                            name="taskSearch"
                            allowClear
                            className="app-list-search"
                            prefix={<Search className="size-4 text-foreground/40" />}
                            value={keyword}
                            placeholder="搜索任务、模型或画布"
                            onChange={(event) => setHistoryRoute({ keyword: event.target.value })}
                        />
                        <Select
                            showSearch
                            optionFilterProp="label"
                            aria-label="按画布筛选"
                            className="w-full sm:w-48"
                            value={projectFilter}
                            onChange={(value) => setHistoryRoute({ projectFilter: value })}
                            options={[{ label: "全部画布", value: "all" }, ...projectOptions]}
                        />
                        <Select
                            aria-label="按类型筛选"
                            className="w-full sm:w-32"
                            value={kindFilter}
                            onChange={(value) => setHistoryRoute({ kindFilter: value as TaskKindFilter })}
                            options={[
                                { label: "全部类型", value: "all" },
                                { label: "文本", value: "text" },
                                { label: "图片", value: "image" },
                                { label: "视频", value: "video" },
                                { label: "声音", value: "audio" },
                            ]}
                        />
                        <Select
                            showSearch
                            optionFilterProp="label"
                            aria-label="按模型筛选"
                            className="w-full sm:w-44"
                            value={modelFilter}
                            onChange={(value) => setHistoryRoute({ modelFilter: value })}
                            options={[{ label: "全部模型", value: "all" }, ...modelOptions]}
                        />
                    </CollectionToolbar>
                </div>

                <div className="collection-content task-collection-content">
                    {loading && !tasks.length ? (
                        <div className="library-loading-grid" aria-label="正在加载任务">
                            {Array.from({ length: 8 }, (_, index) => (
                                <div key={index} className="library-skeleton" />
                            ))}
                        </div>
                    ) : null}
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
                    {!loading || tasks.length ? (
                        visibleTasks.length ? (
                            viewMode === "grid" ? (
                                <div className="task-grid-view">{visibleTasks.map(renderTaskGridCard)}</div>
                            ) : groupingActive ? (
                                <div className="task-group-list">
                                    {visibleTaskGroups.map((group) => (
                                        <section key={group.key} className="task-group">
                                            <TaskGroupHeader group={group} retrying={retryingGroup === group.key} onRetryFailed={() => void retryGroupTasks(group.key, group.tasks)} />
                                            <div className="task-record-list">{group.tasks.map(renderTaskRow)}</div>
                                        </section>
                                    ))}
                                </div>
                            ) : (
                                <div className="task-record-list">{visibleTasks.map(renderTaskRow)}</div>
                            )
                        ) : historyError ? null : (
                            <WorkspaceState
                                compact
                                title={taskEmptyState(statusFilter).title}
                                description={taskEmptyState(statusFilter).description}
                                action={
                                    <Button className="library-primary-action" type="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>
                                        新建任务
                                    </Button>
                                }
                            />
                        )
                    ) : null}
                    <PaginationBar
                        current={page}
                        pageSize={pageSize}
                        total={history?.total || 0}
                        pageSizeOptions={[20, 50, 100]}
                        onChange={(nextPage, nextPageSize) => setHistoryRoute({ page: nextPageSize !== pageSize ? 1 : nextPage, pageSize: nextPageSize })}
                    />
                </div>
            </WorkspacePage>
            <Modal className="library-modal" title="新建异步生成任务" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={submitTask} confirmLoading={creating} okText="创建任务">
                <Form form={form} layout="vertical" initialValues={{ operation: "text_to_video" }}>
                    <Form.Item name="operation" label="任务类型" rules={[{ required: true, message: "请选择任务类型" }]}>
                        <Select options={operationOptions} />
                    </Form.Item>
                    <Form.Item name="prompt" label="创作指令" rules={[{ required: true, message: "请输入创作指令" }]}>
                        <Input.TextArea rows={5} placeholder="描述短剧、MV、TVC 或要执行的视频编辑操作" />
                    </Form.Item>
                    <Form.Item name="projectId" label="绑定画布">
                        <Select allowClear showSearch optionFilterProp="label" options={projectOptions} placeholder={projectOptions.length ? "可选，选择要绑定的画布" : "暂无本地画布"} />
                    </Form.Item>
                    <Form.Item name="model" label="目标模型">
                        <Input placeholder="可选，例如 seedance、kling、wan、nano-banana" />
                    </Form.Item>
                </Form>
            </Modal>
            <Drawer
                className="library-drawer"
                title="任务详情"
                open={Boolean(detailTask)}
                focusable={{ trap: !cancelConfirmationOpen }}
                onClose={() => {
                    detailRequestSequence.current++;
                    setDetailTask(null);
                }}
                size="large"
                destroyOnHidden
            >
                {detailTask ? (
                    <div className="space-y-5">
                        <div className="task-detail-facts grid text-sm sm:grid-cols-2">
                            <InfoItem label="状态" value={generationTaskStatusLabel(detailTask)} />
                            {detailTask.mediaStage ? <InfoItem label="作品交付" value={mediaDeliverySummary(detailTask.status, detailTask.mediaStage, detailTask.type)} /> : null}
                            {detailTask.canvasDeliveryStatus ? (
                                <InfoItem
                                    label="画布保存"
                                    value={
                                        detailTask.canvasDeliveryStatus === "applied"
                                            ? "已同步到原画布"
                                            : detailTask.canvasDeliveryStatus === "skipped"
                                              ? "原节点已移除或更换，结果保留在任务中"
                                              : detailTask.status === "succeeded"
                                                ? "作品已生成，等待同步画布；服务会自动重试保存，无需重新生成"
                                                : detailTask.status === "failed" || detailTask.status === "cancelled"
                                                  ? "正在同步结束状态"
                                                  : "任务结束后自动保存，关闭页面也会继续"
                                    }
                                />
                            ) : null}
                            {detailTask.imageLayerDeliveryStatus ? (
                                <InfoItem
                                    label="图层组回写"
                                    value={
                                        detailTask.imageLayerDeliveryStatus === "pending"
                                            ? detailTask.status === "succeeded"
                                                ? "等待回写；素材已保留，服务会继续核对"
                                                : detailTask.status === "failed" || detailTask.status === "cancelled"
                                                  ? "本次未回写，原图层组保留"
                                                  : "合成完成后会核对并回写原图层组"
                                            : detailTask.imageLayerDeliveryStatus === "detached"
                                              ? "图层已变化，结果作为独立素材保留"
                                              : "已记录回写，当前作品以画布版本为准"
                                    }
                                />
                            ) : null}
                            <InfoItem label="画布名称" value={getTaskCanvasContext(detailTask, canvasById, domainProjectNameById).canvasName} />
                            <InfoItem label="任务类型" value={formatTaskKind(detailTask)} />
                            <InfoItem label="模型" value={formatModelName(effectiveConfig, detailTask)} />
                            {detailTask.status !== "text_replay" ? <InfoItem label="尝试次数" value={`第 ${detailTask.attempts || 1} 次`} /> : null}
                            <InfoItem label="创建时间" value={formatDate(detailTask.createdAt)} />
                            <InfoItem label="开始时间" value={formatDate(detailTask.startedAt)} />
                            <InfoItem label="完成时间" value={formatDate(detailTask.completedAt)} />
                            <InfoItem label="耗时" value={formatTaskDuration(detailTask)} />
                            {detailTask.providerCancelStatus ? <InfoItem label="取消结果" value={providerCancelStatusLabel(detailTask)} /> : null}
                            {detailTask.providerCancelRequestedAt ? <InfoItem label="请求取消时间" value={formatDate(detailTask.providerCancelRequestedAt)} /> : null}
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                            {detailTask.status === "text_replay" ? <Typography.Text type="secondary">这是对话存档，不代表素材生成完成。原始模型执行记录单独保存。</Typography.Text> : null}
                            {detailTask.operation === "cloud_agent" && detailTask.projectId && detailTask.canvasContext?.status === "available" ? (
                                <Button
                                    onClick={() => {
                                        if (detailTask.projectId) navigate(`/canvas/${encodeURIComponent(detailTask.projectId)}?agent=1&agentRun=${encodeURIComponent(detailTask.id)}`);
                                    }}
                                >
                                    查看原对话
                                </Button>
                            ) : null}
                            {detailTask.type === "image_operation" && detailTask.operation !== "layer-workflow" && detailTask.status === "succeeded" && detailTask.projectId ? (
                                <Button
                                    type="primary"
                                    loading={actingId === detailTask.id}
                                    onClick={async () => {
                                        setActingId(detailTask.id);
                                        try {
                                            const adopted = await adoptImageOperationToCanvas(detailTask.id);
                                            message.success(
                                                adopted.historical
                                                    ? "已找到历史回执，保留了画布的后续编辑；本次未重新覆盖"
                                                    : adopted.updated
                                                      ? "合成结果已回写原图层组，请打开画布核对当前版本"
                                                      : adopted.added
                                                        ? "处理结果已添加到原画布"
                                                        : "处理结果已在原画布中",
                                            );
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
                            {canCancelGenerationTask(detailTask) && (
                                <Button danger loading={actingId === detailTask.id} onClick={() => cancelTask(detailTask)}>
                                    取消任务
                                </Button>
                            )}
                            {detailTask.canRecoverMedia ? (
                                <Button icon={<RefreshCw className="size-4" />} loading={actingId === detailTask.id} onClick={() => void runAction(detailTask.id)}>
                                    重试保存
                                </Button>
                            ) : null}
                            {videoReworkEditorURL(detailTask) && <Button onClick={() => navigate(videoReworkEditorURL(detailTask)!)}>返回剪辑修复</Button>}
                            {canQueryProviderTask(detailTask) ? (
                                <Button icon={<RefreshCw className="size-4" />} loading={actingId === detailTask.id} onClick={() => void queryProviderTask(detailTask)}>
                                    手动查询任务
                                </Button>
                            ) : null}
                            {isTaskFailed(detailTask) ? (
                                <Button
                                    icon={<Bug className="size-4" />}
                                    onClick={() => navigate(`/settings?section=diagnostics&taskId=${encodeURIComponent(detailTask.id)}${detailTask.projectId ? `&projectId=${encodeURIComponent(detailTask.projectId)}` : ""}`)}
                                >
                                    导出诊断包
                                </Button>
                            ) : null}
                        </div>
                        {detailTask.error && (detailTask.status !== "cancelled" || detailTask.providerCancelStatus === "uncertain") ? (
                            <pre className="task-detail-error max-h-28 overflow-auto whitespace-pre-wrap px-3 py-2 text-xs">{generationErrorMessage(detailTask.error)}</pre>
                        ) : null}
                        <TaskResultMedia value={detailTask.resultJson} taskType={detailTask.type} />
                        <DetailBlock title="提示词" value={detailLoading ? "详情加载中..." : detailTask.prompt || "无"} tall />
                        <TaskParameters inputJson={detailLoading ? undefined : detailTask.inputJson} />
                        <DetailBlock title="结果" value={detailLoading ? "详情加载中..." : formatTaskJson(detailTask.resultJson)} />
                        <div>
                            <Typography.Text strong>日志</Typography.Text>
                            <div className="mt-2 max-h-60 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                                {logsLoading ? "日志加载中..." : taskLogs.length ? taskLogs.map((log) => `[${new Date(log.createdAt).toLocaleString()}] ${log.level.toUpperCase()} ${formatTaskLog(log)}`).join("\n\n") : "暂无日志"}
                            </div>
                        </div>
                    </div>
                ) : null}
            </Drawer>
            <Modal
                title={<span className="block truncate pr-8">{mediaPreview?.title || "生成结果预览"}</span>}
                open={Boolean(mediaPreview)}
                onCancel={() => setMediaPreview(null)}
                footer={null}
                centered
                width="min(1040px, calc(100vw - 32px))"
                destroyOnHidden
                className="library-modal task-media-preview-modal"
            >
                {mediaPreview ? (
                    <MediaPreview
                        src={mediaPreview.url}
                        kind={mediaPreview.kind}
                        alt={mediaPreview.title}
                        controls={mediaPreview.kind === "video"}
                        className="max-h-[76vh] w-full bg-black object-contain"
                        fallbackClassName="task-media-preview-unavailable"
                    />
                ) : null}
            </Modal>
        </>
    );
}

function canQueryProviderTask(task: GenerationTask) {
    return task.status === "failed" && !task.mediaStage && (task.type.startsWith("canvas_video") || task.type.startsWith("video_")) && Boolean(task.providerRequestId);
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

function TaskResultMedia({ value, taskType }: { value?: string; taskType: string }) {
    const urls = resultMediaUrls(value);
    if (!urls.length) return null;
    return (
        <div>
            <Typography.Text strong>生成结果</Typography.Text>
            <div className="mt-2 grid max-h-[360px] grid-cols-2 gap-2 overflow-auto rounded-lg bg-stone-950 p-2 md:grid-cols-3">
                {urls.map((url, index) => {
                    const isVideo = isVideoResult(url, taskType);
                    return (
                        <MediaPreview
                            key={`${url}-${index}`}
                            src={url}
                            kind={isVideo ? "video" : "image"}
                            alt={`生成结果 ${index + 1}`}
                            controls={isVideo}
                            className={isVideo ? "task-result-media is-video" : "task-result-media"}
                            fallbackClassName={isVideo ? "task-result-media is-video" : "task-result-media"}
                        />
                    );
                })}
            </div>
        </div>
    );
}

function resultMediaUrls(value?: string) {
    if (!value) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        parsed = value;
    }
    const urls: string[] = [];
    const visit = (item: unknown, key = "") => {
        if (typeof item === "string") {
            const isInlineMedia = /^(data:image\/|data:video\/)/.test(item);
            const isMediaPath = /\.(png|jpe?g|webp|gif|avif|mp4|webm|mov)(?:$|\?)/i.test(item);
            const isNamedMediaUrl = /^(https?:|blob:)/.test(item) && /(url|image|video|result|output|media)/i.test(key);
            if ((isInlineMedia || isMediaPath || isNamedMediaUrl) && !urls.includes(item)) urls.push(item);
            return;
        }
        if (Array.isArray(item)) return item.forEach((value) => visit(value, key));
        if (item && typeof item === "object") Object.entries(item).forEach(([field, value]) => visit(value, field));
    };
    visit(parsed);
    return urls.slice(0, 12);
}

function isVideoResult(value: string, taskType: string) {
    return value.startsWith("data:video/") || /\.(mp4|webm|mov)(?:$|\?)/i.test(value) || taskType.includes("video");
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
    if (status === "all") return { title: "还没有任务", description: "新提交的生成会在这里显示状态和实时进度。" };
    if (status === "active") return { title: "没有运行中的任务", description: "新提交的生成会在这里显示排队状态和实时进度。" };
    if (status === "succeeded") return { title: "还没有已完成任务", description: "生成成功后，结果预览和执行记录会保留在这里。" };
    return { title: "没有失败或取消的任务", description: "失败或取消的生成会出现在这里，并提供原因和可用操作。" };
}

function formatDate(value?: string) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function formatTaskDuration(task: GenerationTask) {
    if (!task.createdAt) return "-";
    const start = new Date(task.startedAt || task.createdAt).getTime();
    const end = task.completedAt ? new Date(task.completedAt).getTime() : task.status === "queued" || task.status === "running" ? Date.now() : Number.NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "-";
    const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes ? `${minutes}分 ${seconds}秒` : `${seconds}秒`;
}

function InfoItem({ label, value, wrap = false }: { label: string; value: string; wrap?: boolean }) {
    return (
        <div className="task-detail-fact min-w-0 px-3 py-2">
            <Typography.Text type="secondary" className="block text-xs">
                {label}
            </Typography.Text>
            <Typography.Text className={`block text-sm ${wrap ? "whitespace-pre-wrap break-words" : "truncate"}`} title={value}>
                {value}
            </Typography.Text>
        </div>
    );
}

function DetailBlock({ title, value, tall = false }: { title: string; value: string; tall?: boolean }) {
    return (
        <div>
            <Typography.Text strong>{title}</Typography.Text>
            <pre className={`mt-2 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100 ${tall ? "h-40 whitespace-pre-wrap break-words" : "max-h-60"}`}>{value}</pre>
        </div>
    );
}

function TaskParameters({ inputJson }: { inputJson?: string }) {
    const fields = taskParameterFields(inputJson);
    return (
        <div>
            <Typography.Text strong>参数</Typography.Text>
            {fields.length ? (
                <div className="task-detail-facts mt-2 grid text-sm sm:grid-cols-2">
                    {fields.map((field) => (
                        <InfoItem key={field.label} label={field.label} value={field.value} wrap />
                    ))}
                </div>
            ) : (
                <div className="mt-2 rounded-md bg-foreground/[.04] px-3 py-3 text-sm text-foreground/50">暂无参数记录</div>
            )}
        </div>
    );
}

function taskParameterFields(inputJson?: string) {
    const input = parseTaskInput(inputJson);
    if (!input) return [];
    const config = asRecord(input.config);
    const fields: Array<{ label: string; value: string }> = [];
    const add = (label: string, value: unknown) => {
        const text = formatParameterValue(value);
        if (text) fields.push({ label, value: text });
    };

    add("模式", input.mode);
    add("尺寸 / 比例", config.size);
    add("分辨率", config.vquality || config.quality);
    add("时长", config.videoSeconds === undefined ? undefined : `${config.videoSeconds} 秒`);
    add("生成数量", config.count);
    add("生成声音", booleanParameter(config.videoGenerateAudio));
    add("水印", booleanParameter(config.videoWatermark));
    add("音色", config.audioVoice);
    add("音频格式", config.audioFormat);
    add("音频速度", config.audioSpeed);

    add("参考图片", formatReferenceList(input.referenceImages, "图片"));
    add("参考视频", formatReferenceList(input.referenceVideos, "视频"));
    add("参考音频", formatReferenceList(input.referenceAudios, "音频"));
    add("遮罩图片", formatReferenceList(input.mask ? [input.mask] : [], "遮罩"));
    return fields;
}

function parseTaskInput(value?: string): Record<string, unknown> | null {
    if (!value) return null;
    try {
        const parsed: unknown = JSON.parse(value);
        return asRecord(parsed);
    } catch {
        return null;
    }
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function formatParameterValue(value: unknown) {
    if (value === undefined || value === null || value === "") return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
}

function booleanParameter(value: unknown) {
    if (value === true || value === "true") return "是";
    if (value === false || value === "false") return "否";
    return undefined;
}

function formatReferenceList(value: unknown, kind: string) {
    if (!Array.isArray(value) || !value.length) return "无";
    return value
        .map((item, index) => {
            const reference = asRecord(item);
            const name = typeof reference.name === "string" && reference.name.trim() && !/^https?:|^data:|^blob:/i.test(reference.name) ? reference.name.trim() : `${kind}${index + 1}`;
            const dimensions = typeof reference.width === "number" && typeof reference.height === "number" ? `${reference.width}×${reference.height}` : "";
            const duration = typeof reference.durationMs === "number" && reference.durationMs > 0 ? `${Math.round(reference.durationMs / 100) / 10}s` : "";
            const details = [dimensions, duration].filter(Boolean).join("，");
            return details ? `${name}（${details}）` : name;
        })
        .join("、");
}

function formatTaskJson(value?: string) {
    if (!value) return "无";
    try {
        return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
        return value;
    }
}
