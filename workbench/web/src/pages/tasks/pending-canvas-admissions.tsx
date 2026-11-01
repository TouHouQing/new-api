import { App, Button } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { getActiveUserScope } from "@/lib/user-scope";
import { admissionTasks, canvasAdmissionChanged, createCanvasAdmissionJournal, type CanvasAdmissionBatch, type CanvasAdmissionRecord } from "@/services/canvas-admission-journal";
import { createCanvasGenerationBatch, createGenerationTask, taskByClientOperation, type CreateTaskInput } from "@/services/api/task-center";
import { ApiError } from "@/services/api/request";
import { backendProviderConfig } from "@/services/api/generation-task";
import { resolveModelRequestConfig, useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export function PendingCanvasAdmissions({ onRecovered }: { onRecovered: () => void }) {
    const scope = useUserStore((state) => state.user?.id || "guest"),
        config = useEffectiveConfig(),
        { message } = App.useApp();
    const journal = useMemo(() => createCanvasAdmissionJournal(localForageStorageForScope(scope), scope, getActiveUserScope), [scope]);
    const [records, setRecords] = useState<CanvasAdmissionRecord[]>([]),
        [error, setError] = useState(""),
        [busy, setBusy] = useState<{ key: string; action: "query" | "resume" } | null>(null);
    const load = useCallback(async () => {
        if (scope === "guest") return;
        try {
            const records = await journal.list();
            if (getActiveUserScope() === scope) {
                setRecords(records);
                setError("");
            }
        } catch (error) {
            if (getActiveUserScope() === scope) setError(error instanceof Error ? error.message : "无法读取原生成提交");
        }
    }, [journal, scope]);
    useEffect(() => {
        void load();
        const refresh = () => void load();
        window.addEventListener(canvasAdmissionChanged, refresh);
        return () => window.removeEventListener(canvasAdmissionChanged, refresh);
    }, [load]);
    const credentialsFor = (task: CreateTaskInput) => {
        const mode = task.input?.mode;
        if (mode !== "image" && mode !== "video" && mode !== "audio" && mode !== "text") throw new Error("原生成模式无法读取，尚未提交");
        const model = task.model || "",
            workflow = (task.input?.execution as { provider?: string } | undefined)?.provider;
        const current = { ...config, model, ...(workflow === "runninghub" ? { taskWorkflowProvider: "runninghub" as const } : {}) };
        return { ...resolveModelRequestConfig(current, model), ...backendProviderConfig(current, mode) } as Record<string, unknown>;
    };
    const recover = async (record: CanvasAdmissionRecord, retry: boolean) => {
        setBusy({ key: record.key, action: retry ? "resume" : "query" });
        try {
            const found = await Promise.all(
                record.operationIds.map(async (id) => {
                    try {
                        return await taskByClientOperation(id);
                    } catch (error) {
                        if (error instanceof ApiError && error.status === 404) return null;
                        throw error;
                    }
                }),
            );
            const tasks = found.filter((task) => task !== null);
            if (tasks.length === record.operationIds.length) {
                journal.verifyAccepted(record, tasks);
                await journal.clear(record);
                onRecovered();
                message.success("已找到原任务，继续跟踪已有结果");
            } else if (tasks.length) throw new Error("已找到部分原任务，请先核对已有记录，暂不重复提交整个批次");
            else if (!retry) message.info("暂未找到原任务，可选择继续原提交；会沿用原编号和参数");
            else {
                const request = await journal.replay(record, credentialsFor);
                if (record.kind === "batch") await createCanvasGenerationBatch(request as CanvasAdmissionBatch);
                else await createGenerationTask(request as CreateTaskInput);
                onRecovered();
                message.success("原提交已确认，关闭页面后任务也会继续");
            }
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "原提交尚未确认，请保留记录后再试");
        } finally {
            setBusy(null);
        }
    };
    const visibleRecords = records.filter((record) => record.scope === scope);
    if (scope === "guest") return null;
    if (!visibleRecords.length && !error) return null;
    return (
        <section aria-label="待确认的生成提交" className="mt-4 space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="text-sm font-medium">有生成提交等待确认</div>
            <p className="text-xs text-muted-foreground">先查询原任务；未找到时可继续原提交，保留原编号和参数。</p>
            {error ? (
                <p role="alert" className="text-sm text-muted-foreground">
                    {error}
                </p>
            ) : null}
            {visibleRecords.map((record) => (
                <div key={record.key} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{admissionTasks(record.kind, record.request)[0]?.prompt.slice(0, 80) || "生成任务"}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            {record.operationIds.length} 个任务 · {new Date(record.createdAt).toLocaleString()}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button size="small" aria-label="查询原任务" loading={busy?.key === record.key && busy.action === "query"} disabled={Boolean(busy)} onClick={() => void recover(record, false)}>
                            查询原任务
                        </Button>
                        <Button size="small" aria-label="继续原提交" loading={busy?.key === record.key && busy.action === "resume"} disabled={Boolean(busy)} onClick={() => void recover(record, true)}>
                            继续原提交
                        </Button>
                    </div>
                </div>
            ))}
        </section>
    );
}
