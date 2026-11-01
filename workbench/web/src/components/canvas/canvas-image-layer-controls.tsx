import { useEffect, useState } from "react";
import { Button, Collapse, Grid, InputNumber, Popover } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { usePopoverAnchorAlign } from "@/hooks/use-popover-anchor-align";
import { ArrowDown, ArrowUp, Eye, EyeOff, Layers3, RefreshCw } from "lucide-react";
import { useCanvasNodeActions, type CanvasNodeActionContextValue } from "./canvas-node-action-context";
import type { CanvasNodeData } from "@/types/canvas";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";

function LayerNumber({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (value: number) => void }) {
    const [draft, setDraft] = useState<number | null>(value);
    useEffect(() => setDraft(value), [value]);
    return (
        <label className="flex items-center justify-between gap-2 text-xs">
            {label}
            <InputNumber
                size="small"
                aria-label={label}
                value={draft}
                min={min}
                max={max}
                onChange={setDraft}
                onPressEnter={(event) => {
                    event.preventDefault();
                    if (event.target instanceof HTMLInputElement) event.target.blur();
                }}
                onBlur={() => {
                    if (draft === null || !Number.isFinite(draft) || draft < min || draft > max) {
                        setDraft(value);
                        return;
                    }
                    if (draft !== value) onCommit(draft);
                }}
            />
        </label>
    );
}

