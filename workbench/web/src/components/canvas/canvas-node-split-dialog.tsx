// Nonuniform split controls inspired by HuFakai/infinite-canvas aadd02f (AGPL-3.0-or-later).
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button, InputNumber } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { MAX_IMAGE_GRID, imageSplitBoundaries, planImageTiles, type ImageSplitParams } from "@/lib/canvas/image-operation-plan";
import { useImageToolSource } from "./use-image-tool-source";

export type CanvasImageSplitParams = ImageSplitParams;
type SplitDialogProps = { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (params: CanvasImageSplitParams) => void | Promise<void> };
type Axis = "horizontal" | "vertical";
type SelectedLine = { axis: Axis; index: number };

export function CanvasNodeSplitDialog(props: SplitDialogProps) {
    return props.open && props.dataUrl ? <SplitEditor key={props.dataUrl} {...props} /> : null;
}

function SplitEditor({ dataUrl, onClose, onConfirm }: SplitDialogProps) {
    const [grid, setGrid] = useState<ImageSplitParams>({ rows: 2, columns: 2 });
    const [selected, setSelected] = useState<SelectedLine | null>(null);
    const [busy, setBusy] = useState(false);
    const previewRef = useRef<HTMLDivElement>(null);
    const drag = useRef<(SelectedLine & { pointerId: number }) | null>(null);
    const submitting = useRef(false);
    const { size, error } = useImageToolSource(dataUrl);
    const valid = size !== null && size.width >= grid.columns && size.height >= grid.rows;
    const tiles = valid ? planImageTiles(size, grid) : [];
    const length = (axis: Axis) => (axis === "horizontal" ? (size?.height ?? 0) : (size?.width ?? 0));
    const count = (axis: Axis) => (axis === "horizontal" ? grid.rows : grid.columns);
    const key = (axis: Axis) => (axis === "horizontal" ? "horizontalLines" : "verticalLines");
    const lines = (axis: Axis) =>
        valid
            ? imageSplitBoundaries(length(axis), count(axis), grid[key(axis)])
                  .slice(1, -1)
                  .map((pixel) => pixel / length(axis))
            : [];
    const bounds = (axis: Axis, index: number) => {
        const positions = lines(axis),
            dimension = length(axis);
        return { min: Math.round((positions[index - 1] ?? 0) * dimension) + 1, max: Math.round((positions[index + 1] ?? 1) * dimension) - 1 };
    };
    const setLine = (axis: Axis, index: number, pixel: number) => {
        const positions = lines(axis),
            limit = bounds(axis, index),
            dimension = length(axis);
        if (!dimension || busy || limit.max < limit.min || !Number.isFinite(pixel) || positions[index] === undefined) return;
        positions[index] = Math.max(limit.min, Math.min(limit.max, Math.round(pixel))) / dimension;
        setGrid((current) => ({ ...current, [key(axis)]: positions }));
    };
    const updateCount = (axis: "rows" | "columns", value: number | null) => {
        if (value === null || !Number.isFinite(value)) return;
        setSelected(null);
        setGrid((previous) => ({ ...previous, [axis]: Math.min(MAX_IMAGE_GRID, Math.max(1, Math.round(value))), [axis === "rows" ? "horizontalLines" : "verticalLines"]: undefined }));
    };
    const addLine = (axis: Axis) => {
        const dimension = length(axis),
            positions = lines(axis);
        if (!valid || busy || count(axis) >= Math.min(MAX_IMAGE_GRID, dimension)) return;
        const edges = [0, ...positions.map((value) => Math.round(value * dimension)), dimension];
        let gap = 0;
        for (let index = 1; index < edges.length - 1; index++) if (edges[index + 1] - edges[index] > edges[gap + 1] - edges[gap]) gap = index;
        positions.splice(gap, 0, Math.floor((edges[gap] + edges[gap + 1]) / 2) / dimension);
        setGrid((current) => ({ ...current, [axis === "horizontal" ? "rows" : "columns"]: positions.length + 1, [key(axis)]: positions }));
        setSelected({ axis, index: gap });
    };
    const removeLine = (line: SelectedLine | null) => {
        if (!line || busy) return;
        const positions = lines(line.axis).filter((_, index) => index !== line.index);
        setGrid((current) => ({ ...current, [line.axis === "horizontal" ? "rows" : "columns"]: positions.length + 1, [key(line.axis)]: positions }));
        setSelected(null);
        drag.current = null;
    };
    const startDrag = (axis: Axis, index: number, event: PointerEvent<HTMLButtonElement>) => {
        if (busy || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.focus();
        setSelected({ axis, index });
        drag.current = { axis, index, pointerId: event.pointerId };
        event.currentTarget.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent<HTMLButtonElement>) => {
        const active = drag.current,
            box = previewRef.current?.getBoundingClientRect();
        if (!active || active.pointerId !== event.pointerId || !box || !box.width || !box.height || busy) return;
        const value = active.axis === "horizontal" ? (event.clientY - box.top) / box.height : (event.clientX - box.left) / box.width;
        setLine(active.axis, active.index, value * length(active.axis));
    };
    const adjust = (axis: Axis, index: number, event: KeyboardEvent) => {
        if (busy) return;
        const pixel = Math.round(lines(axis)[index] * length(axis)),
            limit = bounds(axis, index),
            step = event.shiftKey ? 10 : 1;
        if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            event.stopPropagation();
            removeLine({ axis, index });
            return;
        }
        const direction = event.key === (axis === "horizontal" ? "ArrowUp" : "ArrowLeft") ? -1 : event.key === (axis === "horizontal" ? "ArrowDown" : "ArrowRight") ? 1 : 0;
        if (direction || event.key === "Home" || event.key === "End") {
            event.preventDefault();
            event.stopPropagation();
            setLine(axis, index, event.key === "Home" ? limit.min : event.key === "End" ? limit.max : pixel + direction * step);
        }
    };
    const confirm = async () => {
        if (!valid || tiles.length < 2 || submitting.current) return;
        submitting.current = true;
        setBusy(true);
        try {
            await onConfirm(grid);
        } finally {
            submitting.current = false;
            setBusy(false);
        }
    };
    const renderLine = (axis: Axis, value: number, index: number) => {
        const active = selected?.axis === axis && selected.index === index,
            limit = bounds(axis, index);
        return (
            <button
                key={`${axis}-${index}`}
                type="button"
                role="slider"
                aria-label={`${axis === "horizontal" ? "横向" : "竖向"}分割线 ${index + 1}`}
                aria-orientation={axis === "horizontal" ? "vertical" : "horizontal"}
                aria-valuemin={limit.min}
                aria-valuemax={limit.max}
                aria-valuenow={Math.round(value * length(axis))}
                aria-valuetext={`${Math.round(value * length(axis))} 像素`}
                disabled={busy}
                onFocus={() => setSelected({ axis, index })}
                onPointerDown={(event) => startDrag(axis, index, event)}
                onPointerMove={move}
                onPointerUp={() => {
                    drag.current = null;
                }}
                onPointerCancel={() => {
                    drag.current = null;
                }}
                onLostPointerCapture={() => {
                    drag.current = null;
                }}
                onKeyDown={(event) => adjust(axis, index, event)}
                className={`absolute z-10 touch-none border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-primary ${axis === "horizontal" ? "inset-x-0 h-4 -translate-y-1/2 cursor-row-resize" : "inset-y-0 w-4 -translate-x-1/2 cursor-col-resize"}`}
                style={axis === "horizontal" ? { top: `${value * 100}%` } : { left: `${value * 100}%` }}
            >
                <span
                    aria-hidden
                    className={`pointer-events-none absolute border border-black/60 ${active ? "bg-primary" : "bg-white"} ${axis === "horizontal" ? "inset-x-0 top-1/2 h-[3px] -translate-y-1/2" : "inset-y-0 left-1/2 w-[3px] -translate-x-1/2"}`}
                />
            </button>
        );
    };
    return (
        <AppModal
            open
            title="切分图片"
            width={820}
            centered
            onCancel={() => !busy && onClose()}
            maskClosable={!busy}
            keyboard={!busy}
            closable={!busy}
            confirmLoading={busy}
            okText={`保存 ${grid.rows * grid.columns} 张图片`}
            onOk={confirm}
            okButtonProps={{ disabled: !valid || tiles.length < 2 || busy }}
            cancelButtonProps={{ disabled: busy }}
        >
            <p className="mb-4 text-sm text-muted-foreground">拖动分割线避开人物或文字，按原图像素另存为子节点。选中分割线后也可用方向键微调。</p>
            <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                <figure className="m-0 flex min-w-0 flex-col items-center gap-3 rounded-lg border border-border bg-surface-active p-3">
                    <div ref={previewRef} className="relative max-w-full overflow-hidden" data-testid="image-split-preview">
                        <img alt="待切分图片" src={dataUrl} draggable={false} className="block max-h-[340px] max-w-full object-contain" />
                        {(["horizontal", "vertical"] as const).flatMap((axis) => lines(axis).map((value, index) => renderLine(axis, value, index)))}
                    </div>
                    <figcaption className="text-sm text-muted-foreground">{size ? `${size.width} × ${size.height} px` : error || "正在读取图片…"}</figcaption>
                </figure>
                <div className="flex flex-col gap-4">
                    {(["rows", "columns"] as const).map((axis) => (
                        <label key={axis} className="flex flex-col gap-2 text-sm">
                            {axis === "rows" ? "行数" : "列数"}
                            <InputNumber
                                aria-label={axis === "rows" ? "切分行数" : "切分列数"}
                                disabled={busy}
                                min={1}
                                max={Math.min(MAX_IMAGE_GRID, axis === "rows" ? (size?.height ?? MAX_IMAGE_GRID) : (size?.width ?? MAX_IMAGE_GRID))}
                                precision={0}
                                value={grid[axis]}
                                onChange={(value) => updateCount(axis, value)}
                            />
                        </label>
                    ))}
                    <div className="flex flex-wrap gap-2">
                        <Button disabled={busy || !valid || grid.rows >= Math.min(MAX_IMAGE_GRID, size?.height ?? 0)} onClick={() => addLine("horizontal")}>
                            添加横线
                        </Button>
                        <Button disabled={busy || !valid || grid.columns >= Math.min(MAX_IMAGE_GRID, size?.width ?? 0)} onClick={() => addLine("vertical")}>
                            添加竖线
                        </Button>
                        <Button disabled={busy || !selected} onClick={() => removeLine(selected)}>
                            删除选中线
                        </Button>
                        <Button
                            disabled={busy}
                            onClick={() => {
                                setGrid((current) => ({ rows: current.rows, columns: current.columns }));
                                setSelected(null);
                            }}
                        >
                            恢复均分
                        </Button>
                    </div>
                    <output className="text-sm text-muted-foreground">{tiles.length ? `共 ${tiles.length} 张，完整保留原图像素。` : "等待有效图片尺寸"}</output>
                    {tiles.length > 0 ? (
                        <details className="text-sm text-muted-foreground">
                            <summary className="cursor-pointer">查看每张尺寸</summary>
                            <ul className="mt-2 max-h-32 overflow-auto">
                                {tiles.map((tile) => (
                                    <li key={`${tile.row}-${tile.column}`}>
                                        {tile.row + 1}-{tile.column + 1}：{tile.width} × {tile.height} px
                                    </li>
                                ))}
                            </ul>
                        </details>
                    ) : null}
                    {tiles.length === 1 ? (
                        <p role="alert" className="text-sm text-destructive">
                            请至少切分为两张图片
                        </p>
                    ) : null}
                    {error || (size && !valid) ? (
                        <p role="alert" className="text-sm text-destructive">
                            {error || "行列数超过图片像素尺寸，请减少切分数量"}
                        </p>
                    ) : null}
                </div>
            </div>
        </AppModal>
    );
}
