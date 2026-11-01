import { expect, test } from "bun:test";
import { readImageMaskDocument, type ImageMaskDocument } from "../src/lib/canvas/image-mask-document";

const draft = (): ImageMaskDocument => ({
    version: 1,
    sourceStorageKey: "resource:original",
    width: 31,
    height: 23,
    mode: "keep",
    prompt: "保留人物",
    strokes: [
        {
            diameter: 8,
            erase: false,
            points: [
                [15.5, 10.5],
                [20.25, 12.75],
            ],
        },
    ],
});

test("遮罩草稿保持原图坐标和笔画顺序，读取副本不改写已保存内容", () => {
    const original = draft();
    const checked = readImageMaskDocument(original, "resource:original", { width: 31, height: 23 });
    expect(checked).toEqual(original);
    checked.strokes[0].points.push([1, 2]);
    expect(original.strokes[0].points).toHaveLength(2);
    expect(readImageMaskDocument({ ...original, strokes: [] }, "resource:original").strokes).toEqual([]);
});

test("遮罩换图、尺寸漂移、非有限坐标和过量采样不会被当作可恢复草稿", () => {
    expect(() => readImageMaskDocument(draft(), "resource:replacement")).toThrow("原图不一致");
    expect(() => readImageMaskDocument(draft(), "resource:original", { width: 30, height: 23 })).toThrow("原图不一致");
    for (const point of [[1, Number.NaN], [1, 2, 3], [1], [Infinity, 1], [-99999, 1]]) expect(() => readImageMaskDocument({ ...draft(), strokes: [{ diameter: 8, erase: false, points: [point] }] }, "resource:original")).toThrow();
    expect(() => readImageMaskDocument({ ...draft(), strokes: [{ diameter: 8, erase: false, points: Array.from({ length: 8193 }, () => [1, 1]) }] }, "resource:original")).toThrow("8192");
    expect(() => readImageMaskDocument({ ...draft(), mode: "guess" }, "resource:original")).toThrow();
});

test("AI 遮罩草稿重开保持编辑方式、模型与候选数量", () => {
    const editor = { purpose: "ai" as const, model: "local::flux", count: 3, size: "1:1", quality: "auto", transparentBackground: "false" };
    const original = { ...draft(), editor };
    const restored = readImageMaskDocument(JSON.parse(JSON.stringify(original)), "resource:original");
    expect(restored.editor).toEqual(editor);
    restored.editor!.count = 1;
    expect(original.editor.count).toBe(3);
    expect(readImageMaskDocument(draft(), "resource:original").editor).toBeUndefined();
});

test("遮罩编辑意图无效时保留错误，不切换为另一处理方式", () => {
    const editor = { purpose: "ai", model: "local::flux", count: 3, size: "1:1", quality: "auto", transparentBackground: "false" };
    for (const change of [{ purpose: "remove" }, { purpose: "guess" }, { count: 0 }, { count: 16 }, { count: 1.5 }, { model: null }, { size: 512 }])
        expect(() => readImageMaskDocument({ ...draft(), editor: { ...editor, ...change } }, "resource:original")).toThrow("编辑方式或生成设置无效");
});
