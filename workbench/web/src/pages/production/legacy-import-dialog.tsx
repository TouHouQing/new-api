import { useEffect, useRef, useState } from "react";
import { Button, Input, Spin } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { AppModal } from "@/components/ui/product/app-modal";
import { legacyImportFieldLabel, legacyNativeSummary } from "@/lib/legacy-import-fields";
import { importLegacyProject, inspectLegacyProject, type LegacyProjectImportResult, type LegacyProjectInspection } from "@/services/api/production-import";

const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;

export function LegacyImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [file, setFile] = useState<File>();
    const [inspection, setInspection] = useState<LegacyProjectInspection>();
    const [result, setResult] = useState<LegacyProjectImportResult>();
    const [name, setName] = useState("");
    const [error, setError] = useState("");
    const [checking, setChecking] = useState(false);
    const [importing, setImporting] = useState(false);
    const pendingCheck = useRef<AbortController | null>(null);
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    useEffect(() => () => pendingCheck.current?.abort(), []);
    useEffect(() => {
        if (open) return;
        pendingCheck.current?.abort();
        setFile(undefined);
        setInspection(undefined);
        setResult(undefined);
        setError("");
        setName("");
        setChecking(false);
    }, [open]);

    const selectFile = (selected?: File) => {
        pendingCheck.current?.abort();
        setChecking(false);
        setInspection(undefined);
        setResult(undefined);
        setError("");
        setFile(selected);
        if (selected && (selected.size === 0 || selected.size > MAX_ARCHIVE_BYTES)) setError("请选择不超过 1 GB 的完整工程 ZIP 包");
    };
    const inspect = async () => {
        if (!file || file.size === 0 || file.size > MAX_ARCHIVE_BYTES || checking) return;
        const controller = new AbortController();
        pendingCheck.current?.abort();
        pendingCheck.current = controller;
        setChecking(true);
        setError("");
        try {
            const data = await inspectLegacyProject(file, controller.signal);
            if (controller.signal.aborted) return;
            setInspection(data);
            setName(`${data.title}（导入）`.slice(0, 200));
        } catch (cause) {
            if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "工程检查失败，请重试");
        } finally {
            if (!controller.signal.aborted) setChecking(false);
        }
    };
    const importProject = async () => {
        if (!file || !inspection?.readyForMigration || !name.trim() || importing) return;
        setImporting(true);
        setError("");
        try {
            const imported = await importLegacyProject(file, inspection.sourceFingerprint, name.trim());
            setResult(imported);
            await queryClient.invalidateQueries({ queryKey: ["projects"] });
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "导入失败，可保留当前文件重试");
        } finally {
            setImporting(false);
        }
    };

    return (
        <AppModal open={open} title="导入原平台工程" onCancel={onClose} footer={null} closable={!importing} maskClosable={!importing} keyboard={!importing} width={640}>
            <div className="flex flex-col gap-4">
                {result ? (
                    <>
                        <p role="status">
                            {result.reused ? "已找到此前导入的项目" : "项目已导入"}：{result.report.nodes} 个节点、{result.report.takes} 个候选版本、{result.report.resources} 份素材。
                        </p>
                        {!!result.report.nativeFields?.length && <p>可继续编辑：{legacyNativeSummary(result.report)}。</p>}
                        {result.report.preservedOnly.length > 0 && (
                            <details>
                                <summary>部分高级设定暂不能继续编辑，原始快照已保留</summary>
                                <ul>
                                    {result.report.preservedOnly.map((path) => (
                                        <li key={path} title={path}>
                                            {legacyImportFieldLabel(path)}
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        )}
                        {result.report.warnings.length > 0 && (
                            <ul role="status">
                                {result.report.warnings.map((warning, index) => (
                                    <li key={index}>{warning}</li>
                                ))}
                            </ul>
                        )}
                        <div className="flex justify-end gap-2">
                            <Button
                                onClick={() => {
                                    onClose();
                                    navigate(`/canvas/${result.receipt.canvasId}`);
                                }}
                            >
                                打开画布
                            </Button>
                            <Button
                                onClick={() => {
                                    onClose();
                                    navigate(`/production/${result.receipt.projectId}/editor`);
                                }}
                            >
                                剪辑字幕与声音
                            </Button>
                            <Button
                                type="primary"
                                onClick={() => {
                                    onClose();
                                    navigate(`/production/${result.receipt.projectId}/overview`);
                                }}
                            >
                                继续制作
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <p>选择原平台导出的完整工程 ZIP 包，带入镜头、素材和候选版本。导入不会重新生成素材。</p>
                        <label className="flex flex-col gap-2">
                            <span>工程文件（最大 1 GB）</span>
                            <input key={open ? "open" : "closed"} type="file" accept=".zip,application/zip" disabled={checking || importing} onChange={(event) => selectFile(event.target.files?.[0])} />
                        </label>
                        {checking && (
                            <div role="status">
                                <Spin size="small" /> 正在检查工程和全部素材…
                            </div>
                        )}
                        {inspection && (
                            <>
                                <p>
                                    {inspection.nodeCount} 个节点 · {inspection.takeCount} 个候选版本 · {inspection.resources.length} 份素材
                                </p>
                                {!inspection.readyForMigration ? (
                                    <p role="alert">缺少 {inspection.missingMediaIds.length} 份素材，无法完整导入。请回到原平台重新导出包含全部媒体的工程包。</p>
                                ) : (
                                    <>
                                        <label className="flex flex-col gap-2">
                                            <span>新项目名称</span>
                                            <Input value={name} maxLength={200} disabled={importing} onChange={(event) => setName(event.target.value)} />
                                        </label>
                                        {!!inspection.projection?.preservedOnly.length && (
                                            <details>
                                                <summary>有 {inspection.projection.preservedOnly.length} 类高级设定暂不能继续编辑，原始快照会保留</summary>
                                                <ul>
                                                    {inspection.projection.preservedOnly.map((path) => (
                                                        <li key={path} title={path}>
                                                            {legacyImportFieldLabel(path)}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </details>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                        {error && <p role="alert">{error}</p>}
                        <div className="flex justify-end gap-2">
                            <Button disabled={importing} onClick={onClose}>
                                取消
                            </Button>
                            {!inspection ? (
                                <Button type="primary" aria-label="检查工程" aria-busy={checking} disabled={!file || file.size > MAX_ARCHIVE_BYTES || file.size === 0} loading={checking} onClick={() => void inspect()}>
                                    检查工程
                                </Button>
                            ) : (
                                <Button type="primary" aria-label={importing ? "正在导入项目" : "导入项目"} aria-busy={importing} loading={importing} disabled={!inspection.readyForMigration || !name.trim()} onClick={() => void importProject()}>
                                    {importing ? "正在导入…" : "导入项目"}
                                </Button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </AppModal>
    );
}
