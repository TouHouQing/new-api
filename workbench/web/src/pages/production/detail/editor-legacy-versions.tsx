import { useEffect, useRef, useState } from "react";
import { Button, Checkbox } from "antd";
import { useEditorHostContext } from "@/components/editor/editor-context";
import { getProjectCore } from "@/services/api/projects";
import { getProjectCut, type ProjectCutView } from "@/services/api/project-cuts";
import { applyLegacyVersion, previewLegacyVersion, readLegacyVersions, type LegacyVersionPage, type LegacyVersionPreview, type LegacyVersionRequest } from "@/services/api/production-import";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";
import { getActiveUserScope } from "@/lib/user-scope";
import { legacyImportFieldLabel } from "@/lib/legacy-import-fields";

type Props = {
    disabled: boolean;
    onBusyChange: (value: boolean) => void;
    onDirtyChange: (value: boolean) => void;
    onConverted: (view: ProjectCutView) => Promise<void>;
};

export function EditorLegacyVersions({ disabled, onBusyChange, onDirtyChange, onConverted }: Props) {
    const host = useEditorHostContext();
    const scope = getActiveUserScope(),
        owner = `${scope}:${host.projectId}`;
    const [page, setPage] = useState<LegacyVersionPage>();
    const [busy, setBusy] = useState(false),
        [error, setError] = useState("");
    const [plan, setPlan] = useState<LegacyVersionPreview>(),
        [acknowledged, setAcknowledged] = useState(false);
    const intent = useRef<LegacyVersionRequest | null>(null);
    const mounted = useRef(true);
    const activeOwner = useRef(owner);
    activeOwner.current = owner;
    const current = () => mounted.current && activeOwner.current === owner && getActiveUserScope() === scope;
    useEffect(() => {
        mounted.current = true;
        setPage(undefined);
        setPlan(undefined);
        setError("");
        intent.current = null;
        onDirtyChange(false);
        return () => {
            mounted.current = false;
            onBusyChange(false);
            onDirtyChange(false);
        };
    }, [owner, onBusyChange, onDirtyChange]);
    const start = () => {
        setBusy(true);
        onBusyChange(true);
        setError("");
    };
    const finish = () => {
        if (current()) {
            setBusy(false);
            onBusyChange(false);
        }
    };
    const list = async (next = false) => {
        const result = await readLegacyVersions(host.projectId, next ? page?.nextCursor || 0 : 0, next ? page?.sourceSha256 : undefined);
        if (current()) setPage((previous) => (next && previous ? { ...result, versions: [...previous.versions, ...result.versions] } : result));
        return result;
    };
    const load = async (next = false) => {
        start();
        try {
            await list(next);
        } catch (cause) {
            if (current()) setError(cause instanceof Error ? cause.message : "读取旧版本失败");
        } finally {
            finish();
        }
    };
    const inspect = async (sourceId: string) => {
        const revision = host.getTimelineRevision?.();
        if (revision == null || !page) return;
        start();
        try {
            const core = await getProjectCore(host.projectId);
            const input = { sourceId, sourceSha256: page.sourceSha256, expectedProjectRevision: core.project.revision, expectedTimelineRevision: revision };
            const preview = await previewLegacyVersion(host.projectId, input);
            if (current()) {
                intent.current = { ...input, previewToken: preview.previewToken };
                setPlan(preview);
                setAcknowledged(false);
                onDirtyChange(true);
            }
        } catch (cause) {
            if (current()) setError(cause instanceof Error ? cause.message : "预览失败，原工程已保留");
        } finally {
            finish();
        }
    };
    const convert = async () => {
        if (!intent.current || !plan) return;
        const input = { ...intent.current, ...(acknowledged ? { acceptPreservedFields: plan.preservedOnly } : {}) };
        start();
        try {
            // Deterministic source identity makes recovery safe even when the
            // first successful reply was lost or the window was reopened.
            let view: ProjectCutView;
            try {
                view = await applyLegacyVersion(host.projectId, input);
            } catch (cause) {
                try {
                    view = await getProjectCut(host.projectId, plan.cutId);
                } catch {
                    throw cause;
                }
            }
            if (view.cut.id !== plan.cutId || view.cut.timelineSha256 !== plan.summary.sha256 || view.metadata?.sourceSha256 !== input.sourceSha256 || (view.metadata?.sourceVersion as { id?: string } | undefined)?.id !== input.sourceId)
                throw new Error("转换回执与已确认版本不匹配，请保留原始档案并核对");
            if (!current()) return;
            intent.current = null;
            setPlan(undefined);
            onDirtyChange(false);
            await onConverted(view);
            await list();
        } catch (cause) {
            if (current()) setError(cause instanceof Error ? cause.message : "结果尚未确认，可按原预览重试");
        } finally {
            finish();
        }
    };
    const choose = async (id: string) => {
        start();
        try {
            const view = await getProjectCut(host.projectId, id);
            if (current()) await onConverted(view);
        } catch (cause) {
            if (current()) setError(cause instanceof Error ? cause.message : "读取转换版本失败");
        } finally {
            finish();
        }
    };
    return (
        <details className="flex flex-col gap-2" aria-label="旧工程剧集与区域版">
            <summary className="cursor-pointer">旧工程的剧集与区域版本</summary>
            <p className="mt-2">选择一个旧版，检查它固定的原片、字幕和声音，再转换为可编辑剪辑。原始档案与当前工作剪辑均保留。</p>
            {!page && (
                <Button className="mt-2" aria-label="读取旧工程区域版本" loading={busy} disabled={disabled || busy} onClick={() => void load()}>
                    读取旧工程区域版本
                </Button>
            )}
            {page && (
                <div className="mt-2 flex flex-col gap-2">
                    {!page.versions.length && <p>此工程没有保存的区域版本。</p>}
                    {page.versions.map((source) => (
                        <div key={source.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2">
                            <div>
                                <strong>{source.title}</strong>
                                <p className="text-xs text-muted-foreground">
                                    {source.episode || "原集数已移除"} · {source.language || "未标记语言"}
                                    {source.region ? ` · ${source.region}` : ""} · {source.occurrences} 段画面
                                </p>
                            </div>
                            <Button disabled={disabled || busy || !!plan} onClick={() => (source.cut ? void choose(source.cut.id) : void inspect(source.id))}>
                                {source.cut ? "查看已转换版本" : `检查并转换“${source.title}”`}
                            </Button>
                            {source.requiresUpgrade && (
                                <Button disabled={disabled || busy || !!plan} onClick={() => void inspect(source.id)}>
                                    更新为可编辑版本
                                </Button>
                            )}
                            {source.hasReframes && <p className="basis-full text-xs text-muted-foreground">此版包含跟随构图。转换会固定原工程指定的校正版本，后续分析修改可另行预览采用。</p>}
                            {source.hasAttachedAudio && <p className="basis-full text-xs text-muted-foreground">此版的声音跟随具体镜头。更新后可继续移动、拆分和变速，并保留各自的声音来源。</p>}
                        </div>
                    ))}
                    {!!page.nextCursor && (
                        <Button disabled={disabled || busy || !!plan} onClick={() => void load(true)}>
                            加载更多旧工程区域版本
                        </Button>
                    )}
                </div>
            )}
            {plan && (
                <section aria-label="旧区域版转换预览" className="mt-3 flex flex-col gap-2">
                    <strong>{plan.source.title}</strong>
                    <p>
                        {plan.summary.clips} 个片段 · {plan.summary.tracks} 条轨道 · {formatTimelineTime(plan.summary.durationMs)}
                    </p>
                    <p>
                        固定原版字幕与声音。{plan.output.width}×{plan.output.height} · {plan.output.fps}帧/秒。
                    </p>
                    {plan.warnings.map((warning, index) => (
                        <p key={index}>{warning}</p>
                    ))}
                    {!!plan.preservedOnly.length && (
                        <>
                            <p role="alert">下列设置仍仅保存在原始档案中；此版本完成这些编辑后才能直接导出。</p>
                            <ul className="list-inside list-disc">
                                {plan.preservedOnly.map((field) => (
                                    <li key={field} title={field}>
                                        {legacyImportFieldLabel(field)}
                                    </li>
                                ))}
                            </ul>
                            <Checkbox checked={acknowledged} disabled={disabled || busy} onChange={(event) => setAcknowledged(event.target.checked)}>
                                已核对上述设置，先转换其余可编辑内容
                            </Checkbox>
                        </>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <Button type="primary" aria-label="确认转换此区域版本" loading={busy} disabled={disabled || busy || (!!plan.preservedOnly.length && !acknowledged)} onClick={() => void convert()}>
                            确认转换此区域版本
                        </Button>
                        <Button
                            disabled={disabled || busy}
                            onClick={() => {
                                intent.current = null;
                                setPlan(undefined);
                                onDirtyChange(false);
                            }}
                        >
                            返回选择旧版
                        </Button>
                    </div>
                </section>
            )}
            {error && (
                <p role="alert" className="mt-2">
                    {error}
                </p>
            )}
        </details>
    );
}
