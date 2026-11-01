export interface PixelSize {
    width: number;
    height: number;
}

/** Normalized image coordinates, independent of the preview's CSS dimensions. */
export interface ImageCropRect extends PixelSize {
    x: number;
    y: number;
}

export type ImageUpscaleAlgorithm = "nearest" | "bilinear" | "high";
export interface ImageUpscaleParams {
    targetLongEdge: number;
    algorithm: ImageUpscaleAlgorithm;
}
export interface ImageSplitParams {
    rows: number;
    columns: number;
    horizontalLines?: number[];
    verticalLines?: number[];
}
export interface ImageSplitPiece {
    row: number;
    column: number;
    dataUrl: string;
}
export const MAX_UPSCALE_LONG_EDGE = 4096;
export const MAX_IMAGE_GRID = 12;

export function assertPixelSize(size: PixelSize): void {
    if (![size.width, size.height].every((n) => Number.isSafeInteger(n) && n > 0)) {
        throw new RangeError("图片尺寸必须是正整数");
    }
}

export function resolveUpscaleSize(width: number, height: number, requested: number): PixelSize {
    assertPixelSize({ width, height });
    if (!Number.isFinite(requested) || requested <= 0) throw new RangeError("目标尺寸无效");
    const edge = Math.max(1, Math.min(MAX_UPSCALE_LONG_EDGE, Math.round(requested)));
    return width >= height ? { width: edge, height: Math.max(1, Math.round((height / width) * edge)) } : { width: Math.max(1, Math.round((width / height) * edge)), height: edge };
}

export function resolveCropPixels(size: PixelSize, selection?: ImageCropRect): ImageCropRect {
    assertPixelSize(size);
    if (selection === undefined) {
        const side = Math.min(size.width, size.height);
        return { width: side, height: side, x: Math.floor((size.width - side) / 2), y: Math.floor((size.height - side) / 2) };
    }
    const { x, y, width, height } = selection;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) throw new RangeError("裁剪区域无效");
    const left = Math.max(0, Math.floor(x * size.width));
    const top = Math.max(0, Math.floor(y * size.height));
    const right = Math.min(size.width, Math.ceil((x + width) * size.width));
    const bottom = Math.min(size.height, Math.ceil((y + height) * size.height));
    if (left >= right || top >= bottom) throw new RangeError("裁剪区域超出图片边界");
    return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Nonuniform split controls inspired by HuFakai/infinite-canvas, aadd02f (AGPL-3.0-or-later).
 * Integer boundaries keep every source pixel in exactly one tile. */
export function imageSplitBoundaries(length: number, count: number, lines?: number[]): number[] {
    if (!Number.isSafeInteger(length) || !Number.isInteger(count) || count < 1 || count > MAX_IMAGE_GRID || length < count) throw new RangeError("切分数量不能超过图片像素尺寸");
    if (lines === undefined) return Array.from({ length: count + 1 }, (_, i) => Math.floor((length * i) / count));
    if (!Array.isArray(lines) || lines.length !== count - 1 || lines.some((line) => !Number.isFinite(line) || line <= 0 || line >= 1)) throw new RangeError("分割线数量或位置无效");
    const edges = [0, ...lines.map((line) => Math.round(line * length)), length];
    if (edges.some((edge, index) => index > 0 && edge <= edges[index - 1])) throw new RangeError("分割线过近或交叉，请至少保留一个原图像素");
    return edges;
}

export function planImageTiles(size: PixelSize, grid: ImageSplitParams): Array<ImageCropRect & { row: number; column: number }> {
    assertPixelSize(size);
    if (![grid.rows, grid.columns].every((n) => Number.isInteger(n) && n >= 1 && n <= MAX_IMAGE_GRID)) throw new RangeError("切分行列数必须在 1 到 12 之间");
    if (grid.columns > size.width || grid.rows > size.height) throw new RangeError("切分数量不能超过图片像素尺寸");
    const horizontal = imageSplitBoundaries(size.width, grid.columns, grid.verticalLines);
    const vertical = imageSplitBoundaries(size.height, grid.rows, grid.horizontalLines);
    return Array.from({ length: grid.rows * grid.columns }, (_, index) => {
        const column = index % grid.columns;
        const row = Math.floor(index / grid.columns);
        return { column, row, x: horizontal[column], y: vertical[row], width: horizontal[column + 1] - horizontal[column], height: vertical[row + 1] - vertical[row] };
    });
}