export function CanvasImageLayerControls({ node, actions, variant = "overlay", onOpenChange }: { node: CanvasNodeData; actions?: CanvasNodeActionContextValue; variant?: "overlay" | "toolbar"; onOpenChange?: (open: boolean) => void }) {
    const contextualActions = useCanvasNodeActions();
    const { updateNode, extractLayerMaterials, imageLayerMaterialFeedback } = actions || contextualActions;
    const screens = Grid.useBreakpoint();
    const [open, setOpen] = useState(false);
    const changeOpen = (next: boolean) => {
        setOpen(next);
        onOpenChange?.(next);
    };
    const projects = useCanvasStore((state) => state.projects);
    const names = new Map(projects.flatMap((project) => project.nodes.map((node) => [node.id, node.title] as const)));
    const popoverRef = usePopoverAnchorAlign(open);
    const group = node.metadata?.imageLayerGroup;
    if (!group) return null;
    const materialFeedback = imageLayerMaterialFeedback?.[node.id];
    const materialError = materialFeedback ? materialFeedback.error : node.metadata?.imageLayerMaterials?.error;
    const materialLoading = materialFeedback?.loading || (node.metadata?.imageLayerMaterials?.status === "loading" && !materialError);
    const hasTransparentForeground = group.layers.some((layer) => projects.some((project) => project.nodes.some((child) => child.id === layer.nodeId && child.metadata?.imageLayer?.kind === "transparent")));
    const change = (nodeId: string, direction?: number) =>
        updateNode?.(node.id, (current) => {
            const live = current.metadata?.imageLayerGroup;
            if (!live) return current;
            const layers = live.layers.map((layer) => ({ ...layer }));
            const index = layers.findIndex((layer) => layer.nodeId === nodeId);
            if (index < 0) return current;
            if (direction === undefined) layers[index].visible = !layers[index].visible;
            else {
                const target = index + direction;
                if (target < 0 || target >= layers.length) return current;
                [layers[index], layers[target]] = [layers[target], layers[index]];
            }
            return {
                ...current,
                metadata: { ...current.metadata, imageLayerGroup: { ...live, layers, compositeIntentId: crypto.randomUUID(), pendingTaskId: undefined, pendingSignature: undefined, compositeStatus: "updating", compositeError: undefined } },
            };
        });
    const adjust = (nodeId: string, patch: { x?: number; y?: number; opacity?: number }) =>
        updateNode?.(node.id, (current) => {
            const live = current.metadata?.imageLayerGroup;
            if (!live) return current;
            return {
                ...current,
                metadata: {
                    ...current.metadata,
                    imageLayerGroup: {
                        ...live,
                        layers: live.layers.map((layer) => (layer.nodeId === nodeId ? { ...layer, ...patch } : layer)),
                        compositeIntentId: crypto.randomUUID(),
                        pendingTaskId: undefined,
                        pendingSignature: undefined,
                        compositeStatus: "updating",
                        compositeError: undefined,
                    },
                },
            };
        });
    const resize = (width: number, height: number) => {
        if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width * height > 16_777_216) return;
        updateNode?.(node.id, (current) => {
            const live = current.metadata?.imageLayerGroup;
            if (!live) return current;
            return {
                ...current,
                height: (current.width * height) / width,
                metadata: {
                    ...current.metadata,
                    manualSize: true,
                    imageLayerGroup: { ...live, width, height, compositeIntentId: crypto.randomUUID(), pendingTaskId: undefined, pendingSignature: undefined, compositeStatus: "updating", compositeError: undefined },
                },
            };
        });
    };
    const panel = (
        <div className="max-h-[min(72vh,640px)] w-72 max-w-[calc(100vw-48px)] space-y-2 overflow-y-auto pr-1" data-canvas-no-zoom data-canvas-wheel-scroll onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
            <div className="text-sm font-medium">图层顺序（上方在前）</div>
            {node.metadata?.nativeImageLayerWorkflow?.warnings?.length ? (
                <div role="status" className="space-y-1 text-xs text-amber-600 dark:text-amber-400">
                    <p>合成已完成，以下画面细节需要检查：</p>
                    {node.metadata.nativeImageLayerWorkflow.warnings.map((warning, index) => (
                        <p key={index}>{warning}</p>
                    ))}
                </div>
            ) : null}
            {group.incomplete ? (
                <p role="status" className="text-xs text-amber-600 dark:text-amber-400">
                    已收纳 {group.incomplete.completed}/{group.incomplete.total} 层，{group.incomplete.failed} 层尚未通过。{group.incomplete.missingBackground ? "当前预览缺少完整背景。" : "当前显示部分合成。"}展开查看失败层并单独重试。
                </p>
            ) : null}
            <div className="max-h-64 space-y-1 overflow-y-auto">
                {[...group.layers].reverse().map((layer, reverseIndex) => {
                    const index = group.layers.length - 1 - reverseIndex;
                    return (
                        <div key={layer.nodeId} className="rounded px-1 py-1">
                            <div className="flex items-center gap-1">
                                <button type="button" aria-label={`切换第 ${index + 1} 层可见性`} aria-pressed={layer.visible} className="p-1" onClick={() => change(layer.nodeId)}>
                                    {layer.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                                </button>
                                <span className="min-w-0 flex-1 truncate text-xs" title={names.get(layer.nodeId) || layer.nodeId}>
                                    {names.get(layer.nodeId) || `第 ${index + 1} 层`}
                                </span>
                                <button type="button" aria-label={`第 ${index + 1} 层上移`} disabled={index === group.layers.length - 1} className="p-1 disabled:opacity-30" onClick={() => change(layer.nodeId, 1)}>
                                    <ArrowUp className="size-4" />
                                </button>
                                <button type="button" aria-label={`第 ${index + 1} 层下移`} disabled={index === 0} className="p-1 disabled:opacity-30" onClick={() => change(layer.nodeId, -1)}>
                                    <ArrowDown className="size-4" />
                                </button>
                            </div>
                            <Collapse
                                size="small"
                                ghost
                                items={[
                                    {
                                        key: "placement",
                                        label: `位置与透明度 · ${Math.round((layer.opacity ?? 1) * 100)}%`,
                                        children: (
                                            <div className="space-y-2">
                                                <LayerNumber label={`第 ${index + 1} 层 X（px）`} value={layer.x} min={-group.width - 4096} max={group.width + 4096} onCommit={(x) => adjust(layer.nodeId, { x })} />
                                                <LayerNumber label={`第 ${index + 1} 层 Y（px）`} value={layer.y} min={-group.height - 4096} max={group.height + 4096} onCommit={(y) => adjust(layer.nodeId, { y })} />
                                                <LayerNumber label={`第 ${index + 1} 层透明度（%）`} value={(layer.opacity ?? 1) * 100} min={0} max={100} onCommit={(opacity) => adjust(layer.nodeId, { opacity: opacity / 100 })} />
                                            </div>
                                        ),
                                    },
                                ]}
                            />
                        </div>
                    );
                })}
            </div>
            <Collapse
                size="small"
                ghost
                items={[
                    {
                        key: "frame",
                        label: `画面尺寸 · ${group.width} × ${group.height} px`,
                        children: (
                            <div className="space-y-2">
                                <LayerNumber label="合成宽度（px）" value={group.width} min={1} max={Math.min(16384, Math.floor(16_777_216 / group.height))} onCommit={(width) => resize(width, group.height)} />
                                <LayerNumber label="合成高度（px）" value={group.height} min={1} max={Math.min(16384, Math.floor(16_777_216 / group.width))} onCommit={(height) => resize(group.width, height)} />
                            </div>
                        ),
                    },
                ]}
            />
            <p className="text-xs opacity-60">叠放、位置和透明度免费处理，不调用模型。位置使用原图像素；拖动画布节点只调整工作区布局。</p>
            {extractLayerMaterials && hasTransparentForeground ? (
                <button type="button" disabled={Boolean(materialLoading)} className="text-xs underline disabled:opacity-50" onClick={() => void extractLayerMaterials(node)}>
                    {materialLoading ? "正在另存独立素材…可关闭页面" : node.metadata?.imageLayerMaterials?.groupId ? "查看或更新独立素材（免费）" : "另存独立素材（免费）"}
                </button>
            ) : null}
            <p className="text-xs opacity-60">{hasTransparentForeground ? "独立素材只裁去外部透明留白，保留原文件像素和色彩信息；原位图层保持不变。" : "这些图片已经是独立素材，可直接选用或下载。"}</p>
            {node.metadata?.imageLayerMaterials?.emptyLayerIds?.length ? (
                <p role="status" className="text-xs opacity-60">
                    已跳过空透明图层：{node.metadata.imageLayerMaterials.emptyLayerIds.map((id) => names.get(id) || "未命名图层").join("、")}。原图层保留。
                </p>
            ) : null}
            {materialError ? (
                <p role="alert" className="text-xs text-amber-600 dark:text-amber-400">
                    {materialError}
                </p>
            ) : null}
            {group.compositeStatus === "updating" ? (
                <p role="status" className="text-xs">
                    正在更新合成图…
                </p>
            ) : null}
            {group.compositeStatus === "error" ? (
                <div role="alert" className="space-y-1 text-xs">
                    <p>{group.compositeError}</p>
                    <button
                        type="button"
                        className="flex items-center gap-1 underline"
                        onClick={() =>
                            updateNode?.(node.id, (current) =>
                                current.metadata?.imageLayerGroup
                                    ? {
                                          ...current,
                                          metadata: {
                                              ...current.metadata,
                                              imageLayerGroup: { ...current.metadata.imageLayerGroup, compositeIntentId: crypto.randomUUID(), pendingTaskId: undefined, pendingSignature: undefined, compositeStatus: "updating", compositeError: undefined },
                                          },
                                      }
                                    : current,
                            )
                        }
                    >
                        <RefreshCw className="size-3" />
                        重试合成
                    </button>
                </div>
            ) : null}
        </div>
    );
    const trigger = (
        <button
            type="button"
            title="管理图层"
            aria-label="管理图层"
            aria-expanded={open}
            className={
                variant === "toolbar"
                    ? "aceternity-dock-command is-labeled pointer-events-auto inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[var(--dock-item-radius)] px-2.5 outline-none"
                    : "grid size-6 place-items-center rounded bg-black/60 text-white"
            }
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
                event.stopPropagation();
                if (!screens.sm) changeOpen(true);
            }}
        >
            <Layers3 className="size-3.5" />
            {variant === "toolbar" ? <span className="text-[var(--fs-label)]">图层</span> : null}
        </button>
    );
    return screens.sm ? (
        <Popover ref={popoverRef} trigger="click" open={open} onOpenChange={changeOpen} content={panel} placement="top">
            {trigger}
        </Popover>
    ) : (
        <>
            {trigger}
            <AppModal title="管理图层" open={open} centered width={360} onCancel={() => changeOpen(false)} footer={<Button onClick={() => changeOpen(false)}>返回画布</Button>}>
                {panel}
            </AppModal>
        </>
    );
}
