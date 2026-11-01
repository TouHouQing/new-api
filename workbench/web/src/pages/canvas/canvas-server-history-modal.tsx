import { useEffect, useRef, useState } from "react";
import { Alert, Button, Spin } from "antd";
import { EmptyState } from "@/components/ui/product/empty-state";
import { AppModal } from "@/components/ui/product/app-modal";
import { getCanvasHistorySnapshot, listCanvasHistory, restoreCanvasHistory, type CanvasHistoryList } from "@/services/api/canvas-history";
import { refreshCanvasAfterAgent } from "@/services/user-data-sync";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";

type Props = { canvasId: string; onPrepare: () => Promise<boolean>; onClose: () => void; onRestored: () => void };

export function CanvasServerHistoryModal({ canvasId, onPrepare, onClose, onRestored }: Props) {
    const prepare = useRef(onPrepare);
    prepare.current = onPrepare;
    const [history, setHistory] = useState<CanvasHistoryList | null>(null);
    const [selected, setSelected] = useState("");
    const [preview, setPreview] = useState<CanvasProject | null>(null);
    const [loading, setLoading] = useState(false),
        [restoring, setRestoring] = useState(false),
        [error, setError] = useState("");
    const alive = useRef(true),
        sequence = useRef(0);
    const snapshot = history?.snapshots.find((item) => item.id === selected);
    async function load() {
        const request = ++sequence.current;
        setLoading(true);
        setError("");
        setPreview(null);
        setSelected("");
        try {
            if (!(await prepare.current())) throw new Error("当前画布尚未保存到服务端，请先恢复网络并保存，再读取历史版本");
            if (!alive.current || request !== sequence.current) return;
            const result = await listCanvasHistory(canvasId);
            if (alive.current && request === sequence.current) setHistory(result);
        } catch (failure) {
            if (alive.current && request === sequence.current) setError(failure instanceof Error ? failure.message : "读取历史版本失败");
        } finally {
            if (alive.current && request === sequence.current) setLoading(false);
        }
    }
    useEffect(() => {
        alive.current = true;
        void load();
        return () => {
            alive.current = false;
            sequence.current++;
        };
        // The mounted canvas owns the read; a changing save callback does not start another save.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvasId]);
    async function select(id: string) {
        const request = ++sequence.current;
        setSelected(id);
        setPreview(null);
        setError("");
        setLoading(true);
        try {
            const result = await getCanvasHistorySnapshot(canvasId, id);
            if (alive.current && request === sequence.current) setPreview(result.project);
        } catch (failure) {
            if (alive.current && request === sequence.current) setError(failure instanceof Error ? failure.message : "读取版本内容失败");
        } finally {
            if (alive.current && request === sequence.current) setLoading(false);
        }
    }
    async function restore() {
        if (!snapshot || !preview || !history || restoring || loading) return;
        setRestoring(true);
        setError("");
        let committed = false;
        try {
            if (!(await prepare.current())) throw new Error("当前编辑尚未保存，未恢复历史版本。请先保存再重试");
            await restoreCanvasHistory(canvasId, snapshot.id, history.currentRevision);
            committed = true;
            await refreshCanvasAfterAgent(canvasId, "sync");
            if (alive.current) {
                onRestored();
                onClose();
            }
        } catch (failure) {
            if (alive.current) setError(`${committed ? "服务端已恢复，请关闭此面板后重新载入画布；" : ""}${failure instanceof Error ? failure.message : "恢复结果尚未确认，请刷新历史并核对当前画布，勿连续重试"}`);
        } finally {
            if (alive.current) setRestoring(false);
        }
    }
    return (
        <AppModal
            open
            title="画布历史版本"
            width={780}
            onCancel={restoring ? undefined : onClose}
            closable={!restoring}
            keyboard={!restoring}
            maskClosable={!restoring}
            footer={
                <div className="flex flex-wrap justify-end gap-2">
                    <Button onClick={() => void load()} disabled={loading || restoring}>
                        刷新历史
                    </Button>
                    <Button onClick={onClose} disabled={restoring}>
                        关闭
                    </Button>
                    <Button type="primary" disabled={!snapshot || !preview || loading} loading={restoring} onClick={() => void restore()}>
                        恢复{snapshot ? `到 V${snapshot.revision}` : "选中版本"}
                    </Button>
                </div>
            }
        >
            <p className="mb-3 text-sm text-muted-foreground">云端保留最近 20 个历史版本，常规编辑每 5 分钟记录一次。恢复前会保存当前内容；素材源文件继续保留。其他窗口有新修改时会停止恢复。</p>
            {error && <Alert type="error" showIcon title={error} className="mb-3" />}
            <Spin spinning={loading || restoring}>
                <div className="grid max-h-[58vh] min-h-48 gap-3 overflow-y-auto sm:grid-cols-[240px_1fr]">
                    <div className="space-y-2">
                        {history?.snapshots.length === 0 ? (
                            <EmptyState description="还没有历史版本，继续编辑后会自动记录" />
                        ) : (
                            history?.snapshots.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    disabled={restoring}
                                    aria-pressed={selected === item.id}
                                    onClick={() => void select(item.id)}
                                    className={`block w-full rounded-lg border p-3 text-left ${selected === item.id ? "border-primary bg-secondary" : "border-border"}`}
                                >
                                    <strong className="text-sm">
                                        V{item.revision} · {item.title || "未命名画布"}
                                    </strong>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                        {new Date(item.contentUpdatedAt || item.createdAt).toLocaleString()}
                                        <br />
                                        {item.nodeCount} 个节点 · {item.connectionCount} 条连线{item.reason === "before_restore" ? " · 恢复前备份" : item.reason === "before_legacy_previs" ? " · 导演预演转换前" : ""}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                    <div className="rounded-lg border border-border p-3">
                        {preview ? (
                            <>
                                <h3 className="mb-2 text-sm font-medium">{preview.title} · 版本内容</h3>
                                <ul className="space-y-2">
                                    {preview.nodes.slice(0, 50).map((node) => {
                                        const text = node.metadata?.prompt || (["text", "script"].includes(node.type) ? node.metadata?.content : undefined);
                                        return (
                                            <li key={node.id} className="border-b border-border pb-2 text-sm">
                                                <strong>{node.title || "未命名节点"}</strong>
                                                {text && <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">{text.slice(0, 600)}</p>}
                                            </li>
                                        );
                                    })}
                                </ul>
                                {preview.nodes.length > 50 && <p className="mt-2 text-xs">预览前 50 个节点，恢复会包含全部 {preview.nodes.length} 个节点及连线。</p>}
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">选择左侧版本核对内容，再恢复。</p>
                        )}
                    </div>
                </div>
            </Spin>
        </AppModal>
    );
}
