import { useEffect, useState } from "react";
import { App, Button, Pagination } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { AppModal } from "@/components/ui/product/app-modal";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { getActiveUserScope } from "@/lib/user-scope";
import { resourceFileUrl } from "@/services/api/resources";
import { listShotPlans, readShotPlan, readShotPlanSource, restoreShotPlan, type ProjectDetail } from "@/services/api/projects";
import {
    adoptPendingShotPlan,
    discardPendingShotPlan,
    finishShotPlanGeneration,
    pendingShotPlanGenerations,
    pendingShotPlans,
    prepareShotPlanIntent,
    savePendingShotPlan,
    shotPlanAdoptionEvent,
    storeStoryboardPlan,
    type PendingShotPlan,
    type ShotPlanIntent,
} from "./shot-plan-adoption";
import { taskByClientOperation } from "@/services/api/task-center";
import { chapterStoryboardFromGenerationTask } from "./project-chapter-ai";
import { ShotPlanBriefPreview, ShotPlanRevisionPreview } from "./shot-plan-preview";

type RestoreIntent = { scope: string; recordId: string; input: Parameters<typeof restoreShotPlan>[2] };

export function ShotPlanHistory({ detail, unitId, onChanged, disabled }: { detail: ProjectDetail; unitId: string; onChanged: () => void; disabled?: boolean }) {
    const { message } = App.useApp();
    const [open, setOpen] = useState(false),
        [page, setPage] = useState(1),
        [selected, setSelected] = useState("");
    const [intent, setIntent] = useState<RestoreIntent | null>(null),
        [pending, setPending] = useState<PendingShotPlan[]>([]),
        [busy, setBusy] = useState(false),
        [error, setError] = useState("");
    const [generations, setGenerations] = useState<ShotPlanIntent[]>([]);
    const [notices, setNotices] = useState<string[]>([]);
    const [previewPage, setPreviewPage] = useState(1);
    const projectId = detail.project.id,
        scope = getActiveUserScope();
    const key = `shot-plan-restore:${projectId}:${unitId}`;
    const versions = useQuery({ queryKey: ["shot-plans", projectId, unitId, page], queryFn: ({ signal }) => listShotPlans(projectId, unitId, page, signal), enabled: open });
    const preview = useQuery({ queryKey: ["shot-plan", projectId, selected, previewPage], queryFn: ({ signal }) => readShotPlan(projectId, selected, signal, previewPage), enabled: open && Boolean(selected) });
    useEffect(() => {
        let active = true;
        const load = () =>
            Promise.all([pendingShotPlans(projectId, unitId), pendingShotPlanGenerations(projectId, unitId)])
                .then(([plans, generations]) => {
                    if (active) {
                        setPending(plans);
                        setGenerations(generations);
                    }
                })
                .catch((value) => {
                    if (active) setError(String(value));
                });
        void load();
        window.addEventListener(shotPlanAdoptionEvent, load);
        void Promise.resolve(localForageStorageForScope(scope).getItem(key))
            .then((raw) => {
                if (!active) return;
                const value = raw ? (JSON.parse(raw) as RestoreIntent) : null;
                if (value && value.scope !== scope) throw new Error("恢复记录账号不匹配");
                setIntent(value);
            })
            .catch((value) => {
                if (active) setError(String(value));
            });
        return () => {
            active = false;
            window.removeEventListener(shotPlanAdoptionEvent, load);
        };
    }, [projectId, unitId, scope, key]);
    async function checkRestore() {
        if (!preview.data) return;
        setBusy(true);
        setError("");
        try {
            const current = await readShotPlanSource(projectId, unitId);
            if (getActiveUserScope() !== scope) throw new Error("账号已切换，请重新打开方案历史");
            const next: RestoreIntent = {
                scope,
                recordId: selected,
                input: { requestId: crypto.randomUUID(), sourceSha256: preview.data.record.payloadSha256, expectedShotIds: current.snapshot.entries.map((value) => value.shotId), expectedSourceSha256: current.sha256 },
            };
            await localForageStorageForScope(scope).setItem(key, JSON.stringify(next));
            setIntent(next);
        } catch (value) {
            setError(value instanceof Error ? value.message : String(value));
        } finally {
            setBusy(false);
        }
    }
    async function applyRestore() {
        if (!intent || busy) return;
        setBusy(true);
        setError("");
        try {
            if (getActiveUserScope() !== intent.scope) throw new Error("账号已切换，请回到原账号继续");
            const result = await restoreShotPlan(projectId, intent.recordId, intent.input);
            if (getActiveUserScope() !== intent.scope) throw new Error("账号已切换，请回到原账号核对结果");
            await localForageStorageForScope(scope).removeItem(key);
            setIntent(null);
            onChanged();
            await versions.refetch();
            if (result.current) message.success("历史分镜方案已恢复，当前方案也已保留为历史");
            else message.info("原恢复请求已完成，当前已有后续修改，本次保留后续方案");
            setNotices(result.warnings || []);
        } catch (value) {
            setError(value instanceof Error ? value.message : String(value));
        } finally {
            setBusy(false);
        }
    }
    async function applyPending(value: PendingShotPlan, reconfirm = false) {
        if (busy) return;
        setBusy(true);
        setError("");
        try {
            let next = value;
            if (reconfirm) {
                const source = await prepareShotPlanIntent(detail, unitId);
                next = { ...value, intent: { ...source, assetVersions: value.intent.assetVersions, assetLabels: value.intent.assetLabels } };
                await savePendingShotPlan(next);
            }
            const result = await adoptPendingShotPlan(next);
            onChanged();
            await versions.refetch();
            if (result.current) {
                if (reconfirm) await discardPendingShotPlan(value);
                message.success("已采用保存的分镜草稿");
            } else setError("这次操作已经完成，之后又有新的修改。如仍要采用，请核对后点击“采用到当前方案”。");
        } catch (value) {
            setError(value instanceof Error ? value.message : String(value));
        } finally {
            setBusy(false);
        }
    }
    async function reconcileGeneration(intent: ShotPlanIntent) {
        if (busy) return;
        setBusy(true);
        setError("");
        try {
            const task = await taskByClientOperation(`chapter-plan:${intent.requestId}`);
            if (task.status === "failed" || task.status === "cancelled") {
                await finishShotPlanGeneration(intent);
                setError("原任务已停止，可核对任务详情后再次生成。");
                return;
            }
            if (task.status !== "succeeded") {
                setError(`原任务仍在${task.status === "queued" ? "排队" : "运行"}，进度 ${task.progress || 0}%。可稍后再核对。`);
                return;
            }
            const result = await storeStoryboardPlan(intent, chapterStoryboardFromGenerationTask(task).rows, detail, task.id);
            onChanged();
            await versions.refetch();
            if (result.current) message.success("已采用原任务结果，没有重复调用模型");
            else setError("原任务已完成，当前方案已有后续修改。草稿已保留，请重新核对采用。");
        } catch (value) {
            setError(value instanceof Error ? value.message : String(value));
        } finally {
            setBusy(false);
        }
    }
    return (
        <>
            <Button size="small" disabled={disabled} onClick={() => setOpen(true)}>
                方案历史{pending.length || generations.length ? ` · ${pending.length + generations.length} 份待核对` : ""}
            </Button>
            <AppModal
                title="分镜方案历史"
                open={open}
                width={920}
                footer={null}
                onCancel={() => {
                    if (!busy) setOpen(false);
                }}
            >
                <div className="max-h-[70dvh] space-y-4 overflow-y-auto pr-1">
                    <p className="text-sm text-foreground/60">重新拆分、移除镜头或恢复方案前，系统会保存完整的镜头、脚本、固定素材与候选选择。历史恢复沿用原文件。</p>
                    {error && (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    )}
                    {notices.map((notice, index) => (
                        <p role="status" key={index} className="text-sm text-foreground/65">
                            {notice}
                        </p>
                    ))}
                    {generations.map((value) => (
                        <section key={value.requestId} className="rounded-lg border border-border p-3 text-sm">
                            <p>上次分镜生成请求尚待核对</p>
                            <p className="mt-1 text-xs text-foreground/50">关闭页面或丢失响应后，先查询原任务。不会在这里重新提交模型。</p>
                            <Button size="small" className="mt-2" loading={busy} onClick={() => void reconcileGeneration(value)}>
                                查询原任务并恢复结果
                            </Button>
                        </section>
                    ))}
                    {pending.map((value) => (
                        <section key={value.intent.requestId} className="rounded-lg border border-border p-3 text-sm">
                            <p>待采用分镜草稿 · {value.shots.length} 个镜头</p>
                            {value.warnings?.map((warning) => (
                                <p key={warning} className="mt-2 text-xs text-foreground/60">
                                    {warning}
                                </p>
                            ))}
                            <details className="mt-2">
                                <summary className="cursor-pointer">核对草稿内容</summary>
                                <div className="max-h-64 space-y-2 overflow-auto py-2">
                                    {value.shots.map((shot, index) => (
                                        <div key={index}>
                                            <strong>
                                                {shot.title} · {shot.durationMs / 1000} 秒
                                            </strong>
                                            <p className="whitespace-pre-wrap">{shot.description}</p>
                                            {shot.revision.dialogue && <p>对白：{shot.revision.dialogue}</p>}
                                            <p className="text-xs text-foreground/50">固定素材参考：{shot.assetVersionIds.length} 个</p>
                                        </div>
                                    ))}
                                </div>
                            </details>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <Button size="small" disabled={busy || !value.shots.length} onClick={() => void applyPending(value)}>
                                    核对原采用请求
                                </Button>
                                <Button size="small" disabled={busy || !value.shots.length || detail.project.status !== "active"} onClick={() => void applyPending(value, true)}>
                                    采用到当前方案
                                </Button>
                                <Button size="small" disabled={busy} onClick={() => void discardPendingShotPlan(value).catch((value) => setError(String(value)))}>
                                    移除本地草稿
                                </Button>
                            </div>
                            <p className="mt-2 text-xs text-foreground/50">采用到当前方案会保留现有分镜为历史，不重新运行模型。</p>
                        </section>
                    ))}
                    {intent && (
                        <section className="rounded-lg border border-border p-3 text-sm">
                            <p>
                                已确认恢复范围：替换 {intent.input.expectedShotIds.length} 个当前镜头，恢复 {versions.data?.versions.find((value) => value.id === intent.recordId)?.shotCount ?? "历史"} 个镜头。当前方案会先保存为历史。
                            </p>
                            <div className="mt-2 flex gap-2">
                                <Button type="primary" disabled={busy || detail.project.status !== "active"} loading={busy} onClick={() => void applyRestore()}>
                                    确认恢复 / 核对原请求
                                </Button>
                                <Button
                                    disabled={busy}
                                    onClick={() => {
                                        void Promise.resolve(localForageStorageForScope(scope).removeItem(key))
                                            .then(() => setIntent(null))
                                            .catch((value) => setError(String(value)));
                                    }}
                                >
                                    暂不恢复
                                </Button>
                            </div>
                            <p className="mt-2 text-xs text-foreground/50">章节正文、创作目标和已保存剪辑保持各自的版本。恢复后请核对它们与镜头的关系。</p>
                        </section>
                    )}
                    {versions.isError ? (
                        <p role="alert">{versions.error.message}</p>
                    ) : versions.isLoading ? (
                        <p>正在读取历史…</p>
                    ) : !versions.data?.total ? (
                        <p>尚无历史方案。首次重新拆分或移除镜头时会自动保存。</p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {versions.data.versions.map((value) => (
                                <Button
                                    key={value.id}
                                    className="h-auto min-h-9 whitespace-normal text-left"
                                    aria-pressed={selected === value.id}
                                    onClick={() => {
                                        setSelected(value.id);
                                        setPreviewPage(1);
                                    }}
                                >
                                    {value.title} · {value.shotCount} 个镜头 · {new Date(value.createdAt).toLocaleString()}
                                </Button>
                            ))}
                            <Pagination size="small" current={page} total={versions.data.total} pageSize={20} showSizeChanger={false} onChange={setPage} />
                        </div>
                    )}
                    {preview.isError && <p role="alert">{preview.error.message}</p>}
                    {preview.data && (
                        <section className="space-y-3 border-t border-border pt-3">
                            <h3>方案预览 · {preview.data.record.shotCount} 个镜头</h3>
                            <ShotPlanBriefPreview raw={preview.data.snapshot.projectBriefJson} description={preview.data.snapshot.projectDescription} />
                            <Link className="inline-block text-sm underline" to={`/production/${encodeURIComponent(projectId)}/settings?sourcePlan=${encodeURIComponent(selected)}`}>
                                到项目设置核对采用此目标
                            </Link>
                            {preview.data.snapshot.entries.slice((preview.data.page - 1) * preview.data.pageSize, preview.data.page * preview.data.pageSize).map((entry) => {
                                const revision = preview.data.revisions.find((value) => value.id === entry.revisionId),
                                    media = preview.data.snapshot.selections.find((value) => value.shotId === entry.shotId);
                                return (
                                    <div key={entry.shotId} className="rounded-lg border border-border p-3 text-sm">
                                        <strong>
                                            {entry.title} · {entry.durationMs / 1000} 秒
                                        </strong>
                                        <p className="mt-1 whitespace-pre-wrap">{revision?.plotDescription}</p>
                                        {revision?.dialogue && <p>对白：{revision.dialogue}</p>}
                                        <ShotPlanRevisionPreview revision={revision} />
                                        {media?.resourceId && (
                                            <a href={resourceFileUrl(media.resourceId)} target="_blank" rel="noreferrer">
                                                查看固定候选
                                            </a>
                                        )}
                                    </div>
                                );
                            })}
                            <Pagination size="small" current={previewPage} total={preview.data.record.shotCount} pageSize={preview.data.pageSize} showSizeChanger={false} onChange={setPreviewPage} />
                            <Button disabled={busy || detail.project.status !== "active"} onClick={() => void checkRestore()}>
                                核对并准备恢复此方案
                            </Button>
                        </section>
                    )}
                </div>
            </AppModal>
        </>
    );
}
