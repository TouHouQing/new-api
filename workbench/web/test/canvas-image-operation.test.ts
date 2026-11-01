import { describe, expect, test } from "bun:test";
import { imageOperationNodes, mergeImageOperationNodes } from "../src/lib/canvas/canvas-image-operation";
import { imageOperationResult, type ImageOperationResult } from "../src/services/api/image-operations";
import { canCancelGenerationTask, formatTaskKind, generationTaskStatusLabel, mediaDeliverySummary } from "../src/lib/generation-task-display";
import type { GenerationTask } from "../src/services/api/task-center";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";
import { layoutGridSplitCells } from "../src/lib/canvas/canvas-grid-split";

const source: CanvasNodeData = { id: "source", type: CanvasNodeType.Image, title: "原图", position: { x: 10, y: 20 }, width: 310, height: 230, metadata: { storageKey: "resource:original", content: "/api/resources/original/file" } };
const result: ImageOperationResult = {
    imageOperation: {
        version: 1,
        request: { requestId: "request", projectId: "canvas", sourceNodeId: "source", resourceId: "original", recipe: { operation: "split", split: { rows: 1, columns: 2 } } },
        requestSha256: "digest",
        source: { sha256: "immutable-source", width: 31, height: 23, orientation: 1, format: "png" },
        pieces: [
            { x: 0, y: 0, width: 15, height: 23, outputWidth: 15, outputHeight: 23, row: 0, column: 0 },
            { x: 15, y: 0, width: 16, height: 23, outputWidth: 16, outputHeight: 23, row: 0, column: 1 },
        ],
    },
    images: [15, 16].map((width, i) => ({
        resourceId: `output${i}`,
        assetId: `asset${i}`,
        assetVersionId: `version${i}`,
        storageKey: `resource:output${i}`,
        url: `/api/resources/output${i}/file`,
        width,
        height: 23,
        bytes: 500,
        mimeType: "image/png",
        piece: { x: i * 15, y: 0, width, height: 23, outputWidth: width, outputHeight: 23, row: 0, column: i },
    })),
};
const task: GenerationTask = {
    id: "native-task",
    projectId: "canvas",
    type: "image_operation",
    provider: "local",
    model: "image-raster-v1",
    operation: "split",
    status: "succeeded",
    prompt: "图片切分",
    attempts: 1,
    createdAt: "2026-10-24T00:00:00Z",
    updatedAt: "2026-10-24T00:00:00Z",
    resultJson: JSON.stringify(result),
};

