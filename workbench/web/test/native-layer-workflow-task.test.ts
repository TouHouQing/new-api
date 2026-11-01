import { expect, test } from "bun:test";
import { isNativeLayerWorkflowCurrent, nativeLayerWorkflowParentId } from "../src/lib/native-layer-workflow-task";
import type { CanvasNodeData } from "../src/types/canvas";

test("图层父任务及CPU和模型子任务回到同一工作流确认，普通图片仍独立重试", () => {
    const parent = "a".repeat(32);
    expect(nativeLayerWorkflowParentId({ id: parent, type: "image_operation", operation: "layer-workflow" })).toBe(parent);
    expect(nativeLayerWorkflowParentId({ id: "child", type: "canvas_image", inputJson: JSON.stringify({ metadata: { imageLayerWorkflow: { taskId: parent, stage: "extract" } } }) })).toBe(parent);
    expect(nativeLayerWorkflowParentId({ id: "cpu", type: "image_operation", inputJson: JSON.stringify({ request: { requestId: `layer-flow:${parent}:1:normalize-extracted` } }) })).toBe(parent);
    expect(nativeLayerWorkflowParentId({ id: "image", type: "canvas_image", inputJson: JSON.stringify({ request: { requestId: `layer-flow:${parent}:1:extract` } }) })).toBeUndefined();
    expect(nativeLayerWorkflowParentId({ id: "broken", type: "image_operation", inputJson: "{" })).toBeUndefined();
});

test("历史拆层回执不能把删除或被改作其它用途的节点视为当前制作结果", () => {
    const result = { canvasId: "canvas", nodeId: "group", taskId: "task", childNodeIds: ["layer"], revision: 1, requestSha256: "a".repeat(64), replayed: true };
    const root = { id: "group", metadata: { nativeImageLayerWorkflow: { taskId: "task", requestSha256: result.requestSha256 } } } as CanvasNodeData;
    const child = { id: "layer", metadata: { nativeImageLayerWorkflowParentId: "task" } } as CanvasNodeData;
    expect(isNativeLayerWorkflowCurrent([root, child], result)).toBe(true);
    expect(isNativeLayerWorkflowCurrent([child], result)).toBe(false);
    expect(isNativeLayerWorkflowCurrent([root], result)).toBe(false);
    expect(isNativeLayerWorkflowCurrent([root, { ...child, metadata: { nativeImageLayerWorkflowParentId: "another" } }], result)).toBe(false);
    expect(isNativeLayerWorkflowCurrent([{ ...root, metadata: { ...root.metadata, nativeImageLayerWorkflow: { ...root.metadata.nativeImageLayerWorkflow!, requestSha256: "b".repeat(64) } } }, child], result)).toBe(false);
});
