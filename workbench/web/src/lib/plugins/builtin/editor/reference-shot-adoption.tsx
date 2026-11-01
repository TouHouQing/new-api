import { useEffect, useRef, useState } from "react";
import { Alert, Button, Input, Space, Spin } from "antd";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/services/api/request";
import { getProjectCore } from "@/services/api/projects";
import { previewReferenceShots, applyReferenceShots, readReferenceAdoption, type MediaAnalysisView, type ReferenceShotPreview, type ReferenceShotRequest, type ReferenceShotResult } from "@/services/api/project-media-analysis";

export function ReferenceShotAdoption({ projectId, view, disabled, onBusy, onDraftDirty }: { projectId: string; view: MediaAnalysisView; disabled: boolean; onBusy: (busy: boolean) => void; onDraftDirty: (dirty: boolean) => void }) {
    const alive = useRef(true),
        submitting = useRef(false),
        queryClient = useQueryClient();
    const requestId = `reference-ui-${view.analysis.id}-${view.currentVersion.id}`;
    const [checking, setChecking] = useState(true),
        [error, setError] = useState("");
    const initialTitle = Array.from(`参考分镜 · ${view.analysis.title}`).slice(0, 240).join("");
    const [title, setTitle] = useState(initialTitle);
    const [preview, setPreview] = useState<{ input: ReferenceShotRequest; plan: ReferenceShotPreview } | null>(null);
    const [result, setResult] = useState<ReferenceShotResult | null>(null);
    useEffect(() => {
        onDraftDirty(!result && (title !== initialTitle || preview !== null));
        return () => onDraftDirty(false);
    }, [title, initialTitle, preview, result, onDraftDirty]);
    useEffect(() => {
        alive.current = true;
        const controller = new AbortController();
        readReferenceAdoption(projectId, requestId, controller.signal)
            .then((value) => {
                if (alive.current) setResult(value);
            })
            .catch((failure) => {
                if (alive.current && !controller.signal.aborted && !(failure instanceof ApiError && failure.status === 404)) setError(failure instanceof Error ? failure.message : "采用回执读取失败");
            })
            .finally(() => {
                if (alive.current) setChecking(false);
            });
        return () => {
            alive.current = false;
            controller.abort();
        };
    }, [projectId, requestId]);
    async function plan() {
        if (disabled || submitting.current || checking || result) return;
        submitting.current = true;
        onBusy(true);
        setError("");
        try {
            const core = await getProjectCore(projectId);
            const input: ReferenceShotRequest = {
                requestId,
                analysisRevisionId: view.currentVersion.id,
                expectedProjectRevision: core.project.revision,
                title,
                sectionIds: view.document.sections.filter((section) => section.approved).map((section) => section.id),
            };
            const value = await previewReferenceShots(projectId, view.analysis.id, input);
            if (alive.current) setPreview({ input, plan: value });
        } catch (failure) {
            if (alive.current) setError(failure instanceof Error ? failure.message : "分镜预览失败");
        } finally {
            if (alive.current) onBusy(false);
            submitting.current = false;
        }
    }
    async function apply() {
        if (disabled || submitting.current || !preview || result) return;
        submitting.current = true;
        onBusy(true);
        setError("");
        try {
            let value: ReferenceShotResult;
            try {
                value = await applyReferenceShots(projectId, view.analysis.id, { ...preview.input, previewToken: preview.plan.previewToken });
            } catch (failure) {
                // A committed chapter can be recovered independently of the
                // browser plan, including after reload and later project edits.
                try {
                    value = await readReferenceAdoption(projectId, requestId);
                } catch {
                    throw failure;
                }
            }
            if (alive.current) {
                setResult(value);
                setPreview(null);
                void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
            }
        } catch (failure) {
            if (alive.current) setError(failure instanceof Error ? failure.message : "采用结果未确认，请保留原方案重试");
        } finally {
            if (alive.current) onBusy(false);
            submitting.current = false;
        }
    }
    const approved = view.document.sections.filter((section) => section.approved).length;
    return (
        <section className="mt-4 border-t border-border pt-3" aria-label="参考分镜规划">
            <strong className="text-sm">把参考分段用于新作品</strong>
            <p className="my-2 text-xs">将已核对的分段规划为一个新章节，再填写画面描述、角色和运镜。共 {approved} 个已核对分段。</p>
            {checking && <Spin size="small" />}
            {error && <Alert className="my-2" type="error" title={error} />}
            {result ? (
                result.unitDeleted ? (
                    <Alert type="info" title="这个分析版本曾规划的章节已删除。原采用回执保留，刷新或重试不会重新建稿。" />
                ) : (
                    <>
                        <p className="my-2 text-sm">
                            已规划「{result.plan.title}」· {result.plan.shots.length} 个镜头{result.missingShotIds.length ? ` · 后续已删除 ${result.missingShotIds.length} 个` : ""}
                        </p>
                        <Link to={`/projects/${encodeURIComponent(projectId)}/workflow/${encodeURIComponent(result.plan.unitId)}/storyboard`}>打开分镜章节</Link>
                    </>
                )
            ) : (
                <>
                    <label className="block text-sm">
                        新章节名称
                        <Input
                            aria-label="参考分镜章节名称"
                            value={title}
                            maxLength={240}
                            disabled={disabled || checking}
                            onChange={(event) => {
                                setTitle(event.target.value);
                                setPreview(null);
                            }}
                        />
                    </label>
                    <Button className="mt-2" disabled={disabled || checking || approved === 0 || approved > 200 || !title.trim()} onClick={() => void plan()}>
                        预览规划为分镜
                    </Button>
                    {preview && (
                        <div className="mt-3">
                            <p className="text-sm">
                                新建「{preview.plan.title}」· {preview.plan.shots.length} 个镜头
                            </p>
                            <ul className="my-2 max-h-40 list-inside list-disc break-words overflow-y-auto text-xs">
                                {preview.plan.shots.map((shot) => (
                                    <li key={shot.shotId}>
                                        {shot.title} · 原片 {(shot.startMs / 1000).toFixed(2)}–{(shot.endMs / 1000).toFixed(2)} 秒
                                    </li>
                                ))}
                            </ul>
                            {preview.plan.warnings.map((warning) => (
                                <p key={warning} className="my-2 text-xs">
                                    {warning}
                                </p>
                            ))}
                            <Space wrap>
                                <Button type="primary" disabled={disabled} onClick={() => void apply()}>
                                    确认新建分镜章节
                                </Button>
                                <Button disabled={disabled} onClick={() => setPreview(null)}>
                                    返回调整
                                </Button>
                            </Space>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