describe("原生后台图片操作", () => {
    test("跨过坐标零点时保留宫格真实位置", () => {
        const positions = layoutGridSplitCells({ x: -148, y: -148 }, [
            { row: 0, column: 0, width: 100, height: 100 },
            { row: 1, column: 1, width: 100, height: 100 },
        ]);
        expect(positions).toEqual([
            { x: -148, y: -148 },
            { x: 0, y: 0 },
        ]);
    });
    test("结果成组避开相邻原图和以前的派生节点，重复采用保留用户位置", () => {
        const neighbor = { ...source, id: "neighbor", position: { x: 440, y: 20 }, width: 640, height: 380 };
        const children = imageOperationNodes(task, result, source, [source, neighbor]);
        for (const child of children) {
            expect(child.position.y >= neighbor.position.y + neighbor.height + 36 || child.position.x >= neighbor.position.x + neighbor.width + 36).toBe(true);
        }
        const another = imageOperationNodes({ ...task, id: "another" }, result, source, [source, neighbor, ...children]);
        for (const child of another) {
            for (const existing of [source, neighbor, ...children]) {
                expect(
                    child.position.x + child.width <= existing.position.x || child.position.x >= existing.position.x + existing.width || child.position.y + child.height <= existing.position.y || child.position.y >= existing.position.y + existing.height,
                ).toBe(true);
            }
        }
        const moved = children.map((node) => ({ ...node, position: { x: -1000, y: -1000 } }));
        const repeated = imageOperationNodes(task, result, source, [source, neighbor, ...moved]);
        expect(mergeImageOperationNodes([source, neighbor, ...moved], [], source.id, repeated).nodes).toEqual([source, neighbor, ...moved]);
    });
    test("采用服务端资源和版本身份，保留原图与输入", () => {
        const parsed = imageOperationResult(task);
        const children = imageOperationNodes(task, parsed, source);
        const merged = mergeImageOperationNodes([source], [], source.id, children);
        expect(merged.nodes[0]).toBe(source);
        expect(merged.nodes).toHaveLength(3);
        expect(merged.connections).toHaveLength(2);
        expect(children[0].metadata?.assetId).toBe("asset0");
        expect(children[0].metadata?.assetVersionId).toBe("version0");
        expect(children[0].metadata?.imageOperationTaskId).toBe(task.id);
        expect(children[0].metadata?.generationEffectKeys).toEqual([`image-operation:${task.id}:adopt`]);
        expect(result.images[0].assetVersionId).toBe("version0");
    });
    test("重复采用不会增加节点或连线，不覆盖用户已修改的名称和位置", () => {
        const children = imageOperationNodes(task, result, source);
        const initial = mergeImageOperationNodes([source], [], source.id, children);
        const renamed = { ...initial.nodes[1], title: "用户选择的名字", position: { x: 900, y: 600 } };
        const merged = mergeImageOperationNodes([source, renamed, initial.nodes[2]], initial.connections, source.id, children);
        expect(merged.added).toBe(0);
        expect(merged.nodes).toHaveLength(3);
        expect(merged.nodes[1]).toBe(renamed);
        expect(merged.connections).toHaveLength(2);
    });
    test("替换过的原图或结果节点不能被迟到的处理结果覆盖", () => {
        expect(() => imageOperationNodes(task, result, { ...source, metadata: { ...source.metadata, storageKey: "resource:replacement" } })).toThrow("源图片已被修改");
        const children = imageOperationNodes(task, result, source);
        expect(() => mergeImageOperationNodes([source, { ...children[0], metadata: { storageKey: "resource:new-output" } }], [], source.id, children)).toThrow("处理结果节点已经改变");
    });
    test("刷新后不依赖浏览器临时副作用标记判断重复采用", () => {
        const children = imageOperationNodes(task, result, source);
        const initial = mergeImageOperationNodes([source], [], source.id, children);
        const reloaded = initial.nodes.map((node) => ({ ...node, metadata: { ...node.metadata, generationEffectKeys: undefined } }));
        const repeated = mergeImageOperationNodes(reloaded, initial.connections, source.id, children);
        expect(repeated.added).toBe(0);
        expect(repeated.nodes).toEqual(reloaded);
        expect(repeated.connections).toEqual(initial.connections);
    });
    test("部分或尺寸错误的结果不能当成处理成功", () => {
        expect(() => imageOperationResult({ ...task, status: "running" })).toThrow();
        expect(() => imageOperationResult({ ...task, resultJson: JSON.stringify({ ...result, images: result.images.slice(0, 1) }) })).toThrow();
        expect(() => imageOperationResult({ ...task, resultJson: JSON.stringify({ ...result, images: result.images.map((item) => ({ ...item, width: 1 })) }) })).toThrow();
    });
    test("本地图片处理明确显示无需模型的工作种类，保存期间可取消", () => {
        const running = { ...task, status: "running" as const, mediaStage: "local_save" as const };
        expect(canCancelGenerationTask(running)).toBe(true);
        expect(generationTaskStatusLabel(running)).toBe("处理中");
        expect(formatTaskKind(task)).toBe("图片切分");
        expect(formatTaskKind({ ...task, operation: "mask" })).toBe("图片遮罩处理");
        expect(mediaDeliverySummary("running", "checkpoint", task.type)).not.toContain("生成成功");
        expect(mediaDeliverySummary("succeeded", "completed", task.type)).toContain("素材已登记");
    });
});
