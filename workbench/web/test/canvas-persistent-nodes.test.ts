import { describe, expect, test } from "bun:test";
import { canvasPersistentNodes } from "@/lib/canvas/canvas-persistent-nodes";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

const source = (status: "loading" | "success" = "success"): CanvasNodeData => ({
    id: "native-text",
    type: CanvasNodeType.Text,
    title: "原始正文",
    position: { x: 1, y: 2 },
    width: 300,
    height: 200,
    metadata: { status, content: "原始正文不变", taskId: "native-task", taskStatus: status === "success" ? "succeeded" : "running", taskProgress: status === "success" ? 100 : 10, taskStage: "服务器已保存", taskUpdatedAt: "2026-10-28T21:05:56.072391Z" },
});

describe("原生任务观察的持久化边界", () => {
    test("重开终态节点保留服务器的精确任务时间和原对象", () => {
        const node = source(),
            before = [node];
        expect(canvasPersistentNodes([node], before)).toBe(before);
        expect(canvasPersistentNodes([node])[0]).toBe(node);
        expect(node.metadata?.taskUpdatedAt).toBe("2026-10-28T21:05:56.072391Z");
    });
    test("已加载的活动观察既不被删除，也不因后续心跳反复保存", () => {
        const node = source("loading"),
            before = [node];
        expect(canvasPersistentNodes(before, before)).toBe(before);
        const polled = { ...node, metadata: { ...node.metadata, taskUpdatedAt: "2026-10-29T00:00:00Z", taskProgress: 85, taskStage: "轮询中的临时进度" } };
        expect(canvasPersistentNodes([polled], before)).toBe(before);
        expect(node.metadata?.taskProgress).toBe(10);
    });
    test("活动期间的真实标题编辑保留，同时保留原生时间和观察", () => {
        const node = source("loading"),
            edited = { ...node, title: "用户的新标题", metadata: { ...node.metadata, taskProgress: 80 } };
        const result = canvasPersistentNodes([edited], [node])[0];
        expect(result.title).toBe("用户的新标题");
        expect(result.metadata?.taskUpdatedAt).toBe(node.metadata?.taskUpdatedAt);
        expect(result.metadata?.taskProgress).toBe(10);
    });
    test("换绑新任务和明确移除绑定不继承旧任务观察", () => {
        const node = source("loading"),
            replaced = { ...node, metadata: { ...node.metadata, taskId: "new-task", taskUpdatedAt: "2026-10-29T00:00:00Z" } };
        const result = canvasPersistentNodes([replaced], [node])[0];
        expect(result.metadata?.taskId).toBe("new-task");
        expect(result.metadata?.taskUpdatedAt).toBe("2026-10-29T00:00:00Z");
        expect(result.metadata?.taskProgress).toBeUndefined();
        expect(canvasPersistentNodes([{ ...node, metadata: { status: "idle" } }], [node])[0].metadata).toEqual({ status: "idle" });
    });
    test("同一任务的真实终态内容和新时间仍可保存", () => {
        const node = source("loading"),
            completed = source();
        completed.metadata = { ...completed.metadata, content: "真实的新结果", taskUpdatedAt: "2026-10-29T00:00:00Z" };
        const result = canvasPersistentNodes([completed], [node])[0];
        expect(result.metadata?.content).toBe("真实的新结果");
        expect(result.metadata?.taskStatus).toBe("succeeded");
        expect(result.metadata?.taskUpdatedAt).toBe("2026-10-29T00:00:00Z");
    });
});
