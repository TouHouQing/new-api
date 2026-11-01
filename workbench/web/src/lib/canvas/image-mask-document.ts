export type MaskPoint = readonly [number, number];
export type MaskStroke = { diameter: number; erase: boolean; points: MaskPoint[] };
export type ImageMaskEditor = { purpose: "ai" | "keep" | "remove"; model: string; count: number; size: string; quality: string; transparentBackground: string };
export type ImageMaskDocument = { version: 1; sourceStorageKey: string; width: number; height: number; mode: "keep" | "remove"; strokes: MaskStroke[]; prompt: string; editor?: ImageMaskEditor };

export function readImageMaskDocument(value: unknown, sourceStorageKey: string, size?: { width: number; height: number }): ImageMaskDocument {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("遮罩草稿格式无效，请保留原草稿并重新涂抹");
    const item = value as ImageMaskDocument;
    if (
        item.version !== 1 ||
        !sourceStorageKey.startsWith("resource:") ||
        item.sourceStorageKey !== sourceStorageKey ||
        !Number.isSafeInteger(item.width) ||
        !Number.isSafeInteger(item.height) ||
        item.width <= 0 ||
        item.height <= 0 ||
        item.width * item.height > 4096 * 4096 ||
        (size && (size.width !== item.width || size.height !== item.height))
    )
        throw new Error("遮罩草稿与当前原图不一致，请核对原图后重新涂抹");
    if ((item.mode !== "keep" && item.mode !== "remove") || typeof item.prompt !== "string" || item.prompt.length > 3200 || !Array.isArray(item.strokes) || item.strokes.length > 256) throw new Error("遮罩草稿的笔画或设置无效");
    if (item.editor !== undefined) {
        const editor = item.editor;
        if (
            !editor ||
            typeof editor !== "object" ||
            Array.isArray(editor) ||
            !["ai", "keep", "remove"].includes(editor.purpose) ||
            (editor.purpose === "remove" ? "remove" : "keep") !== item.mode ||
            !Number.isSafeInteger(editor.count) ||
            editor.count < 1 ||
            editor.count > 15 ||
            [editor.model, editor.size, editor.quality, editor.transparentBackground].some((value) => typeof value !== "string" || value.length > 512)
        )
            throw new Error("遮罩草稿的编辑方式或生成设置无效");
    }
    let points = 0;
    for (const stroke of item.strokes) {
        if (!Number.isFinite(stroke.diameter) || stroke.diameter < 1 || stroke.diameter > 4096 || typeof stroke.erase !== "boolean" || !Array.isArray(stroke.points) || !stroke.points.length) throw new Error("遮罩草稿包含无效笔画");
        points += stroke.points.length;
        if (points > 8192) throw new Error("遮罩最多8192个采样点，请减少笔画");
        for (const point of stroke.points)
            if (!Array.isArray(point) || point.length !== 2 || point.some((coordinate, axis) => !Number.isFinite(coordinate) || coordinate < -4096 || coordinate > (axis ? item.height : item.width) + 4096)) throw new Error("遮罩笔画超出原图坐标范围");
    }
    return structuredClone({
        version: 1,
        sourceStorageKey,
        width: item.width,
        height: item.height,
        mode: item.mode,
        strokes: item.strokes,
        prompt: item.prompt,
        ...(item.editor ? { editor: { purpose: item.editor.purpose, model: item.editor.model, count: item.editor.count, size: item.editor.size, quality: item.editor.quality, transparentBackground: item.editor.transparentBackground } } : {}),
    });
}

/** A stroke document is the source of truth; previews and exported masks are separate renders. */
export function paintMaskStrokes(canvas: HTMLCanvasElement, strokes: readonly MaskStroke[], color: string): CanvasRenderingContext2D {
    const brush = canvas.getContext("2d", { willReadFrequently: true });
    if (!brush) throw new Error("无法创建遮罩画布");
    brush.clearRect(0, 0, canvas.width, canvas.height);
    brush.lineCap = "round";
    brush.lineJoin = "round";
    brush.fillStyle = brush.strokeStyle = color;
    for (const stroke of strokes) {
        const first = stroke.points[0];
        if (!first) continue;
        brush.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
        brush.lineWidth = stroke.diameter;
        const path = new Path2D();
        if (stroke.points.length === 1) {
            path.arc(first[0], first[1], stroke.diameter / 2, 0, Math.PI * 2);
            brush.fill(path);
        } else {
            path.moveTo(first[0], first[1]);
            for (const [x, y] of stroke.points.slice(1)) path.lineTo(x, y);
            brush.stroke(path);
        }
    }
    brush.globalCompositeOperation = "source-over";
    return brush;
}

export function invertSelectionAlpha(selection: Uint8ClampedArray): Uint8ClampedArray {
    if (selection.length % 4 !== 0) throw new RangeError("遮罩像素数据无效");
    let selected = false;
    const result = new Uint8ClampedArray(selection.length).fill(255);
    for (let pixel = 0; pixel < selection.length / 4; pixel++) {
        if (selection[pixel * 4 + 3] === 0) continue;
        selected = true;
        result[pixel * 4 + 3] = 0;
    }
    if (!selected) throw new Error("请先涂抹需要修改的区域");
    return result;
}

export function exportEditMask(width: number, height: number, strokes: readonly MaskStroke[]): string {
    const surface = document.createElement("canvas");
    Object.assign(surface, { width, height });
    const brush = paintMaskStrokes(surface, strokes, "black");
    const pixels = brush.getImageData(0, 0, width, height);
    pixels.data.set(invertSelectionAlpha(pixels.data));
    brush.putImageData(pixels, 0, 0);
    const png = surface.toDataURL("image/png");
    if (!png.startsWith("data:image/png")) throw new Error("遮罩导出失败");
    return png;
}
